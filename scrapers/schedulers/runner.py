from __future__ import annotations

import json
import os
from collections import Counter
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from scrapers.adapters.http_adapter import HttpAdapter
from scrapers.conflict_resolution.resolver import resolve_conflicts
from scrapers.parsers.deadline_parser import parse_deadlines
from scrapers.parsers.requirements_parser import parse_requirements
from scrapers.source_scoring.scorer import compute_source_score
from scrapers.validators.payload_validator import validate_deadlines, validate_requirements


@dataclass
class ScrapeDiagnostic:
    institution_id: str
    source_url: str
    success: bool
    errors: List[str]
    deadline_count: int
    requirement_count: int
    confidence_score: float
    stale: bool


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _log_structured(payload: Dict) -> None:
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))


def _checkpoint_index(checkpoint_path: Optional[str]) -> int:
    if not checkpoint_path:
        return 0
    checkpoint = Path(checkpoint_path)
    if not checkpoint.exists():
        return 0
    try:
        data = json.loads(checkpoint.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return 0
    return int(data.get("next_index") or 0)


def _write_checkpoint(checkpoint_path: Optional[str], payload: Dict) -> None:
    if not checkpoint_path:
        return
    checkpoint = Path(checkpoint_path)
    checkpoint.parent.mkdir(parents=True, exist_ok=True)
    checkpoint.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _normalize_error_type(error_type: Optional[str], error: str) -> str:
    if error_type:
        return error_type
    lowered = (error or "").lower()
    if "schema" in lowered or "column" in lowered:
        return "SchemaError"
    if "timeout" in lowered or "connection" in lowered:
        return "NetworkError"
    if "rate" in lowered or "429" in lowered:
        return "RateLimitError"
    return "UnknownError"


def run_scrape_cycle(
    targets: List[Dict],
    *,
    adapter: Optional[HttpAdapter] = None,
    batch_size: Optional[int] = None,
    checkpoint_path: Optional[str] = None,
    workflow_name: str = "scrape-weekly",
) -> Dict:
    adapter = adapter or HttpAdapter()
    batch_size = int(batch_size or os.getenv("SCRAPER_BATCH_SIZE", "25"))
    batch_size = max(1, batch_size)
    diagnostics: List[ScrapeDiagnostic] = []
    deadline_rows = []
    requirement_rows = []
    retry_count = 0
    error_type_counts: Counter = Counter()
    start_time = datetime.now(timezone.utc)

    resume_index = min(_checkpoint_index(checkpoint_path), len(targets))
    batches_completed = 0
    for batch_start in range(resume_index, len(targets), batch_size):
        batch_targets = targets[batch_start: batch_start + batch_size]
        batch_id = f"batch-{(batch_start // batch_size) + 1}"
        for target in batch_targets:
            institution_id = str(target.get("institution_id"))
            source_url = str(target.get("source_url"))
            errors: List[str] = []
            try:
                fetch = adapter.fetch(source_url)
                retry_count += int(fetch.retries_attempted or 0)
                if not fetch.success:
                    error_text = fetch.error or "fetch failed"
                    error_type = _normalize_error_type(fetch.error_type, error_text)
                    error_type_counts[error_type] += 1
                    errors.append(error_text)
                    _log_structured(
                        {
                            "workflow": workflow_name,
                            "institution": institution_id,
                            "stage": "fetch",
                            "error_type": error_type,
                            "retryable": bool(fetch.retryable),
                            "column": None,
                            "timestamp": _timestamp(),
                            "batch_id": batch_id,
                            "message": error_text,
                        }
                    )
                    diagnostics.append(
                        ScrapeDiagnostic(
                            institution_id=institution_id,
                            source_url=source_url,
                            success=False,
                            errors=errors,
                            deadline_count=0,
                            requirement_count=0,
                            confidence_score=0.0,
                            stale=True,
                        )
                    )
                    continue

                try:
                    parsed_deadlines = parse_deadlines(fetch.html)
                    parsed_requirements = parse_requirements(fetch.html)
                except Exception as parser_exc:
                    error_text = str(parser_exc)
                    error_type_counts["ParserError"] += 1
                    errors.append(error_text)
                    _log_structured(
                        {
                            "workflow": workflow_name,
                            "institution": institution_id,
                            "stage": "parsing",
                            "error_type": "ParserError",
                            "retryable": False,
                            "column": None,
                            "timestamp": _timestamp(),
                            "batch_id": batch_id,
                            "message": error_text,
                        }
                    )
                    diagnostics.append(
                        ScrapeDiagnostic(
                            institution_id=institution_id,
                            source_url=source_url,
                            success=False,
                            errors=errors,
                            deadline_count=0,
                            requirement_count=0,
                            confidence_score=0.0,
                            stale=True,
                        )
                    )
                    continue

                valid_deadlines, deadline_errors = validate_deadlines(parsed_deadlines)
                valid_requirements, requirement_errors = validate_requirements(parsed_requirements)
                if deadline_errors or requirement_errors:
                    error_type_counts["ValidationError"] += len(deadline_errors + requirement_errors)
                for validation_error in deadline_errors + requirement_errors:
                    errors.append(validation_error)
                    _log_structured(
                        {
                            "workflow": workflow_name,
                            "institution": institution_id,
                            "stage": "validation",
                            "error_type": "ValidationError",
                            "retryable": False,
                            "column": None,
                            "timestamp": _timestamp(),
                            "batch_id": batch_id,
                            "message": validation_error,
                        }
                    )

                source_meta = compute_source_score(source_url=source_url, parser_confidence=0.9)
                now = _timestamp()
                for row in valid_deadlines:
                    deadline_rows.append(
                        {
                            "institution_id": institution_id,
                            "source_url": source_url,
                            "last_verified": now,
                            "extraction_timestamp": now,
                            "parser_version": "deadline_parser_v1",
                            "confidence_score": source_meta["confidence_score"],
                            "source_type": source_meta["source_type"],
                            "freshness_score": source_meta["freshness_score"],
                            **row,
                        }
                    )
                for row in valid_requirements:
                    requirement_rows.append(
                        {
                            "institution_id": institution_id,
                            "source_url": source_url,
                            "last_verified": now,
                            "extraction_timestamp": now,
                            "parser_version": "requirements_parser_v1",
                            "confidence_score": source_meta["confidence_score"],
                            "source_type": source_meta["source_type"],
                            "freshness_score": source_meta["freshness_score"],
                            **row,
                        }
                    )

                diagnostics.append(
                    ScrapeDiagnostic(
                        institution_id=institution_id,
                        source_url=source_url,
                        success=True,
                        errors=errors,
                        deadline_count=len(valid_deadlines),
                        requirement_count=len(valid_requirements),
                        confidence_score=source_meta["confidence_score"],
                        stale=source_meta["stale"],
                    )
                )
            except Exception as exc:
                error_text = str(exc)
                error_type = _normalize_error_type(None, error_text)
                error_type_counts[error_type] += 1
                _log_structured(
                    {
                        "workflow": workflow_name,
                        "institution": institution_id,
                        "stage": "institution_processing",
                        "error_type": error_type,
                        "retryable": False,
                        "column": None,
                        "timestamp": _timestamp(),
                        "batch_id": batch_id,
                        "message": error_text,
                    }
                )
                diagnostics.append(
                    ScrapeDiagnostic(
                        institution_id=institution_id,
                        source_url=source_url,
                        success=False,
                        errors=[error_text],
                        deadline_count=0,
                        requirement_count=0,
                        confidence_score=0.0,
                        stale=True,
                    )
                )

        batches_completed += 1
        _write_checkpoint(
            checkpoint_path,
            {
                "updated_at": _timestamp(),
                "batch_id": batch_id,
                "batches_completed": batches_completed,
                "next_index": min(len(targets), batch_start + batch_size),
                "targets_total": len(targets),
                "processed_total": len(diagnostics),
                "retry_count": retry_count,
            },
        )
        _log_structured(
            {
                "workflow": workflow_name,
                "stage": "batch_complete",
                "batch_id": batch_id,
                "processed_total": len(diagnostics),
                "targets_total": len(targets),
                "timestamp": _timestamp(),
            }
        )

    deduped_deadlines = resolve_conflicts(deadline_rows)
    deduped_requirements = resolve_conflicts(requirement_rows)
    duration_seconds = int((datetime.now(timezone.utc) - start_time).total_seconds())
    return {
        "deadlines": deduped_deadlines,
        "requirements": deduped_requirements,
        "diagnostics": [asdict(d) for d in diagnostics],
        "summary": {
            "targets": len(targets),
            "success": sum(1 for d in diagnostics if d.success),
            "failures": sum(1 for d in diagnostics if not d.success),
            "deadline_records": len(deduped_deadlines),
            "requirement_records": len(deduped_requirements),
            "stale_sources": sum(1 for d in diagnostics if d.stale),
            "resume_index": resume_index,
            "batches_completed": batches_completed,
            "retry_count": retry_count,
            "error_types": dict(error_type_counts),
            "duration_seconds": duration_seconds,
        },
    }


if __name__ == "__main__":
    fixture_path = os.environ.get("SCRAPER_TARGETS_FILE")
    if not fixture_path:
        raise SystemExit("SCRAPER_TARGETS_FILE is required")
    with open(fixture_path, "r", encoding="utf-8") as fh:
        targets = json.load(fh)
    result = run_scrape_cycle(targets)
    print(json.dumps(result, ensure_ascii=False))

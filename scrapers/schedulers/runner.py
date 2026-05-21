from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Callable, Dict, List, Sequence

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
    batch_id: str
    success: bool
    errors: List[str]
    error_type: str | None
    retryable: bool
    deadline_count: int
    requirement_count: int
    confidence_score: float
    stale: bool


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _chunked(items: Sequence[Dict], size: int) -> List[List[Dict]]:
    return [list(items[i : i + size]) for i in range(0, len(items), size)]


def _structured_log(
    *,
    institution: str,
    stage: str,
    error_type: str,
    retryable: bool,
    batch_id: str,
    column: str | None = None,
    message: str | None = None,
) -> None:
    payload = {
        "institution": institution,
        "stage": stage,
        "error_type": error_type,
        "retryable": retryable,
        "column": column,
        "timestamp": _iso_now(),
        "batch_id": batch_id,
        "workflow": "scrape-weekly",
    }
    if message:
        payload["message"] = message
    print(json.dumps(payload, ensure_ascii=False))


def run_scrape_cycle(
    targets: List[Dict],
    *,
    adapter: HttpAdapter | None = None,
    batch_size: int = 25,
    checkpoint_callback: Callable[[Dict], None] | None = None,
    disabled_modules: set[str] | None = None,
) -> Dict:
    active_adapter = adapter or HttpAdapter()
    diagnostics: List[ScrapeDiagnostic] = []
    deadline_rows = []
    requirement_rows = []
    retry_count = 0
    schema_errors = 0
    parser_errors = 0
    network_errors = 0
    stale_records_detected = 0
    disabled = disabled_modules or set()

    batches = _chunked(targets, max(1, batch_size))
    processed = 0

    for batch_index, batch in enumerate(batches, start=1):
        batch_id = f"batch-{batch_index}"
        for target in batch:
            institution_id = str(target.get("institution_id"))
            source_url = str(target.get("source_url"))
            errors: List[str] = []
            try:
                fetch = active_adapter.fetch(source_url)
                retry_count += fetch.retry_count
                if not fetch.success:
                    error_type = fetch.error_type or "NetworkError"
                    if fetch.retryable:
                        network_errors += 1
                    _structured_log(
                        institution=institution_id,
                        stage="fetch",
                        error_type=error_type,
                        retryable=fetch.retryable,
                        batch_id=batch_id,
                        message=fetch.error or "fetch failed",
                    )
                    diagnostics.append(
                        ScrapeDiagnostic(
                            institution_id=institution_id,
                            source_url=source_url,
                            batch_id=batch_id,
                            success=False,
                            errors=[fetch.error or "fetch failed"],
                            error_type=error_type,
                            retryable=fetch.retryable,
                            deadline_count=0,
                            requirement_count=0,
                            confidence_score=0.0,
                            stale=True,
                        )
                    )
                    stale_records_detected += 1
                    continue

                source_meta = compute_source_score(source_url=source_url, parser_confidence=0.9)
                stale_records_detected += 1 if source_meta["stale"] else 0
                institution_deadline_count = 0
                institution_requirement_count = 0

                if "deadlines" not in disabled:
                    try:
                        parsed_deadlines = parse_deadlines(fetch.html)
                        valid_deadlines, deadline_errors = validate_deadlines(parsed_deadlines)
                        for err in deadline_errors:
                            schema_errors += 1
                            errors.append(err)
                            _structured_log(
                                institution=institution_id,
                                stage="deadline_validation",
                                error_type="SchemaError",
                                retryable=False,
                                batch_id=batch_id,
                                message=err,
                            )
                        for row in valid_deadlines:
                            deadline_rows.append(
                                {
                                    "institution_id": institution_id,
                                    "source_url": source_url,
                                    "last_verified": _iso_now(),
                                    "extraction_timestamp": _iso_now(),
                                    "parser_version": "deadline_parser_v1",
                                    "confidence_score": source_meta["confidence_score"],
                                    "source_type": source_meta["source_type"],
                                    "freshness_score": source_meta["freshness_score"],
                                    **row,
                                }
                            )
                        institution_deadline_count = len(valid_deadlines)
                    except Exception as exc:
                        parser_errors += 1
                        errors.append(str(exc))
                        _structured_log(
                            institution=institution_id,
                            stage="deadline_parse",
                            error_type="ParserError",
                            retryable=False,
                            batch_id=batch_id,
                            message=str(exc),
                        )
                else:
                    errors.append("deadlines module disabled by schema drift")

                if "requirements" not in disabled:
                    try:
                        parsed_requirements = parse_requirements(fetch.html)
                        valid_requirements, requirement_errors = validate_requirements(parsed_requirements)
                        for err in requirement_errors:
                            schema_errors += 1
                            errors.append(err)
                            _structured_log(
                                institution=institution_id,
                                stage="requirements_validation",
                                error_type="SchemaError",
                                retryable=False,
                                batch_id=batch_id,
                                message=err,
                            )
                        for row in valid_requirements:
                            requirement_rows.append(
                                {
                                    "institution_id": institution_id,
                                    "source_url": source_url,
                                    "last_verified": _iso_now(),
                                    "extraction_timestamp": _iso_now(),
                                    "parser_version": "requirements_parser_v1",
                                    "confidence_score": source_meta["confidence_score"],
                                    "source_type": source_meta["source_type"],
                                    "freshness_score": source_meta["freshness_score"],
                                    **row,
                                }
                            )
                        institution_requirement_count = len(valid_requirements)
                    except Exception as exc:
                        parser_errors += 1
                        errors.append(str(exc))
                        _structured_log(
                            institution=institution_id,
                            stage="requirements_parse",
                            error_type="ParserError",
                            retryable=False,
                            batch_id=batch_id,
                            message=str(exc),
                        )
                else:
                    errors.append("requirements module disabled by schema drift")

                success = bool(institution_deadline_count or institution_requirement_count) or not errors
                diagnostics.append(
                    ScrapeDiagnostic(
                        institution_id=institution_id,
                        source_url=source_url,
                        batch_id=batch_id,
                        success=success,
                        errors=errors,
                        error_type=None if success else "InstitutionScrapeError",
                        retryable=False,
                        deadline_count=institution_deadline_count,
                        requirement_count=institution_requirement_count,
                        confidence_score=source_meta["confidence_score"],
                        stale=source_meta["stale"],
                    )
                )
            except Exception as exc:
                parser_errors += 1
                _structured_log(
                    institution=institution_id,
                    stage="institution_scrape",
                    error_type="InstitutionScrapeError",
                    retryable=False,
                    batch_id=batch_id,
                    message=str(exc),
                )
                diagnostics.append(
                    ScrapeDiagnostic(
                        institution_id=institution_id,
                        source_url=source_url,
                        batch_id=batch_id,
                        success=False,
                        errors=[str(exc)],
                        error_type="InstitutionScrapeError",
                        retryable=False,
                        deadline_count=0,
                        requirement_count=0,
                        confidence_score=0.0,
                        stale=True,
                    )
                )
                stale_records_detected += 1
            finally:
                processed += 1

        if checkpoint_callback:
            checkpoint_callback(
                {
                    "batch_id": batch_id,
                    "processed": processed,
                    "total_targets": len(targets),
                    "success_count": sum(1 for d in diagnostics if d.success),
                    "failure_count": sum(1 for d in diagnostics if not d.success),
                    "timestamp": _iso_now(),
                }
            )

    deduped_deadlines = resolve_conflicts(deadline_rows)
    deduped_requirements = resolve_conflicts(requirement_rows)
    success_count = sum(1 for d in diagnostics if d.success)
    failure_count = sum(1 for d in diagnostics if not d.success)

    status = "success"
    if failure_count > 0 or schema_errors > 0 or parser_errors > 0:
        status = "degraded"

    return {
        "deadlines": deduped_deadlines,
        "requirements": deduped_requirements,
        "diagnostics": [asdict(d) for d in diagnostics],
        "summary": {
            "workflow": "scrape-weekly",
            "targets": len(targets),
            "institutions_processed": len(diagnostics),
            "success_count": success_count,
            "failure_count": failure_count,
            "deadline_records": len(deduped_deadlines),
            "requirement_records": len(deduped_requirements),
            "stale_records_detected": stale_records_detected,
            "schema_errors": schema_errors,
            "network_errors": network_errors,
            "parser_errors": parser_errors,
            "retry_count": retry_count,
            "status": status,
            "disabled_modules": sorted(disabled),
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

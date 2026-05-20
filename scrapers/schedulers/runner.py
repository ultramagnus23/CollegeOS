from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Dict, List

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


def run_scrape_cycle(targets: List[Dict]) -> Dict:
    adapter = HttpAdapter()
    diagnostics: List[ScrapeDiagnostic] = []
    deadline_rows = []
    requirement_rows = []

    for target in targets:
        institution_id = str(target.get("institution_id"))
        source_url = str(target.get("source_url"))
        fetch = adapter.fetch(source_url)
        errors: List[str] = []
        if not fetch.success:
            diagnostics.append(
                ScrapeDiagnostic(
                    institution_id=institution_id,
                    source_url=source_url,
                    success=False,
                    errors=[fetch.error or "fetch failed"],
                    deadline_count=0,
                    requirement_count=0,
                    confidence_score=0.0,
                    stale=True,
                )
            )
            continue

        parsed_deadlines = parse_deadlines(fetch.html)
        parsed_requirements = parse_requirements(fetch.html)
        valid_deadlines, deadline_errors = validate_deadlines(parsed_deadlines)
        valid_requirements, requirement_errors = validate_requirements(parsed_requirements)
        errors.extend(deadline_errors + requirement_errors)

        source_meta = compute_source_score(source_url=source_url, parser_confidence=0.9)
        for row in valid_deadlines:
            deadline_rows.append({
                "institution_id": institution_id,
                "source_url": source_url,
                "last_verified": datetime.now(timezone.utc).isoformat(),
                "extraction_timestamp": datetime.now(timezone.utc).isoformat(),
                "parser_version": "deadline_parser_v1",
                "confidence_score": source_meta["confidence_score"],
                "source_type": source_meta["source_type"],
                "freshness_score": source_meta["freshness_score"],
                **row,
            })
        for row in valid_requirements:
            requirement_rows.append({
                "institution_id": institution_id,
                "source_url": source_url,
                "last_verified": datetime.now(timezone.utc).isoformat(),
                "extraction_timestamp": datetime.now(timezone.utc).isoformat(),
                "parser_version": "requirements_parser_v1",
                "confidence_score": source_meta["confidence_score"],
                "source_type": source_meta["source_type"],
                "freshness_score": source_meta["freshness_score"],
                **row,
            })

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

    deduped_deadlines = resolve_conflicts(deadline_rows)
    deduped_requirements = resolve_conflicts(requirement_rows)
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


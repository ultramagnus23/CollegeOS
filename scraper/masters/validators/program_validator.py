"""Data-quality validator — deliverable #9.

Gates a normalized program record + its detected pathways BEFORE anything is
written to a DB. Never silently ingests low-confidence data:
  - required-field check (reject if missing identity fields)
  - plausibility checks (degree type, GPA range)
  - per-pathway confidence gating: weak / single-signal "special" pathways
    (executive, portfolio, bridge, conditional, direct-entry) are quarantined
    for review rather than trusted, because on multi-program pages they are
    often cross-link noise (e.g. an "Executive MBA" link on a full-time page)
  - dedup key for duplicate detection across a batch
  - missing-field tracking and an overall confidence score

Pure, reusable, university-agnostic — the same validator runs for all 100-120+
targets. No hardcoded per-university logic.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List

REQUIRED_FIELDS = ("institution_name", "institution_country", "program_name", "degree_type")
VALID_DEGREES = {"MS", "MA", "MBA"}

# Pathways that are easily false-triggered by cross-links on multi-program pages;
# require a higher bar than the generic threshold.
REVIEW_PRONE = {"executive_part_time", "portfolio_based", "bridge_certificate",
                "conditional_admission", "direct_entry_no_test"}
PATHWAY_MIN_CONFIDENCE = 0.60
REVIEW_PRONE_MIN_CONFIDENCE = 0.80


@dataclass
class ValidationResult:
    accepted: bool
    confidence: float
    dedup_key: str
    accepted_pathways: List[dict] = field(default_factory=list)
    flagged_pathways: List[dict] = field(default_factory=list)
    issues: List[str] = field(default_factory=list)
    missing_fields: List[str] = field(default_factory=list)


def _norm(s: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def dedup_key(program: dict) -> str:
    return "|".join([
        _norm(program.get("institution_name")),
        _norm(program.get("program_name")),
        (program.get("degree_type") or "").upper(),
        str(program.get("intake_term") or ""),
        str(program.get("intake_year") or ""),
    ])


def validate_program(program: dict, pathways: List[dict]) -> ValidationResult:
    issues: List[str] = []

    missing = [f for f in REQUIRED_FIELDS if not program.get(f)]
    for f in missing:
        issues.append(f"missing_required:{f}")

    if program.get("degree_type") not in VALID_DEGREES:
        issues.append(f"bad_degree_type:{program.get('degree_type')}")

    gpa = program.get("min_gpa")
    if gpa is not None and not (0 < float(gpa) <= 4.3):
        issues.append(f"implausible_gpa:{gpa}")

    # Optional-but-wanted fields (tracked, non-fatal) — drives "missing field detection".
    optional_missing = [f for f in ("gre_requirement", "department")
                        if program.get(f) in (None, "", "unknown")]

    accepted_pathways: List[dict] = []
    flagged_pathways: List[dict] = []
    for pw in pathways:
        conf = float(pw.get("confidence") or 0)
        ptype = pw.get("pathway_type")
        bar = REVIEW_PRONE_MIN_CONFIDENCE if ptype in REVIEW_PRONE else PATHWAY_MIN_CONFIDENCE
        if conf < bar:
            flagged_pathways.append({**pw, "review_reason": f"confidence {conf:.2f} < {bar:.2f}"})
        else:
            accepted_pathways.append(pw)

    base = (sum(p["confidence"] for p in accepted_pathways) / len(accepted_pathways)) if accepted_pathways else 0.3
    confidence = max(0.0, round(base - 0.05 * len(optional_missing), 2))

    hard_fail = any(i.startswith("missing_required:") or i.startswith("bad_degree_type") for i in issues)
    accepted = (not hard_fail) and len(accepted_pathways) > 0

    return ValidationResult(
        accepted=accepted,
        confidence=confidence,
        dedup_key=dedup_key(program),
        accepted_pathways=accepted_pathways,
        flagged_pathways=flagged_pathways,
        issues=issues + [f"flagged_pathway:{p['pathway_type']}" for p in flagged_pathways],
        missing_fields=missing + [f"optional:{m}" for m in optional_missing],
    )


def dedupe_batch(records: List[dict]) -> Dict[str, List[str]]:
    """Return {dedup_key: [program_ids]} for keys that appear more than once."""
    seen: Dict[str, List[str]] = {}
    for rec in records:
        prog = rec.get("program") or {}
        seen.setdefault(dedup_key(prog), []).append(prog.get("id"))
    return {k: v for k, v in seen.items() if len(v) > 1}

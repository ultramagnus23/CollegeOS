"""IPEDS + BLS outcome normalization for masters programs (pure logic).

Maps two real public sources onto canonical.masters_programs WITHOUT inventing
anything. Live fetch (download IPEDS/BLS files or call their APIs) and DB write
are kept as injection points — same pattern as masters_ingestion_pipeline — so
this logic stays unit-testable and side-effect-free.

Sources (Phase-3 source-of-truth table):
  - IPEDS (NCES): institution-level grad enrollment/tuition/completion. Joined to
    our canonical institutions via UnitID -> canonical.institution_identity_map
    (REUSE the undergrad canonical ID system; do NOT mint a parallel masters ID).
  - BLS OEWS: median wage by SOC occupation. Joined to a program via the
    NCES CIP->SOC crosswalk: masters_programs.cip_code -> SOC -> OEWS median.

Confidence tiers come from backend dataConfidence.js (kept in lockstep):
  IPEDS institution = High ; BLS/Scorecard salary = Medium-High.

These figures are FIELD/INSTITUTION level. They are never presented as a
program admit rate or fit/funding score — those have no source and are not here.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


def _num(v) -> Optional[float]:
    if v in (None, "", "NULL"):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


@dataclass
class OutcomeUpdate:
    """A write-ready partial update for one masters_programs row."""
    canonical_institution_id: str          # FK target via institution_identity_map
    cip_code: Optional[str]
    median_earnings: Optional[float]
    roi_source: Optional[str]
    confidence_tier: Optional[str]


def bls_salary_for_cip(cip_code: str, cip_to_soc: dict, oews_median_by_soc: dict) -> Optional[float]:
    """Median annual wage for a program's CIP via the CIP->SOC crosswalk.

    cip_to_soc:           {cip_code: [soc_code, ...]}  (NCES crosswalk)
    oews_median_by_soc:   {soc_code: median_annual_wage}  (BLS OEWS)
    Returns the max median across mapped SOCs (best realistic outcome for the
    field), or None when the field can't be mapped — never a guessed value.
    """
    socs = cip_to_soc.get((cip_code or "").strip())
    if not socs:
        return None
    medians = [oews_median_by_soc[s] for s in socs if s in oews_median_by_soc]
    medians = [m for m in (_num(x) for x in medians) if m is not None]
    return max(medians) if medians else None


def normalize_outcome(
    *,
    canonical_institution_id: str,
    cip_code: Optional[str],
    cip_to_soc: Optional[dict] = None,
    oews_median_by_soc: Optional[dict] = None,
    oews_year: Optional[int] = None,
) -> OutcomeUpdate:
    """Build a write-ready outcome update for a program from BLS OEWS by CIP.

    Returns an update with median_earnings=None (and source=None) when no real
    figure can be derived — the caller must NOT write a placeholder.
    """
    median = None
    source = None
    tier = None
    if cip_code and cip_to_soc and oews_median_by_soc:
        median = bls_salary_for_cip(cip_code, cip_to_soc, oews_median_by_soc)
        if median is not None:
            source = f"BLS OEWS {oews_year}" if oews_year else "BLS OEWS"
            tier = "Medium-High"
    return OutcomeUpdate(
        canonical_institution_id=canonical_institution_id,
        cip_code=cip_code,
        median_earnings=median,
        roi_source=source,
        confidence_tier=tier,
    )


def coverage(updates) -> dict:
    """Summary for the post-ingestion coverage report (real counts, not 'ran ok')."""
    updates = list(updates)
    with_salary = sum(1 for u in updates if u.median_earnings is not None)
    return {
        "programs": len(updates),
        "with_real_salary": with_salary,
        "pct_with_real_salary": round(100.0 * with_salary / len(updates), 1) if updates else 0.0,
    }

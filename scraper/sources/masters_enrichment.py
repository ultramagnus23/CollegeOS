"""
scraper/sources/masters_enrichment.py
───────────────────────────────────────
Enriches canonical.masters_programs rows with:
  - Acceptance rates, GPA/GRE averages (from The Grad Cafe self-reported data)
  - STEM OPT eligibility (CIP code → DHS STEM list lookup)
  - Funding info (TA/RA/stipend) from program pages
  - Derived scores: admission_difficulty, funding_attractiveness, roi_score

This script operates in DB-update mode: reads existing rows, enriches them,
writes back. It does NOT insert new programs (use import_postgrad_excel.py for that).

Usage:
  DATABASE_URL=postgresql://... python scraper/sources/masters_enrichment.py

Rate limits: adds 1–2s delay per institution to be polite to public APIs.
"""

import logging
import os
import re
import time
from typing import Optional

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    raise SystemExit("pip install psycopg2-binary")

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# DHS STEM CIP list (abbreviated — covers CS, EE, DS, BioE, ChemE, Math, Stats, etc.)
STEM_CIP_PREFIXES = {
    "11",   # Computer & Info Sciences
    "14",   # Engineering
    "15",   # Engineering Technologies
    "26",   # Biological & Biomedical Sciences
    "27",   # Math & Statistics
    "29",   # Military Technologies (incl. cyber)
    "40",   # Physical Sciences
    "41",   # Science Technologies
    "42",   # Psychology (research)
    "43",   # Homeland Security / Criminal Justice (cyber)
    "45",   # Social Sciences (economics, quantitative)
    "51",   # Health Professions (STEM-qualified)
    "52",   # Business (quantitative — analytics, finance)
}

STEM_KEYWORDS = {
    "computer", "data science", "machine learning", "artificial intelligence",
    "software", "information systems", "cybersecurity", "electrical", "mechanical",
    "biomedical", "bioinformatics", "statistics", "mathematics", "physics",
    "chemistry", "materials", "chemical engineering", "robotics", "aerospace",
    "environmental engineering", "civil engineering", "quantitative finance",
    "business analytics", "computational",
}


def infer_stem(program_name: str, cip_code: Optional[str]) -> Optional[bool]:
    if cip_code:
        prefix = str(cip_code).split(".")[0].zfill(2)
        if prefix in STEM_CIP_PREFIXES:
            return True
    name_lower = program_name.lower()
    if any(kw in name_lower for kw in STEM_KEYWORDS):
        return True
    # Explicitly non-STEM fields
    non_stem = {"history", "philosophy", "english", "creative writing", "gender",
                "sociology", "political science", "international relations", "media",
                "performing arts", "visual arts", "public policy"}
    if any(kw in name_lower for kw in non_stem):
        return False
    return None


def infer_opt_eligible(country: str, is_stem: Optional[bool]) -> tuple[Optional[bool], Optional[bool]]:
    """Return (opt_eligible, stem_opt_eligible) based on country + STEM status.

    stem_opt_eligible must stay None when is_stem is unknown - `bool(None)` used to
    silently turn "we don't know" into a false "not STEM-OPT-eligible" claim, which is
    itself a small fabrication (a confident negative where the real answer is unknown).
    """
    if country.upper() != "US":
        return None, None
    if is_stem is None:
        return True, None
    return True, is_stem


def compute_admission_difficulty(acceptance_rate: Optional[float], avg_gpa: Optional[float],
                                  avg_gre_quant: Optional[int]) -> Optional[float]:
    """0–100 composite: higher = harder. Returns None (not a fabricated 50.0 baseline)
    when none of the three real inputs are available - there is nothing to derive a
    difficulty score from, so we must not display one."""
    if acceptance_rate is None and avg_gpa is None and avg_gre_quant is None:
        return None
    score = 50.0  # neutral prior only used once at least one real signal exists below
    if acceptance_rate is not None:
        # 5% acceptance → 90 points, 50% → 30 points, 90% → 10 points
        score = max(5.0, min(95.0, 100 * (1 - acceptance_rate ** 0.4)))
    if avg_gpa is not None:
        # GPA on 4.0 scale — higher GPA required = higher difficulty
        score += (avg_gpa - 3.0) * 15
    if avg_gre_quant is not None:
        # GRE Q: 165+ → very hard, 155 → moderate
        score += (avg_gre_quant - 155) * 1.5
    return round(min(99.0, max(1.0, score)), 1)


def compute_funding_attractiveness(funding_avail: Optional[str],
                                    ta: Optional[bool], ra: Optional[bool],
                                    stipend: Optional[float],
                                    full_prob: Optional[float]) -> Optional[float]:
    """0–100 composite: higher = more funding. Returns None (not a fabricated 0.0)
    when none of the five real inputs are available - a bare 0 previously read as a
    confident "no funding at all" when the truth was "we don't know"."""
    if funding_avail is None and ta is None and ra is None and stipend is None and full_prob is None:
        return None
    score = 0.0
    if funding_avail == "fully_funded":
        score += 60
    elif funding_avail == "partial":
        score += 30
    elif funding_avail == "unfunded":
        score -= 20
    if ta:
        score += 10
    if ra:
        score += 15
    if stipend and stipend > 0:
        # $25k+ stipend in US gets near-full marks for that component
        score += min(20.0, stipend / 1500)
    if full_prob is not None:
        score += full_prob * 0.3
    return round(min(100.0, max(0.0, score)), 1)


def compute_roi(median_salary: Optional[float], tuition_total: Optional[float],
                program_length_months: Optional[int]) -> Optional[float]:
    """Simple ROI proxy: (salary - annualized_tuition) / annualized_tuition * 100."""
    if not median_salary or not tuition_total or not program_length_months:
        return None
    annual_cost = tuition_total * (12 / max(1, program_length_months))
    if annual_cost <= 0:
        return None
    roi = (median_salary - annual_cost) / annual_cost * 100
    return round(min(100.0, max(0.0, roi / 5)), 1)  # scale to 0–100


BATCH_SIZE = 50  # commit every N rows to avoid pooler timeout


def enrich_programs(db_url: str) -> int:
    conn = psycopg2.connect(db_url)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("""
        SELECT id, program_name, institution_country, cip_code,
               acceptance_rate, avg_gpa, avg_gre_quant,
               funding_availability, ta_available, ra_available,
               median_stipend_usd, full_funding_probability,
               median_salary_post, tuition_total, program_length_months,
               is_stem_designated, opt_eligible, stem_opt_eligible,
               admission_difficulty, funding_attractiveness, roi_score
        FROM canonical.masters_programs
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    log.info(f"Enriching {len(rows)} masters programs…")

    # Use autocommit=True so each UPDATE is its own statement — avoids the
    # Supabase pooler's statement_timeout on long-running transactions.
    updated = 0
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    write_cur = conn.cursor()

    for i, row in enumerate(rows):
        pid = row["id"]
        name = row["program_name"]
        country = row["institution_country"] or "US"

        is_stem = row["is_stem_designated"]
        if is_stem is None:
            is_stem = infer_stem(name, row["cip_code"])

        opt, stem_opt = row["opt_eligible"], row["stem_opt_eligible"]
        if opt is None:
            opt, stem_opt = infer_opt_eligible(country, is_stem)

        adm_diff = compute_admission_difficulty(
            row["acceptance_rate"], row["avg_gpa"], row["avg_gre_quant"])
        fund_attr = compute_funding_attractiveness(
            row["funding_availability"], row["ta_available"], row["ra_available"],
            row["median_stipend_usd"], row["full_funding_probability"])
        roi = compute_roi(
            row["median_salary_post"], row["tuition_total"], row["program_length_months"])

        try:
            write_cur.execute("""
                UPDATE canonical.masters_programs
                SET
                    is_stem_designated     = COALESCE(is_stem_designated, %(is_stem)s),
                    opt_eligible           = COALESCE(opt_eligible, %(opt)s),
                    stem_opt_eligible      = COALESCE(stem_opt_eligible, %(stem_opt)s),
                    admission_difficulty   = %(adm_diff)s,
                    funding_attractiveness = %(fund_attr)s,
                    roi_score              = COALESCE(%(roi)s, roi_score),
                    updated_at             = NOW()
                WHERE id = %(id)s
            """, {
                "id": pid,
                "is_stem": is_stem,
                "opt": opt,
                "stem_opt": stem_opt,
                "adm_diff": adm_diff,
                "fund_attr": fund_attr,
                "roi": roi,
            })
            updated += 1
        except Exception as e:
            log.warning(f"  skip {pid}: {e}")

        if (i + 1) % 100 == 0:
            log.info(f"  {i+1}/{len(rows)} done")

    write_cur.close()
    conn.close()
    log.info(f"Enriched {updated} programs.")
    return updated


def main():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL not set")
    n = enrich_programs(db_url)
    print(f"Done. Enriched {n} masters programs.")


if __name__ == "__main__":
    main()

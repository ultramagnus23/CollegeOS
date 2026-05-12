#!/usr/bin/env python3
"""
Data Quality Validator
───────────────────────
Validates the staged data files before they are loaded into PostgreSQL:
  • Acceptance rate sanity (0.5 % – 100 %)
  • SAT / ACT score ranges
  • Enrollment > 0
  • NULL-rate summary per column
  • Brier score placeholder (post-ML integration)

Also validates the live colleges_comprehensive table in PostgreSQL and
flags colleges still missing acceptance rates.

Required env vars:   (none strictly required for file-only validation)
Optional env vars:
    DATABASE_URL          Run DB-level checks in addition to file checks
    IPEDS_STAGING_PATH    (default: /tmp/ipeds_staging.json)
    CDS_STAGING_PATH      (default: /tmp/cds_staging.json)
    COLLEGEDATA_STAGING_PATH (default: /tmp/collegedata_staging.json)
"""

import json
import logging
import os
import sys
from typing import Optional

import yaml

# ── Config ────────────────────────────────────────────────────────────────────

_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.yaml")
with open(_CONFIG_PATH) as _fh:
    _CFG = yaml.safe_load(_fh)

logging.basicConfig(
    level=getattr(logging, _CFG.get("log_level", "INFO")),
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("validate_data")

DATABASE_URL = os.environ.get("DATABASE_URL", "")
IPEDS_STAGING_PATH = os.environ.get("IPEDS_STAGING_PATH", "/tmp/ipeds_staging.json")
CDS_STAGING_PATH = os.environ.get("CDS_STAGING_PATH", "/tmp/cds_staging.json")
COLLEGEDATA_STAGING_PATH = os.environ.get(
    "COLLEGEDATA_STAGING_PATH", "/tmp/collegedata_staging.json"
)

ACCEPTANCE_MIN = _CFG["acceptance_rate_min"]   # percent
ACCEPTANCE_MAX = _CFG["acceptance_rate_max"]   # percent

# ── Staging file validators ───────────────────────────────────────────────────

def _check_acceptance_rate(value, source: str = "") -> Optional[float]:
    """
    Validate and normalise an acceptance rate.
    Input may be a fraction (0.18) or a percent (18.0).
    Returns the rate as a fraction [0, 1], or None if invalid.
    """
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None

    # Determine whether the value is already a fraction (0–1) or a percentage (1–100).
    # Values in (1.0, 100.0] are unambiguously percentages.
    # Values in [0, 1.0] are treated as fractions.
    # Values > 100 are always invalid.
    if v > 100.0:
        log.debug(f"[{source}] Rejected acceptance_rate={v} (percentage form >100 — invalid)")
        return None

    if v > 1.0:
        # Percent form — convert to fraction
        rate_pct = v
    else:
        # Fraction form — convert to percent for range check
        rate_pct = v * 100.0

    if not (ACCEPTANCE_MIN <= rate_pct <= ACCEPTANCE_MAX):
        log.debug(f"[{source}] Rejected acceptance_rate={v} (pct={rate_pct:.2f})")
        return None

    # Store as fraction
    return rate_pct / 100.0


def _check_sat(value, lo: int = 400, hi: int = 1600) -> Optional[int]:
    if value is None:
        return None
    try:
        v = int(value)
        return v if lo <= v <= hi else None
    except (TypeError, ValueError):
        return None


def _check_act(value, lo: int = 1, hi: int = 36) -> Optional[int]:
    if value is None:
        return None
    try:
        v = int(value)
        return v if lo <= v <= hi else None
    except (TypeError, ValueError):
        return None


def validate_staging_file(path: str, label: str) -> tuple[list[dict], dict]:
    """
    Load and validate a staging JSON file.
    Returns (cleaned_records, stats_dict).
    """
    if not os.path.exists(path):
        log.warning(f"[{label}] Staging file not found: {path}")
        return [], {}

    with open(path) as fh:
        records = json.load(fh)

    total = len(records)
    stats = {
        "total": total,
        "with_acceptance_rate": 0,
        "with_sat": 0,
        "with_act": 0,
        "with_enrollment": 0,
        "rejected_acceptance_rate": 0,
    }

    cleaned = []
    for rec in records:
        name = rec.get("name", "")

        # Validate acceptance rate
        raw_ar = rec.get("acceptance_rate")
        clean_ar = _check_acceptance_rate(raw_ar, source=f"{label}/{name}")
        if raw_ar is not None and clean_ar is None:
            stats["rejected_acceptance_rate"] += 1
        rec["acceptance_rate"] = clean_ar

        # Validate SAT
        rec["sat_25"] = _check_sat(rec.get("sat_25"))
        rec["sat_75"] = _check_sat(rec.get("sat_75"))

        # Validate ACT
        rec["act_25"] = _check_act(rec.get("act_25"))
        rec["act_75"] = _check_act(rec.get("act_75"))
        if rec.get("act_avg") is not None:
            rec["act_avg"] = _check_act(rec.get("act_avg"))

        # Validate enrollment
        enroll = rec.get("total_enrollment")
        if enroll is not None:
            try:
                enroll = int(enroll)
                rec["total_enrollment"] = enroll if enroll > 0 else None
            except (TypeError, ValueError):
                rec["total_enrollment"] = None

        # Tally
        if rec.get("acceptance_rate") is not None:
            stats["with_acceptance_rate"] += 1
        if rec.get("sat_25") or rec.get("sat_75"):
            stats["with_sat"] += 1
        if rec.get("act_25") or rec.get("act_75"):
            stats["with_act"] += 1
        if rec.get("total_enrollment"):
            stats["with_enrollment"] += 1

        cleaned.append(rec)

    # Write validated data back
    with open(path, "w") as fh:
        json.dump(cleaned, fh, indent=2, default=str)

    pct_ar = stats["with_acceptance_rate"] / max(total, 1) * 100
    log.info(
        f"[{label}] {total} records — "
        f"{stats['with_acceptance_rate']} acceptance rates ({pct_ar:.1f}%), "
        f"{stats['with_sat']} SAT, {stats['with_act']} ACT, "
        f"{stats['rejected_acceptance_rate']} rates rejected"
    )
    return cleaned, stats


# ── Database validators ───────────────────────────────────────────────────────

def validate_database() -> None:
    """
    Connect to PostgreSQL and run validation queries on the live table.
    Fixes out-of-range acceptance rates in-place.
    """
    if not DATABASE_URL:
        log.info("DATABASE_URL not set — skipping live DB validation")
        return

    try:
        import psycopg2
    except ImportError:
        log.warning("psycopg2 not installed — skipping DB validation")
        return

    conn = None
    try:
        conn = psycopg2.connect(DATABASE_URL)
        conn.set_session(autocommit=False)
        cur = conn.cursor()

        # Nullify acceptance rates outside valid bounds
        cur.execute("""
            UPDATE colleges_comprehensive
            SET acceptance_rate = NULL
            WHERE acceptance_rate IS NOT NULL
              AND (acceptance_rate < 0.005 OR acceptance_rate > 1.0)
              AND (country = 'United States' OR country IS NULL);
        """)
        fixed = cur.rowcount
        if fixed > 0:
            log.warning(f"DB: nullified {fixed} out-of-range acceptance_rate rows")

        conn.commit()

        # Count nulls
        cur.execute("""
            SELECT COUNT(*) FROM colleges_comprehensive
            WHERE acceptance_rate IS NULL
              AND (country = 'United States' OR country IS NULL);
        """)
        null_count = cur.fetchone()[0]
        log.info(f"DB: {null_count} US colleges still missing acceptance_rate")

        # Summary stats
        cur.execute("""
            SELECT
                COUNT(*) AS total,
                COUNT(acceptance_rate) AS has_acceptance_rate,
                COUNT(sat_25) AS has_sat_25,
                COUNT(act_25) AS has_act_25,
                COUNT(total_enrollment) AS has_enrollment
            FROM colleges_comprehensive
            WHERE country = 'United States' OR country IS NULL;
        """)
        row = cur.fetchone()
        if row:
            total, has_ar, has_sat, has_act, has_enroll = row
            log.info(
                f"DB summary (US): total={total}, "
                f"acceptance_rate={has_ar} ({has_ar/max(total,1)*100:.1f}%), "
                f"SAT={has_sat}, ACT={has_act}, enrollment={has_enroll}"
            )

        cur.close()
    except Exception as exc:
        log.error(f"DB validation error: {exc}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()


# ── Brier score placeholder ───────────────────────────────────────────────────

def validate_brier_score() -> None:
    """
    Brier score calibration check.
    Once the ML chancing model is trained, load it here and check:
        brier_score_loss(y_true, y_pred) < 0.20
    This is intentionally a stub until PROMPT 2 (ML model) is complete.
    """
    log.info("Brier score validation — placeholder (ML model not yet trained)")
    log.info("After training, add: brier_score_loss(actual_admits, predicted_probs) < 0.20")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    log.info("validate-data.py started")

    all_ok = True
    total_records = 0
    total_with_ar = 0

    for path, label in [
        (IPEDS_STAGING_PATH, "IPEDS"),
        (CDS_STAGING_PATH, "CDS"),
        (COLLEGEDATA_STAGING_PATH, "NCES_CSV"),
    ]:
        _, stats = validate_staging_file(path, label)
        if stats:
            total_records += stats.get("total", 0)
            total_with_ar += stats.get("with_acceptance_rate", 0)

    validate_database()
    validate_brier_score()

    if total_records > 0:
        ar_pct = total_with_ar / total_records * 100
        log.info(
            f"Overall staged: {total_records} records, "
            f"{total_with_ar} acceptance rates ({ar_pct:.1f}%)"
        )
        if ar_pct < _CFG.get("min_acceptance_rate_coverage", 50.0):
            log.warning(
                f"⚠ Only {ar_pct:.1f}% of staged records have acceptance_rate. "
                f"Check API keys and scraper output."
            )

    log.info("✓ Validation complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())

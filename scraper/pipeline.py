#!/usr/bin/env python3
"""
scraper/pipeline.py
────────────────────
Master data pipeline for CollegeOS.

Orchestrates three data sources (IPEDS, College Scorecard, NCES CSV),
merges their results into one record per college, validates every field,
and upserts the clean data into the PostgreSQL `colleges_comprehensive` table.

Usage:
    python scraper/pipeline.py

Required env vars:
    SUPABASE_DB_URL            — full Postgres connection string (port 6543 for Supabase)

Optional env vars (at least one API key needed for live data):
    IPEDS_API_KEY              — data.gov API key for IPEDS source
    COLLEGE_SCORECARD_API_KEY  — data.gov API key for Scorecard source
    REQUEST_DELAY_SEC          — delay between API pages (default: 0.3)

Exit codes:
    0  — success (≥500 rows updated)
    1  — fatal error or fewer than 500 rows updated
"""

import logging
import os
import re
import sys
import unicodedata
from difflib import SequenceMatcher
from typing import Optional

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential

# ── Bootstrap ─────────────────────────────────────────────────────────────────

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("pipeline")

# Minimum successful upserts before the pipeline declares failure
MIN_SUCCESS_ROWS = int(os.environ.get("MIN_SUCCESS_ROWS", "500"))

# Fuzzy-match threshold for name matching (0–1)
FUZZY_THRESHOLD = 0.85

# ── Validation constants ───────────────────────────────────────────────────────

ACCEPTANCE_RATE_MIN = 0.01
ACCEPTANCE_RATE_MAX = 0.99
SAT_MIN, SAT_MAX = 400, 1600
ACT_MIN, ACT_MAX = 1, 36

# ── Source imports (lazy — only fail if all three fail) ───────────────────────

def _import_sources():
    """
    Import all three source modules.  Returns a dict of {name: module}.
    Each module exposes a fetch() function.
    """
    import importlib
    sources = {}
    for name in ("ipeds", "scorecard", "collegedata_csv"):
        try:
            mod = importlib.import_module(f"scraper.sources.{name}")
            sources[name] = mod
        except ImportError as exc:
            log.warning(f"Could not import source '{name}': {exc}")
    return sources

# ── Name normalisation ────────────────────────────────────────────────────────

_PUNCT_RE = re.compile(r"[^\w\s]")


def _normalise_name(name: str) -> str:
    """
    Normalise an institution name for matching.
    Lowercases, strips punctuation, collapses whitespace, removes accents.
    """
    # Decompose unicode (e.g. é → e + combining accent) then strip non-ASCII
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_only = nfkd.encode("ascii", "ignore").decode("ascii")
    lower = ascii_only.lower()
    no_punct = _PUNCT_RE.sub(" ", lower)
    return " ".join(no_punct.split())


# ── Field validators ──────────────────────────────────────────────────────────

def _validate_acceptance_rate(value, college_name: str) -> Optional[float]:
    """
    Validate and return acceptance_rate as a decimal in [0.01, 0.99].
    Converts percentage form (e.g. 18.5 → 0.185) automatically.
    Logs and returns None if the value is invalid.
    """
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        log.debug(f"[{college_name}] invalid acceptance_rate type: {value!r}")
        return None

    # Convert percent form to decimal if > 1
    if v > 1.0:
        v = v / 100.0

    if not (ACCEPTANCE_RATE_MIN <= v <= ACCEPTANCE_RATE_MAX):
        log.debug(
            f"[{college_name}] acceptance_rate={v:.4f} out of range "
            f"[{ACCEPTANCE_RATE_MIN}, {ACCEPTANCE_RATE_MAX}] — skipped"
        )
        return None

    return round(v, 6)


def _validate_sat(value) -> Optional[int]:
    """Validate SAT composite score (400–1600). Returns None if out of range."""
    if value is None:
        return None
    try:
        v = int(value)
    except (TypeError, ValueError):
        return None
    return v if SAT_MIN <= v <= SAT_MAX else None


def _validate_act(value) -> Optional[int]:
    """Validate ACT composite score (1–36). Returns None if out of range."""
    if value is None:
        return None
    try:
        v = int(value)
    except (TypeError, ValueError):
        return None
    return v if ACT_MIN <= v <= ACT_MAX else None


def _validate_positive_int(value) -> Optional[int]:
    """Validate a positive integer (enrollment, applicants, tuition, earnings)."""
    if value is None:
        return None
    try:
        v = int(float(value))
    except (TypeError, ValueError):
        return None
    return v if v > 0 else None


def _validate_rate(value) -> Optional[float]:
    """Validate a rate/fraction in [0.0, 1.0] (completion rate, etc.)."""
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return round(v, 6) if 0.0 <= v <= 1.0 else None


def validate_record(record: dict) -> dict:
    """
    Validate all numeric fields of a merged college record in place.
    Invalid values are set to None (they will not overwrite existing DB data).
    Returns the cleaned record.
    """
    name = record.get("name", "")
    record["acceptance_rate"] = _validate_acceptance_rate(record.get("acceptance_rate"), name)
    record["median_sat_25"] = _validate_sat(record.get("median_sat_25"))
    record["median_sat_75"] = _validate_sat(record.get("median_sat_75"))
    record["median_act_25"] = _validate_act(record.get("median_act_25"))
    record["median_act_75"] = _validate_act(record.get("median_act_75"))
    record["total_enrollment"] = _validate_positive_int(record.get("total_enrollment"))
    record["applications_received"] = _validate_positive_int(record.get("applications_received"))
    record["tuition_in_state"] = _validate_positive_int(record.get("tuition_in_state"))
    record["tuition_out_of_state"] = _validate_positive_int(record.get("tuition_out_of_state"))
    record["completion_rate"] = _validate_rate(record.get("completion_rate"))
    record["median_earnings_post_grad"] = _validate_positive_int(
        record.get("median_earnings_post_grad")
    )
    return record


# ── Merge logic ───────────────────────────────────────────────────────────────

def merge_sources(
    ipeds: list[dict],
    scorecard: list[dict],
    nces: list[dict],
) -> dict[str, dict]:
    """
    Merge records from three sources into a name-keyed dict.

    Priority order (highest wins for non-null values):
        IPEDS > Scorecard > NCES CSV

    This means for acceptance_rate and enrollment, IPEDS takes precedence;
    for earnings and completion, Scorecard takes precedence; NCES fills gaps.
    """
    merged: dict[str, dict] = {}

    def _apply(records: list[dict], source_priority: int) -> None:
        for rec in records:
            key = _normalise_name(rec.get("name", ""))
            if not key:
                continue
            existing = merged.setdefault(key, {"name": rec["name"]})
            for field, val in rec.items():
                if val is not None:
                    # Sources are applied in ascending priority order so that
                    # higher-priority sources (applied last) overwrite lower ones.
                    existing[field] = val
            existing["_priority"] = max(existing.get("_priority", 0), source_priority)

    # Applied in ascending priority: NCES sets baseline, Scorecard fills earnings/
    # completion, IPEDS overwrites admission/enrollment (highest priority, last applied).
    _apply(nces, source_priority=1)
    _apply(scorecard, source_priority=2)
    _apply(ipeds, source_priority=3)

    return merged


# ── Database helpers ──────────────────────────────────────────────────────────

@retry(stop=stop_after_attempt(4), wait=wait_exponential(min=2, max=20))
def _get_connection(db_url: str) -> psycopg2.extensions.connection:
    """Open a psycopg2 connection with retry logic."""
    conn = psycopg2.connect(db_url)
    conn.set_session(autocommit=False)
    return conn


def load_db_colleges(conn) -> dict[str, int]:
    """
    Load all (normalised_name → id) pairs from colleges_comprehensive.
    Used for fuzzy matching incoming scraper records to DB rows.
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id, name FROM colleges_comprehensive ORDER BY id")
        rows = cur.fetchall()
    return {_normalise_name(row["name"]): row["id"] for row in rows}


def find_college_id(name: str, db_lookup: dict[str, int]) -> Optional[int]:
    """
    Find the DB id for a college by normalised name.

    Steps:
      1. Exact match on normalised name.
      2. 30-character prefix match.
      3. SequenceMatcher fuzzy match (threshold: FUZZY_THRESHOLD).

    Returns None if no match meets the threshold.
    """
    key = _normalise_name(name)

    # 1. Exact
    if key in db_lookup:
        return db_lookup[key]

    # 2. Prefix (handles "University of California Berkeley" vs "UC Berkeley" less well,
    #    but good for truncated names)
    prefix = key[:30]
    for k, cid in db_lookup.items():
        if k[:30] == prefix:
            return cid

    # 3. Fuzzy
    best_score = 0.0
    best_id = None
    for k, cid in db_lookup.items():
        score = SequenceMatcher(None, key, k).ratio()
        if score > best_score:
            best_score = score
            best_id = cid

    if best_score >= FUZZY_THRESHOLD:
        return best_id

    return None


# ── Upsert ────────────────────────────────────────────────────────────────────

# Uses COALESCE so existing non-null DB values survive if the new value is NULL.
_UPSERT_SQL = """
    UPDATE colleges_comprehensive
    SET
        acceptance_rate           = COALESCE(%s, acceptance_rate),
        total_enrollment          = COALESCE(%s, total_enrollment),
        applications_received     = COALESCE(%s, applications_received),
        median_sat_25             = COALESCE(%s, median_sat_25),
        median_sat_75             = COALESCE(%s, median_sat_75),
        median_act_25             = COALESCE(%s, median_act_25),
        median_act_75             = COALESCE(%s, median_act_75),
        tuition_in_state          = COALESCE(%s, tuition_in_state),
        tuition_out_of_state      = COALESCE(%s, tuition_out_of_state),
        completion_rate           = COALESCE(%s, completion_rate),
        median_earnings_post_grad = COALESCE(%s, median_earnings_post_grad),
        data_source               = %s,
        last_data_refresh         = NOW()
    WHERE id = %s
    RETURNING id;
"""


def upsert_college(conn, college_id: int, data: dict) -> bool:
    """
    Upsert a single validated college record into colleges_comprehensive.

    Uses a parameterized UPDATE … RETURNING id — never string interpolation.
    Returns True if the row was updated, False otherwise.
    """
    params = (
        data.get("acceptance_rate"),
        data.get("total_enrollment"),
        data.get("applications_received"),
        data.get("median_sat_25"),
        data.get("median_sat_75"),
        data.get("median_act_25"),
        data.get("median_act_75"),
        data.get("tuition_in_state"),
        data.get("tuition_out_of_state"),
        data.get("completion_rate"),
        data.get("median_earnings_post_grad"),
        data.get("data_source", "IPEDS"),
        college_id,
    )
    with conn.cursor() as cur:
        cur.execute(_UPSERT_SQL, params)
        return cur.fetchone() is not None


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    """
    Run the full data pipeline:
      1. Fetch from all three sources (concurrently where possible).
      2. Merge with priority: IPEDS > Scorecard > NCES CSV.
      3. Validate every field.
      4. Upsert into PostgreSQL.
      5. Exit 1 if fewer than MIN_SUCCESS_ROWS rows were updated.
    """
    db_url = os.environ.get("SUPABASE_DB_URL", "") or os.environ.get("DATABASE_URL", "")
    if not db_url:
        log.error("SUPABASE_DB_URL (or DATABASE_URL) is not set. Aborting.")
        return 1

    # ── Step 1: Fetch from all sources ───────────────────────────────────────
    sources = _import_sources()
    if not sources:
        log.error("No source modules available. Aborting.")
        return 1

    ipeds_data: list[dict] = []
    scorecard_data: list[dict] = []
    nces_data: list[dict] = []

    sources_succeeded = 0

    if "ipeds" in sources:
        try:
            ipeds_data = sources["ipeds"].fetch()
            if ipeds_data:
                sources_succeeded += 1
                log.info(f"IPEDS: {len(ipeds_data)} records")
        except Exception as exc:
            log.error(f"IPEDS source failed: {exc}", exc_info=True)

    if "scorecard" in sources:
        try:
            scorecard_data = sources["scorecard"].fetch()
            if scorecard_data:
                sources_succeeded += 1
                log.info(f"Scorecard: {len(scorecard_data)} records")
        except Exception as exc:
            log.error(f"Scorecard source failed: {exc}", exc_info=True)

    if "collegedata_csv" in sources:
        try:
            nces_data = sources["collegedata_csv"].fetch()
            if nces_data:
                sources_succeeded += 1
                log.info(f"NCES CSV: {len(nces_data)} records")
        except Exception as exc:
            log.error(f"NCES CSV source failed: {exc}", exc_info=True)

    if sources_succeeded == 0:
        log.error("All three data sources failed. Aborting.")
        return 1

    log.info(f"{sources_succeeded}/3 sources succeeded")

    # ── Step 2: Merge ─────────────────────────────────────────────────────────
    merged = merge_sources(ipeds_data, scorecard_data, nces_data)
    log.info(f"Merged {len(merged)} unique institutions from all sources")

    # ── Step 3: Connect to DB ─────────────────────────────────────────────────
    conn = None
    rows_updated = 0
    rows_skipped_no_match = 0
    rows_skipped_no_data = 0
    rows_skipped_error = 0

    try:
        conn = _get_connection(db_url)
        db_colleges = load_db_colleges(conn)
        log.info(f"DB has {len(db_colleges)} colleges to match against")

        # ── Step 4: Validate + Upsert ─────────────────────────────────────────
        for _key, record in merged.items():
            name = record.get("name", "")
            college_id = find_college_id(name, db_colleges)

            if college_id is None:
                rows_skipped_no_match += 1
                log.debug(f"[SKIP no-match] {name}")
                continue

            # Validate
            record = validate_record(record)

            # Skip if there is genuinely nothing useful to write
            useful_fields = (
                "acceptance_rate", "total_enrollment", "applications_received",
                "median_sat_25", "median_act_25", "completion_rate",
                "median_earnings_post_grad",
            )
            if not any(record.get(f) is not None for f in useful_fields):
                rows_skipped_no_data += 1
                log.debug(f"[SKIP no-data] {name}")
                continue

            try:
                ok = upsert_college(conn, college_id, record)
                if ok:
                    rows_updated += 1
                else:
                    rows_skipped_error += 1
                    log.debug(f"[SKIP upsert-empty] {name}")
            except Exception as exc:
                log.warning(f"[ERROR] Upsert failed for {name}: {exc}")
                conn.rollback()
                rows_skipped_error += 1
                continue

            # Commit in batches of 200 to reduce memory pressure
            if rows_updated % 200 == 0:
                conn.commit()

        conn.commit()

    except Exception as exc:
        log.error(f"Fatal DB error: {exc}", exc_info=True)
        if conn:
            conn.rollback()
        return 1
    finally:
        if conn:
            conn.close()

    # ── Step 5: Summary + exit code ───────────────────────────────────────────
    log.info("─" * 60)
    log.info(f"Pipeline complete:")
    log.info(f"  rows updated        : {rows_updated}")
    log.info(f"  skipped (no DB match): {rows_skipped_no_match}")
    log.info(f"  skipped (no data)   : {rows_skipped_no_data}")
    log.info(f"  skipped (error)     : {rows_skipped_error}")
    log.info("─" * 60)

    print(f"ROWS_UPSERTED={rows_updated}")

    if rows_updated < MIN_SUCCESS_ROWS:
        log.error(
            f"Only {rows_updated} rows updated — below minimum threshold of "
            f"{MIN_SUCCESS_ROWS}. Exiting with code 1."
        )
        return 1

    log.info(f"✓ Success: {rows_updated} rows updated (threshold: {MIN_SUCCESS_ROWS})")
    return 0


if __name__ == "__main__":
    sys.exit(main())

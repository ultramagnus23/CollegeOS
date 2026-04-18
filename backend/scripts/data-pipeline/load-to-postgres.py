#!/usr/bin/env python3
"""
Load Staged Data to PostgreSQL (colleges_comprehensive)
────────────────────────────────────────────────────────
Reads the three validated staging JSON files (IPEDS, CDS, NCES CSV) and
performs a priority-merge before upserting into colleges_comprehensive.

Merge priority (highest wins):
  1. CDS    — institutional self-reported, highest accuracy for admission data
  2. IPEDS  — Scorecard API, authoritative federal data
  3. NCES   — CSV bulk data, good for trends but slightly older

Matching strategy:
  1. Exact name match (case-insensitive)
  2. Prefix match (first 30 chars)
  3. Fuzzy match (difflib SequenceMatcher ≥ 0.85)

Required env vars:
    DATABASE_URL

Optional env vars:
    IPEDS_STAGING_PATH      (default: /tmp/ipeds_staging.json)
    CDS_STAGING_PATH        (default: /tmp/cds_staging.json)
    COLLEGEDATA_STAGING_PATH (default: /tmp/collegedata_staging.json)
    DRY_RUN                 If set to "1", prints SQL without executing
"""

import json
import logging
import os
import sys
from difflib import SequenceMatcher
from typing import Optional

import psycopg2
import psycopg2.extras
import yaml
from tenacity import retry, stop_after_attempt, wait_exponential

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
log = logging.getLogger("load_to_postgres")

DATABASE_URL = os.environ.get("DATABASE_URL", "")
IPEDS_STAGING_PATH = os.environ.get("IPEDS_STAGING_PATH", "/tmp/ipeds_staging.json")
CDS_STAGING_PATH = os.environ.get("CDS_STAGING_PATH", "/tmp/cds_staging.json")
COLLEGEDATA_STAGING_PATH = os.environ.get(
    "COLLEGEDATA_STAGING_PATH", "/tmp/collegedata_staging.json"
)
DRY_RUN = os.environ.get("DRY_RUN", "0") == "1"

# Fuzzy match threshold (0–1). 0.85 avoids false positives on similarly-named schools.
FUZZY_THRESHOLD = 0.85

# ── DB helpers ────────────────────────────────────────────────────────────────


@retry(stop=stop_after_attempt(4), wait=wait_exponential(min=2, max=20))
def get_connection():
    conn = psycopg2.connect(DATABASE_URL)
    conn.set_session(autocommit=False)
    return conn


def load_db_colleges(conn) -> dict:
    """Load all college names + ids from DB into a lowercase lookup dict."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id, name FROM colleges_comprehensive ORDER BY id")
        rows = cur.fetchall()
    return {row["name"].strip().lower(): row["id"] for row in rows}


def fuzzy_match(name: str, db_lookup: dict) -> Optional[int]:
    """
    Find the best fuzzy match for `name` in db_lookup.
    Returns the college_id if similarity ≥ FUZZY_THRESHOLD, else None.
    """
    name_lower = name.strip().lower()

    # Exact match
    if name_lower in db_lookup:
        return db_lookup[name_lower]

    # Prefix match (first 30 chars)
    prefix = name_lower[:30]
    for k, v in db_lookup.items():
        if k[:30] == prefix:
            return v

    # Fuzzy
    best_score = 0.0
    best_id = None
    for k, cid in db_lookup.items():
        score = SequenceMatcher(None, name_lower, k).ratio()
        if score > best_score:
            best_score = score
            best_id = cid

    return best_id if best_score >= FUZZY_THRESHOLD else None


# ── Data loading ──────────────────────────────────────────────────────────────


def load_staging(path: str, label: str) -> list[dict]:
    if not os.path.exists(path):
        log.warning(f"[{label}] Staging file not found: {path}")
        return []
    with open(path) as fh:
        records = json.load(fh)
    log.info(f"[{label}] Loaded {len(records)} staged records")
    return records


def merge_sources(
    ipeds: list[dict],
    cds: list[dict],
    nces: list[dict],
) -> dict[str, dict]:
    """
    Build a name-keyed dict of merged college records.
    Priority: CDS > IPEDS > NCES (higher priority overwrites lower for non-null values).
    """
    merged: dict[str, dict] = {}

    # Start with lowest priority
    for rec in nces:
        key = rec.get("name", "").strip().lower()
        if key:
            merged[key] = dict(rec)

    # Overwrite with IPEDS where non-null
    for rec in ipeds:
        key = rec.get("name", "").strip().lower()
        if not key:
            continue
        existing = merged.setdefault(key, {"name": rec["name"]})
        for field, val in rec.items():
            if val is not None:
                existing[field] = val

    # Overwrite with CDS (highest priority) where non-null
    for rec in cds:
        key = rec.get("name", "").strip().lower()
        if not key:
            continue
        existing = merged.setdefault(key, {"name": rec["name"]})
        for field, val in rec.items():
            if val is not None:
                existing[field] = val

    return merged


# ── Upsert ────────────────────────────────────────────────────────────────────

_UPSERT_SQL = """
    UPDATE colleges_comprehensive
    SET
        acceptance_rate       = COALESCE(%s, acceptance_rate),
        sat_25                = COALESCE(%s, sat_25),
        sat_75                = COALESCE(%s, sat_75),
        act_25                = COALESCE(%s, act_25),
        act_75                = COALESCE(%s, act_75),
        act_avg               = COALESCE(%s, act_avg),
        total_enrollment      = COALESCE(%s, total_enrollment),
        applications_received = COALESCE(%s, applications_received),
        yield_rate            = COALESCE(%s, yield_rate),
        data_source           = %s,
        last_data_refresh     = NOW()
    WHERE id = %s
    RETURNING id;
"""


def upsert_college(conn, college_id: int, data: dict, dry_run: bool = False) -> bool:
    """Upsert a single college record. Returns True on success."""
    params = (
        data.get("acceptance_rate"),
        data.get("sat_25"),
        data.get("sat_75"),
        data.get("act_25"),
        data.get("act_75"),
        data.get("act_avg"),
        data.get("total_enrollment"),
        data.get("applications_received"),
        data.get("yield_rate"),
        data.get("data_source", "IPEDS"),
        college_id,
    )

    if dry_run:
        log.info(f"[DRY_RUN] Would upsert college_id={college_id}: {data.get('name')}")
        return True

    with conn.cursor() as cur:
        cur.execute(_UPSERT_SQL, params)
        return cur.fetchone() is not None


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    log.info("load-to-postgres.py started")

    if not DATABASE_URL:
        log.error("DATABASE_URL is not set. Exiting.")
        return 1

    if DRY_RUN:
        log.info("DRY_RUN mode enabled — no writes to database")

    # Load staging files
    ipeds_data = load_staging(IPEDS_STAGING_PATH, "IPEDS")
    cds_data = load_staging(CDS_STAGING_PATH, "CDS")
    nces_data = load_staging(COLLEGEDATA_STAGING_PATH, "NCES_CSV")

    if not ipeds_data and not cds_data and not nces_data:
        log.error("All staging files are empty or missing. Exiting.")
        return 1

    # Merge sources
    merged = merge_sources(ipeds_data, cds_data, nces_data)
    log.info(f"Merged {len(merged)} unique colleges from all sources")

    # Connect to DB and load college lookup
    conn = None
    rows_updated = 0
    rows_skipped = 0

    try:
        conn = get_connection()
        db_colleges = load_db_colleges(conn)
        log.info(f"Database has {len(db_colleges)} colleges")

        for _key, data in merged.items():
            name = data.get("name", "")
            college_id = fuzzy_match(name, db_colleges)

            if college_id is None:
                log.debug(f"[SKIP] No DB match for: {name}")
                rows_skipped += 1
                continue

            try:
                ok = upsert_college(conn, college_id, data, dry_run=DRY_RUN)
                if ok:
                    rows_updated += 1
                else:
                    log.debug(f"[SKIP] Upsert returned no row for: {name}")
                    rows_skipped += 1
            except Exception as exc:
                log.warning(f"[ERROR] Upsert failed for {name}: {exc}")
                conn.rollback()
                rows_skipped += 1
                continue

            # Commit in batches of 100
            if rows_updated % 100 == 0 and not DRY_RUN:
                conn.commit()

        if not DRY_RUN:
            conn.commit()

        log.info(
            f"✓ Load complete: {rows_updated} colleges updated, "
            f"{rows_skipped} skipped (no DB match or error)"
        )

        # Log refresh summary
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT COUNT(*) FROM colleges_comprehensive
                    WHERE last_data_refresh > NOW() - INTERVAL '1 day';
                """)
                recently_refreshed = cur.fetchone()[0]
            log.info(f"Last refresh: {recently_refreshed} colleges updated in last 24h")
        except Exception as exc:
            log.debug(f"Could not fetch refresh summary: {exc}")

        print(f"ROWS_UPSERTED={rows_updated}")
        return 0

    except Exception as exc:
        log.error(f"Fatal error: {exc}", exc_info=True)
        if conn:
            conn.rollback()
        return 1
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
# CollegeOS Auto-generated scraper/admissions_scraper.py — do not edit manually
"""
Admissions Stats Scraper
────────────────────────
For every college in the colleges table, fetches and upserts:
  acceptance_rate, median_sat, median_act, median_gpa_admitted,
  total_applicants, total_admitted, yield_rate,
  ed_acceptance_rate, ea_acceptance_rate

Sources (tried in order):
  1. College Scorecard API (data.ed.gov) — requires DATA_GOV_API_KEY
  2. Cached / stale data fallback (marks row as data_freshness='stale')

Required environment variables
───────────────────────────────
    DATABASE_URL

Optional
────────
    DATA_GOV_API_KEY    (College Scorecard)
    ADMISSIONS_YEAR     (default: 2023)
    REQUEST_DELAY_SEC   (default: 1.0)
"""

import os
import sys
import time
import logging
import requests
import psycopg2
import psycopg2.extras
from tenacity import retry, stop_after_attempt, wait_exponential

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("admissions_scraper")

DATABASE_URL = os.environ["DATABASE_URL"]
DATA_GOV_API_KEY = os.environ.get("DATA_GOV_API_KEY", "")
ADMISSIONS_YEAR = int(os.environ.get("ADMISSIONS_YEAR", "2023"))
REQUEST_DELAY = float(os.environ.get("REQUEST_DELAY_SEC", "1.0"))

SCORECARD_BASE = "https://api.data.gov/ed/collegescorecard/v1/schools"

# ── DB helpers ────────────────────────────────────────────────────────────────


@retry(stop=stop_after_attempt(5), wait=wait_exponential(min=2, max=30))
def get_connection():
    conn = psycopg2.connect(DATABASE_URL)
    conn.set_session(autocommit=False)
    return conn


def safe_execute(conn, fn):
    """Re-connect on OperationalError (dropped connection mid-run)."""
    try:
        return fn(conn)
    except psycopg2.OperationalError:
        conn = get_connection()
        return fn(conn)


def load_colleges(conn) -> list[dict]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id, name FROM colleges ORDER BY id")
        return cur.fetchall()


def upsert_admissions_stats(conn, college_id: int, year: int, stats: dict,
                             freshness: str = "fresh") -> None:
    sql = """
        INSERT INTO college_admissions_stats
          (college_id, year, acceptance_rate, median_sat, median_act,
           median_gpa_admitted, total_applicants, total_admitted,
           yield_rate, ed_acceptance_rate, ea_acceptance_rate,
           data_freshness, updated_at)
        VALUES
          (%(college_id)s, %(year)s, %(acceptance_rate)s, %(median_sat)s, %(median_act)s,
           %(median_gpa_admitted)s, %(total_applicants)s, %(total_admitted)s,
           %(yield_rate)s, %(ed_acceptance_rate)s, %(ea_acceptance_rate)s,
           %(data_freshness)s, NOW())
        ON CONFLICT (college_id, year)
          DO UPDATE SET
            acceptance_rate     = EXCLUDED.acceptance_rate,
            median_sat          = EXCLUDED.median_sat,
            median_act          = EXCLUDED.median_act,
            median_gpa_admitted = EXCLUDED.median_gpa_admitted,
            total_applicants    = EXCLUDED.total_applicants,
            total_admitted      = EXCLUDED.total_admitted,
            yield_rate          = EXCLUDED.yield_rate,
            ed_acceptance_rate  = EXCLUDED.ed_acceptance_rate,
            ea_acceptance_rate  = EXCLUDED.ea_acceptance_rate,
            data_freshness      = EXCLUDED.data_freshness,
            updated_at          = NOW()
    """
    params = {
        "college_id": college_id,
        "year": year,
        "acceptance_rate": stats.get("acceptance_rate"),
        "median_sat": stats.get("median_sat"),
        "median_act": stats.get("median_act"),
        "median_gpa_admitted": stats.get("median_gpa_admitted"),
        "total_applicants": stats.get("total_applicants"),
        "total_admitted": stats.get("total_admitted"),
        "yield_rate": stats.get("yield_rate"),
        "ed_acceptance_rate": stats.get("ed_acceptance_rate"),
        "ea_acceptance_rate": stats.get("ea_acceptance_rate"),
        "data_freshness": freshness,
    }
    with conn.cursor() as cur:
        cur.execute(sql, params)
    conn.commit()


def get_existing_stats(conn, college_id: int, year: int) -> dict:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT * FROM college_admissions_stats WHERE college_id=%s AND year=%s",
            (college_id, year)
        )
        row = cur.fetchone()
        return dict(row) if row else {}


# ── Scorecard API ─────────────────────────────────────────────────────────────

def _safe(r: dict, key: str):
    """Return None for missing, empty, or PrivacySuppressed values."""
    v = r.get(key)
    return None if v in (None, "", "PrivacySuppressed") else v


BULK_FIELDS = ",".join([
    "id",
    "school.name",
    "latest.admissions.admission_rate.overall",
    "latest.admissions.sat_scores.midpoint.critical_reading",
    "latest.admissions.sat_scores.midpoint.math",
    "latest.admissions.act_scores.midpoint.cumulative",
    "latest.admissions.applicants.total",
    "latest.admissions.admissions_yield_all",
])


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _fetch_scorecard_page(page: int) -> list[dict]:
    if not DATA_GOV_API_KEY:
        return []
    params = {
        "api_key": DATA_GOV_API_KEY,
        "_fields": BULK_FIELDS,
        "per_page": 100,
        "page": page,
    }
    resp = requests.get(SCORECARD_BASE, params=params, timeout=20)
    resp.raise_for_status()
    return resp.json().get("results", [])


def fetch_all_scorecard() -> dict:
    """
    Bulk-fetch all Scorecard schools (~63 pages of 100) and return a dict
    keyed by lowercased, stripped school.name for fast O(1) lookup.
    Reduces ~6200 per-college API calls to ~63 bulk calls.
    """
    if not DATA_GOV_API_KEY:
        return {}
    lookup: dict = {}
    page = 0
    while True:
        results = _fetch_scorecard_page(page)
        if not results:
            break
        for r in results:
            name = (r.get("school.name") or "").strip().lower()
            if name:
                lookup[name] = r
        log.debug(f"Fetched Scorecard page {page} ({len(results)} records)")
        if len(results) < 100:
            break
        page += 1
        time.sleep(REQUEST_DELAY)
    log.info(f"Scorecard bulk fetch complete: {len(lookup)} schools indexed.")
    return lookup


def scorecard_stats_for(r: dict) -> dict:
    """Map a single Scorecard result dict to admissions stats fields."""
    cr = _safe(r, "latest.admissions.sat_scores.midpoint.critical_reading")
    math = _safe(r, "latest.admissions.sat_scores.midpoint.math")
    median_sat = int(cr + math) if cr and math else None
    return {
        "acceptance_rate": _safe(r, "latest.admissions.admission_rate.overall"),
        "median_sat": median_sat,
        "median_act": _safe(r, "latest.admissions.act_scores.midpoint.cumulative"),
        "total_applicants": _safe(r, "latest.admissions.applicants.total"),
        "yield_rate": _safe(r, "latest.admissions.admissions_yield_all"),
    }


def match_college(college_name: str, lookup: dict) -> dict:
    """
    Look up a college in the Scorecard lookup dict.
    Tries exact lowercase match first, then falls back to first-30-char prefix.
    """
    key = college_name.strip().lower()
    if key in lookup:
        return lookup[key]
    prefix = key[:30]
    for k, v in lookup.items():
        if k[:30] == prefix:
            return v
    return {}


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    log.info("Admissions scraper started.")
    conn = None
    rows_upserted = 0
    stale_count = 0

    try:
        conn = get_connection()
        colleges = load_colleges(conn)
        log.info(f"Loaded {len(colleges)} colleges.")

        # Bulk-fetch all Scorecard data upfront (~63 API calls vs ~6200)
        log.info("Fetching Scorecard data in bulk...")
        scorecard_lookup = fetch_all_scorecard()
        log.info(f"Scorecard lookup ready: {len(scorecard_lookup)} entries.")

        for college in colleges:
            college_id = college["id"]
            college_name = college["name"]

            try:
                raw = match_college(college_name, scorecard_lookup)
                stats = scorecard_stats_for(raw) if raw else {}

                if stats and any(v is not None for v in stats.values()):
                    upsert_admissions_stats(conn, college_id, ADMISSIONS_YEAR, stats, "fresh")
                    rows_upserted += 1
                    log.debug(f"Upserted stats for {college_name}")
                else:
                    existing = get_existing_stats(conn, college_id, ADMISSIONS_YEAR)
                    if existing:
                        upsert_admissions_stats(conn, college_id, ADMISSIONS_YEAR, existing, "stale")
                        stale_count += 1
                        log.debug(f"Marked stale: {college_name}")
                    else:
                        log.debug(f"No data available for {college_name}")

            except Exception as e:
                log.warning(f"Failed to scrape {college_name}: {e}")
                try:
                    existing = get_existing_stats(conn, college_id, ADMISSIONS_YEAR)
                    if existing:
                        upsert_admissions_stats(conn, college_id, ADMISSIONS_YEAR, existing, "stale")
                        stale_count += 1
                except Exception as db_err:
                    log.error(f"DB error for {college_name}: {db_err}")

        log.info(f"Done. {rows_upserted} upserted fresh, {stale_count} marked stale.")
        print(f"ROWS_UPSERTED={rows_upserted}")

        # Fix 10 — Write scrape history record (ignore if table missing)
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO scrape_history (scraper_name, rows_upserted, status, ran_at)
                    VALUES (%s, %s, 'success', NOW())
                    ON CONFLICT DO NOTHING
                """, ('admissions_scraper', rows_upserted))
                conn.commit()
        except Exception as e:
            log.warning(f"Could not write scrape_history (table may not exist): {e}")
            conn.rollback()

        return 0

    except Exception as e:
        log.error(f"Fatal error: {e}", exc_info=True)
        return 1
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    sys.exit(main())

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
DATA_GOV_API_KEY = os.environ.get("DATA_GOV_API_KEY") or os.environ.get("COLLEGE_SCORECARD_API_KEY", "")
ADMISSIONS_YEAR = int(os.environ.get("ADMISSIONS_YEAR", "2023"))

if not DATA_GOV_API_KEY:
    log.warning(
        "DATA_GOV_API_KEY is not set — College Scorecard lookups will be skipped. "
        "Get a free key at https://api.data.gov/signup/ and set DATA_GOV_API_KEY."
    )
REQUEST_DELAY = float(os.environ.get("REQUEST_DELAY_SEC", "1.0"))

SCORECARD_BASE = "https://api.data.ed.gov/student/v1/schools"

# ── DB helpers ────────────────────────────────────────────────────────────────


def get_connection():
    return psycopg2.connect(DATABASE_URL)


def load_colleges(conn) -> list[dict]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id, name FROM colleges_comprehensive ORDER BY id")
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

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def fetch_scorecard(college_name: str) -> dict:
    if not DATA_GOV_API_KEY:
        return {}
    params = {
        "school.name": college_name,
        "api_key": DATA_GOV_API_KEY,
        "_fields": (
            "school.name,"
            "latest.admissions.admission_rate.overall,"
            "latest.admissions.sat_scores.midpoint.critical_reading,"
            "latest.admissions.sat_scores.midpoint.math,"
            "latest.admissions.act_scores.midpoint.cumulative,"
            "latest.student.enrollment.undergrad_12_month,"
            "latest.admissions.admissions_yield_all,"
            "latest.admissions.applicants.total"
        ),
    }
    resp = requests.get(SCORECARD_BASE, params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    results = data.get("results", [])
    if not results:
        return {}
    r = results[0]

    # Combine SAT CR + Math midpoints
    cr = r.get("latest.admissions.sat_scores.midpoint.critical_reading")
    math = r.get("latest.admissions.sat_scores.midpoint.math")
    median_sat = int(cr + math) if cr and math else None

    return {
        "acceptance_rate": r.get("latest.admissions.admission_rate.overall"),
        "median_sat": median_sat,
        "median_act": r.get("latest.admissions.act_scores.midpoint.cumulative"),
        "total_applicants": r.get("latest.admissions.applicants.total"),
        "yield_rate": r.get("latest.admissions.admissions_yield_all"),
    }


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

        for college in colleges:
            college_id = college["id"]
            college_name = college["name"]

            try:
                stats = fetch_scorecard(college_name)
                time.sleep(REQUEST_DELAY)

                if stats:
                    upsert_admissions_stats(conn, college_id, ADMISSIONS_YEAR, stats, "fresh")
                    rows_upserted += 1
                    log.debug(f"Upserted stats for {college_name}")
                else:
                    # Keep existing data but mark stale
                    existing = get_existing_stats(conn, college_id, ADMISSIONS_YEAR)
                    if existing:
                        upsert_admissions_stats(conn, college_id, ADMISSIONS_YEAR, existing, "stale")
                        stale_count += 1
                        log.debug(f"Marked stale: {college_name}")
                    else:
                        log.debug(f"No data available for {college_name}")

            except Exception as e:
                log.warning(f"Failed to scrape {college_name}: {e}")
                # Never delete — mark stale if row exists
                try:
                    existing = get_existing_stats(conn, college_id, ADMISSIONS_YEAR)
                    if existing:
                        upsert_admissions_stats(conn, college_id, ADMISSIONS_YEAR, existing, "stale")
                        stale_count += 1
                except Exception as db_err:
                    log.error(f"DB error for {college_name}: {db_err}")

        log.info(f"Done. {rows_upserted} upserted fresh, {stale_count} marked stale.")
        print(f"ROWS_UPSERTED={rows_upserted}")
        return 0

    except Exception as e:
        log.error(f"Fatal error: {e}", exc_info=True)
        return 1
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    sys.exit(main())

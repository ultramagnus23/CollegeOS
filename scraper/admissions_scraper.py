#!/usr/bin/env python3
"""
Admissions Stats Scraper
────────────────────────
Fetches ALL College Scorecard data in ~63 paginated API calls,
then matches against our colleges DB by name. No per-college delays.
Total runtime: ~2-3 minutes for 6207 colleges.

Required env vars:
    DATABASE_URL
    DATA_GOV_API_KEY
"""

import os
import sys
import time
import logging
import difflib
import requests
import psycopg2
import psycopg2.extras

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
SCORECARD_BASE = "https://api.data.gov/ed/collegescorecard/v1/schools"

if not DATA_GOV_API_KEY:
    log.error("DATA_GOV_API_KEY is not set. Exiting.")
    sys.exit(1)


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


# ── Scorecard bulk fetch ───────────────────────────────────────────────────────

def fetch_all_scorecard_data() -> dict:
    """
    Paginates through entire Scorecard dataset (~7000 schools, 100 per page).
    Returns dict keyed by lowercase school name.
    ~63 API calls, ~30 seconds total.
    """
    all_data = {}
    page = 0
    per_page = 100

    while True:
        params = {
            "api_key": DATA_GOV_API_KEY,
            "per_page": per_page,
            "page": page,
            "_fields": (
                "school.name,"
                "id,"
                "latest.admissions.admission_rate.overall,"
                "latest.admissions.sat_scores.midpoint.critical_reading,"
                "latest.admissions.sat_scores.midpoint.math,"
                "latest.admissions.act_scores.midpoint.cumulative,"
                "latest.admissions.admissions_yield_all,"
                "latest.admissions.applicants.total"
            ),
        }

        try:
            resp = requests.get(SCORECARD_BASE, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            log.error(f"Scorecard API error on page {page}: {e}")
            break

        results = data.get("results", [])
        if not results:
            break

        for r in results:
            name = r.get("school.name", "")
            if not name:
                continue
            cr = r.get("latest.admissions.sat_scores.midpoint.critical_reading")
            math_score = r.get("latest.admissions.sat_scores.midpoint.math")
            median_sat = int(cr + math_score) if cr and math_score else None

            all_data[name.lower().strip()] = {
                "acceptance_rate": r.get("latest.admissions.admission_rate.overall"),
                "median_sat": median_sat,
                "median_act": r.get("latest.admissions.act_scores.midpoint.cumulative"),
                "total_applicants": r.get("latest.admissions.applicants.total"),
                "yield_rate": r.get("latest.admissions.admissions_yield_all"),
                "ed_acceptance_rate": None,
                "ea_acceptance_rate": None,
                "median_gpa_admitted": None,
                "total_admitted": None,
            }

        total = data.get("metadata", {}).get("total", 0)
        fetched = (page + 1) * per_page
        log.info(f"Scorecard page {page}: {min(fetched, total)}/{total} schools fetched")

        if fetched >= total:
            break

        page += 1
        time.sleep(0.3)

    log.info(f"Scorecard fetch complete: {len(all_data)} schools loaded")
    return all_data


def find_scorecard_match(college_name: str, scorecard_data: dict) -> dict:
    """Exact match first, then fuzzy match with 0.85 cutoff."""
    key = college_name.lower().strip()

    # exact
    if key in scorecard_data:
        return scorecard_data[key]

    # fuzzy
    matches = difflib.get_close_matches(key, scorecard_data.keys(), n=1, cutoff=0.85)
    if matches:
        log.debug(f"Fuzzy match: '{college_name}' → '{matches[0]}'")
        return scorecard_data[matches[0]]

    return {}


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    log.info("Admissions scraper started.")
    conn = None
    rows_upserted = 0
    stale_count = 0
    no_data_count = 0

    try:
        conn = get_connection()
        colleges = load_colleges(conn)
        log.info(f"Loaded {len(colleges)} colleges from DB.")

        log.info("Fetching all Scorecard data...")
        scorecard_data = fetch_all_scorecard_data()

        if not scorecard_data:
            log.error("Scorecard returned no data. Check API key. Exiting.")
            return 1

        log.info(f"Starting DB upserts for {len(colleges)} colleges...")

        for college in colleges:
            college_id = college["id"]
            college_name = college["name"]

            try:
                stats = find_scorecard_match(college_name, scorecard_data)

                if stats:
                    upsert_admissions_stats(conn, college_id, ADMISSIONS_YEAR, stats, "fresh")
                    rows_upserted += 1
                else:
                    existing = get_existing_stats(conn, college_id, ADMISSIONS_YEAR)
                    if existing:
                        upsert_admissions_stats(conn, college_id, ADMISSIONS_YEAR, existing, "stale")
                        stale_count += 1
                    else:
                        no_data_count += 1
                        log.debug(f"No data: {college_name}")

            except Exception as e:
                log.warning(f"Failed to process {college_name}: {e}")
                try:
                    existing = get_existing_stats(conn, college_id, ADMISSIONS_YEAR)
                    if existing:
                        upsert_admissions_stats(conn, college_id, ADMISSIONS_YEAR, existing, "stale")
                        stale_count += 1
                except Exception as db_err:
                    log.error(f"DB error for {college_name}: {db_err}")

        log.info(
            f"Done. {rows_upserted} fresh upserts, "
            f"{stale_count} marked stale, "
            f"{no_data_count} with no data at all."
        )
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

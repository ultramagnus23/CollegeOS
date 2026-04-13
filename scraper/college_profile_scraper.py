#!/usr/bin/env python3
# CollegeOS Auto-generated scraper/college_profile_scraper.py — do not edit manually
"""
College Profile Scraper (runs weekly)
──────────────────────────────────────
Keeps the colleges table fields fresh:
  tuition, room_and_board, enrollment, rankings, sat/act/gpa ranges,
  graduation rate, retention rate, campus details, popular_majors, etc.

Sources (tried in order):
  1. College Scorecard API (data.ed.gov)  — requires DATA_GOV_API_KEY
  2. Existing DB values kept as-is (no deletion)

Required environment variables
───────────────────────────────
    DATABASE_URL

Optional
────────
    DATA_GOV_API_KEY
    REQUEST_DELAY_SEC   (default: 2.0 — be gentle with upstream APIs)
"""

import os
import sys
import json
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
log = logging.getLogger("college_profile_scraper")

DATABASE_URL = os.environ["DATABASE_URL"]
DATA_GOV_API_KEY = os.environ.get("DATA_GOV_API_KEY", "")
REQUEST_DELAY = float(os.environ.get("REQUEST_DELAY_SEC", "2.0"))

SCORECARD_BASE = "https://api.data.gov/ed/collegescorecard/v1/schools"

SCORECARD_FIELDS = ",".join([
    "school.name",
    "school.city",
    "school.state",
    "school.school_url",
    "school.ownership",
    "school.locale",
    "latest.cost.tuition.in_state",
    "latest.cost.tuition.out_of_state",
    "latest.cost.roomboard.oncampus",
    "latest.cost.attendance.academic_year",
    "latest.student.enrollment.undergrad_12_month",
    "latest.student.enrollment.grad_12_month",
    "latest.student.grad_students",
    "latest.admissions.sat_scores.25th_percentile.critical_reading",
    "latest.admissions.sat_scores.75th_percentile.critical_reading",
    "latest.admissions.sat_scores.25th_percentile.math",
    "latest.admissions.sat_scores.75th_percentile.math",
    "latest.admissions.act_scores.25th_percentile.cumulative",
    "latest.admissions.act_scores.75th_percentile.cumulative",
    "latest.student.retention_rate.four_year.full_time",
    "latest.completion.completion_rate_4yr_150nt",
    "latest.student.demographics.race_ethnicity.white",
    "latest.academics.program_percentage.computer",
    "latest.academics.program_percentage.business_marketing",
    "latest.academics.program_percentage.engineering",
    "latest.academics.program_percentage.biological",
    "latest.academics.program_percentage.health",
    "latest.student.faculty_salary",
    "latest.student.demographics.race_ethnicity.non_white_total",
])

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


def update_college(conn, college_id: int, updates: dict) -> None:
    if not updates:
        return
    set_clauses = ", ".join(f"{k} = %({k})s" for k in updates)
    updates["college_id"] = college_id
    sql = f"""
        UPDATE colleges
        SET {set_clauses}, last_updated = NOW()
        WHERE id = %(college_id)s
    """
    with conn.cursor() as cur:
        cur.execute(sql, updates)
    conn.commit()


def column_exists(conn, table: str, column: str) -> bool:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT 1 FROM information_schema.columns
            WHERE table_name = %s AND column_name = %s
        """, (table, column))
        return cur.fetchone() is not None


# ── Scorecard API ─────────────────────────────────────────────────────────────

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def fetch_scorecard_profile(college_name: str) -> dict:
    if not DATA_GOV_API_KEY:
        return {}
    params = {
        "school.name": college_name,
        "api_key": DATA_GOV_API_KEY,
        "_fields": SCORECARD_FIELDS,
    }
    resp = requests.get(SCORECARD_BASE, params=params, timeout=15)
    resp.raise_for_status()
    results = resp.json().get("results", [])
    if not results:
        return {}
    r = results[0]

    # Build popular_majors from program percentages
    program_map = {
        "CS": r.get("latest.academics.program_percentage.computer"),
        "Business": r.get("latest.academics.program_percentage.business_marketing"),
        "Engineering": r.get("latest.academics.program_percentage.engineering"),
        "Biology": r.get("latest.academics.program_percentage.biological"),
        "Health": r.get("latest.academics.program_percentage.health"),
    }
    popular_majors = [k for k, v in sorted(
        program_map.items(), key=lambda x: x[1] or 0, reverse=True
    ) if v][:5]

    # Ownership → school_type
    ownership = r.get("school.ownership")
    school_type_map = {1: "public", 2: "private", 3: "private"}
    school_type = school_type_map.get(ownership)

    # Locale → campus_setting
    locale = r.get("school.locale")
    campus_setting = None
    if locale is not None:
        if locale in (11, 12, 13):
            campus_setting = "urban"
        elif locale in (21, 22, 23):
            campus_setting = "suburban"
        elif locale in (31, 32, 33, 41, 42, 43):
            campus_setting = "rural"

    cr25 = r.get("latest.admissions.sat_scores.25th_percentile.critical_reading")
    cr75 = r.get("latest.admissions.sat_scores.75th_percentile.critical_reading")
    m25 = r.get("latest.admissions.sat_scores.25th_percentile.math")
    m75 = r.get("latest.admissions.sat_scores.75th_percentile.math")

    sat25 = int(cr25 + m25) if cr25 and m25 else None
    sat75 = int(cr75 + m75) if cr75 and m75 else None

    # Diversity score: % non-white
    non_white = r.get("latest.student.demographics.race_ethnicity.non_white_total")
    diversity_score = round(float(non_white) * 100, 1) if non_white else None

    return {
        "tuition_in_state": r.get("latest.cost.tuition.in_state"),
        "tuition_out_state": r.get("latest.cost.tuition.out_of_state"),
        "room_and_board": r.get("latest.cost.roomboard.oncampus"),
        "total_cost_of_attendance": r.get("latest.cost.attendance.academic_year"),
        "undergrad_enrollment": r.get("latest.student.enrollment.undergrad_12_month"),
        "grad_enrollment": r.get("latest.student.enrollment.grad_12_month"),
        "sat_range_25th": sat25,
        "sat_range_75th": sat75,
        "act_range_25th": r.get("latest.admissions.act_scores.25th_percentile.cumulative"),
        "act_range_75th": r.get("latest.admissions.act_scores.75th_percentile.cumulative"),
        "retention_rate": r.get("latest.student.retention_rate.four_year.full_time"),
        "graduation_rate_4yr": r.get("latest.completion.completion_rate_4yr_150nt"),
        "diversity_score": diversity_score,
        "campus_setting": campus_setting,
        "school_type": school_type,
        "popular_majors": json.dumps(popular_majors) if popular_majors else None,
        "location_city": r.get("school.city"),
        "location_state": r.get("school.state"),
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def _filter_existing_columns(conn, updates: dict) -> dict:
    """Remove keys that don't exist as columns in the colleges table."""
    return {k: v for k, v in updates.items()
            if v is not None and column_exists(conn, "colleges", k)}


def main() -> int:
    log.info("College profile scraper started.")
    conn = None
    rows_upserted = 0

    try:
        conn = get_connection()
        colleges = load_colleges(conn)
        log.info(f"Loaded {len(colleges)} colleges.")

        for college in colleges:
            college_id = college["id"]
            college_name = college["name"]

            try:
                profile = fetch_scorecard_profile(college_name)
                time.sleep(REQUEST_DELAY)

                if profile:
                    updates = _filter_existing_columns(conn, profile)
                    if updates:
                        update_college(conn, college_id, updates)
                        rows_upserted += 1
                        log.debug(f"Updated profile for {college_name}")
                    else:
                        log.debug(f"No matching columns to update for {college_name}")
                else:
                    log.debug(f"No scorecard data for {college_name}")

            except Exception as e:
                log.warning(f"Failed to process {college_name}: {e}")

        log.info(f"Done. {rows_upserted} colleges updated.")
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

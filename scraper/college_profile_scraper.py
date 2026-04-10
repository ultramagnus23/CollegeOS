#!/usr/bin/env python3
"""
College Profile Scraper (runs weekly)
──────────────────────────────────────
Keeps core college data fresh by writing to the correct Supabase tables:
  colleges_comprehensive  — city, state, type, setting, total_enrollment
  college_admissions      — acceptance_rate, sat_avg, sat_range, act_range
  college_financial_data  — tuition_in_state, tuition_out_state, avg_net_price
  academic_details        — graduation_rate_4yr, retention_rate

Source:
  College Scorecard API (data.ed.gov) — requires DATA_GOV_API_KEY

Required environment variables
───────────────────────────────
    DATABASE_URL

Optional
────────
    DATA_GOV_API_KEY    (get a free key at https://api.data.gov/signup/)
    REQUEST_DELAY_SEC   (default: 2.0 — be gentle with upstream APIs)
    ADMISSIONS_YEAR     (default: 2023)
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
log = logging.getLogger("college_profile_scraper")

DATABASE_URL = os.environ["DATABASE_URL"]
DATA_GOV_API_KEY = os.environ.get("DATA_GOV_API_KEY", "")
REQUEST_DELAY = float(os.environ.get("REQUEST_DELAY_SEC", "2.0"))
ADMISSIONS_YEAR = int(os.environ.get("ADMISSIONS_YEAR", "2023"))

if not DATA_GOV_API_KEY:
    log.warning(
        "DATA_GOV_API_KEY is not set — College Scorecard lookups will be skipped. "
        "Get a free key at https://api.data.gov/signup/ and set DATA_GOV_API_KEY."
    )

SCORECARD_BASE = "https://api.data.ed.gov/student/v1/schools"

# Fields fetched from the College Scorecard API.
# Covers: admissions stats, SAT/ACT percentiles, financials, enrollment, and
# campus metadata needed to populate the four target Supabase tables.
SCORECARD_FIELDS = ",".join([
    "school.name",
    "school.city",
    "school.state",
    "school.ownership",
    "school.locale",
    "latest.admissions.admission_rate.overall",
    "latest.admissions.sat_scores.25th_percentile.critical_reading",
    "latest.admissions.sat_scores.75th_percentile.critical_reading",
    "latest.admissions.sat_scores.25th_percentile.math",
    "latest.admissions.sat_scores.75th_percentile.math",
    "latest.admissions.sat_scores.average.overall",
    "latest.admissions.act_scores.25th_percentile.cumulative",
    "latest.admissions.act_scores.75th_percentile.cumulative",
    "latest.cost.tuition.in_state",
    "latest.cost.tuition.out_of_state",
    "latest.cost.avg_net_price.public",
    "latest.cost.avg_net_price.private",
    "latest.student.enrollment.undergrad_12_month",
    "latest.student.retention_rate.four_year.full_time",
    "latest.completion.completion_rate_4yr_150nt",
])

# ── DB helpers ────────────────────────────────────────────────────────────────


def get_connection():
    return psycopg2.connect(DATABASE_URL)


def load_colleges(conn) -> list[dict]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id, name FROM colleges_comprehensive ORDER BY id")
        return cur.fetchall()


def _get_child_id(conn, table: str, college_id: int) -> int | None:
    """Return the PK of the first existing child row for a college, or None."""
    with conn.cursor() as cur:
        cur.execute(f"SELECT id FROM {table} WHERE college_id = %s ORDER BY id LIMIT 1",
                    (college_id,))
        row = cur.fetchone()
        return row[0] if row else None


def update_college_main(conn, college_id: int, data: dict) -> bool:
    """
    UPDATE colleges_comprehensive with basic profile fields.
    Only columns that are non-None and belong to the known safe set are touched.
    """
    allowed = {"city", "state", "type", "setting", "total_enrollment"}
    fields = {k: v for k, v in data.items() if k in allowed and v is not None}
    if not fields:
        return False
    set_parts = ", ".join(f"{k} = %({k})s" for k in fields)
    fields["_id"] = college_id
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE colleges_comprehensive SET {set_parts} WHERE id = %(_id)s",
            fields,
        )
    conn.commit()
    return True


def upsert_child_table(conn, table: str, college_id: int, data: dict) -> bool:
    """
    Insert or update a child table row keyed on college_id.
    Finds the existing row with _get_child_id; if found, UPDATEs it, otherwise INSERTs.
    Silently skips if there is nothing non-None to write.
    """
    payload = {k: v for k, v in data.items() if v is not None}
    if not payload:
        return False

    existing_id = _get_child_id(conn, table, college_id)
    if existing_id:
        set_parts = ", ".join(f"{k} = %({k})s" for k in payload)
        payload["_id"] = existing_id
        with conn.cursor() as cur:
            cur.execute(f"UPDATE {table} SET {set_parts} WHERE id = %(_id)s", payload)
    else:
        payload["college_id"] = college_id
        cols = ", ".join(payload.keys())
        placeholders = ", ".join(f"%({k})s" for k in payload)
        with conn.cursor() as cur:
            cur.execute(
                f"INSERT INTO {table} ({cols}) VALUES ({placeholders})",
                payload,
            )
    conn.commit()
    return True


# ── Scorecard API ─────────────────────────────────────────────────────────────

def _safe(r: dict, key: str):
    """Return the Scorecard value or None for missing/suppressed entries."""
    v = r.get(key)
    return None if v in (None, "", "PrivacySuppressed") else v


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def fetch_scorecard_profile(college_name: str) -> dict | None:
    """
    Fetch profile data from College Scorecard and map it to Supabase column names.

    Returns a flat dict with keys named after their target Supabase columns, or
    None if no result was found for the college.  Returns {} (empty) when
    DATA_GOV_API_KEY is not configured so the caller can skip gracefully.
    """
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
        return None
    r = results[0]

    # ── Admissions ──────────────────────────────────────────────────────────
    # Build SAT combined percentiles and format as "25th-75th" range string.
    cr25 = _safe(r, "latest.admissions.sat_scores.25th_percentile.critical_reading")
    cr75 = _safe(r, "latest.admissions.sat_scores.75th_percentile.critical_reading")
    m25  = _safe(r, "latest.admissions.sat_scores.25th_percentile.math")
    m75  = _safe(r, "latest.admissions.sat_scores.75th_percentile.math")
    sat25 = int(cr25 + m25) if (cr25 and m25) else None
    sat75 = int(cr75 + m75) if (cr75 and m75) else None
    sat_range = f"{sat25}-{sat75}" if (sat25 and sat75) else None
    # Prefer the Scorecard's own average; fall back to midpoint of our range.
    sat_avg_raw = _safe(r, "latest.admissions.sat_scores.average.overall")
    sat_avg = int(sat_avg_raw) if sat_avg_raw else (
        int((sat25 + sat75) / 2) if (sat25 and sat75) else None
    )

    act25 = _safe(r, "latest.admissions.act_scores.25th_percentile.cumulative")
    act75 = _safe(r, "latest.admissions.act_scores.75th_percentile.cumulative")
    act_range = (f"{int(act25)}-{int(act75)}" if (act25 and act75) else None)

    # ── Financials ──────────────────────────────────────────────────────────
    avg_net_price = (
        _safe(r, "latest.cost.avg_net_price.private")
        or _safe(r, "latest.cost.avg_net_price.public")
    )

    # ── Campus metadata ─────────────────────────────────────────────────────
    ownership = _safe(r, "school.ownership")
    school_type = {1: "public", 2: "private", 3: "private"}.get(ownership)

    locale = _safe(r, "school.locale")
    setting = None
    if locale is not None:
        if locale in (11, 12, 13):
            setting = "urban"
        elif locale in (21, 22, 23):
            setting = "suburban"
        elif locale in (31, 32, 33, 41, 42, 43):
            setting = "rural"

    return {
        # ── colleges_comprehensive fields ──────────────────────────────────
        "city":             _safe(r, "school.city"),
        "state":            _safe(r, "school.state"),
        "type":             school_type,
        "setting":          setting,
        "total_enrollment": _safe(r, "latest.student.enrollment.undergrad_12_month"),
        # ── college_admissions fields ──────────────────────────────────────
        "acceptance_rate":  _safe(r, "latest.admissions.admission_rate.overall"),
        "sat_avg":          sat_avg,
        "sat_range":        sat_range,
        "act_range":        act_range,
        # ── college_financial_data fields ──────────────────────────────────
        "tuition_in_state":  _safe(r, "latest.cost.tuition.in_state"),
        "tuition_out_state": _safe(r, "latest.cost.tuition.out_of_state"),
        "avg_net_price":     avg_net_price,
        # ── academic_details fields ────────────────────────────────────────
        "graduation_rate_4yr": _safe(r, "latest.completion.completion_rate_4yr_150nt"),
        "retention_rate":      _safe(r, "latest.student.retention_rate.four_year.full_time"),
    }


# ── Main ──────────────────────────────────────────────────────────────────────


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

                if not profile:
                    log.debug(f"No scorecard data for {college_name}")
                    continue

                changed = False

                # 1. Update colleges_comprehensive (city, state, type, setting, enrollment)
                if update_college_main(conn, college_id, profile):
                    changed = True

                # 2. Upsert college_admissions (acceptance rate + test score ranges)
                admissions = {
                    "acceptance_rate": profile.get("acceptance_rate"),
                    "sat_avg":         profile.get("sat_avg"),
                    "sat_range":       profile.get("sat_range"),
                    "act_range":       profile.get("act_range"),
                }
                if upsert_child_table(conn, "college_admissions", college_id, admissions):
                    changed = True

                # 3. Upsert college_financial_data (tuition + net price)
                financial = {
                    "tuition_in_state":  profile.get("tuition_in_state"),
                    "tuition_out_state": profile.get("tuition_out_state"),
                    "avg_net_price":     profile.get("avg_net_price"),
                }
                if upsert_child_table(conn, "college_financial_data", college_id, financial):
                    changed = True

                # 4. Upsert academic_details (graduation + retention rates)
                academic = {
                    "graduation_rate_4yr": profile.get("graduation_rate_4yr"),
                    "retention_rate":      profile.get("retention_rate"),
                }
                if upsert_child_table(conn, "academic_details", college_id, academic):
                    changed = True

                if changed:
                    rows_upserted += 1
                    log.debug(f"Updated profile for {college_name}")
                else:
                    log.debug(f"No new data for {college_name}")

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


#!/usr/bin/env python3
"""
scripts/run_scorecard_import.py
--------------------------------
Fetches all US institutions from the College Scorecard API and upserts
the expanded variable set into canonical.institution_admissions,
canonical.institution_financials, and canonical.institution_outcomes
(and a few fields on canonical.institutions itself).

Matching: looks up each school by name in canonical.institutions using
case-insensitive exact match first, then fuzzy prefix match.

Usage:
  DATABASE_URL=... COLLEGE_SCORECARD_API_KEY=... python scripts/run_scorecard_import.py

Estimated time: ~15 minutes for 6,200 schools (rate-limited to be polite).
"""

import os
import re
import sys
import time
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

try:
    from dotenv import load_dotenv
    load_dotenv("backend/.env")
except ImportError:
    pass

try:
    import requests
except ImportError:
    sys.exit("pip install requests")
try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    sys.exit("pip install psycopg2-binary")

DB_URL = os.environ.get("DATABASE_URL")
API_KEY = os.environ.get("COLLEGE_SCORECARD_API_KEY")

if not DB_URL:
    sys.exit("DATABASE_URL not set")
if not API_KEY:
    sys.exit("COLLEGE_SCORECARD_API_KEY not set")

PER_PAGE = 100
DELAY = 0.2  # seconds between API pages

FIELDS = ",".join([
    "id",
    "school.name",
    "school.city",
    "school.state",
    "school.school_url",
    "school.latitude",
    "school.longitude",
    "school.student_faculty_ratio",
    "school.ownership",
    "latest.admissions.admission_rate.overall",
    "latest.admissions.applicants.total",
    "latest.admissions.admitted.total",
    "latest.admissions.enrolled.total",
    "latest.admissions.sat_scores.average.overall",
    "latest.admissions.sat_scores.25th_percentile.critical_reading",
    "latest.admissions.sat_scores.75th_percentile.critical_reading",
    "latest.admissions.sat_scores.25th_percentile.math",
    "latest.admissions.sat_scores.75th_percentile.math",
    "latest.admissions.act_scores.midpoint.cumulative",
    "latest.admissions.act_scores.25th_percentile.cumulative",
    "latest.admissions.act_scores.75th_percentile.cumulative",
    "latest.student.enrollment.all",
    "latest.student.enrollment.undergrad_12_month",
    "latest.student.demographics.race_ethnicity.international",
    "latest.cost.tuition.in_state",
    "latest.cost.tuition.out_of_state",
    "latest.cost.attendance.academic_year",
    "latest.cost.avg_net_price.public",
    "latest.cost.avg_net_price.private",
    "latest.aid.median_debt.completers.overall",
    "latest.aid.pell_grant_rate",
    "latest.earnings.6_yrs_after_entry.median",
    "latest.earnings.10_yrs_after_entry.median_earnings",
    "latest.completion.rate_suppressed.overall",
])


def safe_f(r, k):
    v = r.get(k)
    if v in (None, "", "PrivacySuppressed"):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def safe_i(r, k):
    v = safe_f(r, k)
    return int(v) if v is not None else None


def fetch_all_pages():
    results = []
    page = 0
    while True:
        resp = requests.get(
            "https://api.data.gov/ed/collegescorecard/v1/schools",
            params={"api_key": API_KEY, "_fields": FIELDS, "per_page": PER_PAGE, "page": page},
            timeout=30
        )
        if resp.status_code != 200:
            log.error(f"Page {page} HTTP {resp.status_code}: {resp.text[:200]}")
            break
        data = resp.json()
        batch = data.get("results", [])
        if not batch:
            break
        results.extend(batch)
        total = data.get("metadata", {}).get("total", "?")
        log.info(f"Page {page}: {len(batch)} records (total fetched: {len(results)} / {total})")
        if len(batch) < PER_PAGE:
            break
        page += 1
        time.sleep(DELAY)
    return results


def load_institution_name_map(conn):
    """Returns dict: normalized_name -> institution_id (UUID as str)."""
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name FROM canonical.institutions")
    rows = cur.fetchall()
    cur.close()
    name_map = {}
    for (iid, name) in rows:
        if name:
            name_map[name.lower().strip()] = str(iid)
    return name_map


def match_name(raw_name: str, name_map: dict):
    """Try exact normalized match, then strip common suffixes."""
    key = raw_name.lower().strip()
    if key in name_map:
        return name_map[key]
    # strip trailing Inc / LLC / etc
    stripped = re.sub(r'\s+(inc\.?|llc|corp\.?|university$|college$)$', '', key).strip()
    if stripped in name_map:
        return name_map[stripped]
    return None


def upsert_admissions(cur, inst_id, r):
    applied = safe_i(r, "latest.admissions.applicants.total")
    admitted = safe_i(r, "latest.admissions.admitted.total")
    enrolled = safe_i(r, "latest.admissions.enrolled.total")
    yield_rate = (enrolled / admitted) if (enrolled and admitted and admitted > 0) else None

    sat_r25 = safe_i(r, "latest.admissions.sat_scores.25th_percentile.critical_reading")
    sat_r75 = safe_i(r, "latest.admissions.sat_scores.75th_percentile.critical_reading")
    sat_m25 = safe_i(r, "latest.admissions.sat_scores.25th_percentile.math")
    sat_m75 = safe_i(r, "latest.admissions.sat_scores.75th_percentile.math")
    sat_25 = (sat_r25 + sat_m25) if (sat_r25 and sat_m25) else None
    sat_75 = (sat_r75 + sat_m75) if (sat_r75 and sat_m75) else None

    adm_rate = safe_f(r, "latest.admissions.admission_rate.overall")
    diff = round(max(1.0, min(99.0, 100 * (1 - adm_rate ** 0.4))), 1) if adm_rate is not None else None

    # unique key: (institution_id, data_year, admissions_cycle)
    cur.execute("""
        INSERT INTO canonical.institution_admissions
          (institution_id, acceptance_rate, applied_count, admitted_count, enrolled_count,
           yield_rate, sat_total_25, sat_total_75, sat_ebrw_25, sat_ebrw_75,
           sat_math_25, sat_math_75,
           act_25, act_50, act_75, admission_difficulty, data_year, admissions_cycle)
        VALUES
          (%(id)s, %(ar)s, %(app)s, %(adm)s, %(enr)s,
           %(yr)s, %(s25)s, %(s75)s, %(er25)s, %(er75)s,
           %(em25)s, %(em75)s,
           %(a25)s, %(a50)s, %(a75)s, %(diff)s, 2024, 'RD')
        ON CONFLICT ON CONSTRAINT uq_institution_admissions DO UPDATE SET
          acceptance_rate      = EXCLUDED.acceptance_rate,
          applied_count        = EXCLUDED.applied_count,
          admitted_count       = EXCLUDED.admitted_count,
          enrolled_count       = EXCLUDED.enrolled_count,
          yield_rate           = EXCLUDED.yield_rate,
          sat_total_25         = EXCLUDED.sat_total_25,
          sat_total_75         = EXCLUDED.sat_total_75,
          sat_ebrw_25          = EXCLUDED.sat_ebrw_25,
          sat_ebrw_75          = EXCLUDED.sat_ebrw_75,
          sat_math_25          = EXCLUDED.sat_math_25,
          sat_math_75          = EXCLUDED.sat_math_75,
          act_25               = EXCLUDED.act_25,
          act_50               = EXCLUDED.act_50,
          act_75               = EXCLUDED.act_75,
          admission_difficulty = EXCLUDED.admission_difficulty
    """, {
        "id": inst_id, "ar": adm_rate,
        "app": applied, "adm": admitted, "enr": enrolled, "yr": yield_rate,
        "s25": sat_25, "s75": sat_75,
        "er25": sat_r25, "er75": sat_r75, "em25": sat_m25, "em75": sat_m75,
        "a25": safe_i(r, "latest.admissions.act_scores.25th_percentile.cumulative"),
        "a50": safe_i(r, "latest.admissions.act_scores.midpoint.cumulative"),
        "a75": safe_i(r, "latest.admissions.act_scores.75th_percentile.cumulative"),
        "diff": diff,
    })


def upsert_financials(cur, inst_id, r):
    ownership = safe_i(r, "school.ownership")
    is_public = ownership == 1
    net_p = safe_f(r, "latest.cost.avg_net_price.public" if is_public else "latest.cost.avg_net_price.private")

    cur.execute("""
        INSERT INTO canonical.institution_financials
          (institution_id, tuition_domestic, tuition_international,
           cost_of_attendance, net_price, avg_debt_at_graduation, data_year, data_year_key, academic_year_key)
        VALUES
          (%(id)s, %(td)s, %(ti)s, %(coa)s, %(np)s, %(debt)s, 2024, '2024', '2023-2024')
        ON CONFLICT ON CONSTRAINT uq_institution_financials DO UPDATE SET
          tuition_domestic        = EXCLUDED.tuition_domestic,
          tuition_international   = EXCLUDED.tuition_international,
          cost_of_attendance      = EXCLUDED.cost_of_attendance,
          net_price               = EXCLUDED.net_price,
          avg_debt_at_graduation  = EXCLUDED.avg_debt_at_graduation
    """, {
        "id": inst_id,
        "td": safe_f(r, "latest.cost.tuition.in_state"),
        "ti": safe_f(r, "latest.cost.tuition.out_of_state"),
        "coa": safe_f(r, "latest.cost.attendance.academic_year"),
        "np": net_p,
        "debt": safe_f(r, "latest.aid.median_debt.completers.overall"),
    })


def upsert_outcomes(cur, inst_id, r):
    cur.execute("""
        INSERT INTO canonical.institution_outcomes
          (institution_id, median_salary_1yr, median_salary_5yr,
           graduation_rate_4yr, data_year, data_year_key)
        VALUES
          (%(id)s, %(s1)s, %(s5)s, %(gr)s, 2024, '2024')
        ON CONFLICT ON CONSTRAINT uq_institution_outcomes DO UPDATE SET
          median_salary_1yr   = EXCLUDED.median_salary_1yr,
          median_salary_5yr   = EXCLUDED.median_salary_5yr,
          graduation_rate_4yr = EXCLUDED.graduation_rate_4yr
    """, {
        "id": inst_id,
        "s1": safe_f(r, "latest.earnings.6_yrs_after_entry.median"),
        "s5": safe_f(r, "latest.earnings.10_yrs_after_entry.median_earnings"),
        "gr": safe_f(r, "latest.completion.rate_suppressed.overall"),
    })


def update_institution(cur, inst_id, r):
    intl_raw = safe_f(r, "latest.student.demographics.race_ethnicity.international")
    intl_pct = round(intl_raw * 100, 2) if intl_raw is not None else None
    cur.execute("""
        UPDATE canonical.institutions SET
          latitude              = COALESCE(latitude, %(lat)s),
          longitude             = COALESCE(longitude, %(lng)s),
          student_faculty_ratio = COALESCE(student_faculty_ratio, %(sfr)s),
          total_enrollment      = COALESCE(total_enrollment, %(enr)s),
          international_pct     = COALESCE(international_pct, %(ipct)s),
          updated_at            = NOW()
        WHERE id = %(id)s
    """, {
        "id": inst_id,
        "lat": safe_f(r, "school.latitude"),
        "lng": safe_f(r, "school.longitude"),
        "sfr": safe_f(r, "school.student_faculty_ratio"),
        "enr": safe_i(r, "latest.student.enrollment.all"),
        "ipct": intl_pct,
    })


def main():
    log.info("Fetching College Scorecard data…")
    records = fetch_all_pages()
    log.info(f"Fetched {len(records)} records from Scorecard")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()

    log.info("Loading institution name map…")
    name_map = load_institution_name_map(conn)
    log.info(f"  {len(name_map)} institutions in DB")

    matched = 0
    unmatched = 0

    for i, rec in enumerate(records):
        name = (rec.get("school.name") or "").strip()
        if not name:
            continue

        inst_id = match_name(name, name_map)
        if not inst_id:
            unmatched += 1
            continue

        try:
            upsert_admissions(cur, inst_id, rec)
            upsert_financials(cur, inst_id, rec)
            upsert_outcomes(cur, inst_id, rec)
            update_institution(cur, inst_id, rec)
            matched += 1
        except Exception as e:
            log.warning(f"  skip {name}: {e}")

        if (i + 1) % 200 == 0:
            log.info(f"  {i+1}/{len(records)} processed ({matched} matched, {unmatched} unmatched)")

    cur.close()
    conn.close()
    log.info(f"Done. Matched and updated: {matched} | Unmatched (no canonical row): {unmatched}")


if __name__ == "__main__":
    main()

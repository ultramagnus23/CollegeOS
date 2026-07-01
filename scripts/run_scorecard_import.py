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
    "latest.aid.students_with_any_loan",
    "latest.earnings.6_yrs_after_entry.median",
    "latest.earnings.10_yrs_after_entry.median_earnings",
    "latest.completion.rate_suppressed.overall",
    "latest.completion.retention_rate.four_year.full_time",
    "latest.completion.retention_rate.lt_four_year.full_time",
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


def _norm(name: str) -> str:
    """Normalize institution name for fuzzy matching."""
    n = name.lower().strip()
    n = n.replace("&", "and").replace("-", " ")
    n = re.sub(r'[.,\'"]', '', n)
    n = re.sub(r'\b(the|of|at|a)\b', '', n)
    n = re.sub(r'\s+', ' ', n).strip()
    # common abbreviations
    n = re.sub(r'\bst\.?\b', 'saint', n)
    n = re.sub(r'\bmt\.?\b', 'mount', n)
    n = re.sub(r'\bft\.?\b', 'fort', n)
    return n


def load_institution_maps(conn):
    """Returns (ipeds_map, name_map, norm_map)."""
    cur = conn.cursor()
    cur.execute("""
        SELECT id, canonical_name,
               canonical_external_ids->>'ipeds' AS ipeds_id
        FROM canonical.institutions
    """)
    rows = cur.fetchall()
    cur.close()

    ipeds_map = {}   # ipeds_unitid_str -> inst_id
    name_map = {}    # lower name -> inst_id
    norm_map = {}    # normalized name -> inst_id

    for (iid, name, ipeds_id) in rows:
        sid = str(iid)
        if ipeds_id:
            ipeds_map[ipeds_id.strip()] = sid
        if name:
            name_map[name.lower().strip()] = sid
            norm_map[_norm(name)] = sid

    return ipeds_map, name_map, norm_map


def match_record(r: dict, ipeds_map: dict, name_map: dict, norm_map: dict):
    """Match Scorecard record to canonical institution. IPEDS ID first, then name."""
    # Primary: IPEDS unit ID (exact, fast)
    ipeds_id = str(r.get("id", ""))
    if ipeds_id and ipeds_id in ipeds_map:
        return ipeds_map[ipeds_id]

    raw_name = (r.get("school.name") or "").strip()
    if not raw_name:
        return None

    # Secondary: exact lowercase name
    key = raw_name.lower().strip()
    if key in name_map:
        return name_map[key]

    # Tertiary: normalized (handles & vs and, st. vs saint, punctuation)
    norm = _norm(raw_name)
    if norm in norm_map:
        return norm_map[norm]

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
    sat_50 = (sat_25 + sat_75) // 2 if (sat_25 and sat_75) else None
    act_25 = safe_i(r, "latest.admissions.act_scores.25th_percentile.cumulative")
    act_50 = safe_i(r, "latest.admissions.act_scores.midpoint.cumulative")
    act_75 = safe_i(r, "latest.admissions.act_scores.75th_percentile.cumulative")

    # unique key: (institution_id, data_year, admissions_cycle)
    cur.execute("""
        INSERT INTO canonical.institution_admissions
          (institution_id, acceptance_rate, applied_count, admitted_count, enrolled_count,
           yield_rate, sat_25, sat_50, sat_75,
           sat_total_25, sat_total_75, sat_ebrw_25, sat_ebrw_75,
           sat_math_25, sat_math_75,
           act_25, act_50, act_75, admission_difficulty, data_year, admissions_cycle)
        VALUES
          (%(id)s, %(ar)s, %(app)s, %(adm)s, %(enr)s,
           %(yr)s, %(s25)s, %(s50)s, %(s75)s,
           %(s25)s, %(s75)s, %(er25)s, %(er75)s,
           %(em25)s, %(em75)s,
           %(a25)s, %(a50)s, %(a75)s, %(diff)s, 2024, 'regular')
        ON CONFLICT ON CONSTRAINT uq_institution_admissions DO UPDATE SET
          acceptance_rate      = COALESCE(EXCLUDED.acceptance_rate, institution_admissions.acceptance_rate),
          applied_count        = COALESCE(EXCLUDED.applied_count, institution_admissions.applied_count),
          admitted_count       = COALESCE(EXCLUDED.admitted_count, institution_admissions.admitted_count),
          enrolled_count       = COALESCE(EXCLUDED.enrolled_count, institution_admissions.enrolled_count),
          yield_rate           = COALESCE(EXCLUDED.yield_rate, institution_admissions.yield_rate),
          sat_25               = COALESCE(EXCLUDED.sat_25, institution_admissions.sat_25),
          sat_50               = COALESCE(EXCLUDED.sat_50, institution_admissions.sat_50),
          sat_75               = COALESCE(EXCLUDED.sat_75, institution_admissions.sat_75),
          sat_total_25         = COALESCE(EXCLUDED.sat_total_25, institution_admissions.sat_total_25),
          sat_total_75         = COALESCE(EXCLUDED.sat_total_75, institution_admissions.sat_total_75),
          sat_ebrw_25          = COALESCE(EXCLUDED.sat_ebrw_25, institution_admissions.sat_ebrw_25),
          sat_ebrw_75          = COALESCE(EXCLUDED.sat_ebrw_75, institution_admissions.sat_ebrw_75),
          sat_math_25          = COALESCE(EXCLUDED.sat_math_25, institution_admissions.sat_math_25),
          sat_math_75          = COALESCE(EXCLUDED.sat_math_75, institution_admissions.sat_math_75),
          act_25               = COALESCE(EXCLUDED.act_25, institution_admissions.act_25),
          act_50               = COALESCE(EXCLUDED.act_50, institution_admissions.act_50),
          act_75               = COALESCE(EXCLUDED.act_75, institution_admissions.act_75),
          admission_difficulty = COALESCE(EXCLUDED.admission_difficulty, institution_admissions.admission_difficulty)
    """, {
        "id": inst_id, "ar": adm_rate,
        "app": applied, "adm": admitted, "enr": enrolled, "yr": yield_rate,
        "s25": sat_25, "s50": sat_50, "s75": sat_75,
        "er25": sat_r25, "er75": sat_r75, "em25": sat_m25, "em75": sat_m75,
        "a25": act_25, "a50": act_50, "a75": act_75,
        "diff": diff,
    })


def upsert_financials(cur, inst_id, r):
    ownership = safe_i(r, "school.ownership")
    is_public = ownership == 1
    net_p = safe_f(r, "latest.cost.avg_net_price.public" if is_public else "latest.cost.avg_net_price.private")
    pell = safe_f(r, "latest.aid.pell_grant_rate")
    pell_pct = round(pell * 100, 1) if pell is not None else None

    # unique key: (institution_id, data_year_key, academic_year_key)
    cur.execute("""
        INSERT INTO canonical.institution_financials
          (institution_id, tuition_domestic, tuition_international,
           cost_of_attendance, net_price, avg_debt_at_graduation,
           percent_receiving_aid, data_year, academic_year)
        VALUES
          (%(id)s, %(td)s, %(ti)s, %(coa)s, %(np)s, %(debt)s, %(pell)s,
           2024, '2023-2024')
        ON CONFLICT ON CONSTRAINT uq_institution_financials DO UPDATE SET
          tuition_domestic        = COALESCE(EXCLUDED.tuition_domestic, institution_financials.tuition_domestic),
          tuition_international   = COALESCE(EXCLUDED.tuition_international, institution_financials.tuition_international),
          cost_of_attendance      = COALESCE(EXCLUDED.cost_of_attendance, institution_financials.cost_of_attendance),
          net_price               = COALESCE(EXCLUDED.net_price, institution_financials.net_price),
          avg_debt_at_graduation  = COALESCE(EXCLUDED.avg_debt_at_graduation, institution_financials.avg_debt_at_graduation),
          percent_receiving_aid   = COALESCE(EXCLUDED.percent_receiving_aid, institution_financials.percent_receiving_aid)
    """, {
        "id": inst_id,
        "td": safe_f(r, "latest.cost.tuition.in_state"),
        "ti": safe_f(r, "latest.cost.tuition.out_of_state"),
        "coa": safe_f(r, "latest.cost.attendance.academic_year"),
        "np": net_p,
        "debt": safe_f(r, "latest.aid.median_debt.completers.overall"),
        "pell": pell_pct,
    })


def upsert_outcomes(cur, inst_id, r):
    ret = safe_f(r, "latest.completion.retention_rate.four_year.full_time") or \
          safe_f(r, "latest.completion.retention_rate.lt_four_year.full_time")
    ret_pct = round(ret * 100, 1) if ret is not None else None
    gr = safe_f(r, "latest.completion.rate_suppressed.overall")
    gr_pct = round(gr * 100, 1) if gr is not None else None

    cur.execute("""
        INSERT INTO canonical.institution_outcomes
          (institution_id, median_salary_1yr, median_salary_5yr,
           graduation_rate_4yr, retention_rate, data_year)
        VALUES
          (%(id)s, %(s1)s, %(s5)s, %(gr)s, %(ret)s, 2024)
        ON CONFLICT ON CONSTRAINT uq_institution_outcomes DO UPDATE SET
          median_salary_1yr   = COALESCE(EXCLUDED.median_salary_1yr, institution_outcomes.median_salary_1yr),
          median_salary_5yr   = COALESCE(EXCLUDED.median_salary_5yr, institution_outcomes.median_salary_5yr),
          graduation_rate_4yr = COALESCE(EXCLUDED.graduation_rate_4yr, institution_outcomes.graduation_rate_4yr),
          retention_rate      = COALESCE(EXCLUDED.retention_rate, institution_outcomes.retention_rate)
    """, {
        "id": inst_id,
        "s1": safe_f(r, "latest.earnings.6_yrs_after_entry.median"),
        "s5": safe_f(r, "latest.earnings.10_yrs_after_entry.median_earnings"),
        "gr": gr_pct,
        "ret": ret_pct,
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

    log.info("Loading institution maps…")
    ipeds_map, name_map, norm_map = load_institution_maps(conn)
    log.info(f"  {len(ipeds_map)} IPEDS IDs, {len(name_map)} names in DB")

    matched = 0
    unmatched = 0

    for i, rec in enumerate(records):
        inst_id = match_record(rec, ipeds_map, name_map, norm_map)
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

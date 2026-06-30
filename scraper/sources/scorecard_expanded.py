"""
scraper/sources/scorecard_expanded.py
───────────────────────────────────────
Pulls the full variable set for the expanded undergrad data schema (migration 127).
Replaces the older scorecard.py source for bulk data pulls; the old source is
kept for lightweight fallback usage.

API: https://api.data.gov/ed/collegescorecard/v1/schools
Key env var: COLLEGE_SCORECARD_API_KEY  (free, register at data.gov)

Populates:
  A. institution_admissions: acceptance_rate, SAT/ACT percentiles, yield, enrollment counts
  B. institution_financials: net_price, avg_aid, avg_debt, COA breakdown
  C. institution_outcomes: median_salary (1yr/5yr), employment_rate, grad_school_rate
  D. institutions: total_enrollment, student_faculty_ratio, endowment (where available)
"""

import logging
import os
import time
from typing import Optional

import requests
from tenacity import retry, stop_after_attempt, wait_exponential

log = logging.getLogger(__name__)

SCORECARD_URL = "https://api.data.gov/ed/collegescorecard/v1/schools"
PER_PAGE = 100
REQUEST_DELAY = float(os.environ.get("REQUEST_DELAY_SEC", "0.25"))

# Full field list — all variables needed for migration 127
_FIELDS = ",".join([
    "id",
    "school.name",
    "school.city",
    "school.state",
    "school.school_url",
    "school.type",                           # 1=pub, 2=priv nonprofit, 3=priv for-profit
    "school.ownership",
    "school.main_campus",
    "school.carnegie_basic",
    "school.latitude",
    "school.longitude",
    "school.student_faculty_ratio",
    # Admissions
    "latest.admissions.admission_rate.overall",
    "latest.admissions.admission_rate.by_ope_id",
    "latest.admissions.applicants.total",
    "latest.admissions.admitted.total",
    "latest.admissions.enrolled.total",
    "latest.admissions.sat_scores.average.overall",
    "latest.admissions.sat_scores.25th_percentile.critical_reading",
    "latest.admissions.sat_scores.75th_percentile.critical_reading",
    "latest.admissions.sat_scores.25th_percentile.math",
    "latest.admissions.sat_scores.75th_percentile.math",
    "latest.admissions.sat_scores.midpoint.critical_reading",
    "latest.admissions.sat_scores.midpoint.math",
    "latest.admissions.act_scores.midpoint.cumulative",
    "latest.admissions.act_scores.25th_percentile.cumulative",
    "latest.admissions.act_scores.75th_percentile.cumulative",
    # Enrollment
    "latest.student.enrollment.all",
    "latest.student.enrollment.undergrad_12_month",
    "latest.student.enrollment.grad_12_month",
    "latest.student.part_time_share",
    "latest.student.share_firstgeneration",
    "latest.student.demographics.race_ethnicity.white",
    "latest.student.demographics.race_ethnicity.black",
    "latest.student.demographics.race_ethnicity.hispanic",
    "latest.student.demographics.race_ethnicity.asian",
    "latest.student.demographics.race_ethnicity.international",
    "latest.student.grad_students",
    # Financial
    "latest.cost.tuition.in_state",
    "latest.cost.tuition.out_of_state",
    "latest.cost.tuition.program_year",
    "latest.cost.attendance.academic_year",
    "latest.cost.avg_net_price.public",
    "latest.cost.avg_net_price.private",
    "latest.aid.median_debt.number.overall",
    "latest.aid.median_debt.completers.overall",
    "latest.aid.pell_grant_rate",
    "latest.aid.federal_loan_rate",
    "latest.aid.students_with_any_loan",
    "latest.aid.loan_principal",
    # Outcomes / Earnings
    "latest.earnings.6_yrs_after_entry.median",
    "latest.earnings.8_yrs_after_entry.median",
    "latest.earnings.10_yrs_after_entry.median_earnings",
    "latest.earnings.6_yrs_after_entry.percent_greater_than_25000",
    "latest.completion.rate_suppressed.overall",
    "latest.completion.rate_suppressed.l4_200pct_pooled",
    "latest.completion.outcome_percentage_suppressed.8yr.employed_not_enrolled.pooled",
    "latest.repayment.3_yr_default_rate",
    "latest.repayment.5_yr_default_rate",
])


def _safe(record: dict, key: str) -> Optional[float]:
    v = record.get(key)
    if v in (None, "", "PrivacySuppressed"):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _safe_int(record: dict, key: str) -> Optional[int]:
    v = _safe(record, key)
    return int(v) if v is not None else None


def _normalise(r: dict) -> dict:
    name = (r.get("school.name") or "").strip()
    if not name:
        return {}

    adm_rate = _safe(r, "latest.admissions.admission_rate.overall")
    sat_25_r = _safe_int(r, "latest.admissions.sat_scores.25th_percentile.critical_reading")
    sat_75_r = _safe_int(r, "latest.admissions.sat_scores.75th_percentile.critical_reading")
    sat_25_m = _safe_int(r, "latest.admissions.sat_scores.25th_percentile.math")
    sat_75_m = _safe_int(r, "latest.admissions.sat_scores.75th_percentile.math")

    sat_25 = (sat_25_r + sat_25_m) if (sat_25_r and sat_25_m) else None
    sat_75 = (sat_75_r + sat_75_m) if (sat_75_r and sat_75_m) else None
    sat_50 = _safe_int(r, "latest.admissions.sat_scores.average.overall")

    applied = _safe_int(r, "latest.admissions.applicants.total")
    admitted = _safe_int(r, "latest.admissions.admitted.total")
    enrolled = _safe_int(r, "latest.admissions.enrolled.total")
    yield_rate = (enrolled / admitted) if (enrolled and admitted and admitted > 0) else None

    tuition_in = _safe(r, "latest.cost.tuition.in_state")
    tuition_out = _safe(r, "latest.cost.tuition.out_of_state")
    coa = _safe(r, "latest.cost.attendance.academic_year")
    net_price_pub = _safe(r, "latest.cost.avg_net_price.public")
    net_price_priv = _safe(r, "latest.cost.avg_net_price.private")
    net_price = net_price_pub or net_price_priv

    avg_debt = _safe(r, "latest.aid.median_debt.completers.overall")
    school_type = _safe_int(r, "school.type") or _safe_int(r, "school.ownership")
    is_public = school_type == 1

    median_earn_6yr = _safe(r, "latest.earnings.6_yrs_after_entry.median")
    median_earn_10yr = _safe(r, "latest.earnings.10_yrs_after_entry.median_earnings")
    completion = _safe(r, "latest.completion.rate_suppressed.overall")

    intl_pct_raw = _safe(r, "latest.student.demographics.race_ethnicity.international")
    intl_pct = (intl_pct_raw * 100) if intl_pct_raw is not None else None

    return {
        "name": name,
        "city": (r.get("school.city") or "").strip() or None,
        "state_region": r.get("school.state"),
        "website": r.get("school.school_url"),
        "latitude": _safe(r, "school.latitude"),
        "longitude": _safe(r, "school.longitude"),
        "institution_type": "public" if is_public else ("private" if school_type in (2, 3) else None),
        # Admissions
        "acceptance_rate": adm_rate,
        "yield_rate": yield_rate,
        "applied_count": applied,
        "admitted_count": admitted,
        "enrolled_count": enrolled,
        "sat_total_25": sat_25,
        "sat_total_75": sat_75,
        "sat_50": sat_50,
        "sat_ebrw_25": sat_25_r,
        "sat_ebrw_75": sat_75_r,
        "sat_math_25": sat_25_m,
        "sat_math_75": sat_75_m,
        "act_25": _safe_int(r, "latest.admissions.act_scores.25th_percentile.cumulative"),
        "act_50": _safe_int(r, "latest.admissions.act_scores.midpoint.cumulative"),
        "act_75": _safe_int(r, "latest.admissions.act_scores.75th_percentile.cumulative"),
        # Enrollment
        "total_enrollment": _safe_int(r, "latest.student.enrollment.all"),
        "undergraduate_enrollment": _safe_int(r, "latest.student.enrollment.undergrad_12_month"),
        "international_pct": intl_pct,
        "student_faculty_ratio": _safe(r, "school.student_faculty_ratio"),
        "first_gen_pct": (_safe(r, "latest.student.share_firstgeneration") or 0) * 100,
        # Financial
        "tuition_domestic": tuition_in if is_public else tuition_out,
        "tuition_international": tuition_out,
        "cost_of_attendance": coa,
        "net_price": net_price,
        "avg_debt_at_graduation": avg_debt,
        "pell_grant_rate": (_safe(r, "latest.aid.pell_grant_rate") or 0) * 100,
        # Outcomes
        "median_salary_1yr": median_earn_6yr,
        "median_salary_5yr": median_earn_10yr,
        "graduation_rate_4yr": completion,
        "loan_default_rate_3yr": _safe(r, "latest.repayment.3_yr_default_rate"),
        "data_source": "Scorecard_expanded",
        "data_year": 2024,
    }


@retry(stop=stop_after_attempt(4), wait=wait_exponential(multiplier=1, min=2, max=20))
def _fetch_page(api_key: str, page: int) -> list[dict]:
    resp = requests.get(SCORECARD_URL, params={
        "api_key": api_key,
        "_fields": _FIELDS,
        "per_page": PER_PAGE,
        "page": page,
        "school.main_campus": 1,         # only main campuses, not branches
        "latest.student.enrollment.all__range": "100..2000000",  # skip near-empty schools
    }, timeout=30)
    resp.raise_for_status()
    return resp.json().get("results", [])


def fetch() -> list[dict]:
    api_key = os.environ.get("COLLEGE_SCORECARD_API_KEY", "")
    if not api_key:
        log.warning("COLLEGE_SCORECARD_API_KEY not set — skipping expanded Scorecard source")
        return []

    results: list[dict] = []
    page = 0
    while True:
        try:
            raw = _fetch_page(api_key, page)
        except Exception as exc:
            log.error(f"Scorecard expanded page {page} failed: {exc}")
            break
        if not raw:
            break
        for rec in raw:
            n = _normalise(rec)
            if n.get("name"):
                results.append(n)
        log.info(f"Scorecard expanded page {page}: {len(raw)} records (total: {len(results)})")
        if len(raw) < PER_PAGE:
            break
        page += 1
        time.sleep(REQUEST_DELAY)

    log.info(f"Scorecard expanded fetch complete: {len(results)} institutions")
    return results

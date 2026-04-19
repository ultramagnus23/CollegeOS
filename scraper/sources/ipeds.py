"""
scraper/sources/ipeds.py
────────────────────────
Fetches admission, enrollment, and test-score data from the US Department of
Education's College Scorecard / IPEDS API.

Endpoint: https://api.data.gov/ed/collegescorecard/v1/schools
API key env var: IPEDS_API_KEY

Returns one dict per institution using the canonical pipeline field names.
All pages are fetched in a single bulk loop (~70 pages × 100 schools).
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
REQUEST_DELAY = float(os.environ.get("REQUEST_DELAY_SEC", "0.3"))

# IPEDS fields — admission, enrollment, test scores, tuition
_FIELDS = ",".join([
    "id",
    "school.name",
    "school.state",
    "school.city",
    "school.school_url",
    "latest.admissions.admission_rate.overall",
    "latest.admissions.sat_scores.25th_percentile.critical_reading",
    "latest.admissions.sat_scores.75th_percentile.critical_reading",
    "latest.admissions.sat_scores.25th_percentile.math",
    "latest.admissions.sat_scores.75th_percentile.math",
    "latest.admissions.act_scores.25th_percentile.cumulative",
    "latest.admissions.act_scores.75th_percentile.cumulative",
    "latest.admissions.applicants.total",
    "latest.admissions.admissions_yield_all",
    "latest.student.enrollment.all",
    "latest.cost.tuition.in_state",
    "latest.cost.tuition.out_of_state",
])


def _safe(record: dict, key: str) -> Optional[float]:
    """Return None for missing, empty, or PrivacySuppressed values."""
    v = record.get(key)
    return None if v in (None, "", "PrivacySuppressed") else v


@retry(stop=stop_after_attempt(4), wait=wait_exponential(multiplier=1, min=2, max=15))
def _fetch_page(api_key: str, page: int) -> list[dict]:
    """Fetch a single paginated page from the College Scorecard API."""
    params = {
        "api_key": api_key,
        "_fields": _FIELDS,
        "per_page": PER_PAGE,
        "page": page,
    }
    resp = requests.get(SCORECARD_URL, params=params, timeout=20)
    resp.raise_for_status()
    return resp.json().get("results", [])


def _normalise(record: dict) -> dict:
    """
    Map a raw Scorecard result dict to the canonical pipeline schema.
    SAT composite = critical_reading + math (no writing since 2016 redesign).
    """
    name = (record.get("school.name") or "").strip()
    if not name:
        return {}

    cr_25 = _safe(record, "latest.admissions.sat_scores.25th_percentile.critical_reading")
    cr_75 = _safe(record, "latest.admissions.sat_scores.75th_percentile.critical_reading")
    mt_25 = _safe(record, "latest.admissions.sat_scores.25th_percentile.math")
    mt_75 = _safe(record, "latest.admissions.sat_scores.75th_percentile.math")

    sat_25 = int(cr_25 + mt_25) if (cr_25 and mt_25) else None
    sat_75 = int(cr_75 + mt_75) if (cr_75 and mt_75) else None

    adm = _safe(record, "latest.admissions.admission_rate.overall")

    return {
        "name": name,
        "acceptance_rate": float(adm) if adm is not None else None,
        "total_enrollment": _safe(record, "latest.student.enrollment.all"),
        "applications_received": _safe(record, "latest.admissions.applicants.total"),
        "median_sat_25": sat_25,
        "median_sat_75": sat_75,
        "median_act_25": _safe(record, "latest.admissions.act_scores.25th_percentile.cumulative"),
        "median_act_75": _safe(record, "latest.admissions.act_scores.75th_percentile.cumulative"),
        "tuition_in_state": _safe(record, "latest.cost.tuition.in_state"),
        "tuition_out_of_state": _safe(record, "latest.cost.tuition.out_of_state"),
        "yield_rate": _safe(record, "latest.admissions.admissions_yield_all"),
        "data_source": "IPEDS",
    }


def fetch() -> list[dict]:
    """
    Fetch all US institutions from the College Scorecard / IPEDS API.

    Paginates through all results (~70 pages) using the IPEDS_API_KEY env var.
    Returns a list of normalised dicts in the canonical pipeline schema.
    Logs a warning and returns an empty list if the API key is not set.
    """
    api_key = os.environ.get("IPEDS_API_KEY", "")
    if not api_key:
        log.warning("IPEDS_API_KEY not set — skipping IPEDS source")
        return []

    results: list[dict] = []
    page = 0

    while True:
        try:
            raw = _fetch_page(api_key, page)
        except Exception as exc:
            log.error(f"IPEDS page {page} failed: {exc}")
            break

        if not raw:
            break

        for record in raw:
            normalised = _normalise(record)
            if normalised.get("name"):
                results.append(normalised)

        log.info(f"IPEDS page {page}: {len(raw)} records (total: {len(results)})")

        if len(raw) < PER_PAGE:
            break

        page += 1
        time.sleep(REQUEST_DELAY)

    log.info(f"IPEDS fetch complete: {len(results)} institutions")
    return results

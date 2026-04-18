"""
scraper/sources/scorecard.py
─────────────────────────────
Fetches post-graduation outcome data from the College Scorecard API.

Endpoint: https://api.data.gov/ed/collegescorecard/v1/schools
API key env var: COLLEGE_SCORECARD_API_KEY

Supplements the IPEDS source with fields the primary scraper doesn't pull:
  - Median earnings 6 years after entry (proxy for "post-grad earnings")
  - 4-year completion / graduation rate
  - 3-year federal loan default rate

Returns one dict per institution using the canonical pipeline field names.
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

# Scorecard-specific fields — earnings, completion, debt
_FIELDS = ",".join([
    "id",
    "school.name",
    "latest.earnings.6_yrs_after_entry.median",
    "latest.completion.rate_suppressed.overall",
    "latest.repayment.3_yr_default_rate",
    # Also pull acceptance_rate as a fallback for IPEDS
    "latest.admissions.admission_rate.overall",
    "latest.student.enrollment.all",
    "latest.admissions.applicants.total",
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
    Map a raw Scorecard result to the canonical pipeline schema.
    Only populates the fields this source is responsible for.
    """
    name = (record.get("school.name") or "").strip()
    if not name:
        return {}

    adm = _safe(record, "latest.admissions.admission_rate.overall")

    return {
        "name": name,
        # Carry acceptance_rate as a backup — IPEDS takes priority in the merge,
        # so this value is only used when IPEDS has no data for a given institution.
        "acceptance_rate": float(adm) if adm is not None else None,
        "total_enrollment": _safe(record, "latest.student.enrollment.all"),
        "applications_received": _safe(record, "latest.admissions.applicants.total"),
        "completion_rate": _safe(record, "latest.completion.rate_suppressed.overall"),
        "median_earnings_post_grad": _safe(record, "latest.earnings.6_yrs_after_entry.median"),
        "data_source": "Scorecard",
    }


def fetch() -> list[dict]:
    """
    Fetch post-graduation outcome data for all US institutions.

    Uses the COLLEGE_SCORECARD_API_KEY env var.  Returns a list of normalised
    dicts containing completion_rate and median_earnings_post_grad (plus
    acceptance_rate / enrollment as fallback values).
    Logs a warning and returns an empty list if the API key is not set.
    """
    api_key = os.environ.get("COLLEGE_SCORECARD_API_KEY", "")
    if not api_key:
        log.warning("COLLEGE_SCORECARD_API_KEY not set — skipping Scorecard source")
        return []

    results: list[dict] = []
    page = 0

    while True:
        try:
            raw = _fetch_page(api_key, page)
        except Exception as exc:
            log.error(f"Scorecard page {page} failed: {exc}")
            break

        if not raw:
            break

        for record in raw:
            normalised = _normalise(record)
            if normalised.get("name"):
                results.append(normalised)

        log.info(f"Scorecard page {page}: {len(raw)} records (total: {len(results)})")

        if len(raw) < PER_PAGE:
            break

        page += 1
        time.sleep(REQUEST_DELAY)

    log.info(f"Scorecard fetch complete: {len(results)} institutions")
    return results

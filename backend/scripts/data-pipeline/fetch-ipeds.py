#!/usr/bin/env python3
"""
Fetch IPEDS / College Scorecard Data
─────────────────────────────────────
Bulk-fetches ALL colleges from the College Scorecard API (~70 pages) and
writes the relevant admission / enrollment / test-score fields to a local
JSON staging file: /tmp/ipeds_staging.json

The data is later ingested by load-to-postgres.py.

Required env vars:
    DATA_GOV_API_KEY   (free key from https://api.data.gov/signup/)

Optional env vars:
    DATABASE_URL       (only needed if you want direct fallback writes)
    ADMISSIONS_YEAR    (default: 2023)
    REQUEST_DELAY_SEC  (default: 0.5)
"""

import json
import logging
import os
import sys
import time

import requests
import yaml
from tenacity import retry, stop_after_attempt, wait_exponential

# ── Config ────────────────────────────────────────────────────────────────────

_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.yaml")
with open(_CONFIG_PATH) as _fh:
    _CFG = yaml.safe_load(_fh)

logging.basicConfig(
    level=getattr(logging, _CFG.get("log_level", "INFO")),
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("fetch_ipeds")

DATA_GOV_API_KEY = os.environ.get("DATA_GOV_API_KEY", "")
ADMISSIONS_YEAR = int(os.environ.get("ADMISSIONS_YEAR", _CFG["pipeline"]["scorecard_year"]))
REQUEST_DELAY = float(os.environ.get("REQUEST_DELAY_SEC", _CFG["pipeline"]["request_delay_sec"]))
SCORECARD_BASE = _CFG["pipeline"]["scorecard_base_url"]
PER_PAGE = _CFG["pipeline"]["scorecard_per_page"]

STAGING_PATH = os.environ.get("IPEDS_STAGING_PATH", "/tmp/ipeds_staging.json")

# College Scorecard field names we care about
BULK_FIELDS = ",".join([
    "id",
    "school.name",
    "school.state",
    "school.school_url",
    "school.city",
    "latest.admissions.admission_rate.overall",
    "latest.admissions.sat_scores.25th_percentile.critical_reading",
    "latest.admissions.sat_scores.75th_percentile.critical_reading",
    "latest.admissions.sat_scores.25th_percentile.math",
    "latest.admissions.sat_scores.75th_percentile.math",
    "latest.admissions.act_scores.25th_percentile.cumulative",
    "latest.admissions.act_scores.75th_percentile.cumulative",
    "latest.admissions.act_scores.midpoint.cumulative",
    "latest.admissions.applicants.total",
    "latest.admissions.admissions_yield_all",
    "latest.student.enrollment.all",
    "latest.student.enrollment.undergrad_12_month",
    "latest.cost.tuition.in_state",
    "latest.cost.tuition.out_of_state",
    "latest.cost.avg_net_price.public",
    "latest.cost.avg_net_price.private",
    "latest.completion.rate_suppressed.overall",
])


def _safe(record: dict, key: str):
    """Return None for missing, empty, or PrivacySuppressed values."""
    v = record.get(key)
    return None if v in (None, "", "PrivacySuppressed") else v


@retry(stop=stop_after_attempt(4), wait=wait_exponential(multiplier=1, min=2, max=15))
def _fetch_page(page: int) -> list[dict]:
    if not DATA_GOV_API_KEY:
        log.warning("DATA_GOV_API_KEY not set — skipping Scorecard fetch")
        return []
    params = {
        "api_key": DATA_GOV_API_KEY,
        "_fields": BULK_FIELDS,
        "per_page": PER_PAGE,
        "page": page,
    }
    resp = requests.get(SCORECARD_BASE, params=params, timeout=20)
    resp.raise_for_status()
    return resp.json().get("results", [])


def fetch_all_scorecard() -> list[dict]:
    """
    Bulk-fetch every school from the Scorecard API and return a normalised list.
    Replaces ~6 000 individual API calls with ~70 paginated bulk calls.
    """
    colleges: list[dict] = []
    page = 0

    while True:
        results = _fetch_page(page)
        if not results:
            break

        for r in results:
            name = (r.get("school.name") or "").strip()
            if not name:
                continue

            cr_25 = _safe(r, "latest.admissions.sat_scores.25th_percentile.critical_reading")
            cr_75 = _safe(r, "latest.admissions.sat_scores.75th_percentile.critical_reading")
            math_25 = _safe(r, "latest.admissions.sat_scores.25th_percentile.math")
            math_75 = _safe(r, "latest.admissions.sat_scores.75th_percentile.math")

            sat_25 = int(cr_25 + math_25) if cr_25 and math_25 else None
            sat_75 = int(cr_75 + math_75) if cr_75 and math_75 else None

            net_price = (
                _safe(r, "latest.cost.avg_net_price.public")
                or _safe(r, "latest.cost.avg_net_price.private")
            )

            colleges.append({
                "name": name,
                "state": _safe(r, "school.state"),
                "city": _safe(r, "school.city"),
                "school_url": _safe(r, "school.school_url"),
                "acceptance_rate": _safe(r, "latest.admissions.admission_rate.overall"),
                "sat_25": sat_25,
                "sat_75": sat_75,
                "act_25": _safe(r, "latest.admissions.act_scores.25th_percentile.cumulative"),
                "act_75": _safe(r, "latest.admissions.act_scores.75th_percentile.cumulative"),
                "act_avg": _safe(r, "latest.admissions.act_scores.midpoint.cumulative"),
                "applications_received": _safe(r, "latest.admissions.applicants.total"),
                "yield_rate": _safe(r, "latest.admissions.admissions_yield_all"),
                "total_enrollment": _safe(r, "latest.student.enrollment.all"),
                "tuition_in_state": _safe(r, "latest.cost.tuition.in_state"),
                "tuition_out_state": _safe(r, "latest.cost.tuition.out_of_state"),
                "avg_net_price": net_price,
                "graduation_rate": _safe(r, "latest.completion.rate_suppressed.overall"),
                "data_source": "IPEDS",
                "admissions_year": ADMISSIONS_YEAR,
            })

        log.info(f"Scorecard page {page}: {len(results)} records (total so far: {len(colleges)})")

        if len(results) < PER_PAGE:
            break
        page += 1
        time.sleep(REQUEST_DELAY)

    return colleges


def main() -> int:
    log.info("fetch-ipeds.py started")

    if not DATA_GOV_API_KEY:
        log.error("DATA_GOV_API_KEY is not set. Aborting.")
        return 1

    colleges = fetch_all_scorecard()

    if not colleges:
        log.error("No data returned from College Scorecard API.")
        return 1

    with open(STAGING_PATH, "w") as fh:
        json.dump(colleges, fh, indent=2, default=str)

    log.info(f"✓ Wrote {len(colleges)} colleges to {STAGING_PATH}")
    print(f"ROWS_UPSERTED={len(colleges)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

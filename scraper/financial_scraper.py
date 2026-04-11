#!/usr/bin/env python3
# CollegeOS Auto-generated scraper/financial_scraper.py — do not edit manually
"""
Financial Aid Scraper
─────────────────────
For every college in the colleges table, fetches and upserts financial aid data:
  avg_financial_aid_package, avg_net_price_* income brackets,
  percent_receiving_aid, percent_receiving_grants,
  meets_full_need, no_loan_policy, endowment_per_student, scholarship_count

Sources (tried in order):
  1. IPEDS via Urban Institute Education Data API
  2. College Scorecard API (data.ed.gov)

Required environment variables
───────────────────────────────
    DATABASE_URL

Optional
────────
    DATA_GOV_API_KEY    (College Scorecard)
    FINANCIAL_YEAR      (academic year string, default: "2022-23")
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
log = logging.getLogger("financial_scraper")

DATABASE_URL = os.environ["DATABASE_URL"]
DATA_GOV_API_KEY = os.environ.get("DATA_GOV_API_KEY") or os.environ.get("COLLEGE_SCORECARD_API_KEY", "")
FINANCIAL_YEAR = os.environ.get("FINANCIAL_YEAR", "2022-23")

if not DATA_GOV_API_KEY:
    log.warning(
        "DATA_GOV_API_KEY is not set — College Scorecard lookups will be skipped. "
        "Get a free key at https://api.data.gov/signup/ and set DATA_GOV_API_KEY."
    )
REQUEST_DELAY = float(os.environ.get("REQUEST_DELAY_SEC", "1.0"))

SCORECARD_BASE = "https://api.data.ed.gov/student/v1/schools"
IPEDS_BASE = "https://educationdata.urban.org/api/v1/college-university/ipeds"

# ── DB helpers ────────────────────────────────────────────────────────────────


def get_connection():
    return psycopg2.connect(DATABASE_URL)


def load_colleges(conn) -> list[dict]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id, name FROM colleges_comprehensive ORDER BY id")
        return cur.fetchall()


def upsert_financial_aid(conn, college_id: int, academic_year: str, data: dict) -> None:
    sql = """
        INSERT INTO college_financial_aid
          (college_id, academic_year,
           avg_financial_aid_package,
           avg_net_price_0_30k, avg_net_price_30_48k, avg_net_price_48_75k,
           avg_net_price_75_110k, avg_net_price_110k_plus,
           percent_receiving_aid, percent_receiving_grants,
           meets_full_need, no_loan_policy,
           endowment_per_student, scholarship_count,
           updated_at)
        VALUES
          (%(college_id)s, %(academic_year)s,
           %(avg_financial_aid_package)s,
           %(avg_net_price_0_30k)s, %(avg_net_price_30_48k)s, %(avg_net_price_48_75k)s,
           %(avg_net_price_75_110k)s, %(avg_net_price_110k_plus)s,
           %(percent_receiving_aid)s, %(percent_receiving_grants)s,
           %(meets_full_need)s, %(no_loan_policy)s,
           %(endowment_per_student)s, %(scholarship_count)s,
           NOW())
        ON CONFLICT (college_id, academic_year)
          DO UPDATE SET
            avg_financial_aid_package  = EXCLUDED.avg_financial_aid_package,
            avg_net_price_0_30k        = EXCLUDED.avg_net_price_0_30k,
            avg_net_price_30_48k       = EXCLUDED.avg_net_price_30_48k,
            avg_net_price_48_75k       = EXCLUDED.avg_net_price_48_75k,
            avg_net_price_75_110k      = EXCLUDED.avg_net_price_75_110k,
            avg_net_price_110k_plus    = EXCLUDED.avg_net_price_110k_plus,
            percent_receiving_aid      = EXCLUDED.percent_receiving_aid,
            percent_receiving_grants   = EXCLUDED.percent_receiving_grants,
            meets_full_need            = EXCLUDED.meets_full_need,
            no_loan_policy             = EXCLUDED.no_loan_policy,
            endowment_per_student      = EXCLUDED.endowment_per_student,
            scholarship_count          = EXCLUDED.scholarship_count,
            updated_at                 = NOW()
    """
    params = {
        "college_id": college_id,
        "academic_year": academic_year,
        **{k: data.get(k) for k in [
            "avg_financial_aid_package",
            "avg_net_price_0_30k", "avg_net_price_30_48k", "avg_net_price_48_75k",
            "avg_net_price_75_110k", "avg_net_price_110k_plus",
            "percent_receiving_aid", "percent_receiving_grants",
            "meets_full_need", "no_loan_policy",
            "endowment_per_student", "scholarship_count",
        ]},
    }
    with conn.cursor() as cur:
        cur.execute(sql, params)
    conn.commit()


# ── College Scorecard API ─────────────────────────────────────────────────────

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def fetch_scorecard_financial(college_name: str) -> dict:
    if not DATA_GOV_API_KEY:
        return {}
    params = {
        "school.name": college_name,
        "api_key": DATA_GOV_API_KEY,
        "_fields": (
            "school.name,"
            "latest.aid.median_debt_suppressed.completers.overall,"
            "latest.aid.pell_grant_rate,"
            "latest.aid.federal_loan_rate,"
            "latest.cost.avg_net_price.public,"
            "latest.cost.avg_net_price.private,"
            "latest.cost.net_price.consumer.by_income_level.0-30000,"
            "latest.cost.net_price.consumer.by_income_level.30001-48000,"
            "latest.cost.net_price.consumer.by_income_level.48001-75000,"
            "latest.cost.net_price.consumer.by_income_level.75001-110000,"
            "latest.cost.net_price.consumer.by_income_level.110001-plus"
        ),
    }
    resp = requests.get(SCORECARD_BASE, params=params, timeout=15)
    resp.raise_for_status()
    results = resp.json().get("results", [])
    if not results:
        return {}
    r = results[0]

    avg_net = r.get("latest.cost.avg_net_price.private") or r.get("latest.cost.avg_net_price.public")
    pell_rate = r.get("latest.aid.pell_grant_rate")

    return {
        "avg_financial_aid_package": avg_net,
        "avg_net_price_0_30k": r.get("latest.cost.net_price.consumer.by_income_level.0-30000"),
        "avg_net_price_30_48k": r.get("latest.cost.net_price.consumer.by_income_level.30001-48000"),
        "avg_net_price_48_75k": r.get("latest.cost.net_price.consumer.by_income_level.48001-75000"),
        "avg_net_price_75_110k": r.get("latest.cost.net_price.consumer.by_income_level.75001-110000"),
        "avg_net_price_110k_plus": r.get("latest.cost.net_price.consumer.by_income_level.110001-plus"),
        "percent_receiving_grants": pell_rate,
        "percent_receiving_aid": r.get("latest.aid.federal_loan_rate"),
    }


# ── IPEDS API (Urban Institute) ───────────────────────────────────────────────

@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=2, max=8))
def fetch_ipeds_financial(college_name: str) -> dict:
    """
    Attempt to look up financial data from IPEDS via the Urban Institute API.
    Returns an empty dict if the college is not found or the request fails.
    """
    # Search by name to get unitid
    search_url = f"{IPEDS_BASE}/institutional-characteristics/1/search/"
    resp = requests.get(
        search_url,
        params={"name": college_name},
        timeout=15,
    )
    resp.raise_for_status()
    results = resp.json().get("results", [])
    if not results:
        return {}

    unitid = results[0].get("unitid")
    if not unitid:
        return {}

    # Fetch student financial aid data
    fin_url = f"{IPEDS_BASE}/sfa/{unitid}/1/"
    fin_resp = requests.get(fin_url, timeout=15)
    fin_resp.raise_for_status()
    fin_data = fin_resp.json().get("results", [{}])[0]

    return {
        "avg_financial_aid_package": fin_data.get("grnt_aid_avg"),
        "avg_net_price_0_30k": fin_data.get("avg_net_price_income1"),
        "avg_net_price_30_48k": fin_data.get("avg_net_price_income2"),
        "avg_net_price_48_75k": fin_data.get("avg_net_price_income3"),
        "avg_net_price_75_110k": fin_data.get("avg_net_price_income4"),
        "avg_net_price_110k_plus": fin_data.get("avg_net_price_income5"),
        "percent_receiving_aid": fin_data.get("pct_recv_aid"),
        "percent_receiving_grants": fin_data.get("pct_recv_grant"),
    }


def merge_dicts(*dicts) -> dict:
    """Merge dicts left-to-right, preferring non-None values from earlier dicts."""
    result = {}
    for d in dicts:
        for k, v in d.items():
            if k not in result or result[k] is None:
                result[k] = v
    return result


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    log.info("Financial aid scraper started.")
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
                data: dict = {}

                # Try IPEDS first (free, no key required)
                try:
                    ipeds_data = fetch_ipeds_financial(college_name)
                    data = merge_dicts(ipeds_data, data)
                except Exception as e:
                    log.debug(f"IPEDS failed for {college_name}: {e}")

                # Then Scorecard (richer net-price income brackets)
                try:
                    sc_data = fetch_scorecard_financial(college_name)
                    data = merge_dicts(sc_data, data)
                except Exception as e:
                    log.debug(f"Scorecard failed for {college_name}: {e}")

                time.sleep(REQUEST_DELAY)

                if any(v is not None for v in data.values()):
                    upsert_financial_aid(conn, college_id, FINANCIAL_YEAR, data)
                    rows_upserted += 1
                    log.debug(f"Upserted financial aid for {college_name}")
                else:
                    log.debug(f"No financial aid data for {college_name}")

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

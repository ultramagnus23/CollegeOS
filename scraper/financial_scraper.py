#!/usr/bin/env python3
"""
Financial Aid Scraper — Bulk Pagination Edition
─────────────────────────────────────────────────
Fetches ALL College Scorecard financial data in paginated bulk calls
(~70 pages × 100 schools = 7 000+ schools, ~35 API calls total).
No per-college requests. Matches against our colleges DB by name.

Fetches from College Scorecard:
  • Net price by 5 income brackets
  • Tuition (in-state, out-of-state)
  • Average net price
  • Pell grant %
  • Median debt at graduation
  • Loan default rate (3yr)
  • Median earnings at 6yr and 10yr post-entry
  • Total cost of attendance

Upserts into:
  • college_financial_data   (per-year detail)
  • colleges                 (summary columns for fast querying)

Required env vars:
    DATABASE_URL
    DATA_GOV_API_KEY   (free at https://api.data.gov/signup/)

Optional:
    FINANCIAL_YEAR      (e.g. "2023", default: current year - 1)
    REQUEST_DELAY_SEC   (delay between pages, default 0.3)
"""

import difflib
import os
import sys
import time
import logging

import requests
import psycopg2
import psycopg2.extras
from tenacity import retry, stop_after_attempt, wait_exponential

# ── Logging ────────────────────────────────────────────────────────────────────
try:
    from logger import get_logger
    log = get_logger("financial_scraper")
except ImportError:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
        handlers=[logging.StreamHandler(sys.stdout)],
    )
    log = logging.getLogger("financial_scraper")

# ── Configuration ─────────────────────────────────────────────────────────────
DATABASE_URL     = os.environ["DATABASE_URL"]
DATA_GOV_API_KEY = os.environ.get("DATA_GOV_API_KEY") or os.environ.get("COLLEGE_SCORECARD_API_KEY", "")
FINANCIAL_YEAR   = int(os.environ.get("FINANCIAL_YEAR", str(__import__("datetime").date.today().year - 1)))
REQUEST_DELAY    = float(os.environ.get("REQUEST_DELAY_SEC", "0.3"))

SCORECARD_BASE = "https://api.data.gov/ed/collegescorecard/v1/schools"
IPEDS_BASE = "https://educationdata.urban.org/api/v1/college-university/ipeds"

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
        try:
            cur.execute("SELECT id, name FROM colleges ORDER BY id")
        except psycopg2.errors.UndefinedTable:
            cur.execute("SELECT id, name FROM colleges_comprehensive ORDER BY id")
        return cur.fetchall()


def upsert_college_financial_data(conn, college_id: int, year: int, data: dict) -> None:
    """Upsert into college_financial_data (per-year detail table)."""
    sql = """
        INSERT INTO college_financial_data (
            college_id, year,
            tuition_in_state, tuition_out_state,
            total_coa, avg_net_price,
            net_price_0_30k, net_price_30_48k, net_price_48_75k,
            net_price_75_110k, net_price_110k_plus,
            pct_receiving_pell,
            median_debt_at_graduation,
            loan_default_rate_3yr,
            median_earnings_6yr,
            median_earnings_10yr,
            updated_at
        ) VALUES (
            %(college_id)s, %(year)s,
            %(tuition_in_state)s, %(tuition_out_state)s,
            %(total_coa)s, %(avg_net_price)s,
            %(net_price_0_30k)s, %(net_price_30_48k)s, %(net_price_48_75k)s,
            %(net_price_75_110k)s, %(net_price_110k_plus)s,
            %(pct_receiving_pell)s,
            %(median_debt_at_graduation)s,
            %(loan_default_rate_3yr)s,
            %(median_earnings_6yr)s,
            %(median_earnings_10yr)s,
            NOW()
        )
        ON CONFLICT (college_id, year)
        DO UPDATE SET
            tuition_in_state       = COALESCE(EXCLUDED.tuition_in_state,    college_financial_data.tuition_in_state),
            tuition_out_state      = COALESCE(EXCLUDED.tuition_out_state,   college_financial_data.tuition_out_state),
            total_coa              = COALESCE(EXCLUDED.total_coa,           college_financial_data.total_coa),
            avg_net_price          = COALESCE(EXCLUDED.avg_net_price,       college_financial_data.avg_net_price),
            net_price_0_30k        = COALESCE(EXCLUDED.net_price_0_30k,     college_financial_data.net_price_0_30k),
            net_price_30_48k       = COALESCE(EXCLUDED.net_price_30_48k,    college_financial_data.net_price_30_48k),
            net_price_48_75k       = COALESCE(EXCLUDED.net_price_48_75k,    college_financial_data.net_price_48_75k),
            net_price_75_110k      = COALESCE(EXCLUDED.net_price_75_110k,   college_financial_data.net_price_75_110k),
            net_price_110k_plus    = COALESCE(EXCLUDED.net_price_110k_plus, college_financial_data.net_price_110k_plus),
            pct_receiving_pell     = COALESCE(EXCLUDED.pct_receiving_pell,  college_financial_data.pct_receiving_pell),
            median_debt_at_graduation = COALESCE(EXCLUDED.median_debt_at_graduation, college_financial_data.median_debt_at_graduation),
            loan_default_rate_3yr  = COALESCE(EXCLUDED.loan_default_rate_3yr, college_financial_data.loan_default_rate_3yr),
            median_earnings_6yr    = COALESCE(EXCLUDED.median_earnings_6yr,  college_financial_data.median_earnings_6yr),
            median_earnings_10yr   = COALESCE(EXCLUDED.median_earnings_10yr, college_financial_data.median_earnings_10yr),
            updated_at             = NOW()
    """
    params = {
        "college_id": college_id,
        "year": year,
        **{k: data.get(k) for k in [
            "tuition_in_state", "tuition_out_state",
            "total_coa", "avg_net_price",
            "net_price_0_30k", "net_price_30_48k", "net_price_48_75k",
            "net_price_75_110k", "net_price_110k_plus",
            "pct_receiving_pell",
            "median_debt_at_graduation",
            "loan_default_rate_3yr",
            "median_earnings_6yr",
            "median_earnings_10yr",
        ]},
    }
    with conn.cursor() as cur:
        cur.execute(sql, params)
    conn.commit()


# ── College Scorecard API ─────────────────────────────────────────────────────

def _safe(r: dict, key: str):
    """Return None for missing, empty, or PrivacySuppressed values."""
    v = r.get(key)
    return None if v in (None, "", "PrivacySuppressed") else v


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _fetch_scorecard_page(page: int, per_page: int = 100) -> dict:
    params = {
        "api_key": DATA_GOV_API_KEY,
        "per_page": per_page,
        "page": page,
        "_fields": SCORECARD_FIELDS,
    }
    resp = requests.get(SCORECARD_BASE, params=params, timeout=30)
    resp.raise_for_status()
    results = resp.json().get("results", [])
    if not results:
        return {}
    r = results[0]

    avg_net = _safe(r, "latest.cost.avg_net_price.private") or _safe(r, "latest.cost.avg_net_price.public")

    return {
        "avg_financial_aid_package": avg_net,
        "avg_net_price_0_30k": _safe(r, "latest.cost.net_price.consumer.by_income_level.0-30000"),
        "avg_net_price_30_48k": _safe(r, "latest.cost.net_price.consumer.by_income_level.30001-48000"),
        "avg_net_price_48_75k": _safe(r, "latest.cost.net_price.consumer.by_income_level.48001-75000"),
        "avg_net_price_75_110k": _safe(r, "latest.cost.net_price.consumer.by_income_level.75001-110000"),
        "avg_net_price_110k_plus": _safe(r, "latest.cost.net_price.consumer.by_income_level.110001-plus"),
        # Fix 4: map pell_grant_rate to percent_receiving_grants (not federal_loan_rate)
        "percent_receiving_grants": _safe(r, "latest.aid.pell_grant_rate"),
        "percent_receiving_aid": _safe(r, "latest.aid.federal_loan_rate"),
    }


# ── IPEDS API (Urban Institute) ───────────────────────────────────────────────

def fetch_ipeds_financial(college_name: str) -> dict:
    """
    Look up financial data from IPEDS via the Urban Institute Education Data API.
    Returns an empty dict if the college is not found or any request fails.
    IPEDS is a secondary source — must never crash the main loop.
    """
    try:
        # Fix 5: corrected endpoint format
        search_url = "https://educationdata.urban.org/api/v1/college-university/ipeds/institutional-characteristics/1/"
        resp = requests.get(
            search_url,
            params={"name": college_name, "per_page": 1},
            timeout=15,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        if not results:
            return {}

        unitid = results[0].get("unitid")
        if not unitid:
            return {}

        # Fetch student financial aid data for this institution
        fin_url = f"https://educationdata.urban.org/api/v1/college-university/ipeds/student-financial-aid/{unitid}/1/"
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
    except Exception as e:
        log.debug(f"IPEDS fetch failed for {college_name}: {e}")
        return {}


def merge_dicts(*dicts) -> dict:
    """Merge dicts left-to-right, preferring non-None values from earlier dicts."""
    result = {}
    for d in dicts:
        for k, v in d.items():
            if k not in result or result[k] is None:
                result[k] = v
    return result


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> int:
    log.info(f"Financial aid scraper started (year={FINANCIAL_YEAR}).")
    conn = None
    matched = 0
    skipped = 0

    try:
        conn = get_connection()
        colleges = load_colleges(conn)
        log.info(f"Loaded {len(colleges)} colleges from DB.")

        # Bulk-fetch all Scorecard financial data in one paginated sweep
        scorecard = fetch_all_scorecard_financial()

        for college in colleges:
            college_id   = college["id"]
            college_name = college["name"]

            try:
                # Try IPEDS first (free, no key required)
                ipeds_data: dict = {}
                try:
                    ipeds_data = fetch_ipeds_financial(college_name)
                except Exception as e:
                    log.debug(f"IPEDS failed for {college_name}: {e}")

                # Then Scorecard (richer income brackets take priority)
                sc_data: dict = {}
                try:
                    sc_data = fetch_scorecard_financial(college_name)
                except Exception as e:
                    log.debug(f"Scorecard failed for {college_name}: {e}")

                # Fix 4: Scorecard values take priority over IPEDS
                data = merge_dicts(sc_data, ipeds_data)

                time.sleep(REQUEST_DELAY)

                if any(v is not None for v in data.values()):
                    upsert_financial_aid(conn, college_id, FINANCIAL_YEAR, data)
                    rows_upserted += 1
                    log.debug(f"Upserted financial aid for {college_name}")
                else:
                    log.debug(f"No financial aid data for {college_name}")

            except Exception as e:
                conn.rollback()
                log.warning(f"DB upsert failed for {college_name}: {e}")
                skipped += 1

        log.info(
            f"Financial aid scraper complete. "
            f"Matched={matched}, Skipped/no-data={skipped}, Total={len(colleges)}"
        )
        return 0

    except Exception as e:
        log.error(f"Fatal error in financial scraper: {e}", exc_info=True)
        return 1
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    sys.exit(main())


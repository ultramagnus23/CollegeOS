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

SCORECARD_BASE = "https://api.data.ed.gov/student/v1/schools"

# Scorecard fields to fetch (one comma-separated string)
SCORECARD_FIELDS = ",".join([
    "school.name",
    "id",
    # Tuition
    "latest.cost.tuition.in_state",
    "latest.cost.tuition.out_of_state",
    # Net price by income bracket
    "latest.cost.avg_net_price.public",
    "latest.cost.avg_net_price.private",
    "latest.cost.net_price.consumer.by_income_level.0-30000",
    "latest.cost.net_price.consumer.by_income_level.30001-48000",
    "latest.cost.net_price.consumer.by_income_level.48001-75000",
    "latest.cost.net_price.consumer.by_income_level.75001-110000",
    "latest.cost.net_price.consumer.by_income_level.110001-plus",
    # Aid
    "latest.aid.pell_grant_rate",
    "latest.aid.federal_loan_rate",
    # Debt
    "latest.aid.median_debt_suppressed.completers.overall",
    # Earnings (6yr, 10yr post-entry)
    "latest.earnings.6_yrs_after_entry.median",
    "latest.earnings.10_yrs_after_entry.median",
    # Default rate
    "latest.repayment.3_yr_default_rate",
])

if not DATA_GOV_API_KEY:
    log.warning(
        "DATA_GOV_API_KEY not set — College Scorecard fetches will fail. "
        "Get a free key at https://api.data.gov/signup/"
    )

# ── DB helpers ─────────────────────────────────────────────────────────────────

def get_connection():
    return psycopg2.connect(DATABASE_URL)


def load_colleges(conn) -> list:
    """Load all colleges from DB, trying colleges then colleges_comprehensive."""
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


def update_colleges_summary(conn, college_id: int, data: dict) -> None:
    """Update colleges table with summary financial columns for fast querying."""
    sql = """
        UPDATE colleges SET
            avg_net_price_0_30k          = COALESCE(%(net_price_0_30k)s,    avg_net_price_0_30k),
            avg_net_price_30_48k         = COALESCE(%(net_price_30_48k)s,   avg_net_price_30_48k),
            avg_net_price_48_75k         = COALESCE(%(net_price_48_75k)s,   avg_net_price_48_75k),
            avg_net_price_75_110k        = COALESCE(%(net_price_75_110k)s,  avg_net_price_75_110k),
            avg_net_price_110k_plus      = COALESCE(%(net_price_110k_plus)s,avg_net_price_110k_plus),
            pct_students_receiving_aid   = COALESCE(%(pct_students_receiving_aid)s, pct_students_receiving_aid),
            median_earnings_6yr          = COALESCE(%(median_earnings_6yr)s, median_earnings_6yr),
            median_earnings_10yr         = COALESCE(%(median_earnings_10yr)s, median_earnings_10yr),
            loan_default_rate            = COALESCE(%(loan_default_rate)s,  loan_default_rate),
            avg_total_debt_at_graduation = COALESCE(%(avg_total_debt_at_graduation)s, avg_total_debt_at_graduation)
        WHERE id = %(college_id)s
    """
    params = {
        "college_id": college_id,
        "net_price_0_30k": data.get("net_price_0_30k"),
        "net_price_30_48k": data.get("net_price_30_48k"),
        "net_price_48_75k": data.get("net_price_48_75k"),
        "net_price_75_110k": data.get("net_price_75_110k"),
        "net_price_110k_plus": data.get("net_price_110k_plus"),
        "pct_students_receiving_aid": data.get("pct_receiving_pell"),
        "median_earnings_6yr": data.get("median_earnings_6yr"),
        "median_earnings_10yr": data.get("median_earnings_10yr"),
        "loan_default_rate": data.get("loan_default_rate_3yr"),
        "avg_total_debt_at_graduation": data.get("median_debt_at_graduation"),
    }
    with conn.cursor() as cur:
        cur.execute(sql, params)


# ── Bulk Scorecard fetch ───────────────────────────────────────────────────────

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
    return resp.json()


def fetch_all_scorecard_financial() -> dict:
    """
    Paginate through the entire College Scorecard dataset (~70 pages).
    Returns dict keyed by lowercase school name → financial data dict.
    """
    if not DATA_GOV_API_KEY:
        log.warning("Skipping Scorecard bulk fetch — no API key configured.")
        return {}

    all_data: dict = {}
    page = 0
    per_page = 100

    while True:
        try:
            raw = _fetch_scorecard_page(page, per_page)
        except Exception as e:
            log.error(f"Scorecard API error on page {page}: {e}")
            break

        results = raw.get("results", [])
        if not results:
            break

        for r in results:
            name = (r.get("school.name") or "").strip()
            if not name:
                continue

            avg_net = (
                r.get("latest.cost.avg_net_price.private")
                or r.get("latest.cost.avg_net_price.public")
            )

            # Tuition: prefer out-of-state for international proxy
            tuition_in  = r.get("latest.cost.tuition.in_state")
            tuition_out = r.get("latest.cost.tuition.out_of_state")

            # Cost of attendance: best approximation from available fields
            total_coa = tuition_out or tuition_in  # living costs not in Scorecard; stored separately

            earnings_6yr  = r.get("latest.earnings.6_yrs_after_entry.median")
            earnings_10yr = r.get("latest.earnings.10_yrs_after_entry.median")
            default_rate  = r.get("latest.repayment.3_yr_default_rate")
            debt          = r.get("latest.aid.median_debt_suppressed.completers.overall")
            pell_rate     = r.get("latest.aid.pell_grant_rate")

            all_data[name.lower()] = {
                "tuition_in_state":         _int(tuition_in),
                "tuition_out_state":        _int(tuition_out),
                "total_coa":                _int(total_coa),
                "avg_net_price":            _int(avg_net),
                "net_price_0_30k":          _int(r.get("latest.cost.net_price.consumer.by_income_level.0-30000")),
                "net_price_30_48k":         _int(r.get("latest.cost.net_price.consumer.by_income_level.30001-48000")),
                "net_price_48_75k":         _int(r.get("latest.cost.net_price.consumer.by_income_level.48001-75000")),
                "net_price_75_110k":        _int(r.get("latest.cost.net_price.consumer.by_income_level.75001-110000")),
                "net_price_110k_plus":      _int(r.get("latest.cost.net_price.consumer.by_income_level.110001-plus")),
                "pct_receiving_pell":       _pct(pell_rate),
                "median_debt_at_graduation":_int(debt),
                "loan_default_rate_3yr":    _pct(default_rate),
                "median_earnings_6yr":      _int(earnings_6yr),
                "median_earnings_10yr":     _int(earnings_10yr),
            }

        total   = raw.get("metadata", {}).get("total", 0)
        fetched = (page + 1) * per_page
        log.info(f"Scorecard page {page}: {min(fetched, total)}/{total} schools fetched")

        if fetched >= total:
            break

        page += 1
        time.sleep(REQUEST_DELAY)

    log.info(f"Scorecard bulk fetch complete — {len(all_data)} records loaded.")
    return all_data


# ── Matching helpers ───────────────────────────────────────────────────────────

def find_match(college_name: str, scorecard_data: dict) -> dict:
    """Exact match first, then fuzzy match at 0.85 cutoff."""
    key = college_name.lower().strip()
    if key in scorecard_data:
        return scorecard_data[key]
    matches = difflib.get_close_matches(key, scorecard_data.keys(), n=1, cutoff=0.85)
    if matches:
        log.debug(f"Fuzzy match: '{college_name}' → '{matches[0]}'")
        return scorecard_data[matches[0]]
    return {}


def _int(v) -> int | None:
    """Safe int conversion; returns None for null/missing values."""
    try:
        return int(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _pct(v) -> float | None:
    """Convert a 0–1 float to a 0–100 percentage; returns None for nulls."""
    try:
        f = float(v)
        # Scorecard pell_grant_rate is 0-1; default_rate is also 0-1
        return round(f * 100, 2) if 0.0 <= f <= 1.0 else round(f, 2)
    except (TypeError, ValueError):
        return None


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

            data = find_match(college_name, scorecard)
            if not data or not any(v is not None for v in data.values()):
                log.debug(f"No financial data found for: {college_name}")
                skipped += 1
                continue

            try:
                upsert_college_financial_data(conn, college_id, FINANCIAL_YEAR, data)
                update_colleges_summary(conn, college_id, data)
                conn.commit()
                matched += 1
                log.debug(f"Updated financial data for: {college_name}")
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


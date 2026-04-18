#!/usr/bin/env python3
"""
Common Data Set (CDS) Web Scraper
───────────────────────────────────
For each college in our database, searches for the institution's published
Common Data Set page and extracts admission statistics:
  • Acceptance rate (Section C)
  • Median / 25th / 75th-percentile SAT and ACT scores (Section C)
  • Class size / enrolled class profile

Because CDS pages vary in layout, the scraper uses a multi-strategy approach:
  1. Direct URL patterns (most colleges follow a predictable path)
  2. Google Custom Search JSON API as a fallback (requires GOOGLE_CSE_API_KEY)
  3. DuckDuckGo HTML search as a no-key fallback

Results are written to /tmp/cds_staging.json and merged by load-to-postgres.py.

Required env vars:   (none strictly required — degrades gracefully)
Optional env vars:
    GOOGLE_CSE_API_KEY   Google Custom Search Engine API key
    GOOGLE_CSE_CX        Custom Search Engine ID
    DATABASE_URL         Read college list from DB (else uses IPEDS staging file)
    CDS_TIMEOUT_SEC      HTTP request timeout (default: 15)
    CDS_MAX_COLLEGES     Maximum colleges to attempt (default: unlimited)
"""

import json
import logging
import os
import re
import sys
import time
from typing import Optional
from urllib.parse import quote_plus, urljoin, urlparse

import requests
import yaml
from bs4 import BeautifulSoup
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
log = logging.getLogger("fetch_cds_web")

TIMEOUT = int(os.environ.get("CDS_TIMEOUT_SEC", _CFG["pipeline"]["cds_timeout_sec"]))
MAX_RETRIES = int(_CFG["pipeline"]["cds_max_retries"])
USER_AGENT = _CFG["pipeline"]["cds_user_agent"]
MAX_COLLEGES = int(os.environ.get("CDS_MAX_COLLEGES", "0")) or None

GOOGLE_CSE_API_KEY = os.environ.get("GOOGLE_CSE_API_KEY", "")
GOOGLE_CSE_CX = os.environ.get("GOOGLE_CSE_CX", "")

IPEDS_STAGING_PATH = os.environ.get("IPEDS_STAGING_PATH", "/tmp/ipeds_staging.json")
CDS_STAGING_PATH = os.environ.get("CDS_STAGING_PATH", "/tmp/cds_staging.json")

DATABASE_URL = os.environ.get("DATABASE_URL", "")

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"})

# ── Number extraction helpers ─────────────────────────────────────────────────

_PCT_RE = re.compile(r"(\d{1,3}(?:\.\d+)?)\s*%")
_INT_RE = re.compile(r"\b(\d{3,5})\b")


def _first_pct(text: str) -> Optional[float]:
    m = _PCT_RE.search(text)
    return float(m.group(1)) if m else None


def _first_int(text: str, lo: int = 100, hi: int = 10_000_000) -> Optional[int]:
    for m in _INT_RE.finditer(text):
        v = int(m.group(1))
        if lo <= v <= hi:
            return v
    return None


def _score_in_range(text: str, lo: int, hi: int) -> Optional[int]:
    """Extract the first integer in [lo, hi] from text."""
    for m in _INT_RE.finditer(text):
        v = int(m.group(1))
        if lo <= v <= hi:
            return v
    return None


# ── CDS section-C parsers ─────────────────────────────────────────────────────

def _parse_cds_html(html: str, college_name: str) -> dict:
    """
    Parse a CDS HTML page and extract admission statistics from Section C.
    Returns a dict with keys matching the staging schema.
    """
    soup = BeautifulSoup(html, "lxml")
    text = soup.get_text(" ", strip=True)

    result: dict = {"name": college_name, "data_source": "CDS"}

    # ── Acceptance rate ───────────────────────────────────────────────────────
    # Look for patterns like "Percent admitted: 18%" or "18.4%"
    for pattern in [
        r"percent\s+(?:of\s+applicants\s+)?admitted[:\s]+(\d{1,3}(?:\.\d+)?)\s*%",
        r"admission\s+rate[:\s]+(\d{1,3}(?:\.\d+)?)\s*%",
        r"accepted[:\s]+(\d{1,3}(?:\.\d+)?)\s*%",
    ]:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            result["acceptance_rate"] = float(m.group(1)) / 100.0
            break

    # ── SAT scores ────────────────────────────────────────────────────────────
    # CDS C9: SAT Evidence-Based Reading and Writing / Math
    # Strategy: find tables with "SAT" header, read 25th/75th rows
    tables = soup.find_all("table")
    for tbl in tables:
        tbl_text = tbl.get_text(" ", strip=True).upper()
        if "SAT" not in tbl_text and "ACT" not in tbl_text:
            continue

        rows = tbl.find_all("tr")
        for row in rows:
            cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
            if len(cells) < 2:
                continue
            label = cells[0].upper()

            if "SAT" in label and "25" in label:
                v = _score_in_range(" ".join(cells[1:]), 400, 1600)
                if v:
                    result["sat_25"] = v
            elif "SAT" in label and "75" in label:
                v = _score_in_range(" ".join(cells[1:]), 400, 1600)
                if v:
                    result["sat_75"] = v
            elif "ACT" in label and "25" in label:
                v = _score_in_range(" ".join(cells[1:]), 1, 36)
                if v:
                    result["act_25"] = v
            elif "ACT" in label and "75" in label:
                v = _score_in_range(" ".join(cells[1:]), 1, 36)
                if v:
                    result["act_75"] = v

    # ── Applicant counts ──────────────────────────────────────────────────────
    for pattern in [
        r"(?:number\s+of\s+)?(?:total\s+)?applicants[:\s]+([0-9,]+)",
        r"applications\s+received[:\s]+([0-9,]+)",
    ]:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            raw = m.group(1).replace(",", "")
            v = _first_int(raw, lo=10)
            if v:
                result["applications_received"] = v
                break

    return result


# ── URL / search helpers ──────────────────────────────────────────────────────

_CDS_URL_PATTERNS = [
    "{base}/common-data-set",
    "{base}/admissions/common-data-set",
    "{base}/about/common-data-set",
    "{base}/ir/common-data-set",
    "{base}/institutional-research/common-data-set",
    "{base}/facts-and-figures/common-data-set",
    "{base}/cds",
]


def _candidate_urls(college: dict) -> list[str]:
    """Generate likely CDS URL candidates for a college."""
    urls = []
    raw_url = (college.get("school_url") or "").strip()
    if raw_url:
        if not raw_url.startswith("http"):
            raw_url = "https://" + raw_url
        parsed = urlparse(raw_url)
        base = f"{parsed.scheme}://{parsed.netloc}"
        for pattern in _CDS_URL_PATTERNS:
            urls.append(pattern.format(base=base))
    return urls


@retry(stop=stop_after_attempt(MAX_RETRIES), wait=wait_exponential(min=1, max=8))
def _get(url: str) -> Optional[requests.Response]:
    try:
        resp = SESSION.get(url, timeout=TIMEOUT, allow_redirects=True)
        if resp.status_code == 200:
            return resp
    except requests.RequestException:
        pass
    return None


def _search_google_cse(college_name: str) -> Optional[str]:
    """Use Google Custom Search JSON API to find the CDS page URL."""
    if not GOOGLE_CSE_API_KEY or not GOOGLE_CSE_CX:
        return None
    query = f'"{college_name}" "common data set" filetype:pdf OR filetype:html'
    params = {
        "key": GOOGLE_CSE_API_KEY,
        "cx": GOOGLE_CSE_CX,
        "q": query,
        "num": 3,
    }
    try:
        resp = requests.get(
            "https://www.googleapis.com/customsearch/v1",
            params=params,
            timeout=10,
        )
        if resp.status_code == 200:
            items = resp.json().get("items", [])
            if items:
                return items[0].get("link")
    except requests.RequestException as exc:
        log.debug(f"Google CSE error for {college_name}: {exc}")
    return None


def _search_duckduckgo(college_name: str) -> Optional[str]:
    """Lightweight DuckDuckGo HTML scrape as a no-key fallback."""
    query = f"{college_name} common data set site:edu"
    url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
    try:
        resp = SESSION.get(url, timeout=10)
        soup = BeautifulSoup(resp.text, "lxml")
        for a in soup.select("a.result__url"):
            href = a.get("href", "")
            if "common" in href.lower() or "cds" in href.lower():
                return href
        # Fallback: first .edu result
        for a in soup.select("a.result__url"):
            href = a.get("href", "")
            if ".edu" in href:
                return href
    except requests.RequestException as exc:
        log.debug(f"DuckDuckGo error for {college_name}: {exc}")
    return None


def scrape_college_cds(college: dict) -> dict:
    """
    Attempt to find and parse a college's CDS page.
    Returns a (possibly sparse) stats dict.
    """
    name = college.get("name", "Unknown")
    result = {"name": name, "data_source": "CDS"}

    # 1. Try known URL patterns
    for url in _candidate_urls(college):
        resp = _get(url)
        if resp and "common" in resp.url.lower() or (resp and len(resp.text) > 1000):
            log.debug(f"CDS hit via pattern: {resp.url}")
            parsed = _parse_cds_html(resp.text, name)
            result.update({k: v for k, v in parsed.items() if v is not None})
            if result.get("acceptance_rate"):
                return result

    # 2. Google CSE
    cse_url = _search_google_cse(name)
    if cse_url:
        resp = _get(cse_url)
        if resp:
            parsed = _parse_cds_html(resp.text, name)
            result.update({k: v for k, v in parsed.items() if v is not None})
            if result.get("acceptance_rate"):
                return result

    # 3. DuckDuckGo
    ddg_url = _search_duckduckgo(name)
    if ddg_url:
        resp = _get(ddg_url)
        if resp:
            parsed = _parse_cds_html(resp.text, name)
            result.update({k: v for k, v in parsed.items() if v is not None})

    return result


# ── College list loading ──────────────────────────────────────────────────────

def load_college_list() -> list[dict]:
    """
    Load college name + school_url from either the IPEDS staging file or the DB.
    Falls back to an empty list if neither is available.
    """
    # Prefer IPEDS staging (already populated by fetch-ipeds.py)
    if os.path.exists(IPEDS_STAGING_PATH):
        with open(IPEDS_STAGING_PATH) as fh:
            colleges = json.load(fh)
        log.info(f"Loaded {len(colleges)} colleges from IPEDS staging file")
        return [{"name": c["name"], "school_url": c.get("school_url", "")} for c in colleges]

    # Fallback: query the database
    if DATABASE_URL:
        try:
            import psycopg2
            import psycopg2.extras
            conn = psycopg2.connect(DATABASE_URL)
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("SELECT name, website FROM colleges_comprehensive ORDER BY id")
                colleges = [dict(r) for r in cur.fetchall()]
            conn.close()
            log.info(f"Loaded {len(colleges)} colleges from database")
            return [{"name": c["name"], "school_url": c.get("website", "")} for c in colleges]
        except Exception as exc:
            log.error(f"DB load failed: {exc}")

    log.warning("No college list source available — CDS scraper will produce no output")
    return []


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    log.info("fetch-cds-web.py started")

    colleges = load_college_list()
    if not colleges:
        log.error("Empty college list. Exiting.")
        return 1

    if MAX_COLLEGES:
        colleges = colleges[:MAX_COLLEGES]
        log.info(f"Limited to first {MAX_COLLEGES} colleges (CDS_MAX_COLLEGES)")

    results = []
    found = 0

    for i, college in enumerate(colleges, 1):
        name = college.get("name", "")
        log.info(f"[{i}/{len(colleges)}] Scraping CDS for: {name}")

        try:
            stats = scrape_college_cds(college)
            results.append(stats)
            if stats.get("acceptance_rate"):
                found += 1
        except Exception as exc:
            log.warning(f"Failed to scrape {name}: {exc}")
            results.append({"name": name, "data_source": "CDS"})

        time.sleep(0.5)  # be polite

    with open(CDS_STAGING_PATH, "w") as fh:
        json.dump(results, fh, indent=2, default=str)

    log.info(f"✓ CDS scrape complete: {found}/{len(colleges)} acceptance rates found")
    log.info(f"  Staging file: {CDS_STAGING_PATH}")
    print(f"ROWS_UPSERTED={found}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

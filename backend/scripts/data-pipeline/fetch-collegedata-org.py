#!/usr/bin/env python3
"""
Fetch CollegeData from NCES / College Scorecard GitHub Repository
───────────────────────────────────────────────────────────────────
Downloads the official NCES IPEDS data CSVs from the College Scorecard
data-by-academic-year releases on GitHub (RTICWDT/college-scorecard).

These pre-processed CSVs contain historical acceptance / enrollment trends
going back to 1996–97. The script:
  1. Queries the GitHub API for the latest data release tag
  2. Downloads the most recent academic-year CSV (e.g. MERGED2023_PP.csv)
  3. Parses the relevant admission columns
  4. Writes /tmp/collegedata_staging.json for load-to-postgres.py

Required env vars:   (none strictly required — uses unauthenticated GitHub API)
Optional env vars:
    GITHUB_TOKEN            Increases GitHub API rate limit (5000 req/hr vs 60)
    COLLEGEDATA_STAGING_PATH  Output file (default: /tmp/collegedata_staging.json)
    COLLEGEDATA_MAX_ROWS      Limit rows for testing (default: unlimited)
"""

import csv
import io
import json
import logging
import os
import sys
import zipfile
from typing import Optional

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
log = logging.getLogger("fetch_collegedata_org")

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
STAGING_PATH = os.environ.get(
    "COLLEGEDATA_STAGING_PATH", "/tmp/collegedata_staging.json"
)
MAX_ROWS = int(os.environ.get("COLLEGEDATA_MAX_ROWS", "0")) or None

# ── IPEDS column mapping ──────────────────────────────────────────────────────
# Official IPEDS column names in the merged NCES data files

IPEDS_COLUMNS = {
    # Admission
    "ADM_RATE":    "acceptance_rate",         # overall admission rate (0-1)
    "ADM_RATE_ALL": "acceptance_rate",        # fallback
    "SATVRMID":    "_sat_verb_mid",           # SAT Verbal/ERW midpoint
    "SATMTMID":    "_sat_math_mid",           # SAT Math midpoint
    "SATWRMID":    "_sat_write_mid",          # SAT Writing midpoint (pre-2016)
    "SATWR25":     "_sat_verb_25",
    "SATWR75":     "_sat_verb_75",
    "SATMT25":     "_sat_math_25",
    "SATMT75":     "_sat_math_75",
    "ACTEN25":     "_act_eng_25",
    "ACTEN75":     "_act_eng_75",
    "ACTMT25":     "_act_math_25",
    "ACTMT75":     "_act_math_75",
    "ACTCMMID":    "act_avg",
    "ACTCM25":     "act_25",
    "ACTCM75":     "act_75",
    # Enrollment
    "UGDS":        "total_enrollment",        # Undergraduate degree-seeking
    "APPLCN":      "applications_received",   # Total applicants
    # Identity
    "INSTNM":      "name",
    "STABBR":      "state",
    "CITY":        "city",
    "WEBADDR":     "school_url",
    "UNITID":      "ipeds_unit_id",
}


def _safe_float(v) -> Optional[float]:
    try:
        fv = float(v)
        return None if fv in (-999, -1, 999999) else fv
    except (TypeError, ValueError):
        return None


def _safe_int(v) -> Optional[int]:
    try:
        iv = int(float(v))
        return None if iv in (-999, -1, 999999, 0) else iv
    except (TypeError, ValueError):
        return None


# ── GitHub API helpers ────────────────────────────────────────────────────────

def _github_headers() -> dict:
    hdrs = {"Accept": "application/vnd.github+json"}
    if GITHUB_TOKEN:
        hdrs["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return hdrs


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
def _github_get(url: str) -> dict:
    resp = requests.get(url, headers=_github_headers(), timeout=20)
    resp.raise_for_status()
    return resp.json()


def find_latest_data_url() -> Optional[str]:
    """
    Find the most recent data release on RTICWDT/college-scorecard (GitHub Pages).
    Returns the direct download URL for the latest merged IPEDS CSV zip or CSV.
    """
    # Try the data-by-academic-year zip from the Scorecard data portal
    # The official data portal at https://collegescorecard.ed.gov/data/ releases
    # a single large zip each year.
    # We try the GitHub-hosted copy first since it's more programmatically accessible.
    try:
        releases = _github_get(
            "https://api.github.com/repos/RTICWDT/college-scorecard/releases"
        )
        if releases:
            # Find a release that has a data zip asset
            for release in releases[:5]:
                for asset in release.get("assets", []):
                    name = asset.get("name", "").lower()
                    if "merged" in name and (name.endswith(".zip") or name.endswith(".csv")):
                        url = asset.get("browser_download_url")
                        log.info(f"Found release asset: {asset['name']} → {url}")
                        return url
    except Exception as exc:
        log.debug(f"GitHub releases lookup failed: {exc}")

    # Fallback: Use the official data portal direct download URL
    # This is a stable URL for the most recent data release
    fallback_url = (
        "https://ed-public-download.app.cloud.gov/downloads/"
        "Most-Recent-Cohorts-Field-of-Study.zip"
    )
    log.info(f"Falling back to official data portal URL")
    return fallback_url


def _download_csv_from_zip(zip_url: str) -> Optional[io.StringIO]:
    """Download a zip file and extract the MERGED*.csv inside."""
    log.info(f"Downloading zip: {zip_url}")
    resp = requests.get(zip_url, timeout=120, stream=True)
    resp.raise_for_status()

    content = b""
    for chunk in resp.iter_content(chunk_size=1024 * 1024):
        content += chunk

    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            csv_names = [n for n in zf.namelist() if n.upper().startswith("MERGED") and n.endswith(".csv")]
            if not csv_names:
                # Try any CSV
                csv_names = [n for n in zf.namelist() if n.endswith(".csv")]
            if not csv_names:
                log.error("No CSV found in zip")
                return None
            # Pick the most recent (highest year in name)
            csv_names.sort(reverse=True)
            chosen = csv_names[0]
            log.info(f"Extracting {chosen} from zip")
            return io.StringIO(zf.read(chosen).decode("utf-8", errors="replace"))
    except zipfile.BadZipFile:
        # Maybe the URL points directly to a CSV
        log.info("Not a zip — treating as plain CSV")
        return io.StringIO(content.decode("utf-8", errors="replace"))


def _download_csv_direct(url: str) -> Optional[io.StringIO]:
    """Download a CSV file directly (non-zip)."""
    log.info(f"Downloading CSV: {url}")
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    return io.StringIO(resp.text)


def parse_ipeds_csv(csv_io: io.StringIO, max_rows: Optional[int] = None) -> list[dict]:
    """Parse the IPEDS merged CSV and return normalised college records."""
    reader = csv.DictReader(csv_io)
    colleges = []

    for i, row in enumerate(reader):
        if max_rows and i >= max_rows:
            break

        name = (row.get("INSTNM") or "").strip()
        if not name:
            continue

        # Build SAT composite from sub-scores.
        # SATVRMID / SATMTMID are midpoint columns; SATVR25/SATMT25 are 25th-percentile
        # fallbacks used only when midpoint columns are absent.
        sv_mid = _safe_int(row.get("SATVRMID"))
        sm_mid = _safe_int(row.get("SATMTMID"))
        sv_25 = _safe_int(row.get("SATVR25"))
        sv_75 = _safe_int(row.get("SATVR75"))
        sm_25 = _safe_int(row.get("SATMT25"))
        sm_75 = _safe_int(row.get("SATMT75"))

        sat_25 = (sv_25 + sm_25) if (sv_25 and sm_25) else None
        sat_75 = (sv_75 + sm_75) if (sv_75 and sm_75) else None

        adm = _safe_float(row.get("ADM_RATE") or row.get("ADM_RATE_ALL"))

        record: dict = {
            "name": name,
            "state": (row.get("STABBR") or "").strip() or None,
            "city": (row.get("CITY") or "").strip() or None,
            "school_url": (row.get("WEBADDR") or "").strip() or None,
            "ipeds_unit_id": _safe_int(row.get("UNITID")),
            "acceptance_rate": adm,
            "sat_25": sat_25,
            "sat_75": sat_75,
            "act_25": _safe_int(row.get("ACTCM25")),
            "act_75": _safe_int(row.get("ACTCM75")),
            "act_avg": _safe_float(row.get("ACTCMMID")),
            "total_enrollment": _safe_int(row.get("UGDS")),
            "applications_received": _safe_int(row.get("APPLCN")),
            "data_source": "NCES_IPEDS_CSV",
        }
        colleges.append(record)

    return colleges


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    log.info("fetch-collegedata-org.py started")

    data_url = find_latest_data_url()
    if not data_url:
        log.error("Could not determine IPEDS data URL. Exiting.")
        return 1

    csv_io: Optional[io.StringIO] = None
    try:
        if data_url.endswith(".zip"):
            csv_io = _download_csv_from_zip(data_url)
        else:
            csv_io = _download_csv_direct(data_url)
    except Exception as exc:
        log.error(f"Download failed: {exc}")
        return 1

    if csv_io is None:
        log.error("No CSV data available.")
        return 1

    colleges = parse_ipeds_csv(csv_io, max_rows=MAX_ROWS)

    if not colleges:
        log.error("No records parsed from CSV.")
        return 1

    with open(STAGING_PATH, "w") as fh:
        json.dump(colleges, fh, indent=2, default=str)

    log.info(f"✓ Wrote {len(colleges)} colleges to {STAGING_PATH}")
    print(f"ROWS_UPSERTED={len(colleges)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

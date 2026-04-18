"""
scraper/sources/collegedata_csv.py
───────────────────────────────────
Downloads the most recent NCES IPEDS bulk CSV from the College Scorecard
data portal and parses it with pandas as a fallback data source.

The official data portal at https://collegescorecard.ed.gov/data/ publishes
a yearly ZIP containing a large merged CSV (MERGED<YEAR>_PP.csv).  This module
tries several known stable URLs in order until one succeeds.

No API key required.  Returns one dict per institution using the canonical
pipeline field names.
"""

import io
import logging
import os
import zipfile
from typing import Optional

import pandas as pd
import requests
from tenacity import retry, stop_after_attempt, wait_exponential

log = logging.getLogger(__name__)

# Ordered list of candidate URLs (most recent first).
# These are the official NCES data portal download links.
_CSV_URLS: list[str] = [
    # Direct CSV releases from the College Scorecard GitHub pages branch
    "https://raw.githubusercontent.com/RTICWDT/college-scorecard/gh-pages/assets/downloadable-data/Most-Recent-Cohorts-Institution_11192024.zip",  # noqa: E501
    # Official data portal (always points to most recent)
    "https://ed-public-download.app.cloud.gov/downloads/Most-Recent-Cohorts-Institution.zip",
    # Fallback to the 2023 release
    "https://ed-public-download.app.cloud.gov/downloads/MERGED2023_PP.zip",
]

# IPEDS column → canonical pipeline field
_COL_MAP: dict[str, str] = {
    "INSTNM":       "name",
    "STABBR":       "state",
    "CITY":         "city",
    "WEBADDR":      "school_url",
    "ADM_RATE":     "acceptance_rate",
    "ADM_RATE_ALL": "acceptance_rate",  # fallback key
    "UGDS":         "total_enrollment",
    "APPLCN":       "applications_received",
    "ACTCM25":      "median_act_25",
    "ACTCM75":      "median_act_75",
    "SATVR25":      "_sat_verb_25",   # intermediate; combined below
    "SATVR75":      "_sat_verb_75",
    "SATMT25":      "_sat_math_25",
    "SATMT75":      "_sat_math_75",
    "TUITIONFEE_IN":  "tuition_in_state",
    "TUITIONFEE_OUT": "tuition_out_of_state",
    "C150_4":       "completion_rate",
    "MD_EARN_WNE_P6": "median_earnings_post_grad",
}

_PRIVACY = {"PrivacySuppressed", "NULL", "NA", "", None}


def _safe_num(val) -> Optional[float]:
    """Convert a CSV cell to float, returning None for suppressed/missing values."""
    if val in _PRIVACY:
        return None
    try:
        f = float(val)
        return None if f in (-999.0, -1.0, 999999.0) else f
    except (TypeError, ValueError):
        return None


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
def _download(url: str) -> bytes:
    """Download a URL and return raw bytes."""
    resp = requests.get(url, timeout=120, stream=True)
    resp.raise_for_status()
    chunks = []
    for chunk in resp.iter_content(chunk_size=1024 * 1024):
        chunks.append(chunk)
    return b"".join(chunks)


def _load_csv(raw: bytes) -> Optional[pd.DataFrame]:
    """
    Load a DataFrame from raw bytes which may be a ZIP or a plain CSV.
    Returns None if extraction fails.
    """
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            # Pick the largest file (the merged institution CSV)
            names = [n for n in zf.namelist() if n.lower().endswith(".csv")]
            if not names:
                log.warning("No CSV found inside ZIP")
                return None
            names.sort(key=lambda n: zf.getinfo(n).file_size, reverse=True)
            chosen = names[0]
            log.info(f"Extracting {chosen} from ZIP ({zf.getinfo(chosen).file_size:,} bytes)")
            with zf.open(chosen) as fh:
                return pd.read_csv(fh, encoding="latin-1", low_memory=False)
    except zipfile.BadZipFile:
        # Might already be a plain CSV
        return pd.read_csv(io.BytesIO(raw), encoding="latin-1", low_memory=False)


def _parse_df(df: pd.DataFrame) -> list[dict]:
    """
    Convert a raw IPEDS DataFrame to the canonical pipeline record list.
    Handles SAT composite construction and value normalisation.
    """
    records = []

    for _, row in df.iterrows():
        name = str(row.get("INSTNM", "") or "").strip()
        if not name:
            continue

        adm = _safe_num(row.get("ADM_RATE") or row.get("ADM_RATE_ALL"))

        # Build SAT composite from verbal + math sub-scores
        sv_25 = _safe_num(row.get("SATVR25"))
        sv_75 = _safe_num(row.get("SATVR75"))
        sm_25 = _safe_num(row.get("SATMT25"))
        sm_75 = _safe_num(row.get("SATMT75"))
        sat_25 = int(sv_25 + sm_25) if (sv_25 and sm_25) else None
        sat_75 = int(sv_75 + sm_75) if (sv_75 and sm_75) else None

        record: dict = {
            "name": name,
            "acceptance_rate": adm,
            "total_enrollment": _safe_num(row.get("UGDS")),
            "applications_received": _safe_num(row.get("APPLCN")),
            "median_sat_25": sat_25,
            "median_sat_75": sat_75,
            "median_act_25": _safe_num(row.get("ACTCM25")),
            "median_act_75": _safe_num(row.get("ACTCM75")),
            "tuition_in_state": _safe_num(row.get("TUITIONFEE_IN")),
            "tuition_out_of_state": _safe_num(row.get("TUITIONFEE_OUT")),
            "completion_rate": _safe_num(row.get("C150_4")),
            "median_earnings_post_grad": _safe_num(row.get("MD_EARN_WNE_P6")),
            "data_source": "NCES_CSV",
        }
        records.append(record)

    return records


def fetch() -> list[dict]:
    """
    Download and parse the most recent NCES IPEDS bulk CSV.

    Tries a series of candidate URLs in order.  Returns a parsed list of
    canonical pipeline dicts, or an empty list if all downloads fail.
    No API key is required.
    """
    for url in _CSV_URLS:
        log.info(f"Attempting NCES CSV download: {url}")
        try:
            raw = _download(url)
        except Exception as exc:
            log.warning(f"Download failed ({url}): {exc}")
            continue

        df = _load_csv(raw)
        if df is None or df.empty:
            log.warning(f"Empty or unparseable CSV from {url}")
            continue

        log.info(f"Loaded CSV with {len(df):,} rows and {len(df.columns)} columns")
        records = _parse_df(df)
        log.info(f"NCES CSV fetch complete: {len(records)} institutions")
        return records

    log.error("All NCES CSV download attempts failed")
    return []

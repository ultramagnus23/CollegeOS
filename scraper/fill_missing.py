#!/usr/bin/env python3
"""
scraper/fill_missing.py
=======================

One-time scraper to fill NULL / missing values in the Supabase database.

Data sources (in priority order per college):
  1. College Scorecard API (api.data.gov) — acceptance_rate, SAT, tuition,
     graduation rate, median salary, median debt, enrollment
  2. Wikipedia REST API — description, founded_year, latitude / longitude
  3. College website (requests + BeautifulSoup) — admissions deadlines,
     contact info (email, phone, application fee)

Environment variables (loaded from .env in the repo root):
  SUPABASE_URL         — https://YOUR_PROJECT.supabase.co
  SUPABASE_SERVICE_KEY — service-role key (NOT anon key)
  SCORECARD_API_KEY    — free key from https://api.data.gov/signup/

Output:
  scraper/logs/fill_missing_<timestamp>.log  — JSON lines progress log
  scraper/output/fill_missing_results.csv    — per-college summary

Usage:
  cd <repo-root>
  pip install requests beautifulsoup4 python-dotenv
  python scraper/fill_missing.py [--limit N] [--college-id ID]

Options:
  --limit N       Only process the first N colleges (useful for testing).
  --college-id ID Only process a single college by its ID.
  --dry-run       Fetch and parse data but do NOT write to Supabase.
"""

import argparse
import csv
import json
import logging
import os
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# ─── Load environment ─────────────────────────────────────────────────────────

# Walk up from scraper/ to find the repo-root .env
ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "backend" / ".env", override=False)  # fallback to backend/.env

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
SCORECARD_KEY = os.environ.get("SCORECARD_API_KEY", "DEMO_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print(
        "ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env",
        file=sys.stderr,
    )
    sys.exit(1)

# ─── Logging ──────────────────────────────────────────────────────────────────

LOG_DIR = ROOT / "scraper" / "logs"
OUT_DIR = ROOT / "scraper" / "output"
LOG_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

_ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
_log_file = LOG_DIR / f"fill_missing_{_ts}.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(_log_file),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("fill_missing")

# ─── Constants ────────────────────────────────────────────────────────────────

SCRAPER_USER_AGENT = os.environ.get(
    "SCRAPING_USER_AGENT",
    "CollegeOS/1.0 (Educational Research)",
)
REQUEST_DELAY = 0.5          # seconds between requests
MAX_RETRIES = 3
REQUEST_TIMEOUT = 20         # seconds per HTTP request

SCORECARD_BASE = "https://api.data.gov/ed/collegescorecard/v1/schools"
WIKIPEDIA_BASE = "https://en.wikipedia.org/api/rest_v1/page/summary"

SCORECARD_FIELDS = ",".join([
    "id", "school.name", "school.state",
    "2023.admissions.admission_rate.overall",
    "2023.admissions.sat_scores.average.overall",
    "2023.admissions.act_scores.midpoint.cumulative",
    "2023.cost.tuition.in_state",
    "2023.cost.tuition.out_of_state",
    "2023.cost.avg_net_price.overall",
    "2023.completion.completion_rate_4yr_150",
    "2023.earnings.10_yrs_after_entry.median",
    "2023.earnings.6_yrs_after_entry.median",
    "2023.aid.median_debt.completers.overall",
    "2023.student.size",
    "school.school_url",
    "school.latitude",
    "school.longitude",
    "school.ownership",
    "school.locale",
])

# ─── Supabase helpers ─────────────────────────────────────────────────────────

_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def _supabase_request(method: str, path: str, **kwargs) -> Any:
    """Make a Supabase REST API call with retry logic."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.request(
                method, url, headers=_HEADERS, timeout=REQUEST_TIMEOUT, **kwargs
            )
            if resp.status_code in (200, 201, 204):
                return resp.json() if resp.content else []
            log.warning(
                "Supabase %s %s returned %d (attempt %d): %s",
                method, path, resp.status_code, attempt, resp.text[:200],
            )
        except requests.RequestException as exc:
            log.warning("Supabase request error (attempt %d): %s", attempt, exc)
        if attempt < MAX_RETRIES:
            time.sleep(REQUEST_DELAY * attempt)
    raise RuntimeError(f"Supabase {method} {path} failed after {MAX_RETRIES} retries")


def supabase_patch(table: str, row_id: int, data: dict) -> None:
    """PATCH (update) a single row in a Supabase table."""
    filtered = {k: v for k, v in data.items() if v is not None}
    if not filtered:
        return
    _supabase_request("PATCH", f"{table}?id=eq.{row_id}", json=filtered)


def supabase_upsert(table: str, data: dict, on_conflict: str = "id") -> Any:
    """INSERT with conflict resolution on `on_conflict` column(s)."""
    return _supabase_request(
        "POST",
        table,
        json=data,
        headers={
            **_HEADERS,
            "Prefer": f"resolution=merge-duplicates,return=representation",
        },
    )


def get_colleges_needing_data(limit: int | None, college_id: int | None) -> list[dict]:
    """
    Fetch colleges from colleges_comprehensive that have at least one NULL key field.
    Joins with child tables to detect missing admissions, financial, and academic data.
    """
    filters = "select=id,name,website,description,founded_year,latitude,longitude"
    if college_id is not None:
        filters += f"&id=eq.{college_id}"
    else:
        # Colleges missing description or basic fields
        filters += "&or=(description.is.null,website.is.null,founded_year.is.null)"
    if limit:
        filters += f"&limit={limit}"
    filters += "&order=id.asc"
    return _supabase_request("GET", f"colleges_comprehensive?{filters}") or []


# ─── College Scorecard ────────────────────────────────────────────────────────


def fetch_scorecard(name: str) -> dict | None:
    """Query the College Scorecard API for a college by name."""
    params = {
        "school.name": name,
        "fields": SCORECARD_FIELDS,
        "api_key": SCORECARD_KEY,
        "per_page": 1,
    }
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(
                SCORECARD_BASE, params=params, timeout=REQUEST_TIMEOUT
            )
            resp.raise_for_status()
            results = resp.json().get("results", [])
            if results:
                return results[0]
            return None
        except requests.RequestException as exc:
            log.warning("Scorecard API error (attempt %d): %s", attempt, exc)
            if attempt < MAX_RETRIES:
                time.sleep(REQUEST_DELAY * attempt)
    return None


def parse_scorecard(data: dict) -> dict:
    """Map College Scorecard API fields to our database column names."""
    def safe(key: str):
        v = data.get(key)
        return None if v in (None, "", "NULL", "PrivacySuppressed") else v

    return {
        # admissions
        "acceptance_rate": safe("2023.admissions.admission_rate.overall"),
        "sat_avg": safe("2023.admissions.sat_scores.average.overall"),
        "act_range": safe("2023.admissions.act_scores.midpoint.cumulative"),
        # financials
        "tuition_in_state": safe("2023.cost.tuition.in_state"),
        "tuition_out_state": safe("2023.cost.tuition.out_of_state"),
        "avg_net_price": safe("2023.cost.avg_net_price.overall"),
        # academics
        "graduation_rate_4yr": safe("2023.completion.completion_rate_4yr_150"),
        "median_salary_6yr": safe("2023.earnings.6_yrs_after_entry.median"),
        "median_salary_10yr": safe("2023.earnings.10_yrs_after_entry.median"),
        "median_debt": safe("2023.aid.median_debt.completers.overall"),
        # college main
        "total_enrollment": safe("2023.student.size"),
        "website": safe("school.school_url"),
        "latitude": safe("school.latitude"),
        "longitude": safe("school.longitude"),
    }


# ─── Wikipedia ────────────────────────────────────────────────────────────────


def fetch_wikipedia(name: str) -> dict | None:
    """Query the Wikipedia REST summary API for a college by name."""
    slug = quote(name.replace(" ", "_"))
    url = f"{WIKIPEDIA_BASE}/{slug}"
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(url, timeout=REQUEST_TIMEOUT)
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code == 404:
                return None
        except requests.RequestException as exc:
            log.warning("Wikipedia API error (attempt %d): %s", attempt, exc)
            if attempt < MAX_RETRIES:
                time.sleep(REQUEST_DELAY)
    return None


def parse_wikipedia(data: dict) -> dict:
    """Extract description, founded year, and coordinates from Wikipedia summary."""
    result: dict = {}

    # Description: prefer extract, fall back to description
    extract = data.get("extract") or data.get("description") or ""
    if extract and len(extract) > 50:
        # Truncate to first 3 sentences for storage
        sentences = extract.split(". ")
        result["description"] = ". ".join(sentences[:3]).strip()
        if not result["description"].endswith("."):
            result["description"] += "."

    # Coordinates
    coords = data.get("coordinates") or {}
    if coords.get("lat") and coords.get("lon"):
        result["latitude"] = float(coords["lat"])
        result["longitude"] = float(coords["lon"])

    # Founded year — look in the extract text
    import re
    if extract:
        year_match = re.search(r"founded\s+in\s+(\d{4})", extract, re.IGNORECASE)
        if year_match:
            yr = int(year_match.group(1))
            if 1600 < yr < 2024:
                result["founded_year"] = yr

    return result


# ─── Website scraper ──────────────────────────────────────────────────────────


def fetch_website_contact(url: str) -> dict:
    """
    Scrape an admissions page for contact info and application deadline hints.
    Very best-effort — returns empty dict on any error.
    """
    if not url or not url.startswith("http"):
        return {}

    headers = {
        "User-Agent": SCRAPER_USER_AGENT
    }

    import re

    try:
        resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        text = soup.get_text(" ", strip=True)

        result: dict = {}

        # Email
        email_match = re.search(
            r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", text
        )
        if email_match:
            email = email_match.group()
            if "admission" in email.lower() or "enroll" in email.lower():
                result["admissions_email"] = email

        # Phone (US format)
        phone_match = re.search(
            r"\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}", text
        )
        if phone_match:
            result["admissions_phone"] = phone_match.group()

        # Application fee
        fee_match = re.search(
            r"application\s+fee[\s:]*\$?(\d+)", text, re.IGNORECASE
        )
        if fee_match:
            result["application_fee"] = int(fee_match.group(1))

        # Common App / Coalition App detection
        result["common_app"] = bool(
            re.search(r"common\s+app(?:lication)?", text, re.IGNORECASE)
        )
        result["coalition_app"] = bool(
            re.search(r"coalition\s+app(?:lication)?", text, re.IGNORECASE)
        )

        return result

    except Exception as exc:
        log.debug("Website scrape failed for %s: %s", url, exc)
        return {}


# ─── Child-table helpers ──────────────────────────────────────────────────────


def get_child_row_id(table: str, college_id: int) -> int | None:
    """Return the primary-key ID of the first row in a child table for a college."""
    rows = _supabase_request(
        "GET", f"{table}?college_id=eq.{college_id}&select=id&limit=1"
    )
    if rows:
        return rows[0]["id"]
    return None


def update_child_table(
    table: str, college_id: int, data: dict, dry_run: bool
) -> bool:
    """
    Update (or insert) a child-table row for the given college.
    Returns True if any data was written.
    """
    filtered = {k: v for k, v in data.items() if v is not None}
    if not filtered:
        return False
    if dry_run:
        log.info("[dry-run] Would write to %s for college %d: %s", table, college_id, filtered)
        return True

    row_id = get_child_row_id(table, college_id)
    if row_id is not None:
        # Only patch fields that are currently NULL to avoid overwriting good data
        current = _supabase_request("GET", f"{table}?id=eq.{row_id}&select=*&limit=1")
        if current:
            row = current[0]
            patch_data = {k: v for k, v in filtered.items() if row.get(k) is None}
            if patch_data:
                _supabase_request(
                    "PATCH", f"{table}?id=eq.{row_id}", json=patch_data
                )
                return True
    else:
        # Insert new row
        payload = {"college_id": college_id, **filtered}
        _supabase_request("POST", table, json=payload)
        return True

    return False


# ─── Main processing loop ─────────────────────────────────────────────────────


def process_college(college: dict, dry_run: bool) -> dict:
    """
    Scrape and fill missing data for a single college.
    Returns a result summary dict.
    """
    cid = college["id"]
    name = college["name"]
    website = college.get("website")

    filled: list[str] = []
    failed: list[str] = []
    source_used: list[str] = []

    log.info("Processing [%d] %s", cid, name)

    # ── 1. College Scorecard ──────────────────────────────────────────────────
    scorecard_data = fetch_scorecard(name)
    time.sleep(REQUEST_DELAY)

    if scorecard_data:
        source_used.append("scorecard")
        parsed = parse_scorecard(scorecard_data)

        # Update colleges_comprehensive main fields
        main_fields = {
            k: v
            for k, v in {
                "total_enrollment": parsed.get("total_enrollment"),
                "website": parsed.get("website"),
                "latitude": parsed.get("latitude"),
                "longitude": parsed.get("longitude"),
            }.items()
            if v is not None and college.get(k) is None
        }
        if main_fields:
            if not dry_run:
                _supabase_request(
                    "PATCH",
                    f"colleges_comprehensive?id=eq.{cid}",
                    json=main_fields,
                )
            filled.extend(main_fields.keys())

        # admissions
        admissions = {
            k: parsed.get(k)
            for k in ("acceptance_rate", "sat_avg", "act_range")
        }
        if update_child_table("college_admissions", cid, admissions, dry_run):
            filled.extend([k for k, v in admissions.items() if v is not None])

        # financials
        financials = {
            k: parsed.get(k)
            for k in ("tuition_in_state", "tuition_out_state", "avg_net_price")
        }
        if update_child_table("college_financial_data", cid, financials, dry_run):
            filled.extend([k for k, v in financials.items() if v is not None])

        # academics
        academics = {
            k: parsed.get(k)
            for k in ("graduation_rate_4yr", "median_salary_6yr", "median_salary_10yr", "median_debt")
        }
        if update_child_table("academic_details", cid, academics, dry_run):
            filled.extend([k for k, v in academics.items() if v is not None])

    # ── 2. Wikipedia ──────────────────────────────────────────────────────────
    needs_wiki = (
        not college.get("description")
        or not college.get("founded_year")
        or not college.get("latitude")
    )
    if needs_wiki:
        wiki_data = fetch_wikipedia(name)
        time.sleep(REQUEST_DELAY)

        if wiki_data:
            source_used.append("wikipedia")
            parsed_wiki = parse_wikipedia(wiki_data)

            wiki_main = {
                k: v
                for k, v in parsed_wiki.items()
                if v is not None and college.get(k) is None
            }
            if wiki_main:
                if not dry_run:
                    _supabase_request(
                        "PATCH",
                        f"colleges_comprehensive?id=eq.{cid}",
                        json=wiki_main,
                    )
                filled.extend(wiki_main.keys())

    # ── 3. College website (contact + deadlines) ──────────────────────────────
    if website:
        contact_data = fetch_website_contact(website)
        time.sleep(REQUEST_DELAY)

        if contact_data:
            source_used.append("website")
            if update_child_table("college_contact", cid, contact_data, dry_run):
                filled.extend([k for k, v in contact_data.items() if v is not None])

    return {
        "college_id": cid,
        "college_name": name,
        "fields_filled": "; ".join(filled) if filled else "none",
        "fields_failed": "; ".join(failed) if failed else "none",
        "source_used": "; ".join(sorted(set(source_used))) if source_used else "none",
    }


# ─── Entry point ─────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="Fill missing college data from external APIs")
    parser.add_argument("--limit", type=int, default=None, help="Max colleges to process")
    parser.add_argument("--college-id", type=int, default=None, help="Process a single college by ID")
    parser.add_argument("--dry-run", action="store_true", help="Fetch data but do not write to Supabase")
    args = parser.parse_args()

    log.info("=== fill_missing.py started ===")
    log.info("Supabase URL: %s", SUPABASE_URL)
    log.info("Scorecard key: %s", "***" if SCORECARD_KEY != "DEMO_KEY" else "DEMO_KEY (rate-limited)")
    if args.dry_run:
        log.info("DRY RUN mode — no writes to Supabase")

    colleges = get_colleges_needing_data(args.limit, args.college_id)
    log.info("Colleges to process: %d", len(colleges))

    results: list[dict] = []
    for i, college in enumerate(colleges, 1):
        log.info("[%d/%d] Processing %s (id=%d)", i, len(colleges), college["name"], college["id"])
        try:
            result = process_college(college, dry_run=args.dry_run)
            results.append(result)
        except Exception as exc:
            log.error("Failed to process college %d (%s): %s", college["id"], college["name"], exc)
            log.debug(traceback.format_exc())
            results.append({
                "college_id": college["id"],
                "college_name": college["name"],
                "fields_filled": "error",
                "fields_failed": str(exc)[:200],
                "source_used": "none",
            })

    # ── Write summary CSV ────────────────────────────────────────────────────
    csv_path = OUT_DIR / f"fill_missing_results_{_ts}.csv"
    fieldnames = ["college_id", "college_name", "fields_filled", "fields_failed", "source_used"]
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results)

    total_filled = sum(1 for r in results if r["fields_filled"] not in ("none", "error"))
    log.info("=== Done. %d/%d colleges had data filled. CSV: %s ===", total_filled, len(results), csv_path)


if __name__ == "__main__":
    main()

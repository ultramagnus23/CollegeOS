#!/usr/bin/env python3
"""
scraper/sources/hesa_leo_uk.py
--------------------------------
UK graduate outcomes: real, government (Dept for Education / HESA) Longitudinal
Education Outcomes (LEO) data -- median earnings and sustained-employment rate
per HE provider, 1 and 5 years after graduation. Downloaded directly from the
official "Explore Education Statistics" (GOV.UK) release; not a third-party
aggregator, no ToS/copyright concerns (open government data, OGL-licensed).

SOURCE: "LEO Graduate outcomes provider level data" release, underlying data
file (~2.5M rows, real per-institution/per-subject/per-cohort figures):
  https://content.explore-education-statistics.service.gov.uk/api/releases/
  a13c6267-1527-4761-bf8e-3566d8d26629/files/3896dae9-11af-46ef-b6c6-2eed9acda9e5
(discovered via the release's data-guidance page listing its supporting files
-- the platform has no simple public search API, so this URL was found by
hand rather than pattern-guessed; re-verify it if HESA publishes a newer
release and this one is archived).

MATCHING: exact normalized provider_name -> canonical.institutions
(country_code='GB') -- no UKPRN stored in our schema yet, so this is a name
match rather than an id match. ~37/146 of our GB institutions matched in
initial testing (many of our GB rows are historical/defunct entities from
the Wikidata enrichment pass, e.g. disbanded military colleges, which
naturally have no LEO record).

WHAT IT WRITES: canonical.institution_outcomes.employment_rate_1yr /
median_salary_1yr / median_salary_5yr, institution-wide (cah2_code=='Total'
rows only -- subject-level breakdown is a possible follow-up but needs a
CAH2-to-our-taxonomy mapping table, out of scope here). Additive: only fills
NULL fields, never overwrites an existing value.

USAGE
-----
    python scraper/sources/hesa_leo_uk.py [--dry-run]

Requires: requests, psycopg2-binary, python-dotenv (optional)
Requires DATABASE_URL in backend/.env or the environment.
"""

import argparse
import csv
import io
import logging
import os
import sys
import zipfile
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

HERE = Path(__file__).parent
REPO_ROOT = HERE.parent.parent

try:
    from dotenv import load_dotenv
    load_dotenv(REPO_ROOT / "backend" / ".env")
except ImportError:
    pass

try:
    import requests
    import psycopg2
except ImportError:
    sys.exit("pip install requests psycopg2-binary")

DB_URL = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
LEO_ZIP_URL = (
    "https://content.explore-education-statistics.service.gov.uk/api/releases/"
    "a13c6267-1527-4761-bf8e-3566d8d26629/files/3896dae9-11af-46ef-b6c6-2eed9acda9e5"
)
CACHE_PATH = HERE / ".cache_leo_provider.zip"
HEADERS = {"User-Agent": "Mozilla/5.0 (CollegeOS educational research; +https://collegeos.app/bot)"}


def normalize(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def download_zip() -> Path:
    if CACHE_PATH.exists() and CACHE_PATH.stat().st_size > 10_000_000:
        log.info(f"Using cached LEO file at {CACHE_PATH}")
        return CACHE_PATH
    log.info(f"Downloading LEO provider-level data from {LEO_ZIP_URL} ...")
    resp = requests.get(LEO_ZIP_URL, headers=HEADERS, timeout=180)
    resp.raise_for_status()
    CACHE_PATH.write_bytes(resp.content)
    log.info(f"  saved {CACHE_PATH.stat().st_size:,} bytes")
    return CACHE_PATH


def safe_int(v):
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return None


def load_institution_provider_map(conn) -> dict[str, str]:
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name FROM canonical.institutions WHERE country_code = 'GB'")
    return {normalize(name): str(inst_id) for inst_id, name in cur.fetchall()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not DB_URL:
        sys.exit("DATABASE_URL not set")

    zip_path = download_zip()
    conn = psycopg2.connect(DB_URL)
    inst_map = load_institution_provider_map(conn)
    log.info(f"  {len(inst_map):,} GB institutions indexed by normalized name")

    # Find the latest tax_year present, keep only institution-wide (Total
    # subject) rows for "All graduates" at YAG 1 and 5 -- matches the
    # employment_rate_1yr/median_salary_1yr/median_salary_5yr columns already
    # in canonical.institution_outcomes.
    latest_year = None
    per_institution: dict[str, dict] = {}  # ukprn/name -> {yag1: {...}, yag5: {...}}

    with zipfile.ZipFile(zip_path) as z:
        with z.open("provider_data_20250716.csv") as raw:
            reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8"))
            for row in reader:
                if row["provider_name"] == "Total" or row["cah2_code"] != "Total":
                    continue
                if row["characteristic_type"] != "All graduates":
                    continue
                if row["YAG"] not in ("1", "5"):
                    continue
                tax_year = row["tax_year"]
                if latest_year is None or tax_year > latest_year:
                    latest_year = tax_year
                if tax_year != latest_year:
                    continue  # will re-check once latest_year settles; see below

    # tax_year isn't guaranteed sorted in the CSV, so do a second pass now
    # that we know the true latest year (cheap: file is read twice, ~50MB).
    with zipfile.ZipFile(zip_path) as z:
        with z.open("provider_data_20250716.csv") as raw:
            reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8"))
            for row in reader:
                if row["provider_name"] == "Total" or row["cah2_code"] != "Total":
                    continue
                if row["characteristic_type"] != "All graduates":
                    continue
                if row["tax_year"] != latest_year:
                    continue
                if row["YAG"] not in ("1", "5"):
                    continue
                key = normalize(row["provider_name"])
                if key not in inst_map:
                    continue
                bucket = per_institution.setdefault(key, {})
                bucket[f"yag{row['YAG']}"] = {
                    "median_earnings": safe_int(row["earnings_median"]),
                    "sust_emp_pct": safe_int(row["sust_emp_with_or_without_fs"]),
                }

    log.info(f"Latest tax_year in file: {latest_year}")
    log.info(f"Matched institutions with usable data: {len(per_institution):,}")

    if args.dry_run:
        log.info("[DRY RUN] no writes performed")
        conn.close()
        return

    cur = conn.cursor()
    updated = 0
    data_year_key = int(latest_year.split("/")[1])  # "2022/2023" -> 2023
    for key, data in per_institution.items():
        inst_id = inst_map[key]
        yag1 = data.get("yag1", {})
        yag5 = data.get("yag5", {})
        cur.execute(
            """
            INSERT INTO canonical.institution_outcomes
                (id, institution_id, data_year, employment_rate_1yr,
                 median_salary_1yr, median_salary_5yr, source_attribution, raw_payload,
                 created_at, updated_at)
            VALUES (gen_random_uuid(), %(inst_id)s, %(year)s, %(emp1)s,
                    %(sal1)s, %(sal5)s, %(source)s::jsonb, %(raw)s::jsonb, now(), now())
            ON CONFLICT (institution_id, data_year_key) DO UPDATE SET
                employment_rate_1yr = COALESCE(canonical.institution_outcomes.employment_rate_1yr, EXCLUDED.employment_rate_1yr),
                median_salary_1yr   = COALESCE(canonical.institution_outcomes.median_salary_1yr, EXCLUDED.median_salary_1yr),
                median_salary_5yr   = COALESCE(canonical.institution_outcomes.median_salary_5yr, EXCLUDED.median_salary_5yr),
                updated_at = now()
            """,
            {
                "inst_id": inst_id,
                "year": data_year_key,
                "year_key": data_year_key,
                "emp1": yag1.get("sust_emp_pct"),
                "sal1": yag1.get("median_earnings"),
                "sal5": yag5.get("median_earnings"),
                "source": '{"source": "HESA/DfE LEO Graduate Outcomes (provider level, official govt open data)", "confidence": 0.9}',
                "raw": '{}',
            },
        )
        updated += 1
    conn.commit()
    log.info(f"Done. Upserted {updated} institution_outcomes rows for tax year {latest_year}.")
    conn.close()


if __name__ == "__main__":
    main()

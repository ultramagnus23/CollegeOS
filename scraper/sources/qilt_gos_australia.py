#!/usr/bin/env python3
"""
scraper/sources/qilt_gos_australia.py
----------------------------------------
Australian graduate outcomes: real, government-backed Graduate Outcomes
Survey (GOS) data from QILT (Quality Indicators for Learning and Teaching --
an Australian Government Department of Education initiative, delivered with
Universities Australia). Downloaded directly from qilt.edu.au's own
published National Report Tables; not a third-party aggregator, no ToS/
copyright concerns (QILT publishes these tables specifically for public use).

SOURCE (real, verified 2026-07): the GOS national report tables zip linked
from https://www.qilt.edu.au/surveys/graduate-outcomes-survey-(gos) --
  https://www.qilt.edu.au/docs/default-source/default-document-library/
  gos_2025_national_report_tables.zip
Re-check that URL each year; QILT republishes under a new filename annually.

Sheets used (institution-level, undergraduate, 1 year after completion):
  SAL_UG_UNI_1Y_INST_FIG -- median full-time salary (AUD) by institution
  FTE_UG_UNI_1Y_INST_FIG -- full-time employment rate (%) by institution

MATCHING: exact normalized institution name -> canonical.institutions
(country_code='AU'). 33/42 named institutions in the source matched our 90
AU institutions in initial testing (QILT only covers the ~42 Table A/B
Australian universities that participate in GOS; our 90 AU rows include many
non-university higher ed providers QILT doesn't survey).

WHAT IT WRITES: canonical.institution_outcomes.median_salary_1yr /
employment_rate_1yr, additive only (never overwrites an existing value).

USAGE
-----
    python scraper/sources/qilt_gos_australia.py [--dry-run]

Requires: requests, openpyxl, psycopg2-binary, python-dotenv (optional)
Requires DATABASE_URL in backend/.env or the environment.
"""

import argparse
import io
import logging
import os
import re
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
    import openpyxl
except ImportError:
    sys.exit("pip install requests psycopg2-binary openpyxl")

DB_URL = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
GOS_ZIP_URL = "https://www.qilt.edu.au/docs/default-source/default-document-library/gos_2025_national_report_tables.zip"
CACHE_PATH = HERE / ".cache_qilt_gos.zip"
HEADERS = {"User-Agent": "Mozilla/5.0 (CollegeOS educational research; +https://collegeos.app/bot)"}


def normalize(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def download_zip() -> Path:
    if CACHE_PATH.exists() and CACHE_PATH.stat().st_size > 1_000_000:
        log.info(f"Using cached QILT file at {CACHE_PATH}")
        return CACHE_PATH
    log.info(f"Downloading QILT GOS national report tables from {GOS_ZIP_URL} ...")
    resp = requests.get(GOS_ZIP_URL, headers=HEADERS, timeout=120)
    resp.raise_for_status()
    CACHE_PATH.write_bytes(resp.content)
    log.info(f"  saved {CACHE_PATH.stat().st_size:,} bytes")
    return CACHE_PATH


def parse_leading_number(cell) -> int | None:
    """QILT cells look like '87,100 (84,700, 89,400)' or '90.6 (89.1, 91.8)' --
    take the leading figure before the confidence interval parenthetical."""
    if not cell or not isinstance(cell, str):
        return None
    m = re.match(r"\s*([\d,]+(?:\.\d+)?)", cell)
    if not m:
        return None
    try:
        return round(float(m.group(1).replace(",", "")))
    except ValueError:
        return None


def extract_institution_sheet(wb, sheet_name: str) -> dict[str, int]:
    ws = wb[sheet_name]
    out = {}
    for row in ws.iter_rows(values_only=True):
        if len(row) < 3 or not row[1] or not isinstance(row[1], str):
            continue
        val = parse_leading_number(row[2])
        if val is not None:
            out[row[1]] = val
    return out


def load_au_institution_map(conn) -> dict[str, str]:
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name FROM canonical.institutions WHERE country_code = 'AU'")
    return {normalize(name): str(inst_id) for inst_id, name in cur.fetchall()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not DB_URL:
        sys.exit("DATABASE_URL not set")

    zip_path = download_zip()
    with zipfile.ZipFile(zip_path) as z:
        xlsx_name = next(n for n in z.namelist() if n.endswith(".xlsx"))
        wb = openpyxl.load_workbook(io.BytesIO(z.read(xlsx_name)), read_only=True, data_only=True)

    salaries = extract_institution_sheet(wb, "SAL_UG_UNI_1Y_INST_FIG")
    employment = extract_institution_sheet(wb, "FTE_UG_UNI_1Y_INST_FIG")
    log.info(f"Parsed {len(salaries)} institutions with salary data, {len(employment)} with employment data")

    conn = psycopg2.connect(DB_URL)
    inst_map = load_au_institution_map(conn)

    to_write = {}
    for name, salary in salaries.items():
        key = normalize(name)
        if key not in inst_map:
            continue
        to_write.setdefault(inst_map[key], {})["median_salary_1yr"] = salary
    for name, emp in employment.items():
        key = normalize(name)
        if key not in inst_map:
            continue
        to_write.setdefault(inst_map[key], {})["employment_rate_1yr"] = emp

    log.info(f"Matched {len(to_write)} AU institutions with at least one figure")

    if args.dry_run:
        log.info("[DRY RUN] no writes performed")
        conn.close()
        return

    cur = conn.cursor()
    updated = 0
    for inst_id, fields in to_write.items():
        cur.execute(
            """
            INSERT INTO canonical.institution_outcomes
                (id, institution_id, data_year, employment_rate_1yr, median_salary_1yr,
                 source_attribution, raw_payload, created_at, updated_at)
            VALUES (gen_random_uuid(), %(inst_id)s, %(year)s, %(emp)s, %(sal)s,
                    %(source)s::jsonb, '{}'::jsonb, now(), now())
            ON CONFLICT (institution_id, data_year_key) DO UPDATE SET
                employment_rate_1yr = COALESCE(canonical.institution_outcomes.employment_rate_1yr, EXCLUDED.employment_rate_1yr),
                median_salary_1yr   = COALESCE(canonical.institution_outcomes.median_salary_1yr, EXCLUDED.median_salary_1yr),
                updated_at = now()
            """,
            {
                "inst_id": inst_id,
                "year": 2025,
                "emp": fields.get("employment_rate_1yr"),
                "sal": fields.get("median_salary_1yr"),
                "source": '{"source": "QILT Graduate Outcomes Survey (Australian Government / Universities Australia)", "confidence": 0.9}',
            },
        )
        updated += 1
    conn.commit()
    log.info(f"Done. Upserted {updated} institution_outcomes rows.")
    conn.close()


if __name__ == "__main__":
    main()

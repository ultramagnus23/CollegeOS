#!/usr/bin/env python3
"""
scraper/sources/eter_europe.py
--------------------------------
Bulk, automated European higher-education data pipeline using the European
Tertiary Education Register (ETER) -- the EU Commission-funded reference
dataset covering ~3,500 HEIs across ~40 European countries.

WHY THIS SCRAPER EXISTS
-----------------------
CollegeOS institution records for Germany/France/Switzerland/Ireland/etc.
exist (from a Wikidata enrichment pass) but are almost empty below the
identity level: institution_programs coverage was under 3% for every major
European country. ETER is the closest EU analog to the US College Scorecard
-- a single structured government-funded bulk file with real per-institution
student counts by field of education (ISCED-F 2013 broad fields) and level
(ISCED 5/6/7/8), founding year, staff counts, revenue/expenditure.

SOURCE: full CSV dump published on Zenodo (open, no auth, no scraping
fragility): https://zenodo.org/records/8074821

MATCHING: primary key is normalized website domain
(canonical.institutions.metadata->>'normalized_website', populated by the
existing Wikidata enrichment pass) -- ~95% of European institutions already
carry this field, so this is a precise join, not a fuzzy name guess.

WHAT IT WRITES
--------------
  - canonical.institutions: founded_year / total_enrollment ONLY when
    currently NULL (never overwrites an existing value)
  - canonical.institution_programs: one row per (institution, ISCED level,
    ISCED-F broad field) where the real student headcount > 0. Additive
    only (ON CONFLICT DO NOTHING).

USAGE
-----
    python scraper/sources/eter_europe.py [--dry-run]

Requires: requests, pandas, psycopg2-binary, python-dotenv (optional)
Requires DATABASE_URL in backend/.env or the environment.
"""

import argparse
import logging
import os
import re
import sys
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
    import pandas as pd
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    sys.exit("pip install requests pandas psycopg2-binary")

DB_URL = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
ETER_CSV_URL = "https://zenodo.org/api/records/8074821/files/ETER_fullDump_23062023.csv/content"
CACHE_PATH = HERE / ".cache_eter_fulldump.csv"

# ISCED-F 2013 broad field codes -> human-readable names (standard UNESCO taxonomy)
FOE_NAMES = {
    "00": "Generic Programmes & Qualifications",
    "01": "Education",
    "02": "Arts & Humanities",
    "03": "Social Sciences, Journalism & Information",
    "04": "Business, Administration & Law",
    "05": "Natural Sciences, Mathematics & Statistics",
    "06": "Information & Communication Technologies",
    "07": "Engineering, Manufacturing & Construction",
    "08": "Agriculture, Forestry, Fisheries & Veterinary",
    "09": "Health & Welfare",
    "10": "Services",
}

# ISCED level -> (column prefix for student counts, degree_type label)
LEVELS = [
    ("STUD.ISCED5FOE", "Associate"),
    ("STUD.ISCED6FOE", "Bachelor"),
    ("STUD.ISCED7FOE", "Master"),
    ("RES.STUDISCED8FOE", "PhD"),
]


def normalize_website(url: str) -> str:
    if not url:
        return ""
    u = str(url).strip().lower()
    u = re.sub(r"^https?://", "", u)
    u = re.sub(r"^www\.", "", u)
    u = u.split("/")[0]
    return u


def download_eter_csv() -> Path:
    if CACHE_PATH.exists() and CACHE_PATH.stat().st_size > 10_000_000:
        log.info(f"Using cached ETER dump at {CACHE_PATH}")
        return CACHE_PATH
    log.info(f"Downloading ETER full dump from {ETER_CSV_URL} ...")
    with requests.get(ETER_CSV_URL, stream=True, timeout=300) as resp:
        resp.raise_for_status()
        with open(CACHE_PATH, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                f.write(chunk)
    log.info(f"  saved {CACHE_PATH.stat().st_size:,} bytes")
    return CACHE_PATH


def load_latest_per_institution(csv_path: Path) -> pd.DataFrame:
    log.info("Parsing ETER CSV (this file is ~80MB, may take a minute) ...")
    df = pd.read_csv(csv_path, sep=";", dtype=str, encoding="utf-8-sig", low_memory=False)
    df["BAS.REFYEAR"] = pd.to_numeric(df["BAS.REFYEAR"], errors="coerce")
    df = df.sort_values("BAS.REFYEAR").drop_duplicates("BAS.ETERID", keep="last")
    log.info(f"  {len(df):,} institutions after taking latest year per ETERID")
    return df


def load_institution_map(conn) -> dict[str, dict]:
    """normalized_website -> {id, established_year, total_enrollment}."""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT metadata->>'normalized_website', id, established_year, total_enrollment
        FROM canonical.institutions
        WHERE metadata->>'normalized_website' IS NOT NULL
        """
    )
    out = {}
    for website, inst_id, est_year, total_enr in cur.fetchall():
        out[website] = {"id": inst_id, "established_year": est_year, "total_enrollment": total_enr}
    log.info(f"  {len(out):,} institutions indexed by normalized_website")
    return out


def load_existing_program_keys(conn) -> set[tuple[str, str]]:
    cur = conn.cursor()
    cur.execute("SELECT institution_id::text, normalized_program_name FROM canonical.institution_programs")
    return set(cur.fetchall())


def normalize_name(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def safe_int(v):
    try:
        f = float(v)
        if f != f:  # NaN
            return None
        return int(f)
    except (TypeError, ValueError):
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not DB_URL:
        sys.exit("DATABASE_URL not set")

    csv_path = download_eter_csv()
    df = load_latest_per_institution(csv_path)

    conn = psycopg2.connect(DB_URL)
    inst_map = load_institution_map(conn)
    existing_programs = load_existing_program_keys(conn)

    institution_updates = []  # (id, founded_year, total_enrollment)
    program_rows = []  # (institution_id, program_name, normalized, degree_type, cip_code, count)
    matched = 0

    for _, row in df.iterrows():
        website = normalize_website(row.get("BAS.WEBSITE"))
        if not website or website not in inst_map:
            continue
        matched += 1
        target = inst_map[website]
        inst_id = target["id"]

        founded = safe_int(row.get("BAS.FOUNDYEAR"))
        new_founded = founded if (target["established_year"] is None and founded and 1000 < founded <= 2026) else None

        total_enr = 0
        any_total = False
        for level_col in ("STUD.ISCED5TOTAL", "STUD.ISCED6TOTAL", "STUD.ISCED7TOTAL"):
            v = safe_int(row.get(level_col))
            if v:
                total_enr += v
                any_total = True
        new_enrollment = total_enr if (target["total_enrollment"] is None and any_total) else None

        if new_founded or new_enrollment:
            institution_updates.append((inst_id, new_founded, new_enrollment))

        for col_prefix, degree_type in LEVELS:
            for foe_code, foe_name in FOE_NAMES.items():
                col = f"{col_prefix}{foe_code}"
                count = safe_int(row.get(col))
                if not count or count <= 0:
                    continue
                normalized = normalize_name(foe_name)
                key = (str(inst_id), normalized)
                if key in existing_programs:
                    continue
                existing_programs.add(key)
                program_rows.append((inst_id, foe_name, normalized, degree_type, f"ISCEDF-{foe_code}", count))

    log.info(f"Matched {matched:,} / {len(df):,} ETER institutions to canonical.institutions by website")
    log.info(f"Institution field updates queued: {len(institution_updates):,}")
    log.info(f"New institution_programs rows queued: {len(program_rows):,}")

    if args.dry_run:
        log.info("[DRY RUN] no writes performed")
        conn.close()
        return

    cur = conn.cursor()

    for inst_id, founded, enrollment in institution_updates:
        if founded and enrollment:
            cur.execute(
                "UPDATE canonical.institutions SET founded_year=%s, established_year=%s, total_enrollment=%s, updated_at=now() WHERE id=%s",
                (founded, founded, enrollment, inst_id),
            )
        elif founded:
            cur.execute(
                "UPDATE canonical.institutions SET founded_year=%s, established_year=%s, updated_at=now() WHERE id=%s",
                (founded, founded, inst_id),
            )
        elif enrollment:
            cur.execute(
                "UPDATE canonical.institutions SET total_enrollment=%s, updated_at=now() WHERE id=%s",
                (enrollment, inst_id),
            )
    conn.commit()
    log.info(f"Updated {len(institution_updates):,} institution rows")

    BATCH = 500
    for i in range(0, len(program_rows), BATCH):
        batch = program_rows[i:i + BATCH]
        execute_values(
            cur,
            """
            INSERT INTO canonical.institution_programs
                (id, institution_id, program_name, normalized_program_name, degree_type,
                 metadata, source_attribution, raw_payload, created_at, updated_at, verification_status)
            VALUES %s
            ON CONFLICT (institution_id, normalized_program_name, degree_type_key) DO NOTHING
            """,
            batch,
            template="(gen_random_uuid(), %s, %s, %s, %s, "
                      "jsonb_build_object('isced_f_code', %s, 'student_headcount', %s), "
                      "jsonb_build_object('source', 'ETER (European Tertiary Education Register)', 'confidence', 0.9, 'source_table', 'zenodo.org/records/8074821'), "
                      "'{}'::jsonb, now(), now(), 'unknown')",
        )
        conn.commit()
        log.info(f"  ... {min(i + BATCH, len(program_rows)):,} / {len(program_rows):,}")

    log.info(f"Done. Attempted {len(program_rows):,} institution_programs rows, "
             f"{len(institution_updates):,} institution field backfills.")
    conn.close()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
scraper/sources/ipeds_completions_programs.py
-----------------------------------------------
Bulk, automated IPEDS Completions Survey scraper -> canonical.institution_programs.

WHY THIS SCRAPER EXISTS
-----------------------
The existing program-coverage backfills (migration 094 from public.college_majors,
and backend/scripts/backfillProgramsFromCollegePrograms.js) both trace back to a
manual, one-time IPEDS Completions import that only matched ~5,250 of the 6,237 US
institutions (fuzzy name-matching against a legacy 4-year-only table). This script
replaces that with a direct, automated, precise pipeline:

  1. Downloads the real IPEDS Completions Survey zip straight from nces.ed.gov
     (no manual file placement, no auth) for a given data year.
  2. Matches every row to canonical.institutions via
     canonical_external_ids->>'ipeds' (exact UNITID match -- ~100% reliable for
     the 6,237 US institutions that already carry this id; no fuzzy name
     matching, no false-positive risk).
  3. Aggregates completions by (institution, CIP 2-digit family, award level)
     using the same CIP-2020 taxonomy already embedded in
     scraper/ipeds/cip2020.py (so program_name values match the existing
     convention, e.g. "Computer & Information Sciences").
  4. Upserts into canonical.institution_programs, additive only
     (ON CONFLICT DO NOTHING -- never overwrites a richer existing row).

Real government data only -- CTOTALT (total completions) must be > 0 for a row
to be emitted; nothing is invented for institutions the file has no data for.

USAGE
-----
    python scraper/sources/ipeds_completions_programs.py [--year 2024] [--dry-run]

Requires: requests, psycopg2-binary, python-dotenv (optional)
Requires DATABASE_URL in backend/.env or the environment.
"""

import argparse
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
sys.path.insert(0, str(HERE.parent / "ipeds"))  # for cip2020.py

try:
    from dotenv import load_dotenv
    load_dotenv(REPO_ROOT / "backend" / ".env")
except ImportError:
    pass

try:
    import requests
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    sys.exit("pip install requests psycopg2-binary")

try:
    from cip2020 import get_major_info
except ImportError:
    sys.exit("Could not import scraper/ipeds/cip2020.py -- run from repo root")

DB_URL = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
HEADERS = {"User-Agent": "Mozilla/5.0 (CollegeOS educational research; +https://collegeos.app/bot)"}

# Award levels we care about for a student-facing "programs" table.
AWLEVEL_NAMES = {
    3: "Associate",
    5: "Bachelor",
    7: "Master",
    17: "PhD",
    18: "PhD",  # doctor's - professional practice folds into the same bucket
}


def download_completions(year: int) -> list[dict]:
    url = f"https://nces.ed.gov/ipeds/datacenter/data/C{year}_A.zip"
    log.info(f"Downloading {url} ...")
    resp = requests.get(url, headers=HEADERS, timeout=180)
    if resp.status_code != 200:
        raise SystemExit(f"IPEDS completions file not available for {year} (HTTP {resp.status_code})")
    with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
        csv_name = next((n for n in z.namelist() if n.lower().endswith(".csv")), None)
        if not csv_name:
            raise SystemExit("No CSV found inside the downloaded zip")
        raw_bytes = z.open(csv_name).read()
        if raw_bytes.startswith(b"\xef\xbb\xbf"):
            raw_bytes = raw_bytes[3:]
        raw = raw_bytes.decode("latin-1")
    import csv as csv_mod
    reader = csv_mod.DictReader(io.StringIO(raw))
    rows = []
    for row in reader:
        row = {k.strip().upper(): (v or "").strip() for k, v in row.items()}
        rows.append(row)
    log.info(f"  {len(rows):,} raw completions rows")
    return rows


def load_ipeds_map(conn) -> dict[str, str]:
    """canonical_external_ids->>'ipeds' -> institution UUID, for US institutions only."""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT canonical_external_ids->>'ipeds', id
        FROM canonical.institutions
        WHERE country_code = 'US' AND canonical_external_ids->>'ipeds' IS NOT NULL
        """
    )
    m = {row[0]: row[1] for row in cur.fetchall() if row[0]}
    log.info(f"  {len(m):,} US institutions with an IPEDS unit id")
    return m


def load_existing_program_keys(conn) -> set[tuple[str, str]]:
    """(institution_id, normalized_program_name) pairs that already exist, so we
    never touch an institution/program combo a richer source already populated."""
    cur = conn.cursor()
    cur.execute("SELECT institution_id::text, normalized_program_name FROM canonical.institution_programs")
    return set(cur.fetchall())


def normalize(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=2024, help="IPEDS completions data year")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not DB_URL:
        sys.exit("DATABASE_URL not set")

    rows = download_completions(args.year)

    conn = psycopg2.connect(DB_URL)
    ipeds_map = load_ipeds_map(conn)
    existing = load_existing_program_keys(conn)

    # Aggregate CTOTALT by (unitid, cip 2-digit family, awlevel bucket)
    agg: dict[tuple[str, str, int], int] = {}
    skipped_no_inst = 0
    for row in rows:
        unitid = row.get("UNITID", "")
        awlevel_raw = row.get("AWLEVEL", "")
        cip_raw = row.get("CIPCODE", "")
        ctotalt_raw = row.get("CTOTALT", "0")
        if unitid not in ipeds_map:
            skipped_no_inst += 1
            continue
        try:
            awlevel = int(float(awlevel_raw))
            ctotalt = int(float(ctotalt_raw))
        except ValueError:
            continue
        if ctotalt <= 0 or awlevel not in AWLEVEL_NAMES:
            continue
        # CIP codes look like "11.0701" -- 2-digit family is the part before the dot
        family = cip_raw.split(".")[0].zfill(2)
        key = (unitid, family, awlevel)
        agg[key] = agg.get(key, 0) + ctotalt

    log.info(f"  Aggregated to {len(agg):,} (institution, CIP-family, award-level) buckets")
    log.info(f"  Skipped rows (institution not in canonical/no IPEDS id): {skipped_no_inst:,}")

    to_insert = []
    skipped_existing = 0
    skipped_no_cip = 0
    for (unitid, family, awlevel), completions_count in agg.items():
        info = get_major_info(family + ".0000")
        program_name = info.get("name") if info else None
        if not program_name:
            skipped_no_cip += 1
            continue
        institution_id = ipeds_map[unitid]
        normalized_name = normalize(program_name)
        if (institution_id, normalized_name) in existing:
            skipped_existing += 1
            continue
        existing.add((institution_id, normalized_name))  # dedupe within this run too
        to_insert.append((
            institution_id, program_name, normalized_name, AWLEVEL_NAMES[awlevel],
            family + ".0000", completions_count,
        ))

    log.info(f"  Rows to insert: {len(to_insert):,}  (skipped existing: {skipped_existing:,}, no CIP name: {skipped_no_cip:,})")

    if args.dry_run:
        log.info("[DRY RUN] no writes performed")
        conn.close()
        return

    cur = conn.cursor()
    BATCH = 500
    inserted = 0
    for i in range(0, len(to_insert), BATCH):
        batch = [
            (inst_id, pname, norm, degree, cip, count)
            for inst_id, pname, norm, degree, cip, count in to_insert[i:i + BATCH]
        ]
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
                      "jsonb_build_object('cip_code', %s, 'completions_count', %s), "
                      "jsonb_build_object('source', 'IPEDS Completions Survey', 'confidence', 0.95, 'source_table', 'nces.ed.gov C_A file'), "
                      "'{}'::jsonb, now(), now(), 'unknown')",
        )
        conn.commit()
        log.info(f"  ... {min(i + BATCH, len(to_insert)):,} / {len(to_insert):,}")

    log.info(f"Done. Attempted {len(to_insert):,} institution_programs rows (year={args.year}); "
             "actual inserted count is best verified with a COUNT(*) query (ON CONFLICT DO NOTHING "
             "makes execute_values' rowcount unreliable across batches).")
    conn.close()


if __name__ == "__main__":
    main()

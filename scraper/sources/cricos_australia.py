#!/usr/bin/env python3
"""
scraper/sources/cricos_australia.py
--------------------------------------
Australia institution_programs backfill using CRICOS (Commonwealth Register
of Institutions and Courses for Overseas Students) -- the Australian
Department of Education's real-time public registry of every course any
institution is legally allowed to offer to international students. This is
the closest Australian equivalent to IPEDS Completions: government-run,
covers essentially every real university/college/vocational provider (they
must be CRICOS-registered to enrol international students at all), and lists
individual course names with level (AQF) and field of education (ASCED).

SOURCE (open data, data.gov.au, no auth):
  Institutions: https://data.gov.au/data/dataset/cricos
    -> resource "CRICOS Institutions.csv" (~1,500 providers)
    -> resource "CRICOS Courses.csv" (~26,600 course rows)
Both keyed by "CRICOS Provider Code" -- the two files do NOT use consistent
institution-name strings (e.g. institutions.csv has "Charles Sturt
University", courses.csv has "Charles Sturt University (CSU)" for the same
provider code), so the join MUST go through the provider code, never by
re-matching names between the two CRICOS files.

MATCHING: canonical.institutions.canonical_name (country_code='AU') against
CRICOS Institutions.csv "Institution Name" / "Trading Name", normalized and
with a leading "The " and trailing " (Acronym)" parenthetical stripped (CRICOS
lists e.g. "The University of Queensland", "The University of Melbourne
(UniMelb)"; our canonical names are "University of Queensland" / "University
of Melbourne"). Exact match only, no fuzzy/similarity threshold. Verified 74
of 110 AU gap institutions matched in manual testing (2026-07-10); remaining
36 are real non-CRICOS institutions (military academies, small unaccredited
bible colleges, defunct/merged entities) that are not registered to teach
international students and correctly have no CRICOS course listing. A large
share of AU institutions have duplicate rows in canonical.institutions for
the same real school (confirmed separately, e.g. "University of Queensland"
x2, "Deakin University" x2) -- when a CRICOS provider's name matches more
than one canonical row, this scraper writes the same (correct) course data
to every matching row rather than arbitrarily picking one; see the
provider_to_canonical handling below.

WHAT IT WRITES: canonical.institution_programs, one row per distinct
(non-expired course name, course level, field of education) for each matched
institution. Additive only -- ON CONFLICT DO NOTHING.

USAGE
-----
    python scraper/sources/cricos_australia.py [--dry-run] [--max-per-institution N]

Requires: requests, psycopg2-binary, python-dotenv (optional)
Requires DATABASE_URL in backend/.env or the environment.
"""

import argparse
import csv
import logging
import os
import re
import sys
import unicodedata
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
    from psycopg2.extras import execute_values
except ImportError:
    sys.exit("pip install requests psycopg2-binary")

DB_URL = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
INSTITUTIONS_URL = (
    "https://data.gov.au/data/dataset/e5ae7059-bfa8-4fa4-a5c0-c13cf3520193/"
    "resource/7f6941f3-5327-4db7-b556-5f16d77f63c1/download/cricos-institutions.csv"
)
COURSES_URL = (
    "https://data.gov.au/data/dataset/e5ae7059-bfa8-4fa4-a5c0-c13cf3520193/"
    "resource/48cacf69-2082-415e-9595-f17d0c3a4af0/download/cricos-courses.csv"
)
CACHE_INSTITUTIONS = HERE / ".cache_cricos_institutions.csv"
CACHE_COURSES = HERE / ".cache_cricos_courses.csv"

LEVEL_TO_DEGREE = {
    "Bachelor Degree": "Bachelor",
    "Bachelor Honours Degree": "Bachelor",
    "Associate Degree": "Associate",
    "Advanced Diploma": "Associate",
    "Diploma": "Associate",
    "Graduate Certificate": "Graduate Certificate",
    "Graduate Diploma": "Graduate Diploma",
    "Masters Degree (Coursework)": "Master",
    "Masters Degree (Extended)": "Master",
    "Masters Degree (Research)": "Master",
    "Doctoral Degree": "PhD",
}

FIELD_TO_CATEGORY = {
    "01 - Natural and Physical Sciences": "Science",
    "02 - Information Technology": "Technology",
    "03 - Engineering and Related Technologies": "Engineering",
    "04 - Architecture and Building": "Architecture",
    "05 - Agriculture, Environmental and Related Studies": "Agriculture",
    "06 - Health": "Health",
    "07 - Education": "Education",
    "08 - Management and Commerce": "Business",
    "09 - Society and Culture": "Social Sciences",
    "10 - Creative Arts": "Arts & Humanities",
    "11 - Food, Hospitality and Personal Services": "Services",
    "12 - Mixed Field Programmes": "General Studies",
}


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def clean_institution_name(name: str) -> str:
    n = str(name or "").strip()
    n = re.sub(r"^the\s+", "", n, flags=re.IGNORECASE)
    n = re.sub(r"\s*\([^)]*\)\s*$", "", n)
    return n.strip()


def normalize(name: str) -> str:
    n = strip_accents(clean_institution_name(name)).lower()
    return re.sub(r"[^a-z0-9]", "", n)


def download(url: str, cache_path: Path) -> Path:
    if cache_path.exists() and cache_path.stat().st_size > 10_000:
        log.info(f"Using cached {cache_path.name}")
        return cache_path
    log.info(f"Downloading {url} ...")
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    cache_path.write_bytes(resp.content)
    log.info(f"  saved {cache_path.stat().st_size:,} bytes")
    return cache_path


def load_institution_map(conn):
    """normalized(canonical_name) -> (id, canonical_name)."""
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name FROM canonical.institutions WHERE country_code = 'AU'")
    by_norm = {}
    for inst_id, name in cur.fetchall():
        by_norm.setdefault(normalize(name), []).append((inst_id, name))
    return by_norm


def load_existing_program_keys(conn):
    cur = conn.cursor()
    cur.execute("SELECT institution_id::text, normalized_program_name, degree_type_key FROM canonical.institution_programs")
    return set(cur.fetchall())


def title_case(label: str) -> str:
    return (label or "").strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max-per-institution", type=int, default=250)
    args = parser.parse_args()

    if not DB_URL:
        sys.exit("DATABASE_URL not set")

    inst_csv = download(INSTITUTIONS_URL, CACHE_INSTITUTIONS)
    courses_csv = download(COURSES_URL, CACHE_COURSES)

    with open(inst_csv, encoding="utf-8-sig") as f:
        cricos_institutions = list(csv.DictReader(f))
    with open(courses_csv, encoding="utf-8-sig") as f:
        cricos_courses = list(csv.DictReader(f))
    log.info(f"{len(cricos_institutions):,} CRICOS institutions, {len(cricos_courses):,} CRICOS course rows")

    conn = psycopg2.connect(DB_URL)
    inst_by_norm = load_institution_map(conn)
    existing = load_existing_program_keys(conn)

    # provider_code -> list of (canonical inst_id, canonical_name) it matches (should be 0 or 1)
    provider_to_canonical = {}
    for row in cricos_institutions:
        code = row.get("CRICOS Provider Code", "").strip()
        if not code:
            continue
        candidates = None
        for name_field in ("Institution Name", "Trading Name"):
            name = row.get(name_field, "").strip()
            if not name:
                continue
            hit = inst_by_norm.get(normalize(name))
            if hit:
                candidates = hit
                break
        if candidates:
            # Multiple canonical rows can share one exact name -- confirmed real
            # duplicate institution records (e.g. "University of Queensland"
            # appears twice in canonical.institutions with different ids; see
            # task notes / spawn_task on institution dedup). Since every
            # candidate represents the SAME real-world institution, the same
            # CRICOS course data is correct for all of them -- write to all
            # candidate ids rather than guessing which one is "the real one".
            if len(candidates) != 1:
                log.warning(f"CRICOS provider {code} ({row.get('Institution Name')}) matches {len(candidates)} canonical.institutions rows (duplicate institution records) -- writing to all of them")
            provider_to_canonical[code] = candidates

    total_targets = sum(len(v) for v in provider_to_canonical.values())
    log.info(f"Matched {len(provider_to_canonical)} CRICOS providers to {total_targets} canonical.institutions rows (AU)")
    for code, cands in provider_to_canonical.items():
        for inst_id, name in cands:
            log.info(f"  {code} -> {name} ({inst_id})")

    # Group courses by provider code.
    courses_by_provider: dict[str, list] = {}
    for row in cricos_courses:
        code = row.get("CRICOS Provider Code", "").strip()
        if not code:
            continue
        courses_by_provider.setdefault(code, []).append(row)

    program_rows = []
    matched_institution_count = 0
    for code, candidates in provider_to_canonical.items():
        rows = courses_by_provider.get(code, [])
        for inst_id, canonical_name in candidates:
            matched_institution_count += 1
            seen_keys = set()
            count_for_inst = 0
            for r in rows:
                if count_for_inst >= args.max_per_institution:
                    break
                if (r.get("Expired") or "").strip().lower() == "yes":
                    continue
                course_name = title_case(r.get("Course Name", ""))
                level = (r.get("Course Level") or "").strip()
                degree_type = LEVEL_TO_DEGREE.get(level)
                if not course_name or not degree_type:
                    continue
                normalized_name = normalize(course_name)
                key = (str(inst_id), normalized_name, degree_type)
                if key in existing or key in seen_keys:
                    continue
                seen_keys.add(key)
                field_broad = (r.get("Field of Education 1 Broad Field") or "").strip()
                field_category = FIELD_TO_CATEGORY.get(field_broad, "General Studies")
                program_rows.append((inst_id, course_name, normalized_name, degree_type, field_category, field_broad, code))
                count_for_inst += 1

    log.info(f"New institution_programs rows queued: {len(program_rows):,}")

    if args.dry_run:
        log.info("[DRY RUN] no writes performed")
        conn.close()
        return

    cur = conn.cursor()
    BATCH = 500
    for i in range(0, len(program_rows), BATCH):
        batch = program_rows[i:i + BATCH]
        execute_values(
            cur,
            """
            INSERT INTO canonical.institution_programs
                (id, institution_id, program_name, normalized_program_name, degree_type, field_category,
                 metadata, source_attribution, raw_payload, created_at, updated_at, verification_status)
            VALUES %s
            ON CONFLICT (institution_id, normalized_program_name, degree_type_key) DO NOTHING
            """,
            batch,
            template="(gen_random_uuid(), %s, %s, %s, %s, %s, "
                      "jsonb_build_object('asced_broad_field', %s, 'cricos_provider_code', %s), "
                      "jsonb_build_object('source', 'CRICOS (Australia, data.gov.au)', "
                      "'confidence', 0.9, 'source_table', 'cricos-courses.csv'), "
                      "'{}'::jsonb, now(), now(), 'unknown')",
        )
        conn.commit()
        log.info(f"  ... {min(i + BATCH, len(program_rows)):,} / {len(program_rows):,}")

    log.info(f"Done. Wrote {len(program_rows):,} institution_programs rows across {matched_institution_count} matched institution rows.")
    conn.close()


if __name__ == "__main__":
    main()

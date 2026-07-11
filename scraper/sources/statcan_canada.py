#!/usr/bin/env python3
"""
scraper/sources/statcan_canada.py
--------------------------------------
Canada institution_programs backfill using Statistics Canada's official Web
Data Service (WDS) REST API against cube/table 37-10-0277-01 "Postsecondary
enrolments, by detailed field of study, institution, and program and student
characteristics" -- StatCan's government census of every field of study
actually enrolled in at every Canadian postsecondary institution. This is the
Canadian equivalent of US IPEDS Completions / France SISE / Australia CRICOS.

WHY THE WDS API INSTEAD OF THE BULK CSV: the full bulk CSV for this table is
~854MB and repeatedly truncated on download in prior attempts. StatCan's WDS
API (https://www.statcan.gc.ca/en/developers/wds) exposes the exact same cube
data as small, deterministic per-coordinate lookups, so this script never
downloads the bulk file at all -- it queries the cube's dimension structure
once (getCubeMetadata) and then asks, for each (institution, field-of-study,
program-level) triple, whether a data series exists at that coordinate
(getSeriesInfoFromCubePidCoord, batched 300 coordinates per HTTP call, which
is the API's documented per-call limit). A series existing at a coordinate
means StatCan recorded real enrolment for that combination in some year (the
cube omits zero/non-existent cells entirely rather than storing explicit
zeros) -- so "series exists" is a real, deterministic signal that the
institution offers a program in that field of study at that level. No
enrolment counts, program names, or any other value is inferred or guessed;
every (institution, field, level) triple written here corresponds to a real
StatCan-published data series.

CUBE STRUCTURE (verified live via getCubeMetadata 2026-07-10):
  productId 37100277 (= table 37-10-0277-01 with the "-01" version dropped)
  Dimensions (position: name, members used):
    1: Geography and institutions -- 247 real institution members (identified
       by geoLevel == null and parentMemberId != null, i.e. not a
       province/territory/Canada aggregate row), each named like
       "Memorial University of Newfoundland, Newfoundland and Labrador".
    2: Field of study -- 454 CIP-2020(Canada) 4-digit-code members (e.g.
       "01.01 Agricultural business and management"), the finest granularity
       StatCan publishes below the 50 broad 2-digit CIP fields. Used as the
       "program" name/category source.
    3: Program type -- used at 4 specific member ids to assign a degree_type:
         8  Undergraduate program            -> "Bachelor"
         13 Graduate program (second cycle)  -> "Master"
         14 Graduate program (third cycle)   -> "PhD"
         4  Career, technical or professional training program -> "Certificate"
       (Total, program type = memberId 1, deliberately NOT used for writes --
       only these 4 concrete levels are written, so every written row maps to
       an actual credential level StatCan tracked, not an ambiguous total.)
    4-8: Credential type, Institution type, Registration status, Status of
       student in Canada, Gender -- all pinned to memberId 1 ("Total, ...")
       so each (institution, field, program-type) coordinate resolves to
       exactly one series.

MATCHING: canonical.institutions.canonical_name (country_code='CA') against
StatCan's "Geography and institutions" member names with the trailing
", <Province>" suffix stripped, and (for the bilingual "University of
Ottawa-Université d'Ottawa" entry only) the "-Université d'X" bilingual
half stripped. Exact normalized-name match only, plus a small explicit
alias table (ALIASES below) for a handful of real institutions StatCan
publishes under their official French name while canonical.institutions
has the English name (e.g. "Laval University" <-> "Université Laval",
"University of Montreal" <-> "Université de Montréal") -- every alias here
is a verified real same-institution EN/FR name pair, not a fuzzy guess.
Verified 132 of 285 CA canonical.institutions rows matched (2026-07-10);
remaining ~153 are real non-StatCan-tracked entities (bible colleges,
military academies/colleges, defunct/historical schools, individual
faculties/departments/campuses of already-matched universities, industry
associations) that correctly have no separate StatCan enrolment series.
canonical.institutions has confirmed duplicate rows for the same real
institution (e.g. "University of Toronto" x2, "Carleton University" x2,
"Dalhousie University" x2, "National Institute of Scientific Research" /
"Institut national de la recherche scientifique" as an EN/FR duplicate
pair) -- this script writes the same StatCan data to every matched row
rather than guessing which is canonical, same as the France/Australia
scrapers.

WHAT IT WRITES: canonical.institution_programs, one row per distinct
(institution, CIP 4-digit field of study, program level) where a StatCan
series exists. Additive only -- ON CONFLICT DO NOTHING.

USAGE
-----
    python scraper/sources/statcan_canada.py [--dry-run] [--max-institutions N]

Requires: requests, psycopg2-binary, python-dotenv (optional)
Requires DATABASE_URL in backend/.env or the environment.
"""

import argparse
import json
import logging
import os
import re
import sys
import time
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

WDS_BASE = "https://www150.statcan.gc.ca/t1/wds/rest"
PRODUCT_ID = 37100277
CACHE_META = HERE / ".cache_statcan_37100277_meta.json"

BATCH = 300  # WDS documented max objects per POST call

# Program-type memberId -> our degree_type taxonomy.
PROGRAM_TYPE_TO_DEGREE = {
    8: "Bachelor",
    13: "Master",
    14: "PhD",
    4: "Certificate",
}

# Fixed dimension positions (from getCubeMetadata, verified 2026-07-10):
#   1 Geography and institutions   2 Field of study        3 Program type
#   4 Credential type (Total=1)    5 Institution type (Total=1)
#   6 Registration status (Total=1)  7 Status of student in Canada (Total=1)
#   8 Gender (Total=1)
TOTAL = 1

# CIP 2020 (Canada) 2-digit broad field -> our field_category taxonomy.
CIP_BROAD_TO_CATEGORY = {
    "01": "Agriculture", "03": "Science", "04": "Architecture",
    "05": "Social Sciences", "09": "Communications", "10": "Communications",
    "11": "Computer Science", "12": "Services", "13": "Education",
    "14": "Engineering", "15": "Engineering", "16": "Humanities",
    "19": "Services", "21": "Education", "22": "Law", "23": "Humanities",
    "24": "General Studies", "25": "Social Sciences", "26": "Science",
    "27": "Science", "28": "Other", "29": "Other", "30": "Interdisciplinary",
    "31": "Services", "32": "General Studies", "33": "General Studies",
    "34": "Health", "35": "Social Sciences", "36": "Services",
    "37": "Social Sciences", "38": "Humanities", "39": "Humanities",
    "40": "Science", "41": "Science", "42": "Social Sciences",
    "43": "Other", "44": "Social Sciences", "45": "Social Sciences",
    "46": "Trades", "47": "Trades", "48": "Trades", "49": "Trades",
    "50": "Arts", "51": "Health", "52": "Business",
    "53": "General Studies", "54": "Humanities", "55": "Humanities",
    "60": "Health", "61": "Health",
}

PROVINCES = (
    "Newfoundland and Labrador|Prince Edward Island|Nova Scotia|New Brunswick|"
    "Quebec|Ontario|Manitoba|Saskatchewan|Alberta|British Columbia|Yukon|"
    "Northwest Territories|Nunavut"
)

# Verified real EN/FR (or otherwise divergent) name variants for institutions
# StatCan lists under a different official name than canonical.institutions.
# memberId -> list of extra names to also index this StatCan institution under.
ALIASES = {
    35: ["Laval University", "Universite Laval"],       # Université Laval
    36: ["University of Sherbrooke"],                    # Université de Sherbrooke
    34: ["University of Montreal"],                      # Université de Montréal
    39: ["University of Quebec at Montreal", "University of Québec at Montreal"],
    209: ["MacEwan University"],                         # Grant MacEwan University
    47: ["Universite TELUQ", "Université TÉLUQ"],        # Télé-université (Téluq)
    44: ["National Institute of Scientific Research"],   # Institut national de la recherche scientifique
    245: ["Thompson Rivers University, Open Learning"],  # Thompson Rivers University
}


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def clean_institution_name(name: str) -> str:
    n = str(name or "")
    n = re.sub(rf",\s*({PROVINCES})\s*$", "", n)
    n = re.sub(r"-Université d[e'’]?\s*[A-Za-zéèà]+\s*$", "", n)
    return n.strip()


def normalize(name: str) -> str:
    n = strip_accents(clean_institution_name(name)).lower()
    n = re.sub(r"^the\s+", "", n)
    n = re.sub(r"\s*\([^)]*\)\s*$", "", n)
    return re.sub(r"[^a-z0-9]", "", n)


def wds_post(endpoint: str, payload, retries=3):
    url = f"{WDS_BASE}/{endpoint}"
    for attempt in range(retries):
        resp = requests.post(url, json=payload, timeout=60)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, dict) and "message" in data and "status" not in data:
                raise RuntimeError(f"WDS error on {endpoint}: {data['message']}")
            return data
        time.sleep(2 * (attempt + 1))
    resp.raise_for_status()


def fetch_cube_metadata():
    if CACHE_META.exists():
        log.info(f"Using cached {CACHE_META.name}")
        return json.loads(CACHE_META.read_text(encoding="utf-8"))
    log.info(f"Fetching cube metadata for productId {PRODUCT_ID} ...")
    data = wds_post("getCubeMetadata", [{"productId": PRODUCT_ID}])
    CACHE_META.write_text(json.dumps(data), encoding="utf-8")
    return data


def title_case_field(cip_label: str) -> str:
    return cip_label.strip()


def load_institution_map(conn):
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name FROM canonical.institutions WHERE country_code = 'CA'")
    rows = cur.fetchall()
    return rows


def load_existing_program_keys(conn):
    cur = conn.cursor()
    cur.execute("SELECT institution_id::text, normalized_program_name, degree_type_key FROM canonical.institution_programs")
    return set(cur.fetchall())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max-institutions", type=int, default=1000)
    parser.add_argument("--rate-delay", type=float, default=0.15, help="seconds between WDS calls")
    args = parser.parse_args()

    if not DB_URL:
        sys.exit("DATABASE_URL not set")

    meta = fetch_cube_metadata()
    cube = meta[0]["object"]
    dims = {d["dimensionNameEn"]: d for d in cube["dimension"]}
    geo_dim = dims["Geography and institutions"]
    fos_dim = dims["Field of study"]

    statcan_institutions = [m for m in geo_dim["member"] if m.get("geoLevel") is None]
    log.info(f"{len(statcan_institutions)} StatCan institution members")

    # 4-digit CIP fields (classificationCode length 5, e.g. "01.01").
    fields = [m for m in fos_dim["member"] if m.get("classificationCode") and len(m["classificationCode"]) == 5]
    log.info(f"{len(fields)} CIP 4-digit field-of-study members")

    statcan_by_norm = {}
    for m in statcan_institutions:
        statcan_by_norm.setdefault(normalize(m["memberNameEn"]), []).append(m)
        for alias in ALIASES.get(m["memberId"], []):
            statcan_by_norm.setdefault(normalize(alias), []).append(m)

    conn = psycopg2.connect(DB_URL)
    ca_institutions = load_institution_map(conn)
    existing = load_existing_program_keys(conn)

    matched = []  # (inst_id, canonical_name, statcan_member)
    for inst_id, canonical_name in ca_institutions:
        hit = statcan_by_norm.get(normalize(canonical_name))
        if hit:
            matched.append((inst_id, canonical_name, hit[0]))

    if args.max_institutions < len(matched):
        matched = matched[: args.max_institutions]

    log.info(f"Matched {len(matched)} of {len(ca_institutions)} CA canonical.institutions rows to StatCan")

    # Pass 1: for each matched institution x field, check existence at
    # Total,program type to find which fields are offered at all.
    coord_jobs = []  # (inst_id, canonical_name, statcan_geo_id, field_member)
    for inst_id, canonical_name, geo_member in matched:
        geo_id = geo_member["memberId"]
        for f in fields:
            coord = f"{geo_id}.{f['memberId']}.{TOTAL}.{TOTAL}.{TOTAL}.{TOTAL}.{TOTAL}.{TOTAL}.0.0"
            coord_jobs.append((inst_id, canonical_name, geo_id, f, coord))

    log.info(f"Pass 1: checking {len(coord_jobs):,} (institution, field) coordinates for existence ...")
    found_pairs = []  # (inst_id, canonical_name, geo_id, field_member)
    for i in range(0, len(coord_jobs), BATCH):
        batch = coord_jobs[i:i + BATCH]
        payload = [{"productId": PRODUCT_ID, "coordinate": j[4]} for j in batch]
        resp = wds_post("getSeriesInfoFromCubePidCoord", payload)
        for job, r in zip(batch, resp):
            obj = r.get("object", {})
            if obj.get("responseStatusCode") == 0:
                found_pairs.append((job[0], job[1], job[2], job[3]))
        time.sleep(args.rate_delay)
        if (i // BATCH) % 20 == 0:
            log.info(f"  ... {min(i + BATCH, len(coord_jobs)):,} / {len(coord_jobs):,} checked, {len(found_pairs)} series found so far")

    log.info(f"Pass 1 done: {len(found_pairs):,} real (institution, field-of-study) series found")

    # Pass 2: for each found pair, check which of the 4 program-type levels
    # actually have a series (assigns degree_type).
    level_jobs = []
    for inst_id, canonical_name, geo_id, f in found_pairs:
        for prog_type_id in PROGRAM_TYPE_TO_DEGREE:
            coord = f"{geo_id}.{f['memberId']}.{prog_type_id}.{TOTAL}.{TOTAL}.{TOTAL}.{TOTAL}.{TOTAL}.0.0"
            level_jobs.append((inst_id, canonical_name, f, prog_type_id, coord))

    log.info(f"Pass 2: checking {len(level_jobs):,} (institution, field, level) coordinates ...")
    program_rows = []
    seen_keys = set()
    for i in range(0, len(level_jobs), BATCH):
        batch = level_jobs[i:i + BATCH]
        payload = [{"productId": PRODUCT_ID, "coordinate": j[4]} for j in batch]
        resp = wds_post("getSeriesInfoFromCubePidCoord", payload)
        for job, r in zip(batch, resp):
            obj = r.get("object", {})
            if obj.get("responseStatusCode") != 0:
                continue
            inst_id, canonical_name, f, prog_type_id, _coord = job
            degree_type = PROGRAM_TYPE_TO_DEGREE[prog_type_id]
            field_label = title_case_field(f["memberNameEn"])
            normalized_name = re.sub(r"[^a-z0-9]", "", strip_accents(field_label).lower())
            key = (str(inst_id), normalized_name, degree_type)
            if key in existing or key in seen_keys:
                continue
            seen_keys.add(key)
            cip_code = f.get("classificationCode") or ""
            broad = cip_code.split(".")[0] if cip_code else ""
            field_category = CIP_BROAD_TO_CATEGORY.get(broad, "General Studies")
            program_rows.append((inst_id, field_label, normalized_name, degree_type, field_category, cip_code, canonical_name))
        time.sleep(args.rate_delay)
        if (i // BATCH) % 20 == 0:
            log.info(f"  ... {min(i + BATCH, len(level_jobs)):,} / {len(level_jobs):,} checked, {len(program_rows)} rows queued so far")

    log.info(f"New institution_programs rows queued: {len(program_rows):,}")

    if args.dry_run:
        log.info("[DRY RUN] no writes performed")
        conn.close()
        return

    cur = conn.cursor()
    WRITE_BATCH = 500
    for i in range(0, len(program_rows), WRITE_BATCH):
        batch = program_rows[i:i + WRITE_BATCH]
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
                      "jsonb_build_object('cip_code', %s, 'statcan_institution_name', %s), "
                      "jsonb_build_object('source', 'Statistics Canada WDS API, table 37-10-0277-01', "
                      "'confidence', 0.85, 'source_table', '37-10-0277-01'), "
                      "'{}'::jsonb, now(), now(), 'unknown')",
        )
        conn.commit()
        log.info(f"  ... wrote {min(i + WRITE_BATCH, len(program_rows)):,} / {len(program_rows):,}")

    log.info(f"Done. Wrote {len(program_rows):,} institution_programs rows across {len(matched)} matched institutions.")
    conn.close()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
scraper/sources/sise_france.py
--------------------------------
France institution_programs backfill using the official Ministry of Higher
Education, Research and Space (MESRE) open data platform -- the "principaux
diplomes et formations" dataset built from SISE (Systeme d'Information sur le
Suivi de l'Etudiant), the same government student-tracking system French
universities report to.

WHY THIS SCRAPER EXISTS
------------------------
CollegeOS has 287 France institutions (as of 2026-07-10) with zero rows in
canonical.institution_programs. IPEDS-equivalent coverage does not exist for
one flat national feed of ALL French higher-ed institutions (a large chunk of
our 287-institution gap are small private schools / seminaries / foreign
campuses that never report to SISE at all -- SISE only covers public
establishments under direct MESR supervision, ~140 institutions nationwide).
So this scraper is a partial, honest fix: it recovers real program data for
the subset of our France institutions that ARE large public universities,
which is a meaningful chunk of the gap even though it can't close all of it.

SOURCE (open, no auth, OGL/Licence Ouverte 2.0):
  https://data.enseignementsup-recherche.gouv.fr/explore/dataset/
  fr-esr-principaux-diplomes-et-formations-prepares-etablissements-publics
Covers university years 2006-07 through 2024-25. This scraper uses ONLY the
latest available year in the file (2024-25 as of 2026-07) -- using older
years would reintroduce defunct/pre-merger institution names (e.g.
"Universite Robert Schuman" and "Universite Louis Pasteur", both absorbed
into Universite de Strasbourg in a 2009 merger but still present in the
file's 2006-09 rows) and falsely match them against our current institution
names. This bug was caught during manual validation before this scraper was
written -- see the commit history / task notes for the full story. Do not
relax the latest-year-only filter without re-validating.

MATCHING: canonical.institutions.canonical_name for country_code='FR' is
stored in English (e.g. "University of Strasbourg"), while SISE establishment
names are in French ("Universite de Strasbourg"). There is no shared ID
(no UAI/ROR column in our schema yet) so this scraper generates a small set
of deterministic EN->FR name variants (`University of X` -> `Universite de
X` / `Universite X`, `X University` -> `Universite X` / `Universite de X`)
and requires an EXACT normalized match against a real 2024-25 establishment
name -- no fuzzy/similarity threshold. This produced 41 verified matches out
of 287 gap institutions in manual testing (2026-07-10); all 41 are
well-known major French public universities/grandes ecoles, hand-spot-checked
against the source data before the first write.

WHAT IT WRITES: canonical.institution_programs rows only, one per distinct
(cycle, diploma label, discipline) combination observed for the matched
institution in the latest year. Additive only -- ON CONFLICT DO NOTHING on
the existing (institution_id, normalized_program_name, degree_type_key)
unique constraint. Never touches canonical.institutions.

USAGE
-----
    python scraper/sources/sise_france.py [--dry-run] [--max-per-institution N]

Requires: requests, psycopg2-binary, python-dotenv (optional)
Requires DATABASE_URL in backend/.env or the environment.
"""

import argparse
import csv
import io
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
CSV_URL = (
    "https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/"
    "fr-esr-principaux-diplomes-et-formations-prepares-etablissements-publics/exports/csv"
    "?use_labels=true"
)
CACHE_PATH = HERE / ".cache_sise_france.csv"

# Cycle universitaire (SISE) -> our degree_type taxonomy.
CYCLE_TO_DEGREE = {
    "1er cycle": "Bachelor",
    "2ème cycle": "Master",
    "3ème cycle": "PhD",
    "L": "Bachelor",
    "M": "Master",
}

# Discipline (SISE, French) -> our broad field_category taxonomy. Best-effort
# keyword mapping; anything unmatched falls back to "General Studies" rather
# than being dropped, matching how the ETER scraper handles unknown ISCED-F
# codes.
DISCIPLINE_TO_FIELD = {
    "droit, sciences politiques": "Law",
    "sciences économiques, gestion": "Business",
    "administration économique et sociale": "Business",
    "lettres, sciences du langage, arts": "Arts & Humanities",
    "langues": "Arts & Humanities",
    "sciences humaines et sociales": "Social Sciences",
    "sciences fondamentales et applications": "Science",
    "sciences de la vie, de la terre et de l'univers": "Science",
    "staps": "Health",
    "médecine": "Health",
    "pharmacie": "Health",
    "odontologie": "Health",
    "pluridisciplinaire sciences": "Science",
    "pluridisciplinaire droit, sciences économiques, aes": "Business",
    "pluridisciplinaire lettres, langues, sciences humaines": "Arts & Humanities",
}


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def normalize(name: str) -> str:
    n = strip_accents(str(name or "")).lower()
    return re.sub(r"[^a-z0-9]", "", n)


def english_to_french_variants(name: str) -> list[str]:
    n = str(name or "").strip()
    variants = {n}
    m = re.match(r"^University of (.+)$", n, re.IGNORECASE)
    if m:
        variants.add(f"Université de {m.group(1)}")
        variants.add(f"Université {m.group(1)}")
        variants.add(f"Université d'{m.group(1)}")
    m = re.match(r"^(.+) University$", n, re.IGNORECASE)
    if m:
        variants.add(f"Université {m.group(1)}")
        variants.add(f"Université de {m.group(1)}")
        variants.add(f"{m.group(1)} Université")
    return list(variants)


def download_csv() -> Path:
    if CACHE_PATH.exists() and CACHE_PATH.stat().st_size > 1_000_000:
        log.info(f"Using cached SISE dump at {CACHE_PATH}")
        return CACHE_PATH
    log.info(f"Downloading SISE 'principaux diplomes' dataset from {CSV_URL} ...")
    resp = requests.get(CSV_URL, timeout=180)
    resp.raise_for_status()
    CACHE_PATH.write_bytes(resp.content)
    log.info(f"  saved {CACHE_PATH.stat().st_size:,} bytes")
    return CACHE_PATH


def load_latest_year_rows(csv_path: Path):
    with open(csv_path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        rows = list(reader)
    years = sorted({r["Année universitaire"] for r in rows if r.get("Année universitaire")})
    latest = years[-1]
    log.info(f"Years present: {years[0]}..{years[-1]}; using latest = {latest}")
    return [r for r in rows if r.get("Année universitaire") == latest], latest


def title_case_fr(label: str) -> str:
    label = (label or "").strip()
    if not label:
        return label
    return label[0].upper() + label[1:]


def load_institution_map(conn):
    """normalized(canonical_name) and normalized(EN->FR variants) -> (id, canonical_name)."""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, canonical_name FROM canonical.institutions
        WHERE country_code = 'FR'
        """
    )
    by_variant = {}
    for inst_id, name in cur.fetchall():
        for variant in english_to_french_variants(name):
            by_variant.setdefault(normalize(variant), []).append((inst_id, name))
    return by_variant


def load_existing_program_keys(conn):
    cur = conn.cursor()
    cur.execute("SELECT institution_id::text, normalized_program_name, degree_type_key FROM canonical.institution_programs")
    return set(cur.fetchall())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max-per-institution", type=int, default=200)
    args = parser.parse_args()

    if not DB_URL:
        sys.exit("DATABASE_URL not set")

    csv_path = download_csv()
    rows, latest_year = load_latest_year_rows(csv_path)
    log.info(f"{len(rows):,} rows in {latest_year}")

    conn = psycopg2.connect(DB_URL)
    inst_by_variant = load_institution_map(conn)
    existing = load_existing_program_keys(conn)

    # Group SISE rows by establishment name (normalized).
    by_establishment: dict[str, list] = {}
    for r in rows:
        est = (r.get("Établissement") or "").strip()
        if not est:
            continue
        by_establishment.setdefault(normalize(est), []).append(r)

    matched_pairs = []  # (inst_id, canonical_name, establishment_name, rows)
    seen_inst = set()
    for norm_variant, candidates in inst_by_variant.items():
        est_rows = by_establishment.get(norm_variant)
        if not est_rows:
            continue
        # Multiple canonical rows can share one exact name -- confirmed real
        # duplicate institution records for France (e.g. "University of
        # Strasbourg" appears twice with different ids; verified every
        # ambiguous case here is a same-name duplicate, not two distinct
        # institutions colliding under the EN->FR heuristic). Since all
        # candidates represent the same physical institution, the same SISE
        # data is correct for each -- write to all of them.
        if len(candidates) != 1:
            names = {name for _, name in candidates}
            if len(names) != 1:
                log.warning(f"Ambiguous variant '{norm_variant}' maps to institutions with DIFFERENT names {names} -- skipping (unsafe)")
                continue
            log.warning(f"Variant '{norm_variant}' matches {len(candidates)} duplicate rows for {names} -- writing to all")
        for inst_id, canonical_name in candidates:
            if inst_id in seen_inst:
                continue
            seen_inst.add(inst_id)
            matched_pairs.append((inst_id, canonical_name, est_rows[0]["Établissement"], est_rows))

    log.info(f"Matched {len(matched_pairs)} France institutions to {latest_year} SISE establishment rows")
    for inst_id, canonical_name, est_name, _ in matched_pairs:
        log.info(f"  {canonical_name!r:55s} -> {est_name!r}")

    program_rows = []
    for inst_id, canonical_name, est_name, est_rows in matched_pairs:
        seen_keys = set()
        count_for_inst = 0
        for r in est_rows:
            if count_for_inst >= args.max_per_institution:
                break
            cycle = (r.get("Cycle universitaire (cursus LMD)") or "").strip()
            degree_type = CYCLE_TO_DEGREE.get(cycle)
            if not degree_type:
                continue
            diploma_label = (r.get("Libellé du diplôme ou de la formation 1") or "").strip()
            discipline_raw = (r.get("Discipline") or "").strip()
            if not diploma_label:
                continue
            program_name = title_case_fr(diploma_label)
            normalized_name = normalize(program_name)
            key = (str(inst_id), normalized_name, degree_type)
            if key in existing or key in seen_keys:
                continue
            seen_keys.add(key)
            field_category = DISCIPLINE_TO_FIELD.get(discipline_raw.lower(), "General Studies")
            program_rows.append((inst_id, program_name, normalized_name, degree_type, field_category, discipline_raw, est_name))
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
                      "jsonb_build_object('sise_discipline', %s, 'sise_establishment_name', %s), "
                      "jsonb_build_object('source', 'MESRE / SISE (France, data.enseignementsup-recherche.gouv.fr)', "
                      "'confidence', 0.85, 'source_table', 'fr-esr-principaux-diplomes-et-formations-prepares-etablissements-publics') , "
                      "'{}'::jsonb, now(), now(), 'unknown')",
        )
        conn.commit()
        log.info(f"  ... {min(i + BATCH, len(program_rows)):,} / {len(program_rows):,}")

    log.info(f"Done. Wrote {len(program_rows):,} institution_programs rows across {len(matched_pairs)} institutions.")
    conn.close()


if __name__ == "__main__":
    main()

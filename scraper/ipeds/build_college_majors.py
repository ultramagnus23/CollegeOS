#!/usr/bin/env python3
"""
scraper/ipeds/build_college_majors.py
──────────────────────────────────────
Reads two IPEDS files and populates the `college_majors` junction table.

PREREQUISITES
─────────────
1. Run build_majors.py first (populates the `majors` table).

2. Download the IPEDS Institutional Characteristics file:
     https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx
     → "Institutional Characteristics" → Year: 2023 → "HD2023.csv"
     Place at: scraper/ipeds/HD2023.csv

3. The IPEDS Completions file must also be present at: scraper/ipeds/C2023_A.csv
   (same file used by build_majors.py)

4. DATABASE_URL must be set (see build_majors.py for instructions).

WHAT IT DOES
────────────
• Loads HD2023.csv to build a UNITID → {name, city, stabbr} map
• Uses Python difflib to fuzzy-match each IPEDS institution to a row in
  `colleges_comprehensive` by (name, state), with cutoff ≥ 0.85
• Updates colleges_comprehensive.ipeds_unit_id for matched colleges
• For every row in C2023_A.csv where AWLEVEL in (5,7) and CTOTALT > 0:
    – Resolves college_id (from ipeds_unit_id mapping)
    – Resolves major_id  (by cip_code from the `majors` table)
    – Upserts into college_majors
• Prints a match report and completion summary
• Safe to re-run (upsert, not replace)

RUN
───
    cd scraper
    python ipeds/build_college_majors.py [--hd path/to/HD2023.csv]
                                          [--csv path/to/C2023_A.csv]
                                          [--cutoff 0.85]
                                          [--dry-run]
"""

import argparse
import os
import sys
from difflib import get_close_matches
from pathlib import Path

HERE      = Path(__file__).parent
REPO_ROOT = HERE.parent.parent

sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO_ROOT))

try:
    from dotenv import load_dotenv
    load_dotenv(REPO_ROOT / ".env")
except ImportError:
    pass

try:
    import pandas as pd
except ImportError:
    print("ERROR: pandas not installed. Run: pip install pandas", file=sys.stderr)
    sys.exit(1)

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    print("ERROR: psycopg2 not installed. Run: pip install psycopg2-binary", file=sys.stderr)
    sys.exit(1)

AWLEVEL_BACHELORS = 5
AWLEVEL_MASTERS   = 7

BATCH_SIZE = 5000  # rows per insert batch


def parse_args():
    parser = argparse.ArgumentParser(
        description="Populate college_majors table from IPEDS completions data"
    )
    parser.add_argument("--hd",      default=str(HERE / "HD2023.csv"),   help="Path to HD2023.csv")
    parser.add_argument("--csv",     default=str(HERE / "C2023_A.csv"),  help="Path to C2023_A.csv")
    parser.add_argument("--cutoff",  type=float, default=0.85,           help="Fuzzy match cutoff (0–1)")
    parser.add_argument("--dry-run", action="store_true",                 help="Do not write to DB")
    return parser.parse_args()


# ─── Load helpers ─────────────────────────────────────────────────────────────

def load_hd(hd_path: str) -> dict[str, dict]:
    """Returns {unitid_str: {name, city, stabbr}}."""
    p = Path(hd_path)
    if not p.exists():
        print(
            f"\nERROR: HD file not found at: {hd_path}\n"
            "Download from: https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx\n"
            "  → Institutional Characteristics → Year 2023 → HD2023.csv",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Loading {hd_path} …")
    df = pd.read_csv(hd_path, dtype=str, low_memory=False)
    df.columns = [c.strip().upper() for c in df.columns]

    required = {"UNITID", "INSTNM"}
    missing = required - set(df.columns)
    if missing:
        print(f"ERROR: HD CSV missing columns: {missing}", file=sys.stderr)
        sys.exit(1)

    result = {}
    for _, row in df.iterrows():
        uid = str(row["UNITID"]).strip()
        result[uid] = {
            "name":    str(row.get("INSTNM", "")).strip(),
            "city":    str(row.get("CITY",   "")).strip(),
            "stabbr":  str(row.get("STABBR", "")).strip().upper(),
            "iclevel": str(row.get("ICLEVEL","")).strip(),   # 1=4yr, 2=2yr
        }

    # Keep only 4-year institutions (ICLEVEL == "1")
    four_yr = {k: v for k, v in result.items() if v["iclevel"] == "1"}
    print(f"  4-year institutions in HD file: {len(four_yr):,}")
    return four_yr


def load_completions(csv_path: str) -> pd.DataFrame:
    p = Path(csv_path)
    if not p.exists():
        print(f"ERROR: Completions CSV not found at: {csv_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Loading {csv_path} …")
    df = pd.read_csv(csv_path, dtype=str, low_memory=False)
    df.columns = [c.strip().upper() for c in df.columns]

    df["AWLEVEL"] = pd.to_numeric(df["AWLEVEL"],  errors="coerce")
    df["CTOTALT"] = pd.to_numeric(df["CTOTALT"],  errors="coerce").fillna(0).astype(int)
    df["CIPCODE"] = df["CIPCODE"].str.strip()
    df["UNITID"]  = df["UNITID"].str.strip()

    df = df[
        df["AWLEVEL"].isin([AWLEVEL_BACHELORS, AWLEVEL_MASTERS]) &
        (df["CTOTALT"] > 0)
    ].copy()

    print(f"  Completions rows (bachelor's/master's, CTOTALT>0): {len(df):,}")
    return df


# ─── Fuzzy-match IPEDS institutions to our colleges table ─────────────────────

def build_match_index(cursor) -> tuple[dict, list]:
    """
    Fetch all (id, name, state) from colleges_comprehensive.
    Returns:
      id_by_name: dict  normalised_name → college_id
      names_list: list  of normalised names (for get_close_matches)
    """
    cursor.execute(
        """
        SELECT id, name, state
        FROM   colleges_comprehensive
        WHERE  name IS NOT NULL
        ORDER  BY id
        """
    )
    rows = cursor.fetchall()
    id_by_name = {}
    for (col_id, name, state) in rows:
        key = _norm(name, state)
        id_by_name[key] = col_id
    names_list = list(id_by_name.keys())
    print(f"  colleges_comprehensive rows indexed: {len(names_list):,}")
    return id_by_name, names_list


def _norm(name: str, state: str | None) -> str:
    """Normalise a (name, state) pair into a single comparison string."""
    n = (name or "").lower().strip()
    s = (state or "").lower().strip()
    # Strip common suffixes that differ between IPEDS and our DB
    for suffix in (" university", " college", " institute", " school"):
        n = n.removesuffix(suffix)
    return f"{n}|{s}"


def match_institutions(
    hd: dict[str, dict],
    id_by_name: dict,
    names_list: list,
    cutoff: float,
) -> tuple[dict[str, int], int, int]:
    """
    Fuzzy-match IPEDS UNITID → colleges_comprehensive.id.

    Returns:
      unit_to_col_id: {unitid: college_id}
      n_matched: int
      n_unmatched: int
    """
    unit_to_col_id: dict[str, int] = {}
    n_matched   = 0
    n_unmatched = 0

    for unitid, info in hd.items():
        key = _norm(info["name"], info["stabbr"])
        # Exact match first
        if key in id_by_name:
            unit_to_col_id[unitid] = id_by_name[key]
            n_matched += 1
            continue
        # Fuzzy match
        matches = get_close_matches(key, names_list, n=1, cutoff=cutoff)
        if matches:
            unit_to_col_id[unitid] = id_by_name[matches[0]]
            n_matched += 1
        else:
            n_unmatched += 1

    return unit_to_col_id, n_matched, n_unmatched


# ─── Main logic ───────────────────────────────────────────────────────────────

def main():
    args = parse_args()

    db_url = os.environ.get("DATABASE_URL")
    if not db_url and not args.dry_run:
        print("ERROR: DATABASE_URL is not set.", file=sys.stderr)
        sys.exit(1)

    hd           = load_hd(args.hd)
    completions  = load_completions(args.csv)

    if args.dry_run:
        print("\n[DRY RUN] Skipping database operations.")
        print(f"  Would process {len(completions):,} completion rows")
        print(f"  Against {len(hd):,} 4-year institutions from HD file")
        return

    conn = psycopg2.connect(db_url)
    cur  = conn.cursor()

    # ── 1. Build match index ──────────────────────────────────────────────────
    print("\nBuilding college match index …")
    id_by_name, names_list = build_match_index(cur)

    # ── 2. Fuzzy-match IPEDS institutions → college_ids ───────────────────────
    print("Matching IPEDS institutions to colleges_comprehensive …")
    unit_to_col_id, n_matched, n_unmatched = match_institutions(
        hd, id_by_name, names_list, args.cutoff
    )
    print(f"  Matched: {n_matched:,}  |  Unmatched: {n_unmatched:,}")

    # ── 3. Update ipeds_unit_id on colleges_comprehensive ─────────────────────
    print("Updating colleges_comprehensive.ipeds_unit_id …")
    updates = [(int(col_id), int(uid)) for uid, col_id in unit_to_col_id.items() if uid.isdigit()]
    execute_values(
        cur,
        """
        UPDATE colleges_comprehensive AS cc
        SET    ipeds_unit_id = data.unit_id
        FROM   (VALUES %s) AS data(college_id, unit_id)
        WHERE  cc.id = data.college_id
        """,
        updates,
    )
    conn.commit()
    print(f"  Updated ipeds_unit_id for {len(updates):,} colleges")

    # ── 4. Build major_id lookup {cip_code → major_id} ───────────────────────
    cur.execute("SELECT cip_code, id FROM majors")
    cip_to_major_id = {row[0]: row[1] for row in cur.fetchall()}
    print(f"\nMajors in DB: {len(cip_to_major_id):,}")
    if not cip_to_major_id:
        print(
            "ERROR: No rows in the `majors` table. "
            "Run build_majors.py first.",
            file=sys.stderr,
        )
        conn.close()
        sys.exit(1)

    # ── 5. Build college_majors rows ──────────────────────────────────────────
    print("Building college_majors rows …")
    rows_to_insert: list[tuple] = []
    skipped_no_college = 0
    skipped_no_major   = 0

    for _, row in completions.iterrows():
        unitid   = str(row["UNITID"]).strip()
        cipcode  = str(row["CIPCODE"]).strip()
        awlevel  = int(row["AWLEVEL"])
        ctotalt  = int(row["CTOTALT"])

        college_id = unit_to_col_id.get(unitid)
        if college_id is None:
            skipped_no_college += 1
            continue

        major_id = cip_to_major_id.get(cipcode)
        if major_id is None:
            skipped_no_major += 1
            continue

        rows_to_insert.append((college_id, major_id, True, awlevel, ctotalt))

    print(f"  Rows to insert:       {len(rows_to_insert):,}")
    print(f"  Skipped (no college): {skipped_no_college:,}")
    print(f"  Skipped (no major):   {skipped_no_major:,}")

    # ── 6. Batch upsert ───────────────────────────────────────────────────────
    print("Upserting college_majors …")
    total_inserted = 0
    for i in range(0, len(rows_to_insert), BATCH_SIZE):
        batch = rows_to_insert[i : i + BATCH_SIZE]
        execute_values(
            cur,
            """
            INSERT INTO college_majors
                   (college_id, major_id, offered, awlevel, completions_count)
            VALUES %s
            ON CONFLICT (college_id, major_id, awlevel) DO UPDATE
              SET offered           = EXCLUDED.offered,
                  completions_count = EXCLUDED.completions_count
            """,
            batch,
        )
        conn.commit()
        total_inserted += len(batch)
        print(f"  … {total_inserted:,} / {len(rows_to_insert):,}", end="\r")

    print(f"\n✓ Done — upserted {total_inserted:,} college_major rows")

    cur.close()
    conn.close()

    print(
        "\nNext step: run the precomputeCollegeVectors.js script to build\n"
        "and cache feature vectors for all colleges:\n"
        "  cd backend && node scripts/precomputeCollegeVectors.js\n"
    )


if __name__ == "__main__":
    main()

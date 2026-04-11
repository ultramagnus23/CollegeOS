#!/usr/bin/env python3
"""
scraper/ipeds/build_majors.py
─────────────────────────────
Reads the IPEDS Completions file (C2023_A.csv or the latest year) and
populates the `majors` table in the CollegeOS PostgreSQL database.

PREREQUISITES
─────────────
1. Download the IPEDS Completions file:
     https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx
     → "Completions" → Year: 2023 → Download "C2023_A.csv"
     Place the file at: scraper/ipeds/C2023_A.csv

2. Set the DATABASE_URL environment variable (or create a .env file in the
   repo root with DATABASE_URL=postgres://...).

WHAT IT DOES
────────────
• Reads every row in C2023_A.csv
• Filters to AWLEVEL 5 (bachelor's) and AWLEVEL 7 (master's) only
• Keeps rows where CTOTALT > 0  (at least one completion in last year)
• Extracts unique CIP codes, maps each to a human-readable name via
  the embedded CIP 2020 taxonomy in cip2020.py
• Upserts into the `majors` table (cip_code is UNIQUE — safe to re-run)
• Prints a summary: X new, Y existing rows

RUN
───
    cd scraper
    pip install psycopg2-binary pandas python-dotenv
    python ipeds/build_majors.py [--csv path/to/C2023_A.csv] [--dry-run]
"""

import argparse
import os
import sys
from pathlib import Path

# ── allow importing cip2020 from the same directory ──────────────────────────
HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from cip2020 import get_major_info  # noqa: E402

# ── allow importing dotenv from repo root ────────────────────────────────────
REPO_ROOT = HERE.parent.parent
sys.path.insert(0, str(REPO_ROOT))

try:
    from dotenv import load_dotenv
    load_dotenv(REPO_ROOT / ".env")
except ImportError:
    pass  # dotenv is optional; DATABASE_URL must be set directly

try:
    import pandas as pd
except ImportError:
    print("ERROR: pandas is not installed. Run: pip install pandas", file=sys.stderr)
    sys.exit(1)

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    print("ERROR: psycopg2 is not installed. Run: pip install psycopg2-binary", file=sys.stderr)
    sys.exit(1)

# ─── Award levels we care about ───────────────────────────────────────────────
AWLEVEL_BACHELORS = 5   # Bachelor's degree
AWLEVEL_MASTERS   = 7   # Master's degree

# These are filtered OUT:
# 1  = Postsecondary award < 1 year
# 2  = Postsecondary award 1–2 years
# 3  = Associate's degree
# 6  = Postbaccalaureate certificate
# 8  = Post-master's certificate
# 17 = Doctor's degree – research/scholarship
# 18 = Doctor's degree – professional practice
# 19 = Doctor's degree – other


def parse_args():
    parser = argparse.ArgumentParser(description="Build majors table from IPEDS completions data")
    parser.add_argument(
        "--csv",
        default=str(HERE / "C2023_A.csv"),
        help="Path to the IPEDS C2023_A.csv completions file",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and print results without writing to the database",
    )
    return parser.parse_args()


def load_completions(csv_path: str) -> pd.DataFrame:
    """Load and filter the IPEDS completions CSV."""
    p = Path(csv_path)
    if not p.exists():
        print(
            f"\nERROR: Completions CSV not found at: {csv_path}\n"
            "Please download it from:\n"
            "  https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx\n"
            "  → Completions → Year 2023 → C2023_A.csv\n"
            f"Then place the file at: {csv_path}",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Loading {csv_path} …")
    df = pd.read_csv(csv_path, dtype=str, low_memory=False)

    # Normalise column names to uppercase
    df.columns = [c.strip().upper() for c in df.columns]

    required = {"CIPCODE", "AWLEVEL", "CTOTALT"}
    missing = required - set(df.columns)
    if missing:
        print(f"ERROR: CSV is missing required columns: {missing}", file=sys.stderr)
        print(f"Found columns: {list(df.columns)}", file=sys.stderr)
        sys.exit(1)

    # Cast types
    df["AWLEVEL"]  = pd.to_numeric(df["AWLEVEL"],  errors="coerce")
    df["CTOTALT"]  = pd.to_numeric(df["CTOTALT"],  errors="coerce").fillna(0).astype(int)
    df["CIPCODE"]  = df["CIPCODE"].str.strip()

    # Filter
    df = df[
        df["AWLEVEL"].isin([AWLEVEL_BACHELORS, AWLEVEL_MASTERS]) &
        (df["CTOTALT"] > 0)
    ].copy()

    print(f"  Rows after filtering (bachelor's/master's, completions > 0): {len(df):,}")
    return df


def build_unique_majors(df: pd.DataFrame) -> list[dict]:
    """Deduplicate CIP codes and resolve names via cip2020 taxonomy."""
    unique_codes = df["CIPCODE"].unique()
    print(f"  Unique CIP codes: {len(unique_codes):,}")

    majors = []
    for code in sorted(unique_codes):
        # Skip catch-all / summary rows IPEDS uses
        if code in ("99", "99.0000", "00", "00.0000"):
            continue
        info = get_major_info(code)
        majors.append({
            "cip_code":       code,
            "name":           info["name"],
            "broad_category": info["broad_category"],
            "is_stem":        info["is_stem"],
        })

    print(f"  Resolved {len(majors):,} unique majors")
    return majors


def upsert_majors(majors: list[dict], db_url: str, dry_run: bool) -> tuple[int, int]:
    """
    Upsert majors into the database.
    Returns (inserted, skipped) counts.
    """
    if dry_run:
        print(f"\n[DRY RUN] Would upsert {len(majors):,} majors.")
        for m in majors[:10]:
            print(f"  {m['cip_code']:<12} {m['broad_category']:<35} {m['name']}")
        if len(majors) > 10:
            print(f"  … and {len(majors) - 10} more")
        return 0, 0

    conn = psycopg2.connect(db_url)
    cur  = conn.cursor()

    rows = [
        (m["cip_code"], m["name"], m["broad_category"], m["is_stem"])
        for m in majors
    ]

    sql = """
        INSERT INTO majors (cip_code, name, broad_category, is_stem)
        VALUES %s
        ON CONFLICT (cip_code) DO UPDATE
          SET name           = EXCLUDED.name,
              broad_category = EXCLUDED.broad_category,
              is_stem        = EXCLUDED.is_stem
        RETURNING (xmax = 0) AS inserted
    """

    execute_values(cur, sql, rows)
    results = cur.fetchall()
    conn.commit()

    inserted = sum(1 for (ins,) in results if ins)
    skipped  = len(results) - inserted

    cur.close()
    conn.close()

    return inserted, skipped


def main():
    args = parse_args()

    db_url = os.environ.get("DATABASE_URL")
    if not db_url and not args.dry_run:
        print(
            "ERROR: DATABASE_URL environment variable is not set.\n"
            "Set it or add it to a .env file in the repository root.",
            file=sys.stderr,
        )
        sys.exit(1)

    df     = load_completions(args.csv)
    majors = build_unique_majors(df)

    inserted, skipped = upsert_majors(majors, db_url, args.dry_run)

    if not args.dry_run:
        print(f"\n✓ Done — inserted {inserted:,} new majors, updated {skipped:,} existing")
        print(
            "\nNext step: run build_college_majors.py to populate the\n"
            "college_majors junction table using the same CSV.\n"
        )


if __name__ == "__main__":
    main()

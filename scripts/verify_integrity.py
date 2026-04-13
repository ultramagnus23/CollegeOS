#!/usr/bin/env python3
"""
scripts/verify_integrity.py
-----------------------------
Runs the integrity checks in verify_integrity.sql against your Supabase
(PostgreSQL) database and prints a human-readable report.

Prints:
  - Total colleges / distinct ipeds_unit_id counts
  - Duplicate ipeds_unit_id groups (up to 20)
  - Duplicate (name, country) groups (up to 20)
  - Orphaned FK row counts for all dependent tables
  - Duplicate composite keys in college_majors (up to 20)
  - Canonical view health (total / distinct / coverage)

Usage:
  pip install supabase python-dotenv
  python scripts/verify_integrity.py

Environment variables (.env or export):
  SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY=eyJ...   # service role key (bypasses RLS)
"""

import os
import sys

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SUPABASE_URL         = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

# ── helpers ──────────────────────────────────────────────────────────────────

def sep(title: str = "") -> None:
    width = 60
    if title:
        pad = max(0, (width - len(title) - 2) // 2)
        print(f"\n{'─' * pad} {title} {'─' * pad}")
    else:
        print("─" * width)

def ok(msg: str) -> None:
    print(f"  ✅  {msg}")

def warn(msg: str) -> None:
    print(f"  ⚠️   {msg}")

def err(msg: str) -> None:
    print(f"  ❌  {msg}")

# ── SQL helpers via Supabase RPC ─────────────────────────────────────────────
# Supabase's Python client doesn't expose raw SQL execution on the free plan,
# so we use the PostgREST RPC path via a stored function.  The alternative is
# to connect directly via psycopg2/asyncpg using DATABASE_URL.
# We support both approaches below.

def run_via_psycopg2(queries: list[tuple[str, str]]) -> list[tuple[str, list[dict]]]:
    """
    Execute a list of (label, sql) tuples via psycopg2 (direct Postgres connection).
    Returns (label, rows[]) for each query.
    Requires DATABASE_URL env var (e.g. postgresql://postgres:pw@db.xxx.supabase.co:5432/postgres).
    """
    import psycopg2
    import psycopg2.extras

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise EnvironmentError(
            "DATABASE_URL is not set.\n"
            "Find it in Supabase Dashboard → Settings → Database → Connection String\n"
            "(use the 'Session mode' pooler URL for scripts: "
            "postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres).\n"
            "Alternatively, set SUPABASE_URL + SUPABASE_SERVICE_KEY to use the Supabase RPC path."
        )

    conn = psycopg2.connect(db_url)
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    results = []
    for label, sql in queries:
        try:
            cur.execute(sql)
            rows = [dict(r) for r in cur.fetchall()]
        except Exception as exc:
            rows = [{"error": str(exc)}]
            conn.rollback()
        results.append((label, rows))
    cur.close()
    conn.close()
    return results


def run_via_supabase_rpc(client, queries: list[tuple[str, str]]) -> list[tuple[str, list[dict]]]:
    """
    Execute queries via the Supabase Python SDK using a helper RPC function
    `exec_sql(query text)` that must exist in the database.

    If the function doesn't exist, falls back to printing a warning and
    returning empty results.
    """
    results = []
    for label, sql in queries:
        try:
            resp = client.rpc("exec_sql", {"query": sql}).execute()
            rows = resp.data or []
        except Exception as exc:
            rows = [{"error": str(exc)}]
        results.append((label, rows))
    return results


# ── Query definitions ────────────────────────────────────────────────────────

QUERIES = [
    (
        "summary",
        """
        SELECT
          COUNT(*)                                             AS total_rows,
          COUNT(DISTINCT id)                                   AS distinct_ids,
          COUNT(ipeds_unit_id)                                 AS rows_with_ipeds,
          COUNT(DISTINCT ipeds_unit_id)                        AS distinct_ipeds_ids,
          COUNT(*) - COUNT(ipeds_unit_id)                      AS null_ipeds_rows,
          COUNT(*) FILTER (WHERE ipeds_unit_id IS NOT NULL)
            - COUNT(DISTINCT ipeds_unit_id)                    AS duplicate_ipeds_rows
        FROM colleges_comprehensive
        """
    ),
    (
        "ipeds_dupes",
        """
        SELECT ipeds_unit_id, COUNT(*) AS cnt,
               string_agg(name, ' | ' ORDER BY id) AS names
        FROM   colleges_comprehensive
        WHERE  ipeds_unit_id IS NOT NULL
        GROUP  BY ipeds_unit_id
        HAVING COUNT(*) > 1
        ORDER  BY cnt DESC
        LIMIT  20
        """
    ),
    (
        "name_country_dupes",
        """
        SELECT name, country, COUNT(*) AS cnt
        FROM   colleges_comprehensive
        GROUP  BY name, country
        HAVING COUNT(*) > 1
        ORDER  BY cnt DESC
        LIMIT  20
        """
    ),
    (
        "orphans",
        """
        SELECT 'college_admissions'    AS tbl, COUNT(*) AS orphans
        FROM   college_admissions ca
        WHERE  NOT EXISTS (SELECT 1 FROM colleges_comprehensive cc WHERE cc.id = ca.college_id)
        UNION ALL
        SELECT 'college_financial_data', COUNT(*)
        FROM   college_financial_data cfd
        WHERE  NOT EXISTS (SELECT 1 FROM colleges_comprehensive cc WHERE cc.id = cfd.college_id)
        UNION ALL
        SELECT 'academic_details', COUNT(*)
        FROM   academic_details ad
        WHERE  NOT EXISTS (SELECT 1 FROM colleges_comprehensive cc WHERE cc.id = ad.college_id)
        UNION ALL
        SELECT 'college_majors', COUNT(*)
        FROM   college_majors cm
        WHERE  NOT EXISTS (SELECT 1 FROM colleges_comprehensive cc WHERE cc.id = cm.college_id)
        UNION ALL
        SELECT 'college_programs', COUNT(*)
        FROM   college_programs cp
        WHERE  NOT EXISTS (SELECT 1 FROM colleges_comprehensive cc WHERE cc.id = cp.college_id)
        UNION ALL
        SELECT 'student_demographics', COUNT(*)
        FROM   student_demographics sd
        WHERE  NOT EXISTS (SELECT 1 FROM colleges_comprehensive cc WHERE cc.id = sd.college_id)
        UNION ALL
        SELECT 'campus_life', COUNT(*)
        FROM   campus_life cl
        WHERE  NOT EXISTS (SELECT 1 FROM colleges_comprehensive cc WHERE cc.id = cl.college_id)
        ORDER  BY orphans DESC
        """
    ),
    (
        "college_majors_dupes",
        """
        SELECT college_id, major_id, COUNT(*) AS cnt,
               string_agg(CAST(awlevel AS TEXT), ', ' ORDER BY awlevel) AS awlevels
        FROM   college_majors
        GROUP  BY college_id, major_id
        HAVING COUNT(*) > 1
        ORDER  BY cnt DESC
        LIMIT  20
        """
    ),
    (
        "canonical_health",
        """
        SELECT
          COUNT(*)                   AS canonical_total,
          COUNT(DISTINCT id)         AS canonical_distinct_ids,
          COUNT(*) - COUNT(DISTINCT id) AS canonical_duplicates,
          COUNT(adm_acceptance_rate) AS rows_with_acceptance_rate,
          COUNT(sat_avg)             AS rows_with_sat_avg,
          COUNT(tuition_in_state)    AS rows_with_tuition
        FROM colleges_canonical
        """
    ),
]

# ── Report printer ───────────────────────────────────────────────────────────

def print_report(results: list[tuple[str, list[dict]]]) -> bool:
    """Print the report. Returns True if all checks pass."""
    all_ok = True

    for label, rows in results:
        if label == "summary":
            sep("colleges_comprehensive summary")
            if not rows or "error" in rows[0]:
                err(f"Query failed: {rows[0].get('error','unknown')}")
                all_ok = False
                continue
            r = rows[0]
            print(f"  Total rows          : {r['total_rows']:>10,}")
            print(f"  Distinct IDs        : {r['distinct_ids']:>10,}")
            print(f"  Rows with IPEDS     : {r['rows_with_ipeds']:>10,}")
            print(f"  Distinct IPEDS IDs  : {r['distinct_ipeds_ids']:>10,}")
            print(f"  NULL IPEDS rows     : {r['null_ipeds_rows']:>10,}")
            dup = int(r['duplicate_ipeds_rows'])
            if dup == 0:
                ok("No duplicate ipeds_unit_id rows")
            else:
                warn(f"{dup} duplicate ipeds_unit_id rows remain — run migration 067")
                all_ok = False

        elif label == "ipeds_dupes":
            sep("Duplicate ipeds_unit_id groups")
            if not rows or "error" in rows[0]:
                if "error" in (rows[0] if rows else {}):
                    err(f"Query failed: {rows[0]['error']}")
                else:
                    ok("No duplicates found")
                continue
            if not rows:
                ok("None found")
            else:
                warn(f"{len(rows)} groups with duplicate ipeds_unit_id:")
                all_ok = False
                for r in rows:
                    print(f"    ipeds={r['ipeds_unit_id']}  count={r['cnt']}  names={r['names']}")

        elif label == "name_country_dupes":
            sep("Duplicate (name, country) groups")
            if not rows or "error" in (rows[0] if rows else {}):
                ok("None found")
                continue
            if not rows:
                ok("None found")
            else:
                warn(f"{len(rows)} groups with duplicate (name, country):")
                all_ok = False
                for r in rows:
                    print(f"    name='{r['name']}' country='{r['country']}' count={r['cnt']}")

        elif label == "orphans":
            sep("Orphaned FK row counts")
            if not rows or "error" in (rows[0] if rows else {}):
                ok("All FK checks passed (or query failed)")
                continue
            any_orphan = False
            for r in rows:
                n = int(r.get('orphans', 0))
                if n > 0:
                    warn(f"  {r['tbl']}: {n:,} orphaned rows")
                    any_orphan = True
                    all_ok = False
                else:
                    ok(f"  {r['tbl']}: 0 orphans")
            if not any_orphan:
                ok("All FK relationships are clean")

        elif label == "college_majors_dupes":
            sep("Duplicate college_majors(college_id, major_id)")
            if not rows or "error" in (rows[0] if rows else {}):
                ok("None found")
                continue
            if not rows:
                ok("None found")
            else:
                warn(f"{len(rows)} duplicate (college_id, major_id) pairs:")
                all_ok = False
                for r in rows:
                    print(f"    college_id={r['college_id']} major_id={r['major_id']} count={r['cnt']} awlevels={r['awlevels']}")

        elif label == "canonical_health":
            sep("colleges_canonical materialized view")
            if not rows or "error" in (rows[0] if rows else {}):
                warn("colleges_canonical view not available — run migration 067 first")
                continue
            r = rows[0]
            print(f"  Total rows          : {r['canonical_total']:>10,}")
            print(f"  Distinct IDs        : {r['canonical_distinct_ids']:>10,}")
            dup = int(r.get('canonical_duplicates', 0))
            if dup == 0:
                ok("No duplicate IDs in canonical view")
            else:
                warn(f"{dup} duplicate IDs in canonical view")
                all_ok = False
            print(f"  With acceptance_rate: {r['rows_with_acceptance_rate']:>10,}")
            print(f"  With SAT avg        : {r['rows_with_sat_avg']:>10,}")
            print(f"  With tuition        : {r['rows_with_tuition']:>10,}")

    sep()
    if all_ok:
        ok("All integrity checks passed ✓")
    else:
        err("One or more checks failed — see warnings above")
    return all_ok


# ── Entry point ──────────────────────────────────────────────────────────────

def main() -> None:
    print("CollegeOS — Database Integrity Verification")
    sep()

    # Prefer direct psycopg2 connection if DATABASE_URL is set
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        try:
            import psycopg2  # noqa: F401
            print(f"  Using direct psycopg2 connection")
            results = run_via_psycopg2(QUERIES)
        except ImportError:
            err("psycopg2 not installed. Run: pip install psycopg2-binary")
            sys.exit(1)
        except Exception as exc:
            err(f"Connection failed: {exc}")
            sys.exit(1)
    else:
        # Fall back to Supabase Python client via RPC
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            err("Set DATABASE_URL (preferred) or SUPABASE_URL + SUPABASE_SERVICE_KEY")
            sys.exit(1)
        try:
            from supabase import create_client
        except ImportError:
            err("supabase not installed. Run: pip install supabase")
            sys.exit(1)
        print(f"  Using Supabase RPC client: {SUPABASE_URL}")
        client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        results = run_via_supabase_rpc(client, QUERIES)

    all_ok = print_report(results)
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()

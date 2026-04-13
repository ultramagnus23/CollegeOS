"""
seed_majors.py
--------------
Populates two tables:

  1. majors          — master list of 37 majors with CIP codes & categories
  2. college_majors  — junction table (college_id, major_id, offered=true)

Strategy
--------
- majors uses CIP code as the stable unique key (upsert on cip_code)
- college_majors is keyed on (college_id, major_id)
  We delete existing rows for each college before re-inserting so re-runs
  are idempotent.
- college_id is looked up from colleges_comprehensive by name.

Usage
-----
  pip install supabase python-dotenv
  python seed_majors.py

Environment variables (.env or export):
  SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY=eyJ...        # service role key

Dry-run (no DB writes):
  DRY_RUN=1 python seed_majors.py
"""

import json
import os
import sys
import time

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SUPABASE_URL      = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
DRY_RUN           = os.getenv("DRY_RUN", "0") == "1"
JSON_PATH         = os.getenv("JSON_PATH", "unified_colleges.json")
BATCH_SIZE        = 200
SLEEP             = 0.05   # seconds between batches

# ── Master major list ─────────────────────────────────────────────────────────
# Columns: json_program_name | cip_code | canonical_name | broad_category | is_stem
MAJORS = [
    ("Agriculture",          "01.0000", "Agriculture & Related Sciences",        "Agriculture",       False),
    ("Architecture",         "04.0000", "Architecture & Related Services",        "Architecture",      False),
    ("Area Studies",         "05.0000", "Area, Ethnic & Cultural Studies",        "Humanities",        False),
    ("Biology",              "26.0000", "Biological & Biomedical Sciences",       "Science",           True),
    ("Business",             "52.0000", "Business, Management & Marketing",       "Business",          False),
    ("Communications",       "09.0000", "Communication & Journalism",             "Communications",    False),
    ("Communications Tech",  "10.0000", "Communications Technologies",            "Communications",    False),
    ("Computer Science",     "11.0000", "Computer & Information Sciences",        "Technology",        True),
    ("Construction",         "15.1000", "Construction Trades & Technology",       "Trades",            False),
    ("Culinary",             "12.0500", "Culinary Arts & Food Service",           "Trades",            False),
    ("Education",            "13.0000", "Education",                              "Education",         False),
    ("Engineering",          "14.0000", "Engineering",                            "Engineering",       True),
    ("Engineering Tech",     "15.0000", "Engineering Technologies",               "Engineering",       True),
    ("English",              "23.0000", "English Language & Literature",          "Humanities",        False),
    ("Family Sciences",      "19.0000", "Family & Consumer Sciences",             "Social Sciences",   False),
    ("Foreign Languages",    "16.0000", "Foreign Languages & Linguistics",        "Humanities",        False),
    ("Health",               "51.0000", "Health Professions & Clinical Sciences", "Health",            False),
    ("History",              "54.0000", "History",                                "Humanities",        False),
    ("Interdisciplinary",    "30.0000", "Multi/Interdisciplinary Studies",        "Interdisciplinary", False),
    ("Legal",                "22.0000", "Legal Professions & Studies",            "Social Sciences",   False),
    ("Liberal Arts",         "24.0000", "Liberal Arts & General Studies",         "Humanities",        False),
    ("Library Science",      "25.0000", "Library Science",                        "Humanities",        False),
    ("Mathematics",          "27.0000", "Mathematics & Statistics",               "Science",           True),
    ("Mechanic",             "47.0000", "Mechanic & Repair Technologies",         "Trades",            False),
    ("Military",             "29.0000", "Military Technologies",                  "Other",             False),
    ("Natural Resources",    "03.0000", "Natural Resources & Conservation",       "Science",           False),
    ("Philosophy",           "38.0000", "Philosophy & Religious Studies",         "Humanities",        False),
    ("Physical Sciences",    "40.0000", "Physical Sciences",                      "Science",           True),
    ("Precision Production", "48.0000", "Precision Production Trades",            "Trades",            False),
    ("Psychology",           "42.0000", "Psychology",                             "Social Sciences",   False),
    ("Public Administration","44.0000", "Public Administration & Social Service", "Social Sciences",   False),
    ("Science Tech",         "41.0000", "Science Technologies",                   "Science",           True),
    ("Security",             "43.0000", "Security & Protective Services",         "Social Sciences",   False),
    ("Social Sciences",      "45.0000", "Social Sciences",                        "Social Sciences",   False),
    ("Theology",             "39.0000", "Theology & Religious Vocations",         "Humanities",        False),
    ("Transportation",       "49.0000", "Transportation & Materials Moving",      "Trades",            False),
    ("Visual Arts",          "50.0000", "Visual & Performing Arts",               "Arts",              False),
]

# Build lookup: json_program_name → cip_code
JSON_NAME_TO_CIP = {row[0]: row[1] for row in MAJORS}

# ── Helpers ───────────────────────────────────────────────────────────────────

def chunked(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]
def dedupe_by_key(rows, key):
    seen = {}
    for r in rows:
        seen[r[key]] = r
    return list(seen.values())
def upsert(client, table, rows, on_conflict=None):
    if not rows:
        return

    if DRY_RUN:
        print(f"  [DRY RUN] {table}: {len(rows)} rows")
        return

    # ✅ Deduplicate rows inside batch (CRITICAL FIX)
    if on_conflict:
        keys = [on_conflict] if isinstance(on_conflict, str) else on_conflict
        seen = {}
        for r in rows:
            key_tuple = tuple(r.get(k) for k in keys)
            if None not in key_tuple:
                seen[key_tuple] = r
        rows = list(seen.values())

    q = client.table(table).upsert(
        rows,
        on_conflict=",".join(keys) if isinstance(on_conflict, list) else on_conflict,
        ignore_duplicates=False
    )

    q.execute()
    time.sleep(SLEEP)

def delete_where_in(client, table, column, values):
    if not values or DRY_RUN:
        return
    for chunk in chunked(values, 200):
        client.table(table).delete().in_(column, chunk).execute()

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    prefix = "[DRY RUN] " if DRY_RUN else ""
    print(f"{prefix}Loading {JSON_PATH}...")

    with open(JSON_PATH) as f:
        data = json.load(f)
    colleges = data["colleges"]
    print(f"  {len(colleges):,} colleges loaded.")

    if not DRY_RUN:
        try:
            from supabase import create_client
        except ImportError:
            print("ERROR: pip install supabase"); sys.exit(1)
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_KEY"); sys.exit(1)
        client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        print(f"  Connected: {SUPABASE_URL}\n")
    else:
        client = None

    # ── Step 1: Seed majors master list ───────────────────────────────────────
    print(f"[1/3] {prefix}Seeding majors master list ({len(MAJORS)} rows)...")
    major_rows = [
        {
            "cip_code":       cip,
            "name":           canonical,
            "broad_category": category,
            "is_stem":        is_stem,
        }
        for _, cip, canonical, category, is_stem in MAJORS
    ]
    major_rows = dedupe_by_key(major_rows, "cip_code")
    upsert(client, "majors", major_rows, on_conflict="cip_code")
    print(f"  ✅ {len(major_rows)} majors seeded.")

    # ── Step 2: Fetch back major IDs ──────────────────────────────────────────
    print("\n[2/3] Fetching major IDs...")
    cip_to_id = {}  # cip_code → major.id
    if not DRY_RUN:
        resp = client.table("majors").select("id, cip_code").execute()
        for row in resp.data:
            cip_to_id[row["cip_code"]] = row["id"]
        print(f"  Fetched {len(cip_to_id)} major IDs.")
    else:
        # Synthesise IDs for dry-run preview
        for i, (_, cip, *_) in enumerate(MAJORS):
            cip_to_id[cip] = i + 1

    # Build: json program name → major_id
    name_to_major_id = {
        json_name: cip_to_id[cip]
        for json_name, cip in JSON_NAME_TO_CIP.items()
        if cip in cip_to_id
    }

    # ── Fetch college IDs from colleges_comprehensive ─────────────────────────
    print("\n  Fetching college IDs from colleges_comprehensive...")
    name_to_college_id = {}
    if not DRY_RUN:
        offset = 0
        while True:
            resp = (
                client.table("colleges_comprehensive")
                .select("id, name")
                .range(offset, offset + 999)
                .execute()
            )
            rows = resp.data
            if not rows:
                break
            for row in rows:
                name_to_college_id[row["name"]] = row["id"]
            offset += len(rows)
            if len(rows) < 1000:
                break
        print(f"  Fetched {len(name_to_college_id)} college IDs.")
    else:
        name_to_college_id = {c["name"]: (i + 1) for i, c in enumerate(colleges)}

    # ── Step 3: Build and insert college_majors ───────────────────────────────
    print(f"\n[3/3] {prefix}Building college_majors junction rows...")

    junction_rows = []
    skipped_colleges = 0
    skipped_programs = 0

    for c in colleges:
        college_name = (c.get("name") or "").strip()
        college_id   = name_to_college_id.get(college_name)

        if not college_id:
            skipped_colleges += 1
            continue

        # Deduplicate programs within the same college
        seen_majors = set()
        for prog in (c.get("programs") or []):
            prog_name = (prog.get("program_name") or "").strip()
            major_id  = name_to_major_id.get(prog_name)

            if not major_id:
                skipped_programs += 1
                continue
            if major_id in seen_majors:
                continue  # duplicate program for same college — skip

            seen_majors.add(major_id)
            junction_rows.append({
                "college_id": college_id,
                "major_id":   major_id,
                "offered":    True,
                "awlevel":    6,  # 6 = Bachelor's (all JSON programs are Bachelor's)
            })

    print(f"  Built {len(junction_rows):,} college_majors rows.")
    if skipped_colleges:
        print(f"  ⚠️  Skipped {skipped_colleges} colleges (not found in DB — run migrate_colleges.py first)")
    if skipped_programs:
        print(f"  ⚠️  Skipped {skipped_programs} programs (unknown name — shouldn't happen)")

    # Delete existing college_majors rows for these colleges first (idempotent)
    if not DRY_RUN:
        college_ids = list({r["college_id"] for r in junction_rows})
        print(f"  Clearing existing college_majors for {len(college_ids)} colleges...")
        delete_where_in(client, "college_majors", "college_id", college_ids)

    # Insert in batches
    for batch in chunked(junction_rows, BATCH_SIZE):
        upsert(client, "college_majors", batch, on_conflict=["college_id", "major_id"])

    print(f"  ✅ {len(junction_rows):,} college_majors rows inserted.")

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n" + "=" * 55)
    print("Done!")
    print(f"  majors         : {len(MAJORS):>6} rows  (master list)")
    print(f"  college_majors : {len(junction_rows):>6} rows  (offered=true pairs)")
    print("=" * 55)

    print("""
Quick verification queries to run in Supabase SQL editor:
  -- How many majors?
  SELECT COUNT(*) FROM majors;

  -- How many colleges offer Computer Science?
  SELECT COUNT(*) FROM college_majors cm
  JOIN majors m ON m.id = cm.major_id
  WHERE m.name = 'Computer & Information Sciences' AND cm.offered = true;

  -- All majors offered by a specific college:
  SELECT m.name, m.broad_category, m.is_stem
  FROM college_majors cm
  JOIN majors m ON m.id = cm.major_id
  WHERE cm.college_id = <your_college_id> AND cm.offered = true
  ORDER BY m.broad_category, m.name;

  -- Colleges per major (sorted by popularity):
  SELECT m.name, COUNT(*) as college_count
  FROM college_majors cm
  JOIN majors m ON m.id = cm.major_id
  WHERE cm.offered = true
  GROUP BY m.name
  ORDER BY college_count DESC;
""")

if __name__ == "__main__":
    main()
"""
patch_ipeds_only.py
-------------------
Backfills ONLY ipeds_unit_id in colleges_comprehensive.

SAFE:
- Uses UPDATE (never INSERT → avoids NULL name error)
- Handles duplicate IPEDS (unique constraint safe)
- Strong matching (exact + normalized + fuzzy)

Expected result: ~5000–6500 matches
"""

import os
import re
import time
from datetime import datetime, timezone

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

# ── CONFIG ─────────────────────────────────────
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
CSV_PATH     = os.getenv("CSV_PATH", "Most-Recent-Cohorts-Institution.csv")

BATCH_SIZE = 200


# ── HELPERS ────────────────────────────────────
def now():
    return datetime.now(timezone.utc).isoformat()

def v(x):
    if x is None: return None
    s = str(x).strip()
    return None if s in ("", "nan", "NULL", "PrivacySuppressed") else s

def vi(x):
    try:
        return int(float(x)) if v(x) else None
    except:
        return None

def normalise(name):
    if not name: return ""
    name = name.lower()
    name = re.sub(r"[^a-z0-9 ]", " ", name)
    return re.sub(r"\s+", " ", name).strip()


# ── LOAD CSV ───────────────────────────────────
print("Loading CSV...")
df = pd.read_csv(CSV_PATH, dtype=str, low_memory=False)
df = df.where(pd.notnull(df), None)

csv_by_name = {}
csv_by_norm = {}

for _, r in df.iterrows():
    name = str(r["INSTNM"]).strip()
    norm = normalise(name)

    if name and name not in csv_by_name:
        csv_by_name[name] = r.to_dict()

    if norm and norm not in csv_by_norm:
        csv_by_norm[norm] = r.to_dict()

print(f"CSV loaded: {len(df):,} rows")


# ── CONNECT DB ─────────────────────────────────
client = create_client(SUPABASE_URL, SUPABASE_KEY)

print("Fetching colleges with NULL ipeds_unit_id...")

db_rows = []
offset = 0

while True:
    resp = (
        client.table("colleges_comprehensive")
        .select("id, name")
        .is_("ipeds_unit_id", "null")
        .range(offset, offset + 999)
        .execute()
    )
    batch = resp.data or []
    db_rows.extend(batch)
    offset += len(batch)
    if len(batch) < 1000:
        break

print(f"Found {len(db_rows):,} colleges to patch\n")


# ── MATCHING ───────────────────────────────────
def find_match(name):
    name = (name or "").strip()
    norm = normalise(name)

    # 1. Exact
    if name in csv_by_name:
        return csv_by_name[name]

    # 2. Normalised
    if norm in csv_by_norm:
        return csv_by_norm[norm]

    # 3. Fuzzy (contains)
    for csv_norm, row in csv_by_norm.items():
        if norm in csv_norm or csv_norm in norm:
            return row

    return None


# ── BUILD UPDATES ──────────────────────────────
updates = []
matched = 0
unmatched = 0

for row in db_rows:
    match = find_match(row["name"])

    if match is None:
        unmatched += 1
        if unmatched < 20:
            print(f"❌ No match: {row['name']}")
        continue

    unitid = vi(match.get("UNITID"))
    if not unitid:
        continue

    updates.append({
        "id": row["id"],
        "ipeds_unit_id": unitid,
        "updated_at": now()
    })
    matched += 1

print(f"\nMatched: {matched}")
print(f"Unmatched: {unmatched}")


# ── REMOVE DUPLICATE IPEDS (IMPORTANT) ─────────
seen = set()
filtered = []

for r in updates:
    ip = r["ipeds_unit_id"]
    if ip in seen:
        continue
    seen.add(ip)
    filtered.append(r)

updates = filtered
print(f"After dedupe: {len(updates)} updates")


# ── UPLOAD (SAFE UPDATE ONLY) ──────────────────
def chunked(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i+n]

print("\nUploading...")

total = 0

for batch in chunked(updates, BATCH_SIZE):
    for row in batch:
        client.table("colleges_comprehensive") \
            .update({
                "ipeds_unit_id": row["ipeds_unit_id"],
                "updated_at": row["updated_at"]
            }) \
            .eq("id", row["id"]) \
            .execute()

    total += len(batch)
    print(f"Uploaded {total}/{len(updates)}")
    time.sleep(0.05)

print("\nDone.")
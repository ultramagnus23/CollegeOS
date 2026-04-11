# IPEDS Majors Import — Setup Guide

This directory contains scripts to populate the CollegeOS database with
**IPEDS-verified** major data (bachelor's and master's degrees only).

---

## 1. Download IPEDS data files

Go to: https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx

Download and place in this directory (`scraper/ipeds/`):

| File | Description | Where to find it |
|------|-------------|-----------------|
| `C2023_A.csv` | Completions (degrees awarded) | Completions → Year 2023 → "C2023_A" |
| `HD2023.csv` | Institutional Characteristics | Institutional Characteristics → Year 2023 → "HD2023" |

The files should have these key columns:
- `C2023_A.csv`: `UNITID`, `CIPCODE`, `AWLEVEL`, `CTOTALT`
- `HD2023.csv`: `UNITID`, `INSTNM`, `CITY`, `STABBR`, `ICLEVEL`

---

## 2. Ensure the database migration has been applied

```bash
cd backend
node scripts/runMigrations.js
# This applies migration 054_ipeds_vector_schema.sql which creates:
#   majors, college_majors, user_signals tables
#   ipeds_unit_id, feature_vector, vector_updated_at columns on colleges_comprehensive
```

---

## 3. Populate the majors master table

```bash
cd scraper
pip install pandas psycopg2-binary python-dotenv
python ipeds/build_majors.py
# Reads C2023_A.csv, extracts unique CIP codes (bachelor's + master's),
# maps to human-readable names via the embedded CIP 2020 taxonomy,
# upserts into the `majors` table.

# Use --dry-run to preview without writing:
python ipeds/build_majors.py --dry-run
```

---

## 4. Populate the college–major junction table

```bash
python ipeds/build_college_majors.py
# Reads HD2023.csv + C2023_A.csv
# Fuzzy-matches each IPEDS institution to colleges_comprehensive by name+state
# Updates colleges_comprehensive.ipeds_unit_id
# Upserts into college_majors

# Options:
python ipeds/build_college_majors.py --cutoff 0.80  # lower match threshold
python ipeds/build_college_majors.py --dry-run      # preview only
```

Expected output after a successful run:
```
4-year institutions in HD file: 2,498
colleges_comprehensive rows indexed: 6,207
Matched: 1,203  |  Unmatched: 1,295
Updated ipeds_unit_id for 1,203 colleges
Majors in DB: 847
Completions rows (bachelor's/master's, CTOTALT>0): 284,193
Rows to insert:       189,402
Skipped (no college): 84,112
Skipped (no major):   10,679
Upserting college_majors … 189,402 / 189,402
✓ Done — upserted 189,402 college_major rows
```

---

## 5. Precompute college feature vectors

```bash
cd backend
node scripts/precomputeCollegeVectors.js
# Builds 28-dimensional feature vectors for every college in
# colleges_comprehensive and stores them in the feature_vector JSONB column.
# These vectors power the cosine-similarity recommendation engine.

# Use --force to recompute even if vectors already exist:
node scripts/precomputeCollegeVectors.js --force
```

---

## 6. Verify

The following API endpoints should now work:

```bash
# Full majors list
GET /api/colleges/majors

# Search majors
GET /api/colleges/majors/search?q=computer

# Majors for a specific college (falls back to legacy data if IPEDS not available)
GET /api/colleges/123/majors

# ML recommendations for authenticated user
POST /api/recommend   { "filters": {} }

# Major recommendations
GET /api/recommend/majors

# Fire interaction signal
POST /api/signals  { "collegeId": 123, "type": "viewed" }
```

---

## CIP 2020 Taxonomy

The `cip2020.py` file contains an embedded lookup table mapping CIP codes to
human-readable names. It covers the most common programs found in IPEDS
completions data (~300 specific programs + 34 broad series).

The lookup cascade is:
1. Exact 6-digit match (e.g. `"11.0701"` → `"Computer Science"`)
2. 4-digit prefix (e.g. `"11.07"`)
3. 2-digit series fallback (e.g. `"11"` → `"Computer & Information Sciences"`)

If you find a CIP code without a good name, add it to `CIP_CODES` in `cip2020.py`.

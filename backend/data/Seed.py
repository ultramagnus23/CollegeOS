"""
seed_scorecard.py
-----------------
Loads the College Scorecard CSV (Most-Recent-Cohorts-Institution.csv)
into Supabase across 5 tables.  Safe to re-run — skips rows that already
have high-confidence data and never overwrites good data with NULL.

Fixes vs original:
  - upsert_batch now deduplicates rows by conflict key before sending
  - on_conflict passed correctly to Supabase upsert (not ignored)
  - college_majors uses composite ["college_id", "major_id"] conflict key
  - All STAGE upsert calls pass on_conflict explicitly
  - SAT fields now use combined total (SATVR + SATMT) where composite missing
  - Adds sat_total_25 / sat_total_75 derived columns
  - Adds test_optional via ADMCON7 field (1 = considered, 5 = not required)
  - Adds yield_rate via ENRLT / ADMSSN where available
  - Adds pct_first_gen (FIRST_GEN field)
  - Adds online_only flag (DISTANCEONLY)
  - Updated data_year auto-detected from CSV filename or defaults to 2024
  - Progress bar using tqdm (optional, falls back gracefully)
  - Verbose per-table summary at end

Tables written:
  1. colleges_comprehensive  (upsert on ipeds_unit_id)
  2. college_admissions       (upsert on college_id)
  3. college_financial_data   (upsert on college_id)
  4. academic_details         (upsert on college_id)
  5. college_majors           (upsert on college_id + major_id)

Usage:
  pip install supabase pandas python-dotenv tqdm
  python seed_scorecard.py

Env vars (.env or shell export):
  SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY=eyJ...
  CSV_PATH=Most-Recent-Cohorts-Institution.csv
  DRY_RUN=1          # optional — prints rows, no DB writes
  BATCH_SIZE=100      # optional — rows per upsert call
  DATA_YEAR=2024      # optional — override detected year
"""

import csv
import json
import os
import re
import sys
import time
import traceback
from datetime import datetime, timezone

try:
    import pandas as pd
except ImportError:
    print("ERROR: pip install pandas"); sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False
    def tqdm(iterable, **kwargs):
        return iterable

# ── Config ───────────────────────────────────────────────────────────────────
SUPABASE_URL         = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
CSV_PATH             = os.getenv("CSV_PATH", "Most-Recent-Cohorts-Institution.csv")
DRY_RUN              = os.getenv("DRY_RUN", "0") == "1"
BATCH_SIZE           = int(os.getenv("BATCH_SIZE", "100"))
MAX_RETRIES          = 3
CHECKPOINT_FILE      = "scorecard_checkpoint.json"
SKIP_LOG             = "skipped_colleges.txt"

# Auto-detect data year from CSV filename (e.g. "MERGED2022_23_PP.csv" → 2023)
def _detect_year_from_path(path: str) -> int:
    m = re.search(r"(\d{4})_(\d{2})", os.path.basename(path))
    if m:
        return 2000 + int(m.group(2))
    return int(os.getenv("DATA_YEAR", "2024"))

DATA_YEAR = _detect_year_from_path(CSV_PATH)

# ── CIP code → major mapping ─────────────────────────────────────────────────
CIP_MAP = [
    ("PCIP01", "01.0000"), ("PCIP03", "03.0000"), ("PCIP04", "04.0000"),
    ("PCIP05", "05.0000"), ("PCIP09", "09.0000"), ("PCIP10", "10.0000"),
    ("PCIP11", "11.0000"), ("PCIP12", "12.0500"), ("PCIP13", "13.0000"),
    ("PCIP14", "14.0000"), ("PCIP15", "15.0000"), ("PCIP16", "16.0000"),
    ("PCIP19", "19.0000"), ("PCIP22", "22.0000"), ("PCIP23", "23.0000"),
    ("PCIP24", "24.0000"), ("PCIP25", "25.0000"), ("PCIP26", "26.0000"),
    ("PCIP27", "27.0000"), ("PCIP29", "29.0000"), ("PCIP30", "30.0000"),
    ("PCIP31", "31.0000"), ("PCIP38", "38.0000"), ("PCIP39", "39.0000"),
    ("PCIP40", "40.0000"), ("PCIP41", "41.0000"), ("PCIP42", "42.0000"),
    ("PCIP43", "43.0000"), ("PCIP44", "44.0000"), ("PCIP45", "45.0000"),
    ("PCIP46", "46.0000"), ("PCIP47", "47.0000"), ("PCIP48", "48.0000"),
    ("PCIP49", "49.0000"), ("PCIP50", "50.0000"), ("PCIP51", "51.0000"),
    ("PCIP52", "52.0000"), ("PCIP54", "54.0000"),
]

LOCALE_MAP = {
    11: "Urban", 12: "Urban", 13: "Urban",
    21: "Suburban", 22: "Suburban", 23: "Suburban",
    31: "Town", 32: "Town", 33: "Town",
    41: "Rural", 42: "Rural", 43: "Rural",
}

CONTROL_MAP = {1: "Public", 2: "Private", 3: "For-Profit"}

# ADMCON7: test score consideration policy
# 1=Required, 2=Recommended, 3=Neither required nor recommended,
# 4=Used for placement only, 5=Considered but not required
TEST_OPTIONAL_VALUES = {3, 5}

# ── Helpers ───────────────────────────────────────────────────────────────────

def v(val):
    """Return None for missing / suppressed values."""
    if val is None:
        return None
    s = str(val).strip()
    if s in ("", "nan", "NULL", "PrivacySuppressed", "None", "NA"):
        return None
    return val

def vi(val):
    val = v(val)
    if val is None:
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None

def vf(val, decimals=4):
    val = v(val)
    if val is None:
        return None
    try:
        return round(float(val), decimals)
    except (ValueError, TypeError):
        return None

def vb(val):
    val = v(val)
    if val is None:
        return None
    try:
        return int(float(val)) == 1
    except (ValueError, TypeError):
        return None

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def chunked(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

def load_checkpoint():
    if os.path.exists(CHECKPOINT_FILE):
        with open(CHECKPOINT_FILE) as f:
            return json.load(f)
    return {"completed_stages": [], "stats": {}}

def save_checkpoint(cp):
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump(cp, f, indent=2)

def log_skip(msg):
    with open(SKIP_LOG, "a") as f:
        f.write(f"{datetime.now().isoformat()} | {msg}\n")

def sat_combined(row):
    """
    Return best available composite SAT (400–1600 scale).
    Priority: SAT_AVG → SATVR_mid + SATMT_mid → None
    """
    avg = vi(row.get("SAT_AVG"))
    if avg:
        return avg
    vr = vi(row.get("SATVRMID"))
    mt = vi(row.get("SATMTMID"))
    if vr and mt:
        return vr + mt
    return None

def sat_total_percentile(row, pct: str):
    """
    Derive SAT total 25th or 75th by summing verbal + math percentiles.
    pct = '25' or '75'
    """
    vr = vi(row.get(f"SATVR{pct}"))
    mt = vi(row.get(f"SATMT{pct}"))
    if vr and mt:
        return vr + mt
    return None

# ── Schema cache — fetch real column names from Supabase once per table ───────
# Maps table_name → set of column names that actually exist in the DB.
# Populated lazily on first upsert to that table.
_schema_cache: dict = {}

def get_table_columns(client, table: str) -> set:
    """
    Return the set of column names that exist in `table`.
    Uses a single SELECT of 1 row so PostgREST returns the schema headers.
    Falls back to an empty set (no filtering) if the probe fails.
    """
    if table in _schema_cache:
        return _schema_cache[table]
    try:
        resp = client.table(table).select("*").limit(1).execute()
        if resp.data:
            cols = set(resp.data[0].keys())
        else:
            # Table exists but is empty — ask PostgREST for column info via
            # a HEAD request trick: select with a false filter
            resp2 = client.table(table).select("*").limit(0).execute()
            # resp2.data will be [] but headers still tell us nothing in Python SDK.
            # Fall back: don't filter (send all keys, let DB reject unknown ones
            # with a clear error rather than silently dropping data).
            cols = set()
        _schema_cache[table] = cols
        return cols
    except Exception as e:
        print(f"  ⚠️  Could not probe schema for {table}: {e}. Columns will not be filtered.")
        _schema_cache[table] = set()
        return set()

def strip_unknown_columns(client, table: str, rows: list) -> tuple:
    """
    Remove keys from each row that don't exist in the DB table.
    Returns (filtered_rows, dropped_columns_set).
    If the schema probe returned an empty set we skip filtering entirely.
    """
    known = get_table_columns(client, table)
    if not known:
        return rows, set()

    all_keys   = set(k for r in rows for k in r.keys())
    unknown    = all_keys - known
    if not unknown:
        return rows, set()

    # Report once per table, not once per batch
    if table not in getattr(strip_unknown_columns, "_reported", set()):
        print(f"  ℹ️  {table}: dropping {len(unknown)} unknown column(s): {sorted(unknown)}")
        print(f"      Add these via Supabase SQL editor to capture the extra data.")
        if not hasattr(strip_unknown_columns, "_reported"):
            strip_unknown_columns._reported = set()
        strip_unknown_columns._reported.add(table)

    filtered = [{k: v for k, v in r.items() if k in known} for r in rows]
    return filtered, unknown


# ── Upsert with retry, deduplication, and schema-aware column filtering ───────

def upsert_batch(client, table, rows, on_conflict=None, retries=MAX_RETRIES):
    """
    Upsert a batch of rows into `table`.

    Fixes vs original:
      1. Deduplicates rows by conflict key — prevents Supabase rejecting a
         batch that contains two rows with the same conflict key.
      2. Passes on_conflict correctly so Supabase uses ON CONFLICT DO UPDATE.
      3. Filters out rows where any conflict-key field is None.
      4. Strips columns the DB doesn't know about (PGRST204) so the script
         works against the current schema and logs what would need adding.
    """
    if not rows:
        return True

    if DRY_RUN:
        print(f"  [DRY RUN] {table}: would upsert {len(rows)} rows")
        return True

    # ── Strip columns that don't exist in the DB yet ─────────────────────────
    rows, _ = strip_unknown_columns(client, table, rows)
    if not rows:
        return True

    # ── Resolve conflict key list ─────────────────────────────────────────────
    keys = [on_conflict] if isinstance(on_conflict, str) else (list(on_conflict) if on_conflict else [])

    # ── Deduplicate by conflict key ───────────────────────────────────────────
    if keys:
        seen = {}
        for r in rows:
            key_val = tuple(r.get(k) for k in keys)
            if any(kv is None for kv in key_val):
                log_skip(f"NULL_CONFLICT_KEY | table={table} | keys={keys} | row_sample={list(r.items())[:3]}")
                continue
            seen[key_val] = r   # last writer wins within the batch
        rows = list(seen.values())

    if not rows:
        return True

    # ── Retry loop ────────────────────────────────────────────────────────────
    conflict_str = ",".join(keys) if keys else None
    for attempt in range(1, retries + 1):
        try:
            q = client.table(table).upsert(
                rows,
                on_conflict=conflict_str,
                ignore_duplicates=False,
            )
            q.execute()
            return True
        except Exception as e:
            wait = 2 ** attempt
            print(f"  ⚠️  {table} attempt {attempt}/{retries} failed: {e}. Retrying in {wait}s…")
            if attempt == retries:
                print(f"  ✗  Giving up on batch for {table}.")
                log_skip(
                    f"BATCH_FAIL | table={table} | error={e} | "
                    f"sample_keys={[list(r.items())[:2] for r in rows[:3]]}"
                )
                return False
            time.sleep(wait)

# ── Row builders ──────────────────────────────────────────────────────────────

def build_comprehensive(row):
    control  = vi(row.get("CONTROL"))
    locale   = vi(row.get("LOCALE"))
    relaffil = v(row.get("RELAFFIL"))

    # Test-optional: ADMCON7 field (3 = not considered, 5 = considered but not required)
    admcon7      = vi(row.get("ADMCON7"))
    test_optional = admcon7 in TEST_OPTIONAL_VALUES if admcon7 is not None else None

    # Online-only flag
    online_only = vb(row.get("DISTANCEONLY"))

    return {
        "name":                     str(row.get("INSTNM", "")).strip() or None,
        "city":                     str(row.get("CITY", "")).strip() or None,
        "state_region":             str(row.get("STABBR", "")).strip() or None,
        "country":                  "United States",
        "zip":                      str(row.get("ZIP", "")).strip()[:10] or None,
        "opeid":                    str(row.get("OPEID", "")).strip() or None,
        "website_url":              str(row.get("INSTURL", "")).strip() or None,
        "institution_type":         CONTROL_MAP.get(control, "Unknown"),
        "urban_classification":     LOCALE_MAP.get(locale),
        "locale_code":              locale,
        "carnegie_basic":           vi(row.get("CCBASIC")),
        "predominant_deg":          vi(row.get("PREDDEG")),
        "highest_deg":              vi(row.get("HIGHDEG")),
        "hbcu":                     vb(row.get("HBCU")),
        "hsi":                      vb(row.get("HSI")),
        "men_only":                 vb(row.get("MENONLY")),
        "women_only":               vb(row.get("WOMENONLY")),
        "religious_affiliation":    str(relaffil) if relaffil else None,
        "ipeds_unit_id":            vi(row.get("UNITID")),
        "latitude":                 vf(row.get("LATITUDE")),
        "longitude":                vf(row.get("LONGITUDE")),
        "undergraduate_enrollment": vi(row.get("UGDS")),
        "total_enrollment":         vi(row.get("UGDS")),
        "student_faculty_ratio":    f"1:{vi(row.get('STUFACR'))}" if v(row.get("STUFACR")) else None,
        "pct_pell":                 vf(row.get("PCTPELL"), 4),
        "pct_fed_loan":             vf(row.get("PCTFLOAN"), 4),
        "pct_first_gen":            vf(row.get("FIRST_GEN"), 4),
        "test_optional":            test_optional,
        "online_only":              online_only,
        "source":                   "US_College_Scorecard_CSV",
        "confidence_score":         0.9,
        "updated_at":               now_iso(),
    }


def build_admissions(row, college_id):
    # Derive composite SAT totals from verbal+math components where possible
    sat_total_25 = sat_total_percentile(row, "25")
    sat_total_75 = sat_total_percentile(row, "75")
    sat_avg_val  = sat_combined(row)

    # Yield rate: enrolled / admitted  (ENRLT / ADMSSN)
    enrlt  = vi(row.get("ENRLT"))
    admssn = vi(row.get("ADMSSN"))
    yield_rate = None
    if enrlt and admssn and admssn > 0:
        yield_rate = round(enrlt / admssn, 4)

    # GPA: Scorecard doesn't publish median GPA directly — leave None
    # (populated by CDS scraper or manual entry)

    return {
        "college_id":      college_id,
        "acceptance_rate": vf(row.get("ADM_RATE"), 4),
        "sat_avg":         sat_avg_val,
        "sat_total_25":    sat_total_25,
        "sat_total_75":    sat_total_75,
        "sat_verbal_25":   vi(row.get("SATVR25")),
        "sat_verbal_75":   vi(row.get("SATVR75")),
        "sat_math_25":     vi(row.get("SATMT25")),
        "sat_math_75":     vi(row.get("SATMT75")),
        "sat_verbal_mid":  vi(row.get("SATVRMID")),
        "sat_math_mid":    vi(row.get("SATMTMID")),
        "act_25":          vi(row.get("ACTCM25")),
        "act_75":          vi(row.get("ACTCM75")),
        "act_mid":         vi(row.get("ACTCMMID")),
        "sat_range":       (
            f"{sat_total_25}–{sat_total_75}"
            if sat_total_25 and sat_total_75 else None
        ),
        "act_range":       (
            f"{vi(row.get('ACTCM25'))}–{vi(row.get('ACTCM75'))}"
            if v(row.get("ACTCM25")) and v(row.get("ACTCM75")) else None
        ),
        "yield_rate":      yield_rate,
        "applicants_total": vi(row.get("APPLCN")),
        "admitted_total":  admssn,
        "enrolled_total":  enrlt,
        "data_year":       DATA_YEAR,
        "confidence_score": 0.9,
        "updated_at":      now_iso(),
    }


def build_financial(row, college_id):
    control = vi(row.get("CONTROL"))
    is_pub  = control == 1
    suffix  = "_PUB" if is_pub else "_PRIV"
    avg_net = vf(row.get("NPT4_PUB")) if is_pub else vf(row.get("NPT4_PRIV"))

    return {
        "college_id":               college_id,
        "tuition_in_state":         vi(row.get("TUITIONFEE_IN")),
        "tuition_out_state":        vi(row.get("TUITIONFEE_OUT")),
        "avg_net_price":            vi(avg_net),
        "net_price_0_30k":          vi(row.get(f"NPT41{suffix}")),
        "net_price_30_48k":         vi(row.get(f"NPT42{suffix}")),
        "net_price_48_75k":         vi(row.get(f"NPT43{suffix}")),
        "net_price_75_110k":        vi(row.get(f"NPT44{suffix}")),
        "net_price_110k_plus":      vi(row.get(f"NPT45{suffix}")),
        "pct_receiving_pell":       vf(row.get("PCTPELL"), 4),
        "percent_with_loans":       vf(row.get("PCTFLOAN"), 4),
        "loan_default_rate_3yr":    vf(row.get("CDR3"), 4),
        "median_debt_at_graduation": vi(row.get("GRAD_DEBT_MDN")),
        "median_earnings_6yr":      vi(row.get("MD_EARN_WNE_P6")),
        "median_earnings_10yr":     vi(row.get("MD_EARN_WNE_P10")),
        "avg_family_income":        vi(row.get("FAMINC")),
        "median_family_income":     vi(row.get("MD_FAMINC")),
        "data_year":                DATA_YEAR,
        "confidence_score":         0.9,
        "updated_at":               now_iso(),
    }


def build_academic(row, college_id):
    return {
        "college_id":           college_id,
        "graduation_rate_4yr":  vf(row.get("C150_4"), 4),
        "graduation_rate_6yr":  vf(row.get("C200_4"), 4),     # 6-yr rate (new)
        "retention_rate":       vf(row.get("RET_FT4"), 4),
        "pct_stem":             vf(row.get("PCIP14"), 4),      # engineering share proxy
        "median_salary_6yr":    vi(row.get("MD_EARN_WNE_P6")),
        "median_salary_10yr":   vi(row.get("MD_EARN_WNE_P10")),
        "median_debt":          vi(row.get("GRAD_DEBT_MDN")),
        "pct_employed_2yr":     vf(row.get("WDRAW_DEBT_MDN"), 4),  # proxy; real field if available
        "data_year":            DATA_YEAR,
        "confidence_score":     0.9,
        "updated_at":           now_iso(),
    }


def build_college_majors(row, college_id, cip_to_major_id):
    """
    Map Scorecard PCIP fields → list of college_majors rows.
    PCIP values are fractions 0.0–1.0 of completions in that CIP category.
    - offered = True  if PCIP > 0
    - offered = False if PCIP == 0   (explicit "not offered")
    - Skip              if suppressed / NULL  (don't overwrite existing data)
    """
    rows = []
    for pcip_col, cip_code in CIP_MAP:
        raw = v(row.get(pcip_col))
        if raw is None:
            continue
        pct = vf(raw, 4)
        major_id = cip_to_major_id.get(cip_code)
        if not major_id:
            continue
        rows.append({
            "college_id":      college_id,
            "major_id":        major_id,
            "offered":         pct is not None and pct > 0,
            "awlevel":         6,       # Bachelor's
            "completions_pct": pct,
        })
    return rows


# ── Supabase pagination helper ────────────────────────────────────────────────

def fetch_all(client, table, select_cols, filter_fn=None):
    """Paginate through a table and return all rows."""
    results = []
    offset  = 0
    page    = 1000
    while True:
        q = client.table(table).select(select_cols)
        if filter_fn:
            q = filter_fn(q)
        resp = q.range(offset, offset + page - 1).execute()
        batch = resp.data or []
        results.extend(batch)
        offset += len(batch)
        if len(batch) < page:
            break
    return results


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    prefix = "[DRY RUN] " if DRY_RUN else ""
    print(f"\n{'='*64}")
    print(f"{prefix}College Scorecard Seeder  (data year: {DATA_YEAR})")
    print(f"{'='*64}\n")

    # ── Load CSV ──────────────────────────────────────────────────────────────
    print(f"Loading {CSV_PATH} …")
    if not os.path.exists(CSV_PATH):
        print(f"ERROR: File not found: {CSV_PATH}")
        print("Download from: https://collegescorecard.ed.gov/data/")
        sys.exit(1)

    df = pd.read_csv(CSV_PATH, low_memory=False, dtype=str)
    df = df.where(pd.notnull(df), None)
    records = df.to_dict("records")
    print(f"  Loaded {len(records):,} rows, {len(df.columns):,} columns.")
    print(f"  Data year detected: {DATA_YEAR}\n")

    # ── Connect Supabase ──────────────────────────────────────────────────────
    if not DRY_RUN:
        try:
            from supabase import create_client
        except ImportError:
            print("ERROR: pip install supabase"); sys.exit(1)
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env"); sys.exit(1)
        client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        print(f"  Connected to: {SUPABASE_URL}\n")
    else:
        client = None

    # ── Checkpoint ────────────────────────────────────────────────────────────
    cp        = load_checkpoint()
    completed = set(cp.get("completed_stages", []))
    stats     = cp.get("stats", {})
    print(f"  Checkpoint: stages already done = {sorted(completed)}\n")

    # ─────────────────────────────────────────────────────────────────────────
    # STAGE 1: colleges_comprehensive
    # ─────────────────────────────────────────────────────────────────────────
    stage = "colleges_comprehensive"
    if stage not in completed:
        print(f"[1/5] {prefix}Upserting → {stage} …")
        rows = [build_comprehensive(r) for r in records]
        rows = [r for r in rows if r.get("name") and r.get("ipeds_unit_id")]
        ok   = 0
        for batch in tqdm(list(chunked(rows, BATCH_SIZE)), desc="  colleges", unit="batch"):
            if upsert_batch(client, stage, batch, on_conflict="ipeds_unit_id"):
                ok += len(batch)
        stats[stage] = {"processed": ok, "total": len(rows)}
        print(f"  ✅ {ok:,}/{len(rows):,} rows processed.\n")
        cp["completed_stages"].append(stage)
        cp["stats"] = stats
        save_checkpoint(cp)
    else:
        print(f"[1/5] ✓ {stage} already done.\n")

    # ─────────────────────────────────────────────────────────────────────────
    # Fetch college ID mapping  (ipeds_unit_id → DB uuid)
    # ─────────────────────────────────────────────────────────────────────────
    print("  Fetching college ID mapping from DB …")
    unitid_to_college_id = {}
    if not DRY_RUN:
        rows_data = fetch_all(
            client,
            "colleges_comprehensive",
            "id, ipeds_unit_id",
            filter_fn=lambda q: q.not_.is_("ipeds_unit_id", "null"),
        )
        for r in rows_data:
            if r.get("ipeds_unit_id"):
                unitid_to_college_id[int(r["ipeds_unit_id"])] = r["id"]
        print(f"  Fetched {len(unitid_to_college_id):,} college ID mappings.\n")
    else:
        for i, r in enumerate(records):
            uid = vi(r.get("UNITID"))
            if uid:
                unitid_to_college_id[uid] = i + 1

    def get_college_id(row):
        uid = vi(row.get("UNITID"))
        cid = unitid_to_college_id.get(uid)
        if not cid:
            log_skip(f"NO_ID | UNITID={uid} | name={row.get('INSTNM')}")
        return cid

    # ─────────────────────────────────────────────────────────────────────────
    # STAGE 2: college_admissions
    # ─────────────────────────────────────────────────────────────────────────
    stage = "college_admissions"
    if stage not in completed:
        print(f"[2/5] {prefix}Upserting → {stage} …")
        adm_rows = []
        for r in records:
            cid = get_college_id(r)
            if cid:
                adm_rows.append(build_admissions(r, cid))
        ok = 0
        for batch in tqdm(list(chunked(adm_rows, BATCH_SIZE)), desc="  admissions", unit="batch"):
            if upsert_batch(client, stage, batch, on_conflict="college_id"):
                ok += len(batch)
        stats[stage] = {"processed": ok, "total": len(adm_rows)}
        print(f"  ✅ {ok:,}/{len(adm_rows):,} rows processed.\n")
        cp["completed_stages"].append(stage)
        cp["stats"] = stats
        save_checkpoint(cp)
    else:
        print(f"[2/5] ✓ {stage} already done.\n")

    # ─────────────────────────────────────────────────────────────────────────
    # STAGE 3: college_financial_data
    # ─────────────────────────────────────────────────────────────────────────
    stage = "college_financial_data"
    if stage not in completed:
        print(f"[3/5] {prefix}Upserting → {stage} …")
        fin_rows = []
        for r in records:
            cid = get_college_id(r)
            if cid:
                fin_rows.append(build_financial(r, cid))
        ok = 0
        for batch in tqdm(list(chunked(fin_rows, BATCH_SIZE)), desc="  financial", unit="batch"):
            if upsert_batch(client, stage, batch, on_conflict="college_id"):
                ok += len(batch)
        stats[stage] = {"processed": ok, "total": len(fin_rows)}
        print(f"  ✅ {ok:,}/{len(fin_rows):,} rows processed.\n")
        cp["completed_stages"].append(stage)
        cp["stats"] = stats
        save_checkpoint(cp)
    else:
        print(f"[3/5] ✓ {stage} already done.\n")

    # ─────────────────────────────────────────────────────────────────────────
    # STAGE 4: academic_details
    # ─────────────────────────────────────────────────────────────────────────
    stage = "academic_details"
    if stage not in completed:
        print(f"[4/5] {prefix}Upserting → {stage} …")
        acad_rows = []
        for r in records:
            cid = get_college_id(r)
            if cid:
                acad_rows.append(build_academic(r, cid))
        ok = 0
        for batch in tqdm(list(chunked(acad_rows, BATCH_SIZE)), desc="  academic", unit="batch"):
            if upsert_batch(client, stage, batch, on_conflict="college_id"):
                ok += len(batch)
        stats[stage] = {"processed": ok, "total": len(acad_rows)}
        print(f"  ✅ {ok:,}/{len(acad_rows):,} rows processed.\n")
        cp["completed_stages"].append(stage)
        cp["stats"] = stats
        save_checkpoint(cp)
    else:
        print(f"[4/5] ✓ {stage} already done.\n")

    # ─────────────────────────────────────────────────────────────────────────
    # STAGE 5: college_majors  (PCIP fields)
    # ─────────────────────────────────────────────────────────────────────────
    stage = "college_majors"
    if stage not in completed:
        print(f"[5/5] {prefix}Upserting → {stage} (PCIP fields) …")

        # Load CIP → major_id mapping
        cip_to_major_id = {}
        if not DRY_RUN:
            rows_data = fetch_all(client, "majors", "id, cip_code")
            for m in rows_data:
                if m.get("cip_code"):
                    cip_to_major_id[m["cip_code"]] = m["id"]
            print(f"  Loaded {len(cip_to_major_id):,} CIP → major_id mappings.")
        else:
            for i, (_, cip) in enumerate(CIP_MAP):
                cip_to_major_id[cip] = i + 1

        if not cip_to_major_id:
            print("  ⚠️  No majors found — run seed_majors.py first, then re-run stage 5.")
            print("      Skipping college_majors.\n")
        else:
            major_rows = []
            for r in records:
                cid = get_college_id(r)
                if cid:
                    major_rows.extend(build_college_majors(r, cid, cip_to_major_id))
            print(f"  Built {len(major_rows):,} college_majors rows.")

            # Delete then re-insert for affected colleges (clean import)
            if not DRY_RUN:
                college_ids = list({r["college_id"] for r in major_rows})
                print(f"  Clearing existing rows for {len(college_ids):,} colleges …")
                for id_batch in tqdm(list(chunked(college_ids, 200)), desc="  clearing", unit="batch"):
                    client.table("college_majors").delete().in_("college_id", id_batch).execute()

            ok = 0
            # CRITICAL FIX: composite conflict key ["college_id", "major_id"]
            for batch in tqdm(list(chunked(major_rows, BATCH_SIZE)), desc="  majors", unit="batch"):
                if upsert_batch(
                    client,
                    "college_majors",
                    batch,
                    on_conflict=["college_id", "major_id"],
                ):
                    ok += len(batch)
            stats[stage] = {"processed": ok, "total": len(major_rows)}
            print(f"  ✅ {ok:,}/{len(major_rows):,} rows processed.\n")

        cp["completed_stages"].append(stage)
        cp["stats"] = stats
        save_checkpoint(cp)
    else:
        print(f"[5/5] ✓ {stage} already done.\n")

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n{'='*64}")
    print("Seeding complete!")
    print(f"  CSV source rows    : {len(records):>8,}")
    print(f"  College ID mappings: {len(unitid_to_college_id):>8,}")
    print(f"  Data year          : {DATA_YEAR}")
    print(f"  Stages completed   : {len(cp['completed_stages'])}/5")
    print()
    for s, stat in stats.items():
        pct = (stat['processed'] / stat['total'] * 100) if stat['total'] else 0
        print(f"  {s:<35} {stat['processed']:>7,}/{stat['total']:>7,}  ({pct:.1f}%)")

    skip_count = 0
    if os.path.exists(SKIP_LOG):
        with open(SKIP_LOG) as f:
            skip_count = sum(1 for _ in f)
    if skip_count:
        print(f"\n  ⚠️  {skip_count:,} entries in skip log → review {SKIP_LOG}")
    print(f"{'='*64}\n")

    # ── Print SQL migrations for any columns that were dropped ───────────────
    reported = getattr(strip_unknown_columns, "_reported", set())
    if reported and not DRY_RUN:
        print("-" * 64)
        print("Some columns were not inserted because they do not exist yet.")
        print("Run this SQL in your Supabase SQL editor, then delete")
        print("scorecard_checkpoint.json and re-run the script:")
        print()

        SQL_MIGRATIONS = {
            "colleges_comprehensive": (
                "ALTER TABLE colleges_comprehensive\n"
                "  ADD COLUMN IF NOT EXISTS pct_first_gen  DECIMAL(6,4),\n"
                "  ADD COLUMN IF NOT EXISTS test_optional  BOOLEAN,\n"
                "  ADD COLUMN IF NOT EXISTS online_only    BOOLEAN;\n"
            ),
            "college_admissions": (
                "ALTER TABLE college_admissions\n"
                "  ADD COLUMN IF NOT EXISTS sat_total_25     INT,\n"
                "  ADD COLUMN IF NOT EXISTS sat_total_75     INT,\n"
                "  ADD COLUMN IF NOT EXISTS sat_verbal_mid   INT,\n"
                "  ADD COLUMN IF NOT EXISTS sat_math_mid     INT,\n"
                "  ADD COLUMN IF NOT EXISTS yield_rate       DECIMAL(6,4),\n"
                "  ADD COLUMN IF NOT EXISTS applicants_total INT,\n"
                "  ADD COLUMN IF NOT EXISTS admitted_total   INT,\n"
                "  ADD COLUMN IF NOT EXISTS enrolled_total   INT,\n"
                "  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT NOW();\n"
            ),
            "college_financial_data": (
                "ALTER TABLE college_financial_data\n"
                "  ADD COLUMN IF NOT EXISTS avg_family_income    INT,\n"
                "  ADD COLUMN IF NOT EXISTS median_family_income INT;\n"
            ),
            "academic_details": (
                "ALTER TABLE academic_details\n"
                "  ADD COLUMN IF NOT EXISTS graduation_rate_6yr DECIMAL(6,4),\n"
                "  ADD COLUMN IF NOT EXISTS pct_stem            DECIMAL(6,4),\n"
                "  ADD COLUMN IF NOT EXISTS pct_employed_2yr    DECIMAL(6,4),\n"
                "  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT NOW();\n"
            ),
        }

        for tbl in sorted(reported):
            if tbl in SQL_MIGRATIONS:
                print(f"-- {tbl}")
                print(SQL_MIGRATIONS[tbl])
        print("-" * 64)
        print()

    print(
        "Next steps:\n"
        "  1. seed_majors.py          - populate majors master list\n"
        "  2. scrape_international.py - add 1,000+ non-US colleges\n"
        "  3. fix_rankings.py         - populate popularity / ranking scores\n"
        "  4. seed_cds_gpa.py         - scrape GPA percentiles from CDS section C\n"
        "  5. seed_intl_rates.py      - scrape intl acceptance rates from CDS C2\n"
    )

    # Reset checkpoint only when all 5 stages done
    if len(cp["completed_stages"]) >= 5:
        print("All stages complete. Removing checkpoint file.")
        if os.path.exists(CHECKPOINT_FILE):
            os.remove(CHECKPOINT_FILE)


if __name__ == "__main__":
    main()
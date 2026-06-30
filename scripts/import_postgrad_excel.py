#!/usr/bin/env python3
"""
scripts/import_postgrad_excel.py
---------------------------------
Imports 526 postgrad programs from "ALL POSTGRAD.xlsx" into
canonical.masters_programs (+ masters_program_deadlines for deadline rows).

Usage:
  pip install pandas openpyxl psycopg2-binary python-dotenv
  DATABASE_URL=postgresql://... python scripts/import_postgrad_excel.py [path/to/file.xlsx]

Or export DATABASE_URL in your shell / .env.
"""

import os
import re
import sys
import uuid
from datetime import datetime

try:
    import pandas as pd
except ImportError:
    sys.exit("pip install pandas openpyxl")

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    sys.exit("pip install psycopg2-binary")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

EXCEL_PATH = sys.argv[1] if len(sys.argv) > 1 else "C:/Users/chait/Downloads/ALL POSTGRAD.xlsx"

SKIP_SHEETS = {"Index"}

COUNTRY_MAP = {
    "usa": "US", "united states": "US", "us": "US",
    "uk": "GB", "united kingdom": "GB", "england": "GB",
    "canada": "CA", "ca": "CA",
    "australia": "AU",
    "germany": "DE",
    "netherlands": "NL", "holland": "NL",
    "singapore": "SG",
    "india": "IN",
    "france": "FR",
    "switzerland": "CH",
    "sweden": "SE",
    "denmark": "DK",
    "norway": "NO",
    "italy": "IT",
    "spain": "ES",
    "ireland": "IE",
    "new zealand": "NZ",
    "hong kong": "HK",
    "japan": "JP",
    "china": "CN",
    "south korea": "KR",
    "uae": "AE", "united arab emirates": "AE",
    "belgium": "BE",
    "austria": "AT",
    "finland": "FI",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def normalize_country(raw: str) -> str:
    if not raw or pd.isna(raw):
        return "unknown"
    key = str(raw).strip().lower()
    return COUNTRY_MAP.get(key, str(raw).strip()[:50])


def infer_degree_type(course: str, sheet: str) -> str:
    s = (str(course) + " " + str(sheet)).lower()
    if "mba" in s:
        return "MBA"
    if any(x in s for x in ["ma ", "m.a.", "master of arts", "mim", "master in management"]):
        return "MA"
    return "MS"


def parse_gre(test_req: str) -> str:
    if not test_req or pd.isna(test_req):
        return "unknown"
    t = str(test_req).lower()
    if "waived" in t or "not required" in t or "no gre" in t:
        return "waived"
    if "optional" in t:
        return "optional"
    if "gre" in t and ("required" in t or re.search(r"\bgre\b", t)):
        return "required"
    if "gre" in t:
        return "optional"
    return "unknown"


def parse_gmat(test_req: str) -> str:
    if not test_req or pd.isna(test_req):
        return "unknown"
    t = str(test_req).lower()
    if "gmat" not in t:
        return "unknown"
    if "optional" in t or "waived" in t:
        return "optional"
    return "required"


def parse_min_gpa(req: str):
    if not req or pd.isna(req):
        return None, None
    matches = re.findall(r'(?:gpa|cgpa|grade)[^\d]*(\d+\.?\d*)[/\s]*(\d+\.?\d*)?', str(req).lower())
    if matches:
        try:
            val = float(matches[0][0])
            scale_raw = matches[0][1]
            scale = float(scale_raw) if scale_raw else (4.0 if val <= 4 else 10.0)
            return val, scale
        except ValueError:
            pass
    # bare percentage like ">= 60%"
    pct = re.findall(r'(\d{2,3})\s*%', str(req))
    if pct:
        return float(pct[0]), 100.0
    return None, None


def parse_toefl(req: str):
    if not req or pd.isna(req):
        return None
    m = re.search(r'toefl[^\d]*(\d{2,3})', str(req).lower())
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            pass
    return None


def parse_ielts(req: str):
    if not req or pd.isna(req):
        return None
    m = re.search(r'ielts[^\d]*(\d(?:\.\d)?)', str(req).lower())
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            pass
    return None


def parse_cost(cost_raw: str):
    """Return (amount_inr_approx, currency) best-effort."""
    if not cost_raw or pd.isna(cost_raw):
        return None, None
    s = str(cost_raw)
    # Look for explicit amounts in USD / GBP / EUR / SGD
    for sym, cur in [("\\$", "USD"), ("gbp", "GBP"), ("€", "EUR"), ("sgd", "SGD"), ("aud", "AUD"), ("inr", "INR"), ("₹", "INR")]:
        m = re.search(rf'{sym}[\s]*([\d,]+)', s, re.IGNORECASE)
        if m:
            try:
                amt = float(m.group(1).replace(",", ""))
                return amt, cur
            except ValueError:
                pass
    return None, None


def parse_url(notes: str):
    if not notes or pd.isna(notes):
        return None
    m = re.search(r'https?://[^\s,]+', str(notes))
    return m.group(0) if m else None


def parse_funding(scholarships: str) -> str:
    if not scholarships or pd.isna(scholarships):
        return "unknown"
    s = str(scholarships).lower().strip()
    if s in {"-", "n/a", "na", "none", ""}:
        return "unfunded"
    if any(x in s for x in ["fully funded", "full funding", "full scholarship"]):
        return "fully_funded"
    if any(x in s for x in ["scholarship", "fellowship", "ta", "ra", "grant", "waiver", "stipend"]):
        return "partial"
    return "varies"


def parse_deadline_rows(deadline_raw: str, program_id: str) -> list[dict]:
    """Return list of deadline dicts for masters_program_deadlines."""
    if not deadline_raw or pd.isna(deadline_raw):
        return []
    rows = []
    text = str(deadline_raw)
    # Look for Round patterns: Round 1: Sep, R1: Jan, etc.
    rounds = re.findall(r'(?:round|r)\s*(\d)[:\s]+([A-Za-z]+(?:\s+\d{4})?)', text, re.IGNORECASE)
    for rnd, date_str in rounds:
        rows.append({
            "program_id": program_id,
            "deadline_type": f"Round {rnd}",
            "deadline_label": date_str.strip(),
        })
    if not rows:
        # Generic: split on semicolons or newlines
        parts = re.split(r'[;,\n]', text)
        for part in parts[:3]:
            part = part.strip()
            if len(part) > 3:
                rows.append({
                    "program_id": program_id,
                    "deadline_type": "Application",
                    "deadline_label": part[:100],
                })
    return rows


# ---------------------------------------------------------------------------
# Main import
# ---------------------------------------------------------------------------

def main():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        sys.exit("DATABASE_URL not set. Export it or add it to .env")

    print(f"Reading {EXCEL_PATH}…")
    xl = pd.ExcelFile(EXCEL_PATH)

    programs = []
    deadline_rows = []

    for sheet in xl.sheet_names:
        if sheet in SKIP_SHEETS:
            continue
        df = xl.parse(sheet)
        df = df.dropna(how="all")
        if df.empty:
            continue

        # Normalize column names (sheets differ slightly in naming)
        col_map = {}
        for c in df.columns:
            lc = str(c).lower().strip()
            if "university" in lc:
                col_map["university"] = c
            elif "course" in lc:
                col_map["course"] = c
            elif "program" in lc and "program" not in col_map:
                col_map["program"] = c
            elif "country" in lc:
                col_map["country"] = c
            elif "admission" in lc:
                col_map["admission"] = c
            elif "deadline" in lc:
                col_map["deadline"] = c
            elif "test" in lc:
                col_map["test"] = c
            elif "scholar" in lc:
                col_map["scholarships"] = c
            elif "cost" in lc or "approximate" in lc:
                col_map["cost"] = c
            elif "notes" in lc or "remark" in lc:
                if "notes1" not in col_map:
                    col_map["notes1"] = c
                else:
                    col_map["notes2"] = c

        for _, row in df.iterrows():
            univ = str(row.get(col_map.get("university", ""), "")).strip()
            if not univ or univ.lower() in {"nan", "university", ""}:
                continue

            course = str(row.get(col_map.get("course", ""), "")).strip()
            if not course or course.lower() == "nan":
                course = sheet

            country_raw = str(row.get(col_map.get("country", ""), "")).strip()
            country_code = normalize_country(country_raw)

            degree_type = infer_degree_type(course, sheet)

            admission_req = row.get(col_map.get("admission", ""), "")
            test_req = row.get(col_map.get("test", ""), "")
            scholarships = row.get(col_map.get("scholarships", ""), "")
            cost_raw = row.get(col_map.get("cost", ""), "")
            deadline_raw = row.get(col_map.get("deadline", ""), "")
            notes1 = row.get(col_map.get("notes1", ""), "")
            notes2 = row.get(col_map.get("notes2", ""), "")

            min_gpa, gpa_scale = parse_min_gpa(str(admission_req))
            toefl = parse_toefl(str(admission_req) + " " + str(test_req))
            ielts = parse_ielts(str(admission_req) + " " + str(test_req))
            cost_amt, cost_cur = parse_cost(str(cost_raw))
            program_url = parse_url(str(notes1)) or parse_url(str(notes2))
            funding = parse_funding(str(scholarships))
            gre_req = parse_gre(str(test_req))
            gmat_req = parse_gmat(str(test_req))

            program_id = str(uuid.uuid4())
            programs.append({
                "id": program_id,
                "institution_name": univ[:200],
                "institution_country": country_code,
                "department": sheet[:100],
                "program_name": course[:250],
                "degree_type": degree_type,
                "gre_requirement": gre_req,
                "gmat_requirement": gmat_req,
                "min_gpa": min_gpa,
                "min_gpa_scale": gpa_scale,
                "min_toefl": toefl,
                "min_ielts": ielts,
                "funding_availability": funding,
                "tuition_total": cost_amt,
                "tuition_currency": cost_cur,
                "program_url": program_url[:500] if program_url else None,
                "data_source": "excel_import_postgrad_2026",
                "data_quality_score": 0.55,
                "raw_admission_requirements": str(admission_req)[:1000] if admission_req and not pd.isna(admission_req) else None,
                "raw_test_requirements": str(test_req)[:500] if test_req and not pd.isna(test_req) else None,
                "raw_scholarships": str(scholarships)[:500] if scholarships and not pd.isna(scholarships) else None,
                "raw_cost": str(cost_raw)[:200] if cost_raw and not pd.isna(cost_raw) else None,
                "raw_deadlines": str(deadline_raw)[:200] if deadline_raw and not pd.isna(deadline_raw) else None,
            })
            deadline_rows.extend(parse_deadline_rows(str(deadline_raw), program_id))

    print(f"Parsed {len(programs)} programs, {len(deadline_rows)} deadline entries.")

    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor()

    # Ensure raw columns exist (non-destructive)
    extra_cols = [
        ("raw_admission_requirements", "TEXT"),
        ("raw_test_requirements", "TEXT"),
        ("raw_scholarships", "TEXT"),
        ("raw_cost", "TEXT"),
        ("raw_deadlines", "TEXT"),
    ]
    for col, dtype in extra_cols:
        cur.execute(f"""
            ALTER TABLE canonical.masters_programs
            ADD COLUMN IF NOT EXISTS {col} {dtype};
        """)

    inserted = 0
    skipped = 0
    for p in programs:
        cur.execute("""
            INSERT INTO canonical.masters_programs (
                id, institution_name, institution_country, department,
                program_name, degree_type,
                gre_requirement, gmat_requirement,
                min_gpa, min_gpa_scale, min_toefl, min_ielts,
                funding_availability, tuition_total, tuition_currency,
                program_url, data_source, data_quality_score,
                raw_admission_requirements, raw_test_requirements,
                raw_scholarships, raw_cost, raw_deadlines
            )
            VALUES (
                %(id)s, %(institution_name)s, %(institution_country)s, %(department)s,
                %(program_name)s, %(degree_type)s,
                %(gre_requirement)s, %(gmat_requirement)s,
                %(min_gpa)s, %(min_gpa_scale)s, %(min_toefl)s, %(min_ielts)s,
                %(funding_availability)s, %(tuition_total)s, %(tuition_currency)s,
                %(program_url)s, %(data_source)s, %(data_quality_score)s,
                %(raw_admission_requirements)s, %(raw_test_requirements)s,
                %(raw_scholarships)s, %(raw_cost)s, %(raw_deadlines)s
            )
            ON CONFLICT (institution_name, program_name, degree_type)
            WHERE canonical_institution_id IS NULL
            DO UPDATE SET
                data_quality_score    = EXCLUDED.data_quality_score,
                raw_admission_requirements = EXCLUDED.raw_admission_requirements,
                raw_test_requirements = EXCLUDED.raw_test_requirements,
                raw_scholarships      = EXCLUDED.raw_scholarships,
                raw_cost              = EXCLUDED.raw_cost,
                raw_deadlines         = EXCLUDED.raw_deadlines,
                updated_at            = NOW();
        """, p)
        if cur.rowcount and cur.rowcount > 0:
            inserted += 1
        else:
            skipped += 1

    conn.commit()
    print(f"masters_programs: {inserted} upserted, {skipped} already existed.")

    cur.close()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
scraper/sources/nirf.py
------------------------
Downloads India NIRF (National Institutional Ranking Framework) data
from the official government portal: https://www.nirfindia.org/Rankings/

NIRF publishes Excel/CSV downloads for:
  - Overall ranking
  - University ranking
  - Engineering
  - Medical
  - Management
  - Law
  - Architecture
  - Pharmacy
  - Dental

Upserts nirf_rank into canonical.institution_rankings.
Also updates canonical.institutions.country = 'IN' for matched schools.
"""

import io
import logging
import os
import re
import sys
import time

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

try:
    from dotenv import load_dotenv
    load_dotenv("backend/.env")
except ImportError:
    pass

try:
    import requests
    import psycopg2
    import openpyxl
except ImportError:
    sys.exit("pip install requests psycopg2-binary openpyxl")

DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    sys.exit("DATABASE_URL not set")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CollegeOS-Research/1.0",
    "Referer": "https://www.nirfindia.org/",
}

# NIRF 2024 direct Excel download URLs
NIRF_DOWNLOADS = [
    ("Overall",      "https://www.nirfindia.org/nirfpdfcdn/2024/pdf/Overall.xlsx"),
    ("University",   "https://www.nirfindia.org/nirfpdfcdn/2024/pdf/University.xlsx"),
    ("Engineering",  "https://www.nirfindia.org/nirfpdfcdn/2024/pdf/Engineering.xlsx"),
    ("Medical",      "https://www.nirfindia.org/nirfpdfcdn/2024/pdf/Medical.xlsx"),
    ("Management",   "https://www.nirfindia.org/nirfpdfcdn/2024/pdf/Management.xlsx"),
]

# Fallback: NIRF open data API
NIRF_API = "https://www.nirfindia.org/ranking/2024/Overallranking.php"


def load_india_name_map(conn) -> dict[str, str]:
    """Load institutions whose country is India or name contains common Indian words."""
    cur = conn.cursor()
    cur.execute("""
        SELECT id, canonical_name FROM canonical.institutions
        WHERE country = 'IN'
           OR canonical_name ILIKE '%india%'
           OR canonical_name ILIKE '%iit %'
           OR canonical_name ILIKE '%iim %'
           OR canonical_name ILIKE '%nit %'
           OR canonical_name ILIKE '%aiims%'
           OR canonical_name ILIKE '%jawaharlal%'
           OR canonical_name ILIKE '%anna university%'
           OR canonical_name ILIKE '%delhi%'
           OR canonical_name ILIKE '%bombay%'
           OR canonical_name ILIKE '%calcutta%'
           OR canonical_name ILIKE '%madras%'
    """)
    rows = cur.fetchall()
    cur.close()
    return {r[1].lower().strip(): str(r[0]) for r in rows if r[1]}


def load_all_name_map(conn) -> dict[str, str]:
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name FROM canonical.institutions WHERE canonical_name IS NOT NULL")
    rows = cur.fetchall()
    cur.close()
    return {r[1].lower().strip(): str(r[0]) for r in rows if r[1]}


def normalize(name: str) -> str:
    name = re.sub(r'\s+', ' ', name.lower().strip())
    name = re.sub(r'[,\.\-]', ' ', name)
    name = re.sub(r'\s+', ' ', name)
    return name.strip()


def fuzzy_match(raw: str, name_map: dict, norm_map: dict) -> str | None:
    key = raw.lower().strip()
    if key in name_map:
        return name_map[key]
    norm = normalize(raw)
    if norm in norm_map:
        return norm_map[norm]
    # Try prefix match (e.g. "Indian Institute of Technology Bombay" → "IIT Bombay")
    for k, v in name_map.items():
        if norm[:30] in k or k[:30] in norm:
            return v
    return None


def parse_nirf_xlsx(content: bytes, category: str) -> list[dict]:
    """Parse NIRF Excel file, return list of {rank, name, score, city, state}."""
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        ws = wb.active
    except Exception as e:
        log.warning(f"  XLSX parse error ({category}): {e}")
        return []

    results = []
    header_found = False
    rank_col = name_col = city_col = state_col = score_col = None

    for row in ws.iter_rows(values_only=True):
        if not row:
            continue
        row = [str(c).strip() if c is not None else "" for c in row]

        # Find header row
        if not header_found:
            lower = [c.lower() for c in row]
            if any("rank" in c for c in lower):
                for i, c in enumerate(lower):
                    if "rank" in c and "ir" in c.replace("rank", ""):
                        rank_col = i
                    elif c in ("rank", "ir_rank", "1"):
                        rank_col = i if rank_col is None else rank_col
                    if "name" in c and "inst" in c:
                        name_col = i
                    elif "name" in c:
                        name_col = i if name_col is None else name_col
                    if "city" in c:
                        city_col = i
                    if "state" in c:
                        state_col = i
                    if "score" in c and "total" in c:
                        score_col = i

                if rank_col is None:
                    rank_col = 0
                if name_col is None:
                    name_col = 2
                header_found = True
            continue

        if not header_found or not row[name_col]:
            continue

        try:
            rank_raw = row[rank_col].replace("=", "").strip()
            rank = int(float(rank_raw)) if rank_raw else None
        except (ValueError, TypeError):
            rank = None

        if rank is None:
            continue

        results.append({
            "rank": rank,
            "name": row[name_col],
            "city": row[city_col] if city_col is not None else None,
            "state": row[state_col] if state_col is not None else None,
            "score": row[score_col] if score_col is not None else None,
            "category": category,
        })

    return results


def upsert_nirf(cur, inst_id: str, rank: int, category: str = "Overall"):
    cur.execute("""
        INSERT INTO canonical.institution_rankings
          (institution_id, ranking_year_key, ranking_body, national_rank, ranking_year)
        VALUES (%(id)s, '2024', %(body)s, %(rank)s, 2024)
        ON CONFLICT ON CONSTRAINT uq_institution_rankings DO UPDATE SET
          national_rank = EXCLUDED.national_rank,
          nirf_rank = EXCLUDED.national_rank
    """, {"id": inst_id, "rank": rank, "body": f"NIRF {category}"})

    # Also set the denormalized column for the Overall category
    if category == "Overall":
        cur.execute("""
            UPDATE canonical.institution_rankings SET nirf_rank = %(r)s
            WHERE institution_id = %(id)s AND ranking_body = 'NIRF Overall'
        """, {"r": rank, "id": inst_id})

    # Mark country code as India
    cur.execute("""
        UPDATE canonical.institutions SET
          country_code = COALESCE(country_code, 'IN')
        WHERE id = %s
    """, (inst_id,))


def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True

    log.info("Loading name maps for India institutions…")
    name_map = load_all_name_map(conn)
    norm_map = {normalize(k): v for k, v in name_map.items()}
    log.info(f"  {len(name_map)} institutions in DB")

    cur = conn.cursor()
    total_matched = 0
    total_records = 0

    session = requests.Session()
    session.headers.update(HEADERS)

    for category, url in NIRF_DOWNLOADS:
        log.info(f"Downloading NIRF {category}…")
        try:
            resp = session.get(url, timeout=60)
            if resp.status_code != 200:
                log.warning(f"  HTTP {resp.status_code} for {category}")
                continue

            records = parse_nirf_xlsx(resp.content, category)
            log.info(f"  Parsed {len(records)} {category} records")
            total_records += len(records)

            for rec in records:
                inst_id = fuzzy_match(rec["name"], name_map, norm_map)
                if not inst_id:
                    continue
                try:
                    upsert_nirf(cur, inst_id, rec["rank"], rec.get("category", "Overall"))
                    total_matched += 1
                except Exception as e:
                    log.warning(f"  skip {rec['name']}: {e}")

            time.sleep(1)

        except Exception as e:
            log.warning(f"  Failed {category}: {e}")

    cur.close()
    conn.close()
    log.info(f"Done. NIRF: {total_records} records, {total_matched} matched to DB.")


if __name__ == "__main__":
    main()

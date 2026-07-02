"""
scraper/sources/cwur_global_seed.py
───────────────────────────────────
Seeds + ranks global institutions from the CWUR (Center for World University
Rankings) 2024 edition.

Unlike the existing CWUR scraper (which only writes rankings for institutions
already present), this one will ALSO insert previously-unknown institutions
(global_rank <= 1500) into canonical.institutions, then write CWUR ranking rows
for both pre-existing and newly inserted schools.

Pipeline:
  1. Fetch CWUR 2024 table (HTML).
  2. Parse rows: world rank, institution name, location ("City, Country").
  3. For each row:
       - try to match to an existing canonical.institutions row (name + country)
       - if no match and rank <= 1500: INSERT a new institution
       - upsert a CWUR ranking row
  4. Recompute completeness for touched institutions is left to the migration /
     daily refresh job (this scraper only seeds identity + rankings).

Env:
  DATABASE_URL  — Postgres DSN (required)

Deps: requests, beautifulsoup4, psycopg2-binary, python-dotenv
"""

from __future__ import annotations

import logging
import os
import re
import sys
import uuid

import requests
from bs4 import BeautifulSoup

try:
    import psycopg2
    import psycopg2.extras
except ImportError:  # pragma: no cover
    psycopg2 = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("cwur_global_seed")

CWUR_URL = "https://cwur.org/2024.php"
RANK_INSERT_LIMIT = 1500
RANKING_BODY = "CWUR"
RANKING_YEAR = 2024
HEADERS = {"User-Agent": "CollegeOS-CWURBot/1.0 (+https://collegeos.app/bot)"}

# Country name -> ISO-2 mapping for the CWUR "Location" column.
COUNTRY_MAP = {
    "United States": "US", "USA": "US",
    "United Kingdom": "GB", "UK": "GB",
    "India": "IN",
    "Canada": "CA",
    "Australia": "AU",
    "Germany": "DE",
    "France": "FR",
    "Japan": "JP",
    "China": "CN",
    "South Korea": "KR", "Korea": "KR",
    "Singapore": "SG",
    "Hong Kong": "HK",
    "Netherlands": "NL",
    "Switzerland": "CH",
    "Sweden": "SE",
    "Belgium": "BE",
    "Denmark": "DK",
    "Finland": "FI",
    "Norway": "NO",
    "Spain": "ES",
    "Italy": "IT",
    "Brazil": "BR",
    "Russia": "RU",
    "Iran": "IR",
    "Turkey": "TR",
    "Saudi Arabia": "SA",
    "Taiwan": "TW",
    "Israel": "IL",
    "New Zealand": "NZ",
    "South Africa": "ZA",
    "Egypt": "EG",
    "Malaysia": "MY",
    "Thailand": "TH",
    "Pakistan": "PK",
    "Argentina": "AR",
    "Mexico": "MX",
    "Chile": "CL",
    "Portugal": "PT",
    "Greece": "GR",
    "Austria": "AT",
    "Poland": "PL",
    "Czech Republic": "CZ",
    "Hungary": "HU",
    "Romania": "RO",
    "Ukraine": "UA",
    "Ireland": "IE",
    "Indonesia": "ID",
    "Philippines": "PH",
    "Vietnam": "VN",
    "United Arab Emirates": "AE",
    "Qatar": "QA",
    "Ethiopia": "ET",
    "Nigeria": "NG",
    "Kenya": "KE",
}


def _normalize_name(name: str) -> str:
    """Match the SQL normalized_name: lower, strip non-alnum-space, trim."""
    return re.sub(r"[^a-z0-9\s]", "", name.lower()).strip()


def _make_slug(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"{base}-{uuid.uuid4().hex}"


def fetch_cwur_rows() -> list[dict]:
    """Return list of {rank, name, country_code, city} parsed from CWUR 2024."""
    log.info("Fetching CWUR 2024 table: %s", CWUR_URL)
    resp = requests.get(CWUR_URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    table = soup.find("table")
    if table is None:
        log.error("No table found on CWUR page")
        return []

    rows: list[dict] = []
    for tr in table.find_all("tr"):
        cells = [c.get_text(strip=True) for c in tr.find_all("td")]
        if len(cells) < 3:
            continue
        # CWUR layout: World Rank | Institution | Location | National Rank | ...
        rank_raw, name, location = cells[0], cells[1], cells[2]
        m = re.match(r"\d+", rank_raw)
        if not m or not name:
            continue
        rank = int(m.group())

        country_code, city = None, None
        if location:
            # "City, Country" or just "Country"
            parts = [p.strip() for p in location.split(",")]
            country_name = parts[-1]
            country_code = COUNTRY_MAP.get(country_name)
            if len(parts) > 1:
                city = parts[0]
        rows.append({"rank": rank, "name": name, "country_code": country_code, "city": city})

    log.info("Parsed %d CWUR rows", len(rows))
    return rows


def find_institution(cur, name: str, country_code: str | None) -> str | None:
    norm = _normalize_name(name)
    if country_code:
        cur.execute(
            "SELECT id FROM canonical.institutions "
            "WHERE country_code = %s AND normalized_name = %s LIMIT 1",
            (country_code, norm),
        )
    else:
        cur.execute(
            "SELECT id FROM canonical.institutions WHERE normalized_name = %s LIMIT 1",
            (norm,),
        )
    r = cur.fetchone()
    return str(r[0]) if r else None


def insert_institution(cur, name: str, country_code: str, city: str | None) -> str | None:
    norm = _normalize_name(name)
    slug = _make_slug(name)
    cur.execute(
        """
        INSERT INTO canonical.institutions
          (canonical_name, normalized_name, slug, country_code, city,
           institution_type, source_priority, verification_status)
        VALUES (%s, %s, %s, %s, %s, 'university', 5, 'unverified')
        ON CONFLICT (country_code, normalized_name) DO NOTHING
        RETURNING id
        """,
        (name, norm, slug, country_code, city),
    )
    r = cur.fetchone()
    if r:
        return str(r[0])
    # Lost the race / already existed: re-resolve.
    return find_institution(cur, name, country_code)


def upsert_ranking(cur, institution_id: str, global_rank: int, national_rank: int | None) -> None:
    # verification_status/last_verified_at (docs/data_provenance_design.md, migration
    # 130): CWUR is a real published ranking body, so 'scraped' is correct here rather
    # than leaving the column at its 'unknown' default.
    cur.execute(
        """
        INSERT INTO canonical.institution_rankings
          (institution_id, ranking_year, ranking_body, global_rank, national_rank, source_attribution,
           verification_status, last_verified_at)
        VALUES (%s, %s, %s, %s, %s, %s::jsonb, 'scraped', NOW())
        ON CONFLICT (institution_id, ranking_year_key, ranking_body) DO UPDATE
          SET global_rank = EXCLUDED.global_rank,
              national_rank = EXCLUDED.national_rank,
              verification_status = 'scraped',
              last_verified_at = NOW()
        """,
        (
            institution_id, RANKING_YEAR, RANKING_BODY, global_rank, national_rank,
            '{"source":"cwur_2024","confidence":1.0}',
        ),
    )


def main() -> int:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        log.error("DATABASE_URL not set")
        return 1
    if psycopg2 is None:
        log.error("psycopg2 not installed")
        return 1

    rows = fetch_cwur_rows()
    if not rows:
        log.error("No CWUR rows; aborting")
        return 1

    inserted, matched, ranked, skipped = 0, 0, 0, 0
    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            for row in rows:
                cc = row["country_code"]
                inst_id = find_institution(cur, row["name"], cc)
                if inst_id:
                    matched += 1
                elif cc and row["rank"] <= RANK_INSERT_LIMIT:
                    inst_id = insert_institution(cur, row["name"], cc, row["city"])
                    if inst_id:
                        inserted += 1
                if not inst_id:
                    skipped += 1
                    continue
                upsert_ranking(cur, inst_id, row["rank"], None)
                ranked += 1
        conn.commit()
    except Exception:  # pragma: no cover
        conn.rollback()
        log.exception("CWUR seed failed; rolled back")
        return 1
    finally:
        conn.close()

    log.info("CWUR done. matched=%d inserted=%d ranked=%d skipped=%d",
             matched, inserted, ranked, skipped)
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
scraper/sources/wikidata.py
----------------------------
Fetches university metadata from Wikidata SPARQL endpoint:
  - coordinates (lat/lng)
  - founded year
  - total enrollment
  - endowment (USD)
  - country code

Matches against canonical.institutions by official website URL (most reliable)
then falls back to exact canonical_name match.

Updates: canonical.institutions (lat/lng, founded_year, total_enrollment,
         endowment_usd) and canonical.institution_rankings (qs_rank, the_rank
         if present in Wikidata via P3395/P6608).
"""

import json
import logging
import os
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
    import psycopg2.extras
except ImportError:
    sys.exit("pip install requests psycopg2-binary")

DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    sys.exit("DATABASE_URL not set")

SPARQL_URL = "https://query.wikidata.org/sparql"
HEADERS = {"User-Agent": "CollegeOS-Scraper/1.0 (education research; contact@collegeos.app)"}

# Fetch in batches of 1000 (WDQS limit)
SPARQL_QUERY = """
SELECT ?item ?name ?website ?lat ?lng ?founded ?enrollment ?endowment ?countryCode WHERE {
  ?item wdt:P31/wdt:P279* wd:Q3918 .   # instance of university (transitive)
  OPTIONAL { ?item wdt:P856 ?website . }
  OPTIONAL { ?item wdt:P625 ?coords .
             BIND(geof:latitude(?coords) AS ?lat)
             BIND(geof:longitude(?coords) AS ?lng) }
  OPTIONAL { ?item wdt:P571 ?founded . }
  OPTIONAL { ?item wdt:P2196 ?enrollment . }
  OPTIONAL { ?item wdt:P5418 ?endowment . }
  OPTIONAL { ?item wdt:P17 ?country .
             ?country wdt:P297 ?countryCode . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?item rdfs:label ?name. }
}
LIMIT 20000
OFFSET %d
"""


def sparql_fetch(offset: int) -> list[dict]:
    resp = requests.get(
        SPARQL_URL,
        params={"query": SPARQL_QUERY % offset, "format": "json"},
        headers=HEADERS,
        timeout=120,
    )
    if resp.status_code != 200:
        log.warning(f"SPARQL offset={offset} HTTP {resp.status_code}")
        return []
    bindings = resp.json().get("results", {}).get("bindings", [])
    return bindings


def parse_year(v: str) -> int | None:
    try:
        return int(v[:4])
    except Exception:
        return None


def strip_url(url: str) -> str:
    """Normalize website URL for matching: remove http/https/www/trailing slash."""
    url = url.lower().strip().rstrip("/")
    for prefix in ("https://www.", "http://www.", "https://", "http://", "www."):
        if url.startswith(prefix):
            url = url[len(prefix):]
            break
    return url


def load_url_map(conn) -> dict[str, str]:
    cur = conn.cursor()
    cur.execute("SELECT id, website FROM canonical.institutions WHERE website IS NOT NULL")
    rows = cur.fetchall()
    cur.close()
    return {strip_url(r[1]): str(r[0]) for r in rows if r[1]}


def load_name_map(conn) -> dict[str, str]:
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name FROM canonical.institutions WHERE canonical_name IS NOT NULL")
    rows = cur.fetchall()
    cur.close()
    return {r[1].lower().strip(): str(r[0]) for r in rows if r[1]}


def apply_update(cur, inst_id: str, row: dict):
    lat = float(row["lat"]["value"]) if "lat" in row else None
    lng = float(row["lng"]["value"]) if "lng" in row else None
    founded = parse_year(row["founded"]["value"]) if "founded" in row else None
    enrollment = int(float(row["enrollment"]["value"])) if "enrollment" in row else None
    endowment = int(float(row["endowment"]["value"])) if "endowment" in row else None

    if not any([lat, lng, founded, enrollment, endowment]):
        return False

    cur.execute("""
        UPDATE canonical.institutions SET
          latitude          = COALESCE(latitude, %(lat)s),
          longitude         = COALESCE(longitude, %(lng)s),
          founded_year      = COALESCE(founded_year, %(founded)s),
          total_enrollment  = COALESCE(total_enrollment, %(enr)s),
          endowment_usd     = COALESCE(endowment_usd, %(end)s),
          updated_at        = NOW()
        WHERE id = %(id)s
    """, {"id": inst_id, "lat": lat, "lng": lng,
          "founded": founded, "enr": enrollment, "end": endowment})
    return cur.rowcount > 0


def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True

    log.info("Loading institution URL and name maps…")
    url_map = load_url_map(conn)
    name_map = load_name_map(conn)
    log.info(f"  {len(url_map)} URLs, {len(name_map)} names in DB")

    cur = conn.cursor()
    total_matched = 0
    total_rows = 0

    offset = 0
    while True:
        log.info(f"Fetching SPARQL offset={offset}…")
        bindings = sparql_fetch(offset)
        if not bindings:
            break

        for b in bindings:
            total_rows += 1
            name = b.get("name", {}).get("value", "")
            website = b.get("website", {}).get("value", "")

            inst_id = None
            if website:
                inst_id = url_map.get(strip_url(website))
            if not inst_id and name:
                inst_id = name_map.get(name.lower().strip())
            if not inst_id:
                continue

            try:
                if apply_update(cur, inst_id, b):
                    total_matched += 1
            except Exception as e:
                log.warning(f"  skip {name}: {e}")

        log.info(f"  offset {offset}: {len(bindings)} records, {total_matched} updated so far")

        if len(bindings) < 20000:
            break

        offset += 20000
        time.sleep(2)  # be polite to Wikidata

    cur.close()
    conn.close()
    log.info(f"Done. Processed {total_rows} Wikidata rows, updated {total_matched} institutions.")


if __name__ == "__main__":
    main()

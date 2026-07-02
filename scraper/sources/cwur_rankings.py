#!/usr/bin/env python3
"""
scraper/sources/cwur_rankings.py
----------------------------------
Scrapes Center for World University Rankings (CWUR) global rankings.
Free public data at cwur.org — 2000 institutions per year.
Matches by normalized name. ~25% match rate for global institutions.

Usage:
  DATABASE_URL=... python scraper/sources/cwur_rankings.py
"""

import logging
import os
import re
import sys
import time
import unicodedata

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

try:
    from dotenv import load_dotenv
    load_dotenv("backend/.env")
except ImportError:
    pass

try:
    import requests
    from bs4 import BeautifulSoup
    import psycopg2
except ImportError:
    sys.exit("pip install requests beautifulsoup4 psycopg2-binary")

DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    sys.exit("DATABASE_URL not set")

CWUR_URL = "https://cwur.org/2024.php"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml",
}


def _norm(name: str) -> str:
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    name = name.lower().strip()
    name = re.sub(r"^(the|a|an)\s+", "", name)
    name = re.sub(r"[,\-–—]", " ", name)
    name = re.sub(r"[^a-z0-9 ]", "", name)
    return re.sub(r"\s+", " ", name).strip()


def fetch_cwur() -> list[dict]:
    """Scrape CWUR rankings page — all 2000 institutions on one page."""
    log.info(f"Fetching {CWUR_URL}…")
    resp = requests.get(CWUR_URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    table = soup.find("table")
    if not table:
        log.error("No table found on CWUR page")
        return []

    results = []
    rows = table.find_all("tr")
    for row in rows[1:]:  # skip header
        cols = row.find_all("td")
        if len(cols) < 3:
            continue

        rank_raw = cols[0].get_text(strip=True)
        rank_clean = re.sub(r"Top.*|\xa0.*|\s.*", "", rank_raw).strip()
        try:
            rank = int(rank_clean)
        except ValueError:
            continue

        name = cols[1].get_text(strip=True)
        location = cols[2].get_text(strip=True) if len(cols) > 2 else ""
        nat_rank_raw = cols[3].get_text(strip=True) if len(cols) > 3 else ""
        try:
            nat_rank = int(re.sub(r"[^\d]", "", nat_rank_raw))
        except ValueError:
            nat_rank = None

        score_raw = cols[-1].get_text(strip=True) if cols else ""
        try:
            score = float(score_raw)
        except ValueError:
            score = None

        results.append({
            "rank": rank,
            "name": name,
            "location": location,
            "nat_rank": nat_rank,
            "score": score,
        })

    log.info(f"Parsed {len(results)} CWUR records")
    return results


def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()

    log.info("Loading name maps…")
    cur.execute("SELECT id, canonical_name FROM canonical.institutions WHERE canonical_name IS NOT NULL")
    rows = cur.fetchall()
    name_map = {r[1].lower().strip(): str(r[0]) for r in rows}
    norm_map = {_norm(r[1]): str(r[0]) for r in rows}
    log.info(f"  {len(name_map)} institutions")

    records = fetch_cwur()
    matched = 0
    unmatched = []

    for rec in records:
        name = rec["name"]
        inst_id = (
            name_map.get(name.lower().strip())
            or norm_map.get(_norm(name))
            or name_map.get(name.lower().strip().lstrip("the ").strip())
            or norm_map.get(_norm(name.lstrip("the ").strip() if name.lower().startswith("the ") else name))
        )
        if not inst_id:
            unmatched.append((rec["rank"], name, rec["location"]))
            continue

        try:
            # verification_status/last_verified_at (docs/data_provenance_design.md,
            # migration 130): CWUR is a real published ranking body -> 'scraped'.
            cur.execute("""
                INSERT INTO canonical.institution_rankings
                  (institution_id, ranking_body, global_rank, ranking_score, ranking_year,
                   verification_status, last_verified_at)
                VALUES (%s, 'CWUR', %s, %s, 2024, 'scraped', NOW())
                ON CONFLICT ON CONSTRAINT uq_institution_rankings DO UPDATE SET
                  global_rank   = EXCLUDED.global_rank,
                  ranking_score = COALESCE(EXCLUDED.ranking_score, institution_rankings.ranking_score),
                  verification_status = 'scraped',
                  last_verified_at = NOW()
            """, (inst_id, rec["rank"], rec["score"]))
            matched += 1
        except Exception as e:
            log.debug(f"  CWUR skip {name}: {e}")

    log.info(f"CWUR: {matched}/{len(records)} matched and written")
    if unmatched:
        log.info(f"  Top 10 unmatched: {[(r, n, l) for r, n, l in unmatched[:10]]}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()

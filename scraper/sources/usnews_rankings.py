#!/usr/bin/env python3
"""
scraper/sources/usnews_rankings.py
------------------------------------
Scrapes US News Best Colleges rankings API.
Extracts: US News rank, avg HS GPA, acceptance rate, SAT/ACT ranges, net price.
Matches by xwalkId = IPEDS UNITID (near 100% match for US institutions).

Ranking types fetched:
  national-universities     (~500 schools)
  liberal-arts-colleges     (~220 schools)
  regional-universities-north/south/midwest/west
"""

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
except ImportError:
    sys.exit("pip install requests psycopg2-binary")

DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    sys.exit("DATABASE_URL not set")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
    "Referer": "https://www.usnews.com/best-colleges/rankings/national-universities",
}

RANKING_TYPES = [
    ("national-universities", "US News National"),
    ("liberal-arts-colleges", "US News Liberal Arts"),
    ("regional-universities-north", "US News Regional"),
    ("regional-universities-south", "US News Regional"),
    ("regional-universities-midwest", "US News Regional"),
    ("regional-universities-west", "US News Regional"),
    ("regional-colleges-north", "US News Regional"),
    ("regional-colleges-south", "US News Regional"),
    ("regional-colleges-midwest", "US News Regional"),
    ("regional-colleges-west", "US News Regional"),
]


def fetch_ranking(ranking_type: str, max_pages: int = 60) -> list[dict]:
    """Fetch all pages of a given US News ranking type."""
    results = []
    session = requests.Session()
    session.headers.update(HEADERS)

    for page in range(1, max_pages + 1):
        try:
            resp = session.get(
                "https://www.usnews.com/best-colleges/api/search",
                params={"ranking-type": ranking_type, "per-page": "25", "page": "1", "_page": str(page)},
                timeout=15,
            )
            if resp.status_code != 200:
                break
            data = resp.json()
            items = data.get("data", {}).get("items", [])
            if not items:
                break

            for item in items:
                ranking = item.get("ranking", {})
                sd = item.get("searchData", {})
                inst = item.get("institution", {})

                rank = ranking.get("sortRank")
                if rank is None:
                    continue

                results.append({
                    "rank": rank,
                    "ipeds": str(item.get("xwalkId", "")).strip(),
                    "name": inst.get("displayName", ""),
                    "state": inst.get("state", ""),
                    "gpa": sd.get("hsGpaAvg", {}).get("rawValue"),
                    "acceptance_rate": sd.get("acceptanceRate", {}).get("rawValue"),
                    "tuition": sd.get("tuition", {}).get("rawValue"),
                    "net_price": sd.get("costAfterAid", {}).get("rawValue"),
                    "pct_aid": sd.get("percentReceivingAid", {}).get("rawValue"),
                    "enrollment": sd.get("enrollment", {}).get("rawValue"),
                })

            first_rank = results[-len(items)]["rank"] if items else "?"
            last_rank = results[-1]["rank"] if results else "?"
            log.debug(f"  {ranking_type} page {page}: {len(items)} items (ranks {first_rank}-{last_rank})")

            if len(items) < 10:
                break
            time.sleep(0.3)

        except Exception as e:
            log.warning(f"  {ranking_type} page {page} error: {e}")
            break

    return results


def load_ipeds_map(conn) -> dict[str, str]:
    cur = conn.cursor()
    cur.execute("""
        SELECT id, canonical_external_ids->>'ipeds' AS ipeds_id
        FROM canonical.institutions
        WHERE canonical_external_ids->>'ipeds' IS NOT NULL
          AND canonical_external_ids->>'ipeds' != ''
    """)
    rows = cur.fetchall()
    cur.close()
    return {r[1].strip(): str(r[0]) for r in rows if r[1]}


def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()

    log.info("Loading IPEDS map…")
    ipeds_map = load_ipeds_map(conn)
    log.info(f"  {len(ipeds_map)} institutions with IPEDS IDs")

    total_written = 0
    total_gpa = 0

    for ranking_type, body_label in RANKING_TYPES:
        log.info(f"Fetching {ranking_type}…")
        records = fetch_ranking(ranking_type)
        log.info(f"  {len(records)} records fetched")

        written = 0
        for rec in records:
            inst_id = ipeds_map.get(rec["ipeds"])
            if not inst_id:
                continue

            # Upsert ranking
            try:
                # verification_status/last_verified_at (docs/data_provenance_design.md,
                # migration 130): US News is a real published ranking body -> 'scraped'.
                cur.execute("""
                    INSERT INTO canonical.institution_rankings
                      (institution_id, ranking_body, national_rank, ranking_year,
                       verification_status, last_verified_at)
                    VALUES (%s, %s, %s, 2025, 'scraped', NOW())
                    ON CONFLICT ON CONSTRAINT uq_institution_rankings DO UPDATE SET
                      national_rank = EXCLUDED.national_rank,
                      verification_status = 'scraped',
                      last_verified_at = NOW()
                """, (inst_id, body_label, rec["rank"]))
                written += 1
            except Exception as e:
                log.debug(f"  ranking upsert fail {rec['name']}: {e}")

            # Upsert GPA + acceptance rate into admissions
            if rec["gpa"] is not None or rec["acceptance_rate"] is not None:
                ar = (rec["acceptance_rate"] / 100.0) if rec["acceptance_rate"] is not None else None
                try:
                    cur.execute("""
                        INSERT INTO canonical.institution_admissions
                          (institution_id, gpa_avg, acceptance_rate, data_year, admissions_cycle,
                           verification_status, last_verified_at)
                        VALUES (%s, %s, %s, 2024, 'regular', 'scraped', NOW())
                        ON CONFLICT ON CONSTRAINT uq_institution_admissions DO UPDATE SET
                          gpa_avg         = COALESCE(EXCLUDED.gpa_avg, institution_admissions.gpa_avg),
                          acceptance_rate = COALESCE(EXCLUDED.acceptance_rate, institution_admissions.acceptance_rate),
                          verification_status = 'scraped',
                          last_verified_at = NOW()
                    """, (inst_id, rec["gpa"], ar))
                    if rec["gpa"] is not None:
                        total_gpa += 1
                except Exception as e:
                    log.debug(f"  admissions upsert fail {rec['name']}: {e}")

            # Update financials (net price, enrollment)
            if rec["net_price"] or rec["tuition"]:
                try:
                    cur.execute("""
                        UPDATE canonical.institution_financials SET
                          net_price = COALESCE(net_price, %s),
                          tuition_domestic = COALESCE(tuition_domestic, %s)
                        WHERE institution_id = %s AND data_year = 2024
                    """, (rec["net_price"], rec["tuition"], inst_id))
                except Exception:
                    pass

        log.info(f"  {written} {ranking_type} rankings written")
        total_written += written
        time.sleep(1)

    log.info(f"Done. Total: {total_written} rankings written, {total_gpa} GPA values updated")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()

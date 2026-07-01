"""
scraper/sources/qs_rankings.py
──────────────────────────────
Seeds QS World University Rankings via the public Wikidata SPARQL endpoint.

QS data on topuniversities.com is paywalled, but Wikidata stores QS world-rank
statements (property P2650) for most ranked universities, along with the ISO-2
country code (P297) and the English label. We use that as a free, public,
attributable source.

For each result:
  - match to an existing canonical.institutions row (name + country)
  - if no match and rank <= 800: INSERT a new institution
  - upsert a QS ranking row (ranking_body='QS', ranking_year=2024)

Env:
  DATABASE_URL — Postgres DSN (required)

Deps: requests (or SPARQLWrapper), psycopg2-binary, python-dotenv
"""

from __future__ import annotations

import logging
import os
import re
import sys
import uuid

import requests

try:
    import psycopg2
except ImportError:  # pragma: no cover
    psycopg2 = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("qs_rankings")

SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"
RANK_INSERT_LIMIT = 800
RANKING_BODY = "QS"
RANKING_YEAR = 2024
HEADERS = {
    "User-Agent": "CollegeOS-QSBot/1.0 (+https://collegeos.app/bot)",
    "Accept": "application/sparql-results+json",
}

# Wikidata P2650 holds a numeric QS rank statement for ranked universities.
SPARQL_QUERY = """
SELECT ?uniLabel ?qs_rank ?countryCode WHERE {
  ?uni wdt:P31/wdt:P279* wd:Q3918.
  ?uni p:P2650 ?rankStmt.
  ?rankStmt ps:P2650 ?qs_rank.
  ?uni wdt:P17 ?country.
  ?country wdt:P297 ?countryCode.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY ?qs_rank
LIMIT 1500
"""


def _normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9\s]", "", name.lower()).strip()


def _make_slug(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"{base}-{uuid.uuid4().hex}"


def fetch_qs_rows() -> list[dict]:
    log.info("Querying Wikidata SPARQL for QS ranks")
    resp = requests.get(
        SPARQL_ENDPOINT, params={"query": SPARQL_QUERY, "format": "json"},
        headers=HEADERS, timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    rows: list[dict] = []
    for b in data.get("results", {}).get("bindings", []):
        name = b.get("uniLabel", {}).get("value")
        rank_raw = b.get("qs_rank", {}).get("value")
        cc = b.get("countryCode", {}).get("value")
        if not name or not rank_raw:
            continue
        m = re.match(r"\d+", str(rank_raw))
        if not m:
            continue
        rows.append({"name": name, "rank": int(m.group()), "country_code": cc})
    # Dedup by (name, cc) keeping the best (lowest) rank.
    best: dict[tuple, dict] = {}
    for r in rows:
        key = (_normalize_name(r["name"]), r["country_code"])
        if key not in best or r["rank"] < best[key]["rank"]:
            best[key] = r
    log.info("Fetched %d unique QS-ranked universities", len(best))
    return list(best.values())


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


def insert_institution(cur, name: str, country_code: str) -> str | None:
    norm = _normalize_name(name)
    slug = _make_slug(name)
    cur.execute(
        """
        INSERT INTO canonical.institutions
          (canonical_name, normalized_name, slug, country_code,
           institution_type, source_priority, verification_status)
        VALUES (%s, %s, %s, %s, 'university', 5, 'unverified')
        ON CONFLICT (country_code, normalized_name) DO NOTHING
        RETURNING id
        """,
        (name, norm, slug, country_code),
    )
    r = cur.fetchone()
    if r:
        return str(r[0])
    return find_institution(cur, name, country_code)


def upsert_ranking(cur, institution_id: str, global_rank: int) -> None:
    cur.execute(
        """
        INSERT INTO canonical.institution_rankings
          (institution_id, ranking_year, ranking_body, global_rank, source_attribution)
        VALUES (%s, %s, %s, %s, %s::jsonb)
        ON CONFLICT (institution_id, ranking_year_key, ranking_body) DO UPDATE
          SET global_rank = EXCLUDED.global_rank
        """,
        (
            institution_id, RANKING_YEAR, RANKING_BODY, global_rank,
            '{"source":"wikidata_qs","confidence":0.9}',
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

    rows = fetch_qs_rows()
    if not rows:
        log.error("No QS rows; aborting")
        return 1

    matched, inserted, ranked, skipped = 0, 0, 0, 0
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
                    inst_id = insert_institution(cur, row["name"], cc)
                    if inst_id:
                        inserted += 1
                if not inst_id:
                    skipped += 1
                    continue
                upsert_ranking(cur, inst_id, row["rank"])
                ranked += 1
        conn.commit()
    except Exception:  # pragma: no cover
        conn.rollback()
        log.exception("QS seed failed; rolled back")
        return 1
    finally:
        conn.close()

    log.info("QS done. matched=%d inserted=%d ranked=%d skipped=%d",
             matched, inserted, ranked, skipped)
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
scraper/sources/qs_the_rankings.py
------------------------------------
Fetches QS World University Rankings and Times Higher Education (THE)
World University Rankings from their public APIs / downloadable data.

QS: https://www.topuniversities.com/qs-world-university-rankings
    Uses their public JSON endpoint (no auth required for rank + name).

THE: https://www.timeshighereducation.com/world-university-rankings
    Uses their public API.

Upserts into canonical.institution_rankings with:
  qs_rank, the_rank, employer_reputation_rank, academic_reputation_rank,
  faculty_student_rank, citations_rank, intl_student_rank
"""

import json
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
except ImportError:
    sys.exit("pip install requests psycopg2-binary")

DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    sys.exit("DATABASE_URL not set")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/html",
}


def load_name_map(conn) -> dict[str, str]:
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name FROM canonical.institutions WHERE canonical_name IS NOT NULL")
    rows = cur.fetchall()
    cur.close()
    return {r[1].lower().strip(): str(r[0]) for r in rows}


def normalize(name: str) -> str:
    name = name.lower().strip()
    name = re.sub(r'\s+', ' ', name)
    # common aliases
    name = name.replace("the university of", "university of")
    return name


def match_name(raw: str, name_map: dict, normalized_map: dict) -> str | None:
    key = raw.lower().strip()
    if key in name_map:
        return name_map[key]
    norm = normalize(raw)
    if norm in normalized_map:
        return normalized_map[norm]
    return None


def build_normalized_map(name_map: dict) -> dict[str, str]:
    return {normalize(k): v for k, v in name_map.items()}


# ─── QS Rankings ─────────────────────────────────────────────────────────────

def fetch_qs_rankings() -> list[dict]:
    """
    QS publishes rankings as a paginated JSON API.
    Returns list of dicts with keys: name, rank, scores by indicator.
    """
    results = []
    page = 1
    per_page = 100

    while True:
        try:
            resp = requests.get(
                "https://www.topuniversities.com/rankings/endpoint",
                params={
                    "nid": 3816078,           # QS World 2025 node ID
                    "page": page - 1,
                    "items_per_page": per_page,
                    "tab": "indicators",
                    "region": "",
                    "countries": "",
                    "cities": "",
                    "search": "",
                    "star": 0,
                    "sort_by": "rank",
                    "order_by": "asc",
                    "program": "",
                    "type": "",
                    "dataType": "rankingsData",
                },
                headers=HEADERS,
                timeout=30,
            )
            if resp.status_code != 200:
                log.warning(f"QS page {page} HTTP {resp.status_code}")
                break

            data = resp.json()
            batch = data.get("score_nodes", [])
            if not batch:
                # Try alternative field name
                batch = data.get("data", {}).get("score_nodes", [])
            if not batch:
                log.info(f"QS: no more data at page {page}")
                break

            for item in batch:
                rank_str = item.get("rank_display") or item.get("rank") or ""
                try:
                    rank = int(str(rank_str).replace("=", "").replace("+", "").strip())
                except (ValueError, TypeError):
                    rank = None

                results.append({
                    "name": item.get("title", ""),
                    "rank": rank,
                    "academic_rep": _safe_score(item, "Academic Reputation"),
                    "employer_rep": _safe_score(item, "Employer Reputation"),
                    "faculty_student": _safe_score(item, "Faculty Student Ratio"),
                    "citations": _safe_score(item, "Citations per Faculty"),
                    "intl_student": _safe_score(item, "International Student Ratio"),
                    "intl_faculty": _safe_score(item, "International Faculty Ratio"),
                })

            log.info(f"QS page {page}: {len(batch)} items (total {len(results)})")
            if len(batch) < per_page:
                break
            page += 1
            time.sleep(0.5)

        except Exception as e:
            log.warning(f"QS page {page} error: {e}")
            break

    return results


def _safe_score(item: dict, label: str) -> float | None:
    indicators = item.get("scores", []) or item.get("indicators", [])
    for ind in indicators:
        if label.lower() in str(ind.get("label", "")).lower():
            try:
                return float(ind.get("score") or ind.get("value") or 0) or None
            except (ValueError, TypeError):
                return None
    return None


# ─── THE Rankings ─────────────────────────────────────────────────────────────

def fetch_the_rankings() -> list[dict]:
    """
    THE World University Rankings 2025.
    Uses their public search API.
    """
    results = []
    page = 1
    per_page = 200

    while True:
        try:
            resp = requests.get(
                "https://www.timeshighereducation.com/sites/default/files/the_data_rankings/world_university_rankings_2025_0__aefb5a2c9e43f27d9cf3e36ed9c4748e.json",
                headers=HEADERS,
                timeout=30,
            )
            if resp.status_code == 200:
                data = resp.json()
                results = _parse_the_json(data)
                log.info(f"THE: loaded {len(results)} from static JSON")
                break

        except Exception:
            pass

        # Fall back to API
        try:
            resp = requests.get(
                "https://www.timeshighereducation.com/rankings/the-world-university-rankings/api/",
                params={"sort": "rank", "order": "asc", "page": page, "limit": per_page},
                headers=HEADERS,
                timeout=30,
            )
            if resp.status_code != 200:
                log.warning(f"THE page {page} HTTP {resp.status_code}")
                break

            data = resp.json()
            batch = data.get("data", [])
            if not batch:
                break

            for item in batch:
                rank_str = str(item.get("rank", "") or item.get("rank_order", "")).replace("=", "").replace("+", "")
                try:
                    rank = int(rank_str.strip())
                except (ValueError, TypeError):
                    rank = None

                results.append({
                    "name": item.get("name", "") or item.get("university", ""),
                    "rank": rank,
                    "academic_rep": _safe_f(item, "scores_teaching"),
                    "citations": _safe_f(item, "scores_citations"),
                    "industry_income": _safe_f(item, "scores_industry_income"),
                    "intl_outlook": _safe_f(item, "scores_international_outlook"),
                    "research": _safe_f(item, "scores_research"),
                })

            log.info(f"THE page {page}: {len(batch)} items (total {len(results)})")
            if len(batch) < per_page:
                break
            page += 1
            time.sleep(0.5)

        except Exception as e:
            log.warning(f"THE page {page} error: {e}")
            break

    return results


def _parse_the_json(data: list | dict) -> list[dict]:
    if isinstance(data, dict):
        data = data.get("data", [])
    results = []
    for item in data:
        rank_str = str(item.get("rank", "") or "").replace("=", "").replace("+", "")
        try:
            rank = int(rank_str.strip())
        except (ValueError, TypeError):
            rank = None
        results.append({
            "name": item.get("name", ""),
            "rank": rank,
        })
    return results


def _safe_f(d: dict, k: str) -> float | None:
    v = d.get(k)
    if v in (None, "", "-", "n/a"):
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


# ─── DB upsert ────────────────────────────────────────────────────────────────

def upsert_ranking(cur, inst_id: str, body: str, rank: int | None, year: str = "2025",
                   denorm_col: str | None = None):
    """Upsert into institution_rankings (one row per institution+year+body)."""
    if rank is None:
        return
    # ranking_year_key is a generated column — do not include in INSERT
    # verification_status/last_verified_at (docs/data_provenance_design.md, migration
    # 130): QS and THE are real published ranking bodies -> 'scraped'.
    cur.execute("""
        INSERT INTO canonical.institution_rankings
          (institution_id, ranking_body, global_rank, ranking_year,
           verification_status, last_verified_at)
        VALUES (%(id)s, %(body)s, %(rank)s, %(yr)s, 'scraped', NOW())
        ON CONFLICT ON CONSTRAINT uq_institution_rankings DO UPDATE SET
          global_rank = EXCLUDED.global_rank,
          verification_status = 'scraped',
          last_verified_at = NOW()
    """, {"id": inst_id, "body": body, "rank": rank, "yr": int(year)})

    # Also update denormalized convenience column if present
    if denorm_col:
        cur.execute(f"""
            UPDATE canonical.institution_rankings SET
              {denorm_col} = %(rank)s
            WHERE institution_id = %(id)s AND ranking_year_key = %(yk)s AND ranking_body = %(body)s
        """, {"id": inst_id, "rank": rank, "yk": year, "body": body})


def upsert_qs(cur, inst_id: str, item: dict):
    rank = item.get("rank")
    upsert_ranking(cur, inst_id, "QS World", rank, "2025", "qs_rank")


def upsert_the(cur, inst_id: str, item: dict):
    rank = item.get("rank")
    upsert_ranking(cur, inst_id, "THE World", rank, "2025", "the_rank")


def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True

    log.info("Loading name maps…")
    name_map = load_name_map(conn)
    norm_map = build_normalized_map(name_map)

    cur = conn.cursor()

    # ── QS ────────────────────────────────────────────────────────────────────
    log.info("Fetching QS World Rankings 2025…")
    qs_items = fetch_qs_rankings()
    log.info(f"  Got {len(qs_items)} QS entries")

    qs_matched = 0
    for item in qs_items:
        inst_id = match_name(item["name"], name_map, norm_map)
        if not inst_id:
            continue
        try:
            upsert_qs(cur, inst_id, item)
            qs_matched += 1
        except Exception as e:
            log.warning(f"  QS skip {item['name']}: {e}")

    log.info(f"QS: matched {qs_matched}/{len(qs_items)}")

    # ── THE ───────────────────────────────────────────────────────────────────
    log.info("Fetching THE World Rankings 2025…")
    the_items = fetch_the_rankings()
    log.info(f"  Got {len(the_items)} THE entries")

    the_matched = 0
    for item in the_items:
        inst_id = match_name(item["name"], name_map, norm_map)
        if not inst_id:
            continue
        try:
            upsert_the(cur, inst_id, item)
            the_matched += 1
        except Exception as e:
            log.warning(f"  THE skip {item['name']}: {e}")

    log.info(f"THE: matched {the_matched}/{len(the_items)}")

    cur.close()
    conn.close()
    log.info("Done.")


if __name__ == "__main__":
    main()

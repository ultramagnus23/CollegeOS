from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

import psycopg2
from psycopg2.extras import execute_batch

from scrapers.schedulers.runner import run_scrape_cycle


def get_connection():
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        raise RuntimeError("SUPABASE_DB_URL is required")
    return psycopg2.connect(db_url)


def fetch_targets(conn, mode: str) -> List[Dict]:
    with conn.cursor() as cur:
        if mode == "weekly":
            cur.execute(
                """
                SELECT i.id::text AS institution_id, COALESCE(i.website, i.url, '') AS source_url
                FROM canonical.institutions i
                LEFT JOIN canonical.popularity_index pi ON pi.institution_id = i.id
                WHERE COALESCE(i.website, i.url, '') <> ''
                ORDER BY COALESCE(pi.popularity_score, 0) DESC
                LIMIT 350
                """
            )
        else:
            cur.execute(
                """
                SELECT i.id::text AS institution_id, COALESCE(i.website, i.url, '') AS source_url
                FROM canonical.institutions i
                WHERE COALESCE(i.website, i.url, '') <> ''
                ORDER BY i.id
                LIMIT 1200
                """
            )
        rows = cur.fetchall()
    return [{"institution_id": r[0], "source_url": r[1]} for r in rows]


def upsert_deadlines(conn, deadlines: List[Dict]):
    rows = []
    now = datetime.now(timezone.utc)
    for d in deadlines:
        rows.append((
            d["institution_id"],
            d["deadline_type"],
            d["deadline_date"],
            d.get("source_url"),
            d.get("confidence_score", 0),
            now,
            d.get("parser_version", "deadline_parser_v1"),
            d.get("extraction_timestamp"),
        ))

    with conn.cursor() as cur:
        execute_batch(
            cur,
            """
            INSERT INTO canonical.institution_deadlines
              (institution_id, deadline_type, deadline_date, source_url, confidence_score, last_verified, parser_version, extraction_timestamp)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (institution_id, deadline_type) DO UPDATE SET
              deadline_date = EXCLUDED.deadline_date,
              source_url = EXCLUDED.source_url,
              confidence_score = EXCLUDED.confidence_score,
              last_verified = EXCLUDED.last_verified,
              parser_version = EXCLUDED.parser_version,
              extraction_timestamp = EXCLUDED.extraction_timestamp
            """,
            rows,
            page_size=200,
        )


def upsert_requirements(conn, requirements: List[Dict]):
    rows = []
    now = datetime.now(timezone.utc)
    for r in requirements:
        rows.append((
            r["institution_id"],
            r["requirement_type"],
            r["requirement_text"],
            r.get("source_url"),
            r.get("confidence_score", 0),
            now,
            r.get("parser_version", "requirements_parser_v1"),
            r.get("extraction_timestamp"),
        ))

    with conn.cursor() as cur:
        execute_batch(
            cur,
            """
            INSERT INTO canonical.institution_requirements
              (institution_id, requirement_type, requirement_text, source_url, confidence_score, last_verified, parser_version, extraction_timestamp)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (institution_id, requirement_type, requirement_text) DO UPDATE SET
              source_url = EXCLUDED.source_url,
              confidence_score = EXCLUDED.confidence_score,
              last_verified = EXCLUDED.last_verified,
              parser_version = EXCLUDED.parser_version,
              extraction_timestamp = EXCLUDED.extraction_timestamp
            """,
            rows,
            page_size=200,
        )


def main():
    mode = os.getenv("SCRAPE_MODE", "weekly").strip().lower()
    conn = get_connection()
    try:
        targets = fetch_targets(conn, mode)
        result = run_scrape_cycle(targets)
        upsert_deadlines(conn, result["deadlines"])
        upsert_requirements(conn, result["requirements"])
        conn.commit()

        out_dir = Path(os.getenv("SCRAPER_DIAGNOSTICS_DIR", "scraper_diagnostics"))
        out_dir.mkdir(parents=True, exist_ok=True)
        with (out_dir / "summary.json").open("w", encoding="utf-8") as fh:
            json.dump(result["summary"], fh, indent=2)
        with (out_dir / "diagnostics.json").open("w", encoding="utf-8") as fh:
            json.dump(result["diagnostics"], fh, indent=2)
        failed = [d for d in result["diagnostics"] if not d["success"]]
        stale = [d for d in result["diagnostics"] if d["stale"]]
        with (out_dir / "failed_institutions.json").open("w", encoding="utf-8") as fh:
            json.dump(failed, fh, indent=2)
        with (out_dir / "stale_institutions.json").open("w", encoding="utf-8") as fh:
            json.dump(stale, fh, indent=2)
        print(json.dumps(result["summary"]))
    finally:
        conn.close()


if __name__ == "__main__":
    main()


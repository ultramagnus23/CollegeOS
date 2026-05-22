from __future__ import annotations

import json
import os
from collections import defaultdict
from datetime import datetime, timezone

import psycopg2

from scraper.indian import PARSER_VERSION
from scraper.indian.pipelines.india_ingestion_pipeline import IndiaIngestionPipeline
from scraper.indian.pipelines.supabase_writer import SupabaseIndianWriter


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fetch_targets(conn, mode: str):
    weekly_limit = int(os.getenv("INDIA_WEEKLY_LIMIT", "400"))
    monthly_limit = int(os.getenv("INDIA_MONTHLY_LIMIT", "2500"))
    limit = weekly_limit if mode == "weekly" else monthly_limit

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              i.id::text AS institution_id,
              COALESCE(i.website, '') AS source_url,
              'shiksha'::text AS source_name
            FROM canonical.institutions i
            WHERE COALESCE(i.country_code, 'IN') = 'IN'
              AND COALESCE(i.website, '') <> ''
            ORDER BY i.updated_at DESC NULLS LAST, i.created_at DESC NULLS LAST
            LIMIT %s
            """,
            (limit,),
        )
        return [{"institution_id": r[0], "source_url": r[1], "source_name": r[2]} for r in cur.fetchall()]


def _flatten_for_writes(rows):
    grouped = defaultdict(list)
    for row in rows:
        base = {
            "institution_id": row["institution_id"],
            "source_url": row.get("source_url"),
            "source_name": row.get("source_name", "shiksha"),
            "source_confidence": row.get("source_confidence", 0.7),
            "extraction_timestamp": row.get("extraction_timestamp"),
        }

        grouped["admissions"].append({**base, "raw_payload": row.get("admissions", {})})
        grouped["fees"].append({**base, "raw_payload": row.get("fees", {})})
        grouped["placements"].append({**base, "raw_payload": row.get("placements", {})})
        grouped["rankings"].append({**base, "raw_payload": row.get("rankings", {})})
        grouped["exam_requirements"].append(
            {
                **base,
                "raw_payload": {
                    "entrance_exams": row.get("admissions", {}).get("entrance_exams", []),
                    "international": row.get("international", {}),
                },
            }
        )
        grouped["cutoffs"].append({**base, "raw_payload": {"cutoff_ranges": row.get("admissions", {}).get("cutoff_ranges", [])}})
        grouped["scholarships"].append({**base, "raw_payload": {"scholarships": row.get("fees", {}).get("scholarships", [])}})
        grouped["programs"].append({**base, "raw_payload": row.get("academics", {})})

    return grouped


def main() -> int:
    diagnostics_dir = os.getenv("SCRAPER_DIAGNOSTICS_DIR", "scraper_diagnostics")
    os.makedirs(diagnostics_dir, exist_ok=True)
    mode = os.getenv("SCRAPE_MODE", "weekly").strip().lower()
    status = "failed"
    payload = {
        "workflow": f"india-{mode}-refresh",
        "timestamp": _now_iso(),
        "status": status,
        "institutions_processed": 0,
        "written_rows": 0,
        "failed_rows": 0,
        "stale_records": 0,
        "dead_letter": 0,
        "error": None,
    }

    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        payload["error"] = "SUPABASE_DB_URL missing"
        with open(os.path.join(diagnostics_dir, "india_health_summary.json"), "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
        return 1

    conn = None
    try:
        conn = psycopg2.connect(db_url)
        pipeline = IndiaIngestionPipeline(
            source_config_path="scraper/indian/sources/shiksha.yaml",
            diagnostics_dir=diagnostics_dir,
        )
        targets = _fetch_targets(conn, mode)
        result = pipeline.run(targets, mode=mode)

        writer = SupabaseIndianWriter(conn)
        write_result = writer.write(_flatten_for_writes(result["records"]), parser_version=PARSER_VERSION)

        payload.update(
            {
                "status": "degraded" if write_result["failed"] or result["dead_letter"] else "success",
                "institutions_processed": result["summary"]["institutions_processed"],
                "written_rows": write_result["ok"],
                "failed_rows": write_result["failed"],
                "stale_records": result["summary"]["stale_count"],
                "dead_letter": len(result["dead_letter"]) + len(write_result["dead_letter"]),
            }
        )

        with open(os.path.join(diagnostics_dir, "india_write_dead_letter.json"), "w", encoding="utf-8") as handle:
            json.dump(write_result["dead_letter"], handle, indent=2)

    except Exception as exc:
        payload["status"] = "failed"
        payload["error"] = str(exc)
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()

    with open(os.path.join(diagnostics_dir, "india_health_summary.json"), "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)

    return 0 if payload["status"] in {"success", "degraded"} else 1


if __name__ == "__main__":
    raise SystemExit(main())

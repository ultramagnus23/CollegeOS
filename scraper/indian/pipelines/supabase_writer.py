from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Dict, Iterable, List

from psycopg2.extras import execute_batch


class SupabaseIndianWriter:
    TABLE_CONFIG = {
        "admissions": "canonical.indian_admissions",
        "fees": "canonical.indian_fees",
        "placements": "canonical.indian_placements",
        "rankings": "canonical.indian_rankings",
        "exam_requirements": "canonical.indian_exam_requirements",
        "cutoffs": "canonical.indian_cutoffs",
        "scholarships": "canonical.indian_scholarships",
        "programs": "canonical.indian_programs",
    }

    def __init__(self, connection):
        self.connection = connection

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _upsert_rows(self, table: str, rows: Iterable[Dict], parser_version: str) -> Dict:
        ok = 0
        failed = 0
        dead_letter: List[Dict] = []

        sql = f"""
        INSERT INTO {table}
          (institution_id, source_url, source_name, source_confidence, parser_version, extraction_timestamp, raw_payload)
        VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
        ON CONFLICT (institution_id, source_name, source_url) DO UPDATE SET
          source_confidence = EXCLUDED.source_confidence,
          parser_version = EXCLUDED.parser_version,
          extraction_timestamp = EXCLUDED.extraction_timestamp,
          raw_payload = {table}.raw_payload || EXCLUDED.raw_payload,
          updated_at = NOW()
        """

        with self.connection.cursor() as cursor:
            for row in rows:
                try:
                    params = (
                        row["institution_id"],
                        row.get("source_url"),
                        row.get("source_name", "shiksha"),
                        float(row.get("source_confidence", 0.0)),
                        parser_version,
                        row.get("extraction_timestamp") or self._now_iso(),
                        json.dumps(row.get("raw_payload", row), ensure_ascii=False),
                    )
                    execute_batch(cursor, sql, [params], page_size=1)
                    ok += 1
                except Exception as exc:
                    failed += 1
                    dead_letter.append({"row": row, "error": str(exc), "table": table})

        return {"ok": ok, "failed": failed, "dead_letter": dead_letter}

    def write(self, batched_payload: Dict[str, List[Dict]], parser_version: str) -> Dict:
        diagnostics = {"ok": 0, "failed": 0, "dead_letter": []}
        for section, table in self.TABLE_CONFIG.items():
            rows = batched_payload.get(section, [])
            if not rows:
                continue
            result = self._upsert_rows(table, rows, parser_version)
            diagnostics["ok"] += result["ok"]
            diagnostics["failed"] += result["failed"]
            diagnostics["dead_letter"].extend(result["dead_letter"])
        self.connection.commit()
        return diagnostics

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import psycopg2
from psycopg2 import OperationalError
from psycopg2.errors import InvalidAuthorizationSpecification, InvalidCatalogName, UndefinedColumn, UndefinedTable
from psycopg2.extras import execute_batch

from scrapers.schedulers.runner import run_scrape_cycle


REQUIRED_DIAGNOSTIC_FILES = (
    "run_summary.json",
    "scraper_metrics.json",
    "failed_colleges.json",
    "stale_colleges.json",
    "schema_errors.json",
)

SCHEMA_EXPECTATIONS = {
    "canonical.institution_admissions": {"institution_id", "acceptance_rate", "last_verified"},
    "canonical.institution_deadlines": {
        "institution_id",
        "deadline_type",
        "deadline_date",
        "source_url",
        "confidence_score",
        "last_verified",
        "parser_version",
        "extraction_timestamp",
    },
    "canonical.institution_requirements": {
        "institution_id",
        "requirement_type",
        "requirement_text",
        "source_url",
        "confidence_score",
        "last_verified",
        "parser_version",
        "extraction_timestamp",
    },
    "canonical.institution_financials": {"institution_id", "last_verified"},
}


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _structured_log(
    *,
    stage: str,
    error_type: str,
    retryable: bool,
    batch_id: str,
    institution: str = "system",
    column: str | None = None,
    message: str | None = None,
) -> None:
    payload = {
        "institution": institution,
        "stage": stage,
        "error_type": error_type,
        "retryable": retryable,
        "column": column,
        "timestamp": _iso_now(),
        "batch_id": batch_id,
        "workflow": "scrape-weekly",
    }
    if message:
        payload["message"] = message
    print(json.dumps(payload, ensure_ascii=False))


def ensure_diagnostics_files(out_dir: Path) -> Dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    bootstrap = {
        "run_summary.json": {
            "workflow": "scrape-weekly",
            "institutions_processed": 0,
            "success_count": 0,
            "failure_count": 0,
            "schema_errors": 0,
            "network_errors": 0,
            "retry_count": 0,
            "stale_records_detected": 0,
            "duration_seconds": 0,
            "status": "failed",
            "degraded": False,
            "fatal_error": None,
            "timestamp": _iso_now(),
        },
        "scraper_metrics.json": {
            "workflow": "scrape-weekly",
            "institutions_processed": 0,
            "success_count": 0,
            "failure_count": 0,
            "schema_errors": 0,
            "network_errors": 0,
            "retry_count": 0,
            "stale_records_detected": 0,
            "duration_seconds": 0,
            "status": "failed",
            "timestamp": _iso_now(),
        },
        "failed_colleges.json": [],
        "stale_colleges.json": [],
        "schema_errors.json": [],
    }

    for name, payload in bootstrap.items():
        target = out_dir / name
        if not target.exists():
            with target.open("w", encoding="utf-8") as fh:
                json.dump(payload, fh, indent=2)

    legacy = {
        "summary.json": bootstrap["run_summary.json"],
        "diagnostics.json": [],
        "failed_institutions.json": [],
        "stale_institutions.json": [],
    }
    for name, payload in legacy.items():
        target = out_dir / name
        if not target.exists():
            with target.open("w", encoding="utf-8") as fh:
                json.dump(payload, fh, indent=2)

    return bootstrap


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


def validate_schema(conn) -> List[Dict[str, Any]]:
    drift_rows: List[Dict[str, Any]] = []
    with conn.cursor() as cur:
        for qualified_table, required_columns in SCHEMA_EXPECTATIONS.items():
            schema_name, table_name = qualified_table.split(".", 1)
            cur.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s
                """,
                (schema_name, table_name),
            )
            columns = {row[0] for row in cur.fetchall()}
            missing = sorted(required_columns - columns)
            if missing:
                for column in missing:
                    _structured_log(
                        institution="system",
                        stage="schema_validation",
                        error_type="SchemaDrift",
                        retryable=False,
                        column=column,
                        batch_id="batch-0",
                        message=f"missing column {qualified_table}.{column}",
                    )
                drift_rows.append(
                    {
                        "table": qualified_table,
                        "missing_columns": missing,
                        "detected_at": _iso_now(),
                        "error_type": "SchemaDrift",
                    }
                )
    return drift_rows


def derive_disabled_modules(schema_errors: List[Dict[str, Any]]) -> set[str]:
    disabled = set()
    for err in schema_errors:
        table = err.get("table")
        if table == "canonical.institution_deadlines":
            disabled.add("deadlines")
        if table == "canonical.institution_requirements":
            disabled.add("requirements")
        if table == "canonical.institution_admissions":
            disabled.add("admissions")
        if table == "canonical.institution_financials":
            disabled.add("financials")
    return disabled


def upsert_deadlines(conn, deadlines: List[Dict]):
    if not deadlines:
        return
    rows = []
    now = datetime.now(timezone.utc)
    for d in deadlines:
        rows.append(
            (
                d["institution_id"],
                d["deadline_type"],
                d["deadline_date"],
                d.get("source_url"),
                d.get("confidence_score", 0),
                now,
                d.get("parser_version", "deadline_parser_v1"),
                d.get("extraction_timestamp"),
            )
        )

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
    if not requirements:
        return
    rows = []
    now = datetime.now(timezone.utc)
    for r in requirements:
        rows.append(
            (
                r["institution_id"],
                r["requirement_type"],
                r["requirement_text"],
                r.get("source_url"),
                r.get("confidence_score", 0),
                now,
                r.get("parser_version", "requirements_parser_v1"),
                r.get("extraction_timestamp"),
            )
        )

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


def write_json(path: Path, payload: Any) -> None:
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)


def main() -> int:
    mode = os.getenv("SCRAPE_MODE", "weekly").strip().lower()
    out_dir = Path(os.getenv("SCRAPER_DIAGNOSTICS_DIR", "scraper_diagnostics"))
    ensure_diagnostics_files(out_dir)

    started_at = time.time()
    conn = None

    try:
        conn = get_connection()
        schema_errors = validate_schema(conn)
        disabled_modules = derive_disabled_modules(schema_errors)
        targets = fetch_targets(conn, mode)

        checkpoint_path = out_dir / "batch_checkpoint.json"

        def checkpoint_writer(payload: Dict[str, Any]) -> None:
            write_json(checkpoint_path, payload)

        batch_size = int(os.getenv("SCRAPER_BATCH_SIZE", "25"))
        result = run_scrape_cycle(
            targets,
            batch_size=batch_size,
            checkpoint_callback=checkpoint_writer,
            disabled_modules=disabled_modules,
        )

        if "deadlines" not in disabled_modules:
            upsert_deadlines(conn, result["deadlines"])
        if "requirements" not in disabled_modules:
            upsert_requirements(conn, result["requirements"])

        conn.commit()

        duration_seconds = int(time.time() - started_at)
        summary = {
            "workflow": "scrape-weekly",
            "institutions_processed": result["summary"]["institutions_processed"],
            "success_count": result["summary"]["success_count"],
            "failure_count": result["summary"]["failure_count"],
            "schema_errors": result["summary"]["schema_errors"] + len(schema_errors),
            "network_errors": result["summary"]["network_errors"],
            "retry_count": result["summary"]["retry_count"],
            "stale_records_detected": result["summary"]["stale_records_detected"],
            "duration_seconds": duration_seconds,
            "status": "degraded" if (result["summary"]["failure_count"] > 0 or schema_errors) else "success",
            "degraded": bool(result["summary"]["failure_count"] > 0 or schema_errors),
            "disabled_modules": sorted(disabled_modules),
            "timestamp": _iso_now(),
            "fatal_error": None,
        }

        failed_colleges = [d for d in result["diagnostics"] if not d.get("success")]
        write_json(out_dir / "run_summary.json", summary)
        write_json(out_dir / "scraper_metrics.json", summary)
        write_json(out_dir / "failed_colleges.json", failed_colleges)
        write_json(out_dir / "stale_colleges.json", [d for d in result["diagnostics"] if d.get("stale")])
        write_json(out_dir / "schema_errors.json", schema_errors)

        write_json(out_dir / "summary.json", summary)
        write_json(out_dir / "diagnostics.json", result["diagnostics"])
        write_json(out_dir / "failed_institutions.json", failed_colleges)
        write_json(out_dir / "stale_institutions.json", [d for d in result["diagnostics"] if d.get("stale")])

        print(json.dumps(summary, ensure_ascii=False))
        return 0

    except (OperationalError, InvalidAuthorizationSpecification, InvalidCatalogName) as exc:
        _structured_log(
            stage="initialization",
            error_type="DatabaseUnavailable",
            retryable=False,
            batch_id="batch-0",
            message=str(exc),
        )
        failure_summary = ensure_diagnostics_files(out_dir)["run_summary.json"]
        failure_summary["fatal_error"] = str(exc)
        failure_summary["status"] = "failed"
        write_json(out_dir / "run_summary.json", failure_summary)
        write_json(out_dir / "scraper_metrics.json", failure_summary)
        return 1

    except (UndefinedTable, UndefinedColumn) as exc:
        _structured_log(
            stage="initialization",
            error_type="MigrationIncompatibility",
            retryable=False,
            batch_id="batch-0",
            message=str(exc),
        )
        failure_summary = ensure_diagnostics_files(out_dir)["run_summary.json"]
        failure_summary["fatal_error"] = str(exc)
        failure_summary["status"] = "failed"
        write_json(out_dir / "run_summary.json", failure_summary)
        write_json(out_dir / "scraper_metrics.json", failure_summary)
        return 1

    except Exception as exc:
        _structured_log(
            stage="initialization",
            error_type="InitializationFailure",
            retryable=False,
            batch_id="batch-0",
            message=str(exc),
        )
        failure_summary = ensure_diagnostics_files(out_dir)["run_summary.json"]
        failure_summary["fatal_error"] = str(exc)
        failure_summary["status"] = "failed"
        write_json(out_dir / "run_summary.json", failure_summary)
        write_json(out_dir / "scraper_metrics.json", failure_summary)
        return 1

    finally:
        if conn is not None:
            conn.close()


if __name__ == "__main__":
    raise SystemExit(main())

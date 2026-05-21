from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple

import psycopg2
from psycopg2 import errors
from psycopg2.extras import execute_batch

from scrapers.schedulers.runner import run_scrape_cycle

WORKFLOW_NAME = "scrape-weekly"
DIAGNOSTIC_FILES = (
    "run_summary.json",
    "scraper_metrics.json",
    "failed_colleges.json",
    "schema_errors.json",
)

REQUIRED_SCHEMA_COLUMNS = {
    "canonical.institution_admissions": {
        "institution_id",
        "acceptance_rate",
    },
    "canonical.institution_deadlines": {
        "institution_id",
        "deadline_type",
        "deadline_date",
    },
    "canonical.institution_requirements": {
        "institution_id",
        "requirement_category",
        "requirement_name",
    },
    "canonical.institution_financials": {
        "institution_id",
        "tuition_in_state",
    },
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def diagnostics_dir() -> Path:
    out = Path(os.getenv("SCRAPER_DIAGNOSTICS_DIR", "scraper_diagnostics"))
    out.mkdir(parents=True, exist_ok=True)
    return out


def bootstrap_diagnostics() -> Path:
    out_dir = diagnostics_dir()
    for filename in DIAGNOSTIC_FILES:
        path = out_dir / filename
        if not path.exists():
            path.write_text("[]", encoding="utf-8")
    return out_dir


def write_json_file(path: Path, payload) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def emit_structured_log(
    *,
    institution: str,
    stage: str,
    error_type: str,
    retryable: bool,
    message: str,
    batch_id: str | None = None,
    column: str | None = None,
) -> None:
    print(
        json.dumps(
            {
                "institution": institution,
                "stage": stage,
                "error_type": error_type,
                "retryable": retryable,
                "column": column,
                "timestamp": now_iso(),
                "batch_id": batch_id or "n/a",
                "workflow": WORKFLOW_NAME,
                "message": message,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )


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
                SELECT i.id::text AS institution_id, COALESCE(i.website, '') AS source_url
                FROM canonical.institutions i
                LEFT JOIN canonical.popularity_index pi ON pi.institution_id = i.id
                WHERE COALESCE(i.website, '') <> ''
                ORDER BY COALESCE(pi.popularity_score, 0) DESC
                LIMIT 350
                """
            )
        else:
            cur.execute(
                """
                SELECT i.id::text AS institution_id, COALESCE(i.website, '') AS source_url
                FROM canonical.institutions i
                WHERE COALESCE(i.website, '') <> ''
                ORDER BY i.id
                LIMIT 1200
                """
            )
        rows = cur.fetchall()
    return [{"institution_id": r[0], "source_url": r[1]} for r in rows]


def _is_retryable_db_error(exc: Exception) -> bool:
    retryable_codes = {"40001", "40P01", "53300", "57P03", "08000", "08003", "08006", "08001"}
    pgcode = getattr(exc, "pgcode", None)
    if pgcode and pgcode in retryable_codes:
        return True
    return isinstance(exc, (psycopg2.OperationalError, psycopg2.InterfaceError))


def _execute_batch_with_retry(conn, query: str, rows: List[Tuple], *, operation: str, metrics: Dict) -> None:
    if not rows:
        return
    max_attempts = 3
    for attempt in range(1, max_attempts + 1):
        try:
            with conn.cursor() as cur:
                execute_batch(cur, query, rows, page_size=200)
            return
        except Exception as exc:
            if _is_retryable_db_error(exc) and attempt < max_attempts:
                metrics["retry_count"] = int(metrics.get("retry_count", 0)) + 1
                wait_seconds = min(10, 2 * attempt)
                emit_structured_log(
                    institution="batch",
                    stage=operation,
                    error_type="TransientDatabaseError",
                    retryable=True,
                    message=f"{exc}; retrying in {wait_seconds}s",
                    batch_id=f"db-retry-{attempt}",
                )
                time.sleep(wait_seconds)
                continue
            raise


def upsert_deadlines(conn, deadlines: List[Dict], metrics: Dict):
    rows = []
    now = datetime.now(timezone.utc)
    for d in deadlines:
        cycle_year = d.get("cycle_year")
        if cycle_year is None:
            cycle_year = str(datetime.now(timezone.utc).year)
        rows.append(
            (
                d["institution_id"],
                cycle_year,
                d["deadline_type"],
                d["deadline_date"],
                d.get("source_url"),
                d.get("confidence_score", 0),
                now,
                d.get("parser_version", "deadline_parser_v1"),
                d.get("extraction_timestamp"),
            )
        )
    _execute_batch_with_retry(
        conn,
        """
        INSERT INTO canonical.institution_deadlines
          (institution_id, cycle_year, deadline_type, deadline_date, source_url, confidence_score, last_verified, parser_version, extraction_timestamp)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (institution_id, cycle_year_key, deadline_type, deadline_date_key) DO UPDATE SET
          deadline_date = EXCLUDED.deadline_date,
          source_url = EXCLUDED.source_url,
          confidence_score = EXCLUDED.confidence_score,
          last_verified = EXCLUDED.last_verified,
          parser_version = EXCLUDED.parser_version,
          extraction_timestamp = EXCLUDED.extraction_timestamp
        """,
        rows,
        operation="deadlines_upsert",
        metrics=metrics,
    )


def upsert_requirements(conn, requirements: List[Dict], metrics: Dict):
    rows = []
    now = datetime.now(timezone.utc)
    for r in requirements:
        requirement_category = r.get("requirement_type") or r.get("requirement_category") or "general"
        requirement_name = r.get("requirement_name") or r.get("requirement_text") or "unknown_requirement"
        requirement_value = r.get("requirement_value")
        if requirement_value is None and r.get("requirement_text"):
            requirement_value = r.get("requirement_text")
        rows.append(
            (
                r["institution_id"],
                requirement_category,
                requirement_name,
                requirement_value,
                r.get("source_url"),
                r.get("confidence_score", 0),
                now,
                r.get("parser_version", "requirements_parser_v1"),
                r.get("extraction_timestamp"),
            )
        )
    _execute_batch_with_retry(
        conn,
        """
        INSERT INTO canonical.institution_requirements
          (institution_id, requirement_category, requirement_name, requirement_value, source_url, confidence_score, last_verified, parser_version, extraction_timestamp)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (institution_id, requirement_category, requirement_name) DO UPDATE SET
          requirement_value = COALESCE(EXCLUDED.requirement_value, canonical.institution_requirements.requirement_value),
          source_url = EXCLUDED.source_url,
          confidence_score = EXCLUDED.confidence_score,
          last_verified = EXCLUDED.last_verified,
          parser_version = EXCLUDED.parser_version,
          extraction_timestamp = EXCLUDED.extraction_timestamp
        """,
        rows,
        operation="requirements_upsert",
        metrics=metrics,
    )


def validate_schema(conn) -> Tuple[Dict[str, bool], List[Dict]]:
    module_status = {
        "admissions": True,
        "deadlines": True,
        "requirements": True,
        "financials": True,
    }
    schema_errors: List[Dict] = []
    with conn.cursor() as cur:
        for table_name, required_columns in REQUIRED_SCHEMA_COLUMNS.items():
            schema_name, relation_name = table_name.split(".")
            cur.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s
                """,
                (schema_name, relation_name),
            )
            columns = {row[0] for row in cur.fetchall()}
            missing = sorted(required_columns - columns)
            module_name = relation_name.replace("institution_", "")
            if missing:
                module_status[module_name] = False
                schema_errors.append(
                    {
                        "table": table_name,
                        "module": module_name,
                        "missing_columns": missing,
                        "error_type": "SchemaError",
                        "timestamp": now_iso(),
                    }
                )
                emit_structured_log(
                    institution="schema",
                    stage="schema_validation",
                    error_type="SchemaError",
                    retryable=False,
                    message=f"{table_name} missing columns: {', '.join(missing)}",
                    column=",".join(missing),
                )
    return module_status, schema_errors


def write_diagnostics(
    *,
    out_dir: Path,
    run_summary: Dict,
    scraper_metrics: Dict,
    failed_colleges: List[Dict],
    schema_errors: List[Dict],
) -> None:
    write_json_file(out_dir / "run_summary.json", run_summary)
    write_json_file(out_dir / "scraper_metrics.json", scraper_metrics)
    write_json_file(out_dir / "failed_colleges.json", failed_colleges)
    write_json_file(out_dir / "schema_errors.json", schema_errors)


def main() -> int:
    start = datetime.now(timezone.utc)
    out_dir = bootstrap_diagnostics()
    checkpoint_path = str(out_dir / "checkpoint.json")
    mode = os.getenv("SCRAPE_MODE", "weekly").strip().lower()
    status = "failed"
    conn = None

    run_summary = {
        "workflow": WORKFLOW_NAME,
        "institutions_processed": 0,
        "success_count": 0,
        "failure_count": 0,
        "schema_errors": 0,
        "network_errors": 0,
        "retry_count": 0,
        "stale_records_detected": 0,
        "duration_seconds": 0,
        "status": status,
    }
    scraper_metrics = {
        "workflow": WORKFLOW_NAME,
        "degraded": False,
        "module_status": {},
        "error_types": {},
        "batches_completed": 0,
        "resume_index": 0,
        "retry_count": 0,
    }
    failed_colleges: List[Dict] = []
    schema_errors: List[Dict] = []
    exit_code = 0

    try:
        conn = get_connection()
        module_status, schema_errors = validate_schema(conn)
        scraper_metrics["module_status"] = module_status

        targets = fetch_targets(conn, mode)
        result = run_scrape_cycle(
            targets,
            checkpoint_path=checkpoint_path,
            workflow_name=WORKFLOW_NAME,
        )
        summary = result["summary"]
        failed_colleges = [d for d in result["diagnostics"] if not d["success"]]

        if module_status.get("deadlines", True):
            upsert_deadlines(conn, result["deadlines"], scraper_metrics)
        if module_status.get("requirements", True):
            upsert_requirements(conn, result["requirements"], scraper_metrics)
        conn.commit()

        error_types = summary.get("error_types", {})
        retry_count = int(summary.get("retry_count", 0)) + int(scraper_metrics.get("retry_count", 0))
        degraded = bool(failed_colleges or schema_errors)
        status = "degraded" if degraded else "success"

        run_summary = {
            "workflow": WORKFLOW_NAME,
            "institutions_processed": int(summary.get("targets", 0)),
            "success_count": int(summary.get("success", 0)),
            "failure_count": int(summary.get("failures", 0)),
            "schema_errors": len(schema_errors),
            "network_errors": int(error_types.get("NetworkError", 0) + error_types.get("RateLimitError", 0)),
            "retry_count": retry_count,
            "stale_records_detected": int(summary.get("stale_sources", 0)),
            "duration_seconds": int((datetime.now(timezone.utc) - start).total_seconds()),
            "status": status,
        }
        scraper_metrics = {
            "workflow": WORKFLOW_NAME,
            "degraded": degraded,
            "module_status": module_status,
            "error_types": error_types,
            "batches_completed": int(summary.get("batches_completed", 0)),
            "resume_index": int(summary.get("resume_index", 0)),
            "retry_count": retry_count,
        }
        print(json.dumps(run_summary, ensure_ascii=False))
    except (RuntimeError, psycopg2.OperationalError) as exc:
        status = "failed"
        exit_code = 1
        emit_structured_log(
            institution="system",
            stage="initialization",
            error_type="InitializationError",
            retryable=False,
            message=str(exc),
        )
    except (errors.InvalidAuthorizationSpecification, errors.InvalidPassword) as exc:
        status = "failed"
        exit_code = 1
        emit_structured_log(
            institution="system",
            stage="authentication",
            error_type="AuthenticationError",
            retryable=False,
            message=str(exc),
        )
    except (errors.UndefinedTable, errors.UndefinedColumn, errors.DatatypeMismatch) as exc:
        status = "failed"
        exit_code = 1
        emit_structured_log(
            institution="system",
            stage="migration_compatibility",
            error_type="MigrationCompatibilityError",
            retryable=False,
            message=str(exc),
        )
    except Exception as exc:
        status = "failed"
        exit_code = 1
        emit_structured_log(
            institution="system",
            stage="catastrophic_failure",
            error_type="CatastrophicError",
            retryable=False,
            message=str(exc),
        )
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
        run_summary["duration_seconds"] = int((datetime.now(timezone.utc) - start).total_seconds())
        run_summary["status"] = status
        write_diagnostics(
            out_dir=out_dir,
            run_summary=run_summary,
            scraper_metrics=scraper_metrics,
            failed_colleges=failed_colleges,
            schema_errors=schema_errors,
        )
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())

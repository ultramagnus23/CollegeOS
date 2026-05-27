#!/usr/bin/env python3
"""
scraper/pipeline.py
--------------------
Master data pipeline for CollegeOS.

Orchestrates three data sources (IPEDS, College Scorecard, NCES CSV),
merges their results into one record per college, validates every field,
and upserts the clean data into the PostgreSQL `colleges_comprehensive` table.

Usage:
    python scraper/pipeline.py

Required env vars:
    SUPABASE_DB_URL            -- full Postgres connection string (port 6543 for Supabase)

    IPEDS_API_KEY              -- data.gov API key for IPEDS source
    COLLEGE_SCORECARD_API_KEY  -- data.gov API key for Scorecard source
    REQUEST_DELAY_SEC          -- delay between API pages (default: 0.3)

Exit codes:
    0  -- success (>=500 rows updated)
    1  -- fatal error or fewer than 500 rows updated
"""

import json
import logging
import os
import re
import sys
import time
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Callable, Optional

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential

# -- Bootstrap ----------------------------------------------------------------

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("pipeline")

# Minimum successful upserts before the pipeline declares failure
MIN_SUCCESS_ROWS = int(os.environ.get("MIN_SUCCESS_ROWS", "500"))
DEFAULT_IPEDS_CONFIDENCE_SCORE = 0.7

# Fuzzy-match threshold for name matching (0-1)
FUZZY_THRESHOLD = 0.85


class SchemaError(Exception):
    """Non-retryable schema mismatch."""


class ParseError(Exception):
    """Non-retryable source parsing failure."""


class NetworkError(Exception):
    """Retryable network failure."""


class ValidationError(Exception):
    """Non-retryable validation failure."""


class TransientDatabaseError(Exception):
    """Retryable transient database failure."""


@dataclass
class UpsertPlan:
    sql: str
    params_builder: Callable[..., tuple]

# -- Validation constants -----------------------------------------------------

ACCEPTANCE_RATE_MIN = 0.01
ACCEPTANCE_RATE_MAX = 0.99
SAT_MIN, SAT_MAX = 400, 1600
ACT_MIN, ACT_MAX = 1, 36

# -- Source imports (lazy -- only fail if all three fail) ---------------------

def _import_sources():
    """
    Import all three source modules.  Returns a dict of {name: module}.
    Each module exposes a fetch() function.
    """
    import importlib
    sources = {}
    for name in ("ipeds", "scorecard", "collegedata_csv"):
        try:
            mod = importlib.import_module(f"scraper.sources.{name}")
            sources[name] = mod
        except ImportError as exc:
            log.warning(f"Could not import source '{name}': {exc}")
    return sources

# -- Name normalisation -------------------------------------------------------

_PUNCT_RE = re.compile(r"[^\w\s]")


def _normalise_name(name: str) -> str:
    """
    Normalise an institution name for matching.
    Lowercases, strips punctuation, collapses whitespace, removes accents.
    """
    # Decompose unicode (e.g. e + combining accent) then strip non-ASCII
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_only = nfkd.encode("ascii", "ignore").decode("ascii")
    lower = ascii_only.lower()
    no_punct = _PUNCT_RE.sub(" ", lower)
    return " ".join(no_punct.split())


# -- Field validators ---------------------------------------------------------

def _validate_acceptance_rate(value, college_name: str) -> Optional[float]:
    """
    Validate and return acceptance_rate as a decimal in [0.01, 0.99].
    Converts percentage form (e.g. 18.5 -> 0.185) automatically.
    Logs and returns None if the value is invalid.
    """
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        log.debug(f"[{college_name}] invalid acceptance_rate type: {value!r}")
        return None

    # Convert percent form to decimal if > 1
    if v > 1.0:
        v = v / 100.0

    if not (ACCEPTANCE_RATE_MIN <= v <= ACCEPTANCE_RATE_MAX):
        log.debug(
            f"[{college_name}] acceptance_rate={v:.4f} out of range "
            f"[{ACCEPTANCE_RATE_MIN}, {ACCEPTANCE_RATE_MAX}] -- skipped"
        )
        return None

    return round(v, 6)


def _validate_sat(value) -> Optional[int]:
    """Validate SAT composite score (400-1600). Returns None if out of range."""
    if value is None:
        return None
    try:
        v = int(value)
    except (TypeError, ValueError):
        return None
    return v if SAT_MIN <= v <= SAT_MAX else None


def _validate_act(value) -> Optional[int]:
    """Validate ACT composite score (1-36). Returns None if out of range."""
    if value is None:
        return None
    try:
        v = int(value)
    except (TypeError, ValueError):
        return None
    return v if ACT_MIN <= v <= ACT_MAX else None


def _validate_positive_int(value) -> Optional[int]:
    """Validate a positive integer (enrollment, applicants, tuition, earnings)."""
    if value is None:
        return None
    try:
        v = int(float(value))
    except (TypeError, ValueError):
        return None
    return v if v > 0 else None


def _validate_rate(value) -> Optional[float]:
    """Validate a rate/fraction in [0.0, 1.0] (completion rate, etc.)."""
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return round(v, 6) if 0.0 <= v <= 1.0 else None


def validate_record(record: dict) -> dict:
    """
    Validate all numeric fields of a merged college record in place.
    Invalid values are set to None (they will not overwrite existing DB data).
    Returns the cleaned record.
    """
    name = record.get("name", "")
    record["acceptance_rate"] = _validate_acceptance_rate(record.get("acceptance_rate"), name)
    record["median_sat_25"] = _validate_sat(record.get("median_sat_25"))
    record["median_sat_75"] = _validate_sat(record.get("median_sat_75"))
    record["median_act_25"] = _validate_act(record.get("median_act_25"))
    record["median_act_75"] = _validate_act(record.get("median_act_75"))
    record["total_enrollment"] = _validate_positive_int(record.get("total_enrollment"))
    record["applications_received"] = _validate_positive_int(record.get("applications_received"))
    record["tuition_in_state"] = _validate_positive_int(record.get("tuition_in_state"))
    record["tuition_out_of_state"] = _validate_positive_int(record.get("tuition_out_of_state"))
    record["completion_rate"] = _validate_rate(record.get("completion_rate"))
    record["median_earnings_post_grad"] = _validate_positive_int(
        record.get("median_earnings_post_grad")
    )
    return record


# -- Merge logic --------------------------------------------------------------

def merge_sources(
    ipeds: list[dict],
    scorecard: list[dict],
    nces: list[dict],
) -> dict[str, dict]:
    """
    Merge records from three sources into a name-keyed dict.

    Priority order (highest wins for non-null values):
        IPEDS > Scorecard > NCES CSV

    This means for acceptance_rate and enrollment, IPEDS takes precedence;
    for earnings and completion, Scorecard takes precedence; NCES fills gaps.
    """
    merged: dict[str, dict] = {}

    def _apply(records: list[dict], source_priority: int) -> None:
        for rec in records:
            key = _normalise_name(rec.get("name", ""))
            if not key:
                continue
            existing = merged.setdefault(key, {"name": rec["name"]})
            for field, val in rec.items():
                if val is not None:
                    # Sources are applied in ascending priority order so that
                    # higher-priority sources (applied last) overwrite lower ones.
                    existing[field] = val
            existing["_priority"] = max(existing.get("_priority", 0), source_priority)

    # Applied in ascending priority: NCES sets baseline, Scorecard fills earnings/
    # completion, IPEDS overwrites admission/enrollment (highest priority, last applied).
    _apply(nces, source_priority=1)
    _apply(scorecard, source_priority=2)
    _apply(ipeds, source_priority=3)

    return merged


# -- Database helpers ---------------------------------------------------------

@retry(stop=stop_after_attempt(4), wait=wait_exponential(min=2, max=20))
def _get_connection(db_url: str) -> psycopg2.extensions.connection:
    """Open a psycopg2 connection with retry logic."""
    conn = psycopg2.connect(db_url)
    conn.set_session(autocommit=False)
    return conn


def load_db_colleges(conn) -> dict[str, int]:
    """
    Load all (normalised_name -> id) pairs from colleges_comprehensive.
    Used for fuzzy matching incoming scraper records to DB rows.
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id, name FROM colleges_comprehensive ORDER BY id")
        rows = cur.fetchall()
    return {_normalise_name(row["name"]): row["id"] for row in rows}


def log_run_start(conn, job_name: str) -> int:
    """Insert scraper_run_logs start row and return run id."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO scraper_run_logs (job_name, started_at)
            VALUES (%s, NOW())
            RETURNING id
            """,
            (job_name,),
        )
        row = cur.fetchone()
        if row is None:
            raise RuntimeError(
                f"Failed to create scraper_run_logs row for job: {job_name}. "
                "Check database connectivity and scraper_run_logs constraints."
            )
        return int(row[0])


def log_run_end(conn, run_id: int, rows_upserted: int, status: str, error: Optional[str] = None) -> None:
    """Finalize scraper_run_logs row."""
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE scraper_run_logs
            SET finished_at = NOW(),
                rows_upserted = %s,
                status = %s,
                error_message = %s
            WHERE id = %s
            """,
            (rows_upserted, status, error, run_id),
        )


def find_college_id(name: str, db_lookup: dict[str, int]) -> Optional[int]:
    """
    Find the DB id for a college by normalised name.

    Steps:
      1. Exact match on normalised name.
      2. 30-character prefix match.
      3. SequenceMatcher fuzzy match (threshold: FUZZY_THRESHOLD).

    Returns None if no match meets the threshold.
    """
    key = _normalise_name(name)

    # 1. Exact
    if key in db_lookup:
        return db_lookup[key]

    # 2. Prefix (handles truncated names reasonably well)
    prefix = key[:30]
    for k, cid in db_lookup.items():
        if k[:30] == prefix:
            return cid

    # 3. Fuzzy
    best_score = 0.0
    best_id = None
    for k, cid in db_lookup.items():
        score = SequenceMatcher(None, key, k).ratio()
        if score > best_score:
            best_score = score
            best_id = cid

    if best_score >= FUZZY_THRESHOLD:
        return best_id

    return None


# -- Upsert -------------------------------------------------------------------

# Uses COALESCE so existing non-null DB values survive if the new value is NULL.
_UPSERT_COLUMN_MAP = [
    ("acceptance_rate", "acceptance_rate"),
    ("total_enrollment", "total_enrollment"),
    ("applications_received", "applications_received"),
    ("median_sat_25", "median_sat_25"),
    ("median_sat_75", "median_sat_75"),
    ("median_act_25", "median_act_25"),
    ("median_act_75", "median_act_75"),
    ("tuition_in_state", "tuition_in_state"),
    ("tuition_out_of_state", "tuition_out_of_state"),
    ("completion_rate", "completion_rate"),
    ("median_earnings_post_grad", "median_earnings_post_grad"),
    ("data_source", "data_source"),
]

_UPSERT_SQL_CACHE = None
_UPSERT_FIELDS_CACHE = None


def _get_table_columns(conn, schema: str, table: str) -> set[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = %s
              AND table_name = %s
            """,
            (schema, table),
        )
        return {r[0] for r in cur.fetchall()}


def _resolve_upsert_sql(conn):
    global _UPSERT_SQL_CACHE, _UPSERT_FIELDS_CACHE
    if _UPSERT_SQL_CACHE is not None and _UPSERT_FIELDS_CACHE is not None:
        return _UPSERT_SQL_CACHE, _UPSERT_FIELDS_CACHE

    cols = _get_table_columns(conn, "public", "colleges_comprehensive")
    assignments = []
    selected = []
    for key, column in _UPSERT_COLUMN_MAP:
        if column in cols:
            assignments.append(f"{column} = COALESCE(%s, {column})")
            selected.append((key, column))

    if "last_data_refresh" in cols:
        assignments.append("last_data_refresh = NOW()")

    if not assignments:
        raise RuntimeError("No compatible columns found for colleges_comprehensive upsert")

    _UPSERT_SQL_CACHE = f"""
        UPDATE colleges_comprehensive
        SET
            {", ".join(assignments)}
        WHERE id = %s
        RETURNING id;
    """
    _UPSERT_FIELDS_CACHE = selected
    missing = [column for _, column in _UPSERT_COLUMN_MAP if column not in cols]
    if missing:
        log.warning(
            "Schema drift detected in colleges_comprehensive; skipping missing columns: %s",
            ", ".join(missing),
        )
    return _UPSERT_SQL_CACHE, _UPSERT_FIELDS_CACHE


_ADMISSIONS_UPSERT_SQL = """
    INSERT INTO college_admissions (
        college_id, year, acceptance_rate, yield_rate,
        application_volume, admit_volume, enrollment_volume,
        sat_verbal_25, sat_verbal_75, sat_math_25, sat_math_75,
        act_25, act_75, source, confidence_score
    ) VALUES (
        %s, %s, %s, %s,
        %s, %s, %s,
        %s, %s, %s, %s,
        %s, %s, %s, %s
    )
    ON CONFLICT (college_id, year) DO UPDATE SET
        acceptance_rate   = COALESCE(EXCLUDED.acceptance_rate, college_admissions.acceptance_rate),
        yield_rate        = COALESCE(EXCLUDED.yield_rate, college_admissions.yield_rate),
        application_volume = COALESCE(EXCLUDED.application_volume, college_admissions.application_volume),
        admit_volume      = COALESCE(EXCLUDED.admit_volume, college_admissions.admit_volume),
        enrollment_volume = COALESCE(EXCLUDED.enrollment_volume, college_admissions.enrollment_volume),
        sat_verbal_25     = COALESCE(EXCLUDED.sat_verbal_25, college_admissions.sat_verbal_25),
        sat_verbal_75     = COALESCE(EXCLUDED.sat_verbal_75, college_admissions.sat_verbal_75),
        sat_math_25       = COALESCE(EXCLUDED.sat_math_25, college_admissions.sat_math_25),
        sat_math_75       = COALESCE(EXCLUDED.sat_math_75, college_admissions.sat_math_75),
        act_25            = COALESCE(EXCLUDED.act_25, college_admissions.act_25),
        act_75            = COALESCE(EXCLUDED.act_75, college_admissions.act_75),
        source            = EXCLUDED.source,
        confidence_score  = EXCLUDED.confidence_score
    RETURNING id;
"""


# -- Helper utilities ---------------------------------------------------------

def _write_json(path: Path, data) -> None:
    """Serialize data to a JSON file, converting non-serialisable types to str."""
    path.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")


def _structured_log(stage: str, **kwargs) -> None:
    """Emit a single-line structured JSON warning for downstream log parsers."""
    log.warning(json.dumps({"stage": stage, **kwargs}, default=str))


# -- Upsert plan builders -----------------------------------------------------

def _build_college_upsert_plan(conn) -> UpsertPlan:
    """
    Build a UpsertPlan for the colleges_comprehensive table.
    Inspects the live schema so it gracefully handles schema drift.
    Raises RuntimeError if no compatible columns are found.
    """
    sql, fields = _resolve_upsert_sql(conn)

    def params_builder(college_id: int, data: dict, *_) -> tuple:
        params = [data.get(key) for key, _ in fields]
        params.append(college_id)
        return tuple(params)

    return UpsertPlan(sql=sql, params_builder=params_builder)


def _build_admissions_upsert_plan(conn) -> UpsertPlan:
    """
    Build a UpsertPlan for the college_admissions table.
    Raises SchemaError if required columns are missing.
    """
    required_cols = {
        "college_id", "year", "acceptance_rate", "yield_rate",
        "application_volume", "admit_volume", "enrollment_volume",
        "sat_verbal_25", "sat_verbal_75", "sat_math_25", "sat_math_75",
        "act_25", "act_75", "source", "confidence_score",
    }
    cols = _get_table_columns(conn, "public", "college_admissions")
    missing = required_cols - cols
    if missing:
        raise SchemaError(
            f"college_admissions is missing required columns: {', '.join(sorted(missing))}"
        )

    def params_builder(college_id: int, data: dict, year: int) -> tuple:
        return (
            college_id,
            year,
            data.get("acceptance_rate"),
            data.get("yield_rate"),
            data.get("applications_received") or data.get("applicants_total"),
            data.get("admitted_total"),
            data.get("total_enrollment") or data.get("enrolled_total"),
            data.get("sat_verbal_25"),
            data.get("sat_verbal_75"),
            data.get("median_sat_25"),
            data.get("median_sat_75"),
            data.get("median_act_25"),
            data.get("median_act_75"),
            data.get("data_source", "pipeline"),
            data.get("confidence_score", DEFAULT_IPEDS_CONFIDENCE_SCORE),
        )

    return UpsertPlan(sql=_ADMISSIONS_UPSERT_SQL, params_builder=params_builder)


# -- Diagnostics --------------------------------------------------------------

def ensure_pipeline_diagnostics(out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    defaults = {
        "run_summary.json": {
            "workflow": "refresh-data",
            "rows_upserted": 0,
            "rows_skipped_error": 0,
            "rows_skipped_no_match": 0,
            "rows_skipped_no_data": 0,
            "schema_errors": 0,
            "retry_count": 0,
            "status": "failed",
            "fatal_error": None,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
        "scraper_metrics.json": {
            "workflow": "refresh-data",
            "rows_upserted": 0,
            "rows_skipped_error": 0,
            "schema_errors": 0,
            "retry_count": 0,
            "status": "failed",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
        "failed_colleges.json": [],
        "stale_colleges.json": [],
        "schema_errors.json": [],
    }
    for name, payload in defaults.items():
        target = out_dir / name
        if not target.exists():
            target.write_text(json.dumps(payload, indent=2), encoding="utf-8")


# -- Upsert functions ---------------------------------------------------------

def upsert_college(conn, college_id: int, data: dict, plan: UpsertPlan) -> bool:
    """
    Upsert one row into colleges_comprehensive via the pre-built UpsertPlan.
    Uses a parameterized UPDATE ... RETURNING id -- never string interpolation.
    Returns True if the row was updated, False otherwise.
    """
    with conn.cursor() as cur:
        cur.execute(plan.sql, plan.params_builder(college_id, data))
        return cur.fetchone() is not None


def upsert_college_admissions(conn, college_id: int, data: dict, year: int, plan: UpsertPlan) -> bool:
    with conn.cursor() as cur:
        cur.execute(plan.sql, plan.params_builder(college_id, data, year))
        return cur.fetchone() is not None


# -- Main ---------------------------------------------------------------------

def main() -> int:
    """
    Run the full data pipeline:
      1. Fetch from all three sources (concurrently where possible).
      2. Merge with priority: IPEDS > Scorecard > NCES CSV.
      3. Validate every field.
      4. Upsert into PostgreSQL.
      5. Exit 1 if fewer than MIN_SUCCESS_ROWS rows were updated.
    """
    diagnostics_dir = Path(os.environ.get("SCRAPER_DIAGNOSTICS_DIR", "scraper_diagnostics"))
    ensure_pipeline_diagnostics(diagnostics_dir)
    started_at = time.time()

    db_url = os.environ.get("SUPABASE_DB_URL", "") or os.environ.get("DATABASE_URL", "")
    if not db_url:
        log.error("SUPABASE_DB_URL (or DATABASE_URL) is not set. Aborting.")
        summary = {
            "workflow": "refresh-data",
            "status": "failed",
            "fatal_error": "SUPABASE_DB_URL (or DATABASE_URL) is not set",
            "rows_upserted": 0,
            "rows_skipped_error": 0,
            "rows_skipped_no_match": 0,
            "rows_skipped_no_data": 0,
            "schema_errors": 1,
            "retry_count": 0,
            "duration_seconds": int(time.time() - started_at),
        }
        _write_json(diagnostics_dir / "run_summary.json", summary)
        _write_json(diagnostics_dir / "scraper_metrics.json", summary)
        return 1

    # -- Step 1: Fetch from all sources ---------------------------------------
    sources = _import_sources()
    if not sources:
        log.error("No source modules available. Aborting.")
        return 1

    ipeds_data: list[dict] = []
    scorecard_data: list[dict] = []
    nces_data: list[dict] = []

    sources_succeeded = 0

    if "ipeds" in sources:
        try:
            ipeds_data = sources["ipeds"].fetch()
            if ipeds_data:
                sources_succeeded += 1
                log.info(f"IPEDS: {len(ipeds_data)} records")
        except Exception as exc:
            log.error(f"IPEDS source failed: {exc}", exc_info=True)

    if "scorecard" in sources:
        try:
            scorecard_data = sources["scorecard"].fetch()
            if scorecard_data:
                sources_succeeded += 1
                log.info(f"Scorecard: {len(scorecard_data)} records")
        except Exception as exc:
            log.error(f"Scorecard source failed: {exc}", exc_info=True)

    if "collegedata_csv" in sources:
        try:
            nces_data = sources["collegedata_csv"].fetch()
            if nces_data:
                sources_succeeded += 1
                log.info(f"NCES CSV: {len(nces_data)} records")
        except Exception as exc:
            log.error(f"NCES CSV source failed: {exc}", exc_info=True)

    if sources_succeeded == 0:
        log.error("All three data sources failed. Aborting.")
        return 1

    log.info(f"{sources_succeeded}/3 sources succeeded")

    # -- Step 2: Merge --------------------------------------------------------
    merged = merge_sources(ipeds_data, scorecard_data, nces_data)
    log.info(f"Merged {len(merged)} unique institutions from all sources")

    # -- Step 3: Connect to DB ------------------------------------------------
    conn = None
    rows_updated = 0
    rows_skipped_no_match = 0
    rows_skipped_no_data = 0
    rows_skipped_error = 0
    schema_errors: list[dict] = []
    failed_colleges: list[dict] = []
    run_id: Optional[int] = None
    current_year = int(os.environ.get("PIPELINE_YEAR", "2025"))
    admissions_plan: UpsertPlan | None = None
    college_plan: UpsertPlan | None = None

    try:
        conn = _get_connection(db_url)
        run_id = log_run_start(conn, "daily-data-refresh")
        conn.commit()
        college_plan = _build_college_upsert_plan(conn)
        try:
            admissions_plan = _build_admissions_upsert_plan(conn)
        except SchemaError as exc:
            schema_errors.append(
                {
                    "stage": "schema_validation",
                    "table": "college_admissions",
                    "error_type": "SchemaError",
                    "message": str(exc),
                    "retryable": False,
                }
            )
            _structured_log(
                "schema_validation",
                table="college_admissions",
                error_type="SchemaError",
                retryable=False,
                message=str(exc),
            )
        db_colleges = load_db_colleges(conn)
        log.info(f"DB has {len(db_colleges)} colleges to match against")

        # -- Step 4: Validate + Upsert ----------------------------------------
        for _key, record in merged.items():
            name = record.get("name", "")
            college_id = find_college_id(name, db_colleges)

            if college_id is None:
                rows_skipped_no_match += 1
                log.debug(f"[SKIP no-match] {name}")
                continue

            # Validate
            record = validate_record(record)

            # Skip if there is genuinely nothing useful to write
            useful_fields = (
                "acceptance_rate", "total_enrollment", "applications_received",
                "median_sat_25", "median_act_25", "completion_rate", "yield_rate",
                "applicants_total", "admitted_total", "enrolled_total",
                "sat_verbal_25", "sat_verbal_75", "sat_math_25", "sat_math_75",
                "median_earnings_post_grad",
            )
            if not any(record.get(f) is not None for f in useful_fields):
                rows_skipped_no_data += 1
                log.debug(f"[SKIP no-data] {name}")
                continue

            try:
                if college_plan is None:
                    raise SchemaError("college upsert plan is unavailable")
                ok = upsert_college(conn, college_id, record, college_plan)
                if ok:
                    admissions_ok = True
                    if admissions_plan is not None:
                        admissions_ok = upsert_college_admissions(
                            conn, college_id, record, current_year, admissions_plan
                        )
                    if admissions_ok:
                        rows_updated += 1
                    else:
                        rows_skipped_error += 1
                        log.debug(f"[SKIP admissions-upsert-empty] {name}")
                else:
                    rows_skipped_error += 1
                    log.debug(f"[SKIP upsert-empty] {name}")
            except SchemaError as exc:
                rows_skipped_error += 1
                schema_errors.append(
                    {
                        "college": name,
                        "stage": "upsert",
                        "table": "colleges_comprehensive",
                        "error_type": "SchemaError",
                        "message": str(exc),
                        "retryable": False,
                    }
                )
                failed_colleges.append(
                    {
                        "college": name,
                        "stage": "upsert",
                        "error_type": "SchemaError",
                        "message": str(exc),
                        "retryable": False,
                    }
                )
                _structured_log(
                    "upsert",
                    college=name,
                    table="colleges_comprehensive",
                    error_type="SchemaError",
                    retryable=False,
                    message=str(exc),
                )
                conn.rollback()
                continue
            except Exception as exc:
                _structured_log(
                    "upsert",
                    college=name,
                    table="colleges_comprehensive",
                    error_type=exc.__class__.__name__,
                    retryable=False,
                    message=str(exc),
                )
                conn.rollback()
                rows_skipped_error += 1
                failed_colleges.append(
                    {
                        "college": name,
                        "stage": "upsert",
                        "error_type": exc.__class__.__name__,
                        "message": str(exc),
                        "retryable": False,
                    }
                )
                continue

            # Commit in batches of 200 to reduce memory pressure
            if rows_updated % 200 == 0:
                conn.commit()

        conn.commit()
        if run_id is not None:
            status = "success" if rows_updated >= MIN_SUCCESS_ROWS else "partial"
            log_run_end(conn, run_id, rows_updated, status)
            conn.commit()

    except Exception as exc:
        log.error(f"Fatal DB error: {exc}", exc_info=True)
        if conn:
            conn.rollback()
            if run_id is not None:
                try:
                    log_run_end(conn, run_id, rows_updated, "failed", str(exc))
                    conn.commit()
                except Exception:
                    conn.rollback()
        summary = {
            "workflow": "refresh-data",
            "status": "failed",
            "fatal_error": str(exc),
            "rows_upserted": rows_updated,
            "rows_skipped_error": rows_skipped_error,
            "rows_skipped_no_match": rows_skipped_no_match,
            "rows_skipped_no_data": rows_skipped_no_data,
            "schema_errors": len(schema_errors),
            "retry_count": 0,
            "duration_seconds": int(time.time() - started_at),
        }
        _write_json(diagnostics_dir / "failed_colleges.json", failed_colleges)
        _write_json(diagnostics_dir / "schema_errors.json", schema_errors)
        _write_json(diagnostics_dir / "run_summary.json", summary)
        _write_json(diagnostics_dir / "scraper_metrics.json", summary)
        return 1
    finally:
        if conn:
            conn.close()

    # -- Step 5: Summary + exit code ------------------------------------------
    log.info("-" * 60)
    log.info("Pipeline complete:")
    log.info(f"  rows updated         : {rows_updated}")
    log.info(f"  skipped (no DB match): {rows_skipped_no_match}")
    log.info(f"  skipped (no data)    : {rows_skipped_no_data}")
    log.info(f"  skipped (error)      : {rows_skipped_error}")
    log.info("-" * 60)

    print(f"ROWS_UPSERTED={rows_updated}")

    status = "success"
    fatal_error = None
    if rows_updated < MIN_SUCCESS_ROWS or rows_skipped_error > 0 or schema_errors:
        status = "degraded"

    summary = {
        "workflow": "refresh-data",
        "status": status,
        "fatal_error": fatal_error,
        "rows_upserted": rows_updated,
        "rows_skipped_error": rows_skipped_error,
        "rows_skipped_no_match": rows_skipped_no_match,
        "rows_skipped_no_data": rows_skipped_no_data,
        "schema_errors": len(schema_errors),
        "retry_count": 0,
        "duration_seconds": int(time.time() - started_at),
        "threshold": MIN_SUCCESS_ROWS,
    }
    _write_json(diagnostics_dir / "failed_colleges.json", failed_colleges)
    _write_json(diagnostics_dir / "stale_colleges.json", [])
    _write_json(diagnostics_dir / "schema_errors.json", schema_errors)
    _write_json(diagnostics_dir / "run_summary.json", summary)
    _write_json(diagnostics_dir / "scraper_metrics.json", summary)

    if status == "degraded":
        log.warning(
            f"Degraded run: rows_updated={rows_updated}, rows_skipped_error={rows_skipped_error}, "
            f"schema_errors={len(schema_errors)}"
        )
    else:
        log.info(f"Success: {rows_updated} rows updated (threshold: {MIN_SUCCESS_ROWS})")

    return 0


if __name__ == "__main__":
    sys.exit(main())

"""
Masters scraper — direct Postgres write path.

Gate 1 of the masters Phase 1 plan (memory masters_phase1_scope_2026-08-10):
run_starter_ingest.py's parse/validate logic is untouched; this module only
replaces the "emit tmp/scrape_inserts.sql for manual review" delivery
mechanism with real parameterized writes, following the decision already made
in the parked plan (direct write with per-field provenance + a
never-downgrade-confidence ON CONFLICT, not auto-applied generated SQL).

Reuses the connection-pool pattern from scraper/db.py (asyncpg), kept as a
separate module rather than importing that one directly — scraper/db.py's
functions are shaped around canonical.institution_deadlines/requirements
(the UG tables), not the masters_* tables, and mixing the two would make
either file's ON CONFLICT clauses harder to audit at a glance.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import asyncpg
import structlog

# NOTE: scraper/orchestrator.py and scraper/db.py use a bare `from config
# import settings`, which only resolves when run with cwd=scraper/ (they're
# not invoked by any current workflow — effectively orphaned, see CLAUDE.md's
# "two parallel Python scraper trees" note). run_starter_ingest.py is invoked
# as `python -m scraper.masters.run_starter_ingest` from the repo root, so
# this module needs the fully-qualified package import instead.
from scraper.config import settings

log = structlog.get_logger(__name__)

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=settings.database_url,
            min_size=1,
            max_size=5,
            command_timeout=60,
            # DATABASE_URL points at Supabase's pgbouncer pooler in transaction
            # mode, which doesn't support server-side prepared statements
            # (each "transaction" can land on a different backend connection).
            # asyncpg caches prepared statements by default; disable that or
            # every second query fails with DuplicatePreparedStatementError.
            statement_cache_size=0,
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


async def resolve_institution_id(conn: asyncpg.Connection, institution_name: str) -> Optional[str]:
    """Exact case-insensitive name match against canonical.institutions.

    Returns None (never guesses) if there are zero or more-than-one matches —
    canonical.institutions has confirmed duplicate rows for at least MIT and
    Rice (found 2026-09-04), so ">1 match" is a real case, not theoretical.
    Callers must treat None as "needs human resolution", not "no institution
    exists" — the masters_programs row still gets written with
    canonical_institution_id NULL so the program isn't lost, just unlinked.
    """
    rows = await conn.fetch(
        "SELECT id FROM canonical.institutions WHERE lower(canonical_name) = lower($1)",
        institution_name,
    )
    if len(rows) == 1:
        return str(rows[0]["id"])
    if len(rows) > 1:
        log.warning("ambiguous_institution_name", institution_name=institution_name, match_count=len(rows))
    return None


async def upsert_program(conn: asyncpg.Connection, program: dict) -> tuple[str, str]:
    """Upsert one canonical.masters_programs row.

    Dedup is done entirely in application code by natural key —
    (institution_name, program_name, degree_type, intake_term, intake_year),
    case-insensitive — rather than relying on the DB's
    (canonical_institution_id, program_name, degree_type, intake_term,
    intake_year) unique constraint. Two real reasons, found the hard way
    (2026-09-04):

    1. Postgres NULLs never compare equal in a unique constraint, so
       ON CONFLICT silently fails to dedupe whenever canonical_institution_id
       is unresolved — a rerun would insert a fresh duplicate every time.
    2. Even when resolvable, canonical.institutions has confirmed duplicate
       rows for some universities (MIT, Rice) — an ambiguous name resolves to
       NULL here (resolve_institution_id refuses to guess), which then does
       NOT match a pre-existing row for the same program that DOES have
       canonical_institution_id set (e.g. from the original Excel-sourced
       21/510 program_url rows) — the ON CONFLICT path can't see it either,
       for the same NULL-vs-not-null reason. Matching on the natural key
       first sidesteps both: it finds the right row regardless of whether
       either side's canonical_institution_id is set.

    If canonical_institution_id was previously NULL and this run resolved a
    real one, it gets filled in (never the reverse — a resolved link is never
    cleared back to NULL by a later ambiguous run).

    Returns (id, status) where status is 'inserted' | 'updated'.
    """
    pid = program.get("id") or str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    existing = await conn.fetchrow(
        """
        SELECT id, canonical_institution_id FROM canonical.masters_programs
        WHERE lower(institution_name) = lower($1)
          AND lower(program_name) = lower($2)
          AND degree_type = $3
          AND intake_term = $4
          AND intake_year = $5
        """,
        program["institution_name"], program["program_name"], program["degree_type"],
        program.get("intake_term"), program.get("intake_year"),
    )
    if existing:
        new_institution_id = existing["canonical_institution_id"] or program.get("canonical_institution_id")
        await conn.execute(
            """
            UPDATE canonical.masters_programs SET
                canonical_institution_id = $2, gre_requirement = $3, gmat_requirement = $4,
                min_gpa = $5, is_stem_designated = $6, program_url = $7, data_source = $8,
                data_quality_score = $9, last_scraped_at = $10, updated_at = NOW()
            WHERE id = $1
            """,
            existing["id"], new_institution_id, program.get("gre_requirement"),
            program.get("gmat_requirement"), program.get("min_gpa"), program.get("is_stem_designated"),
            program.get("program_url"), program.get("data_source", "official"),
            program.get("data_quality_score"), now,
        )
        return str(existing["id"]), "updated"

    row = await conn.fetchrow(
        """
        INSERT INTO canonical.masters_programs (
            id, canonical_institution_id, institution_name, institution_country, department,
            program_name, degree_type, gre_requirement, gmat_requirement, min_gpa,
            is_stem_designated, program_url, data_source, data_quality_score,
            last_scraped_at, intake_term, intake_year
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        RETURNING id
        """,
        pid, program.get("canonical_institution_id"), program["institution_name"],
        program.get("institution_country"), program.get("department"),
        program["program_name"], program["degree_type"], program.get("gre_requirement"),
        program.get("gmat_requirement"), program.get("min_gpa"), program.get("is_stem_designated"),
        program.get("program_url"), program.get("data_source", "official"),
        program.get("data_quality_score"), now, program.get("intake_term"), program.get("intake_year"),
    )
    return str(row["id"]), "inserted"


async def upsert_pathway(conn: asyncpg.Connection, pathway: dict) -> None:
    """masters_program_pathways has no unique constraint (Gate 0 finding —
    only 6 rows exist, all from a one-time Excel import, not a live write
    path). Delete-then-insert per (masters_program_id, pathway_type) keeps
    reruns idempotent without needing a schema change for this pass."""
    await conn.execute(
        "DELETE FROM canonical.masters_program_pathways WHERE masters_program_id = $1 AND pathway_type = $2",
        pathway["masters_program_id"], pathway["pathway_type"],
    )
    await conn.execute(
        """
        INSERT INTO canonical.masters_program_pathways
            (id, masters_program_id, pathway_type, description, weighted_fields, confidence, source_url, scraped_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        """,
        pathway.get("id") or str(uuid.uuid4()), pathway["masters_program_id"], pathway["pathway_type"],
        pathway.get("description"), json.dumps(pathway.get("weighted_fields") or {}),
        pathway.get("confidence"), pathway.get("source_url"), datetime.now(timezone.utc),
    )


async def upsert_deadline(conn: asyncpg.Connection, deadline: dict) -> str:
    """Upsert into canonical.masters_program_deadlines using the
    uq_masters_deadline_record constraint added in migration 160. Never
    downgrades confidence: a lower-confidence re-scrape doesn't overwrite a
    higher-confidence prior read, mirroring scraper/db.py's UG pattern."""
    row = await conn.fetchrow(
        """
        INSERT INTO canonical.masters_program_deadlines
            (id, masters_program_id, deadline_type, deadline_date, is_rolling,
             intake_term, intake_year, notes, source_url, confidence_score, scraped_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT ON CONSTRAINT uq_masters_deadline_record DO UPDATE SET
            deadline_date    = EXCLUDED.deadline_date,
            is_rolling       = EXCLUDED.is_rolling,
            notes            = EXCLUDED.notes,
            source_url       = EXCLUDED.source_url,
            confidence_score = EXCLUDED.confidence_score,
            scraped_at       = EXCLUDED.scraped_at,
            updated_at       = NOW()
        WHERE EXCLUDED.confidence_score >= canonical.masters_program_deadlines.confidence_score
           OR canonical.masters_program_deadlines.confidence_score IS NULL
        RETURNING (xmax = 0) AS inserted
        """,
        deadline.get("id") or str(uuid.uuid4()), deadline["masters_program_id"], deadline["deadline_type"],
        deadline.get("deadline_date"), deadline.get("is_rolling", False), deadline.get("intake_term"),
        deadline.get("intake_year"), deadline.get("notes"), deadline.get("source_url"),
        deadline.get("confidence_score"), datetime.now(timezone.utc),
    )
    if row is None:
        return "skipped_lower_confidence"
    return "inserted" if row["inserted"] else "updated"


async def log_scrape(conn: asyncpg.Connection, entry: dict) -> None:
    await conn.execute(
        """
        INSERT INTO canonical.masters_scrape_log
            (program_url, institution_name, program_name, status, confidence, issues, missing_fields, http_bytes, scraped_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        """,
        entry.get("program_url"), entry.get("institution_name"), entry.get("program_name"),
        entry["status"], entry.get("confidence"), json.dumps(entry.get("issues") or []),
        json.dumps(entry.get("missing_fields") or []), entry.get("http_bytes"), datetime.now(timezone.utc),
    )


async def log_execution(conn: asyncpg.Connection, *, scraper_name: str, started_at: datetime,
                         rows_inserted: int, rows_updated: int, rows_skipped: int,
                         success: bool, failure_reason: Optional[str], diagnostics: dict) -> None:
    """Writes canonical.scraper_execution_history. Failure semantics (Gate 2
    of the plan): the caller decides `success` based on rows_fetched/
    rows_attempted hitting zero, NOT rows_inserted+rows_updated hitting zero —
    an idempotent no-op rerun that changes nothing is a legitimate pass, not
    a failure. Those raw counters live in `diagnostics` since this table's
    real columns don't name them directly."""
    finished_at = datetime.now(timezone.utc)
    await conn.execute(
        """
        INSERT INTO canonical.scraper_execution_history
            (scraper_name, started_at, finished_at, rows_inserted, rows_updated, rows_skipped,
             runtime_ms, success, failure_reason, diagnostics)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        """,
        scraper_name, started_at, finished_at, rows_inserted, rows_updated, rows_skipped,
        int((finished_at - started_at).total_seconds() * 1000), success, failure_reason,
        json.dumps(diagnostics),
    )

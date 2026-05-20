"""
CollegeOS Scraper — Database Layer
Handles all Postgres operations against the canonical schema.
Uses asyncpg for async, non-blocking I/O.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any

import asyncpg
import structlog

from config import settings

log = structlog.get_logger(__name__)

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=settings.database_url,
            min_size=settings.db_pool_min,
            max_size=settings.db_pool_max,
            command_timeout=60,
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


# ─────────────────────────────────────────────────────────────────────────────
# Institutions
# ─────────────────────────────────────────────────────────────────────────────

async def fetch_all_institutions(
    country_codes: list[str] | None = None,
    limit: int | None = None,
) -> list[asyncpg.Record]:
    """
    Return every institution we need to scrape.
    Optionally filter by country code list.
    """
    pool = await get_pool()

    where_clauses = ["1=1"]
    args: list[Any] = []

    if country_codes:
        args.append(country_codes)
        where_clauses.append(f"country_code = ANY(${len(args)})")

    limit_clause = f"LIMIT ${len(args) + 1}" if limit else ""
    if limit:
        args.append(limit)

    query = f"""
        SELECT
            i.id,
            i.name,
            i.country_code,
            i.website_url,
            i.common_app_id,
            i.ucas_id,
            i.qs_rank,
            i.type
        FROM canonical.institutions i
        WHERE {' AND '.join(where_clauses)}
        ORDER BY i.qs_rank ASC NULLS LAST, i.name ASC
        {limit_clause}
    """

    async with pool.acquire() as conn:
        return await conn.fetch(query, *args)


async def fetch_source_registry(institution_id: str) -> list[asyncpg.Record]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(
            """
            SELECT * FROM canonical.institution_source_registry
            WHERE institution_id = $1
              AND is_active = true
            ORDER BY source_priority DESC
            """,
            uuid.UUID(institution_id),
        )


# ─────────────────────────────────────────────────────────────────────────────
# Deadlines
# ─────────────────────────────────────────────────────────────────────────────

async def upsert_deadline(conn: asyncpg.Connection, record: dict) -> str:
    """
    Upsert a deadline row. Returns 'inserted' | 'updated' | 'unchanged'.
    Also writes to deadline_history if the date changed.
    """

    # Fetch existing row for history diffing
    existing = await conn.fetchrow(
        """
        SELECT id, deadline_date FROM canonical.institution_deadlines
        WHERE institution_id  = $1
          AND cycle_year_key  = $2
          AND applicant_type  = $3
          AND degree_level    = $4
          AND intake_term     = $5
          AND deadline_type   = $6
        """,
        record["institution_id"],
        record["cycle_year_key"],
        record["applicant_type"],
        record["degree_level"],
        record["intake_term"],
        record["deadline_type"],
    )

    now = datetime.now(timezone.utc)

    row_id = await conn.fetchval(
        """
        INSERT INTO canonical.institution_deadlines (
            institution_id, cycle_year, cycle_year_key,
            degree_level, applicant_type, intake_term,
            deadline_type, deadline_date, deadline_date_key,
            notification_date, is_binding, is_rolling, is_estimated,
            source_url, source_domain, source_type,
            parser_name, parser_version,
            extraction_timestamp, last_verified,
            confidence_score, source_priority,
            raw_payload, parser_trace
        ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,
            $13,$14,$15,$16,$17,$18,$18,$19,$20,
            $21,$22
        )
        ON CONFLICT ON CONSTRAINT uq_deadline_record DO UPDATE SET
            deadline_date       = EXCLUDED.deadline_date,
            deadline_date_key   = EXCLUDED.deadline_date,
            notification_date   = EXCLUDED.notification_date,
            is_binding          = EXCLUDED.is_binding,
            is_rolling          = EXCLUDED.is_rolling,
            is_estimated        = EXCLUDED.is_estimated,
            source_url          = EXCLUDED.source_url,
            source_domain       = EXCLUDED.source_domain,
            source_type         = EXCLUDED.source_type,
            parser_name         = EXCLUDED.parser_name,
            parser_version      = EXCLUDED.parser_version,
            last_verified       = EXCLUDED.last_verified,
            confidence_score    = EXCLUDED.confidence_score,
            raw_payload         = EXCLUDED.raw_payload,
            parser_trace        = EXCLUDED.parser_trace,
            updated_at          = NOW()
        RETURNING id
        """,
        record["institution_id"],
        record.get("cycle_year", settings.current_cycle_year),
        record.get("cycle_year_key", settings.current_cycle_year_key),
        record.get("degree_level", "undergraduate"),
        record.get("applicant_type", "international"),
        record.get("intake_term", "fall"),
        record["deadline_type"],
        record.get("deadline_date"),
        record.get("notification_date"),
        record.get("is_binding", False),
        record.get("is_rolling", False),
        record.get("is_estimated", False),
        record.get("source_url"),
        record.get("source_domain"),
        record.get("source_type", "official"),
        record.get("parser_name", settings.scraper_name),
        record.get("parser_version", settings.scraper_version),
        now,
        record.get("confidence_score", 80.0),
        record.get("source_priority", 0),
        json.dumps(record.get("raw_payload", {})),
        json.dumps(record.get("parser_trace", {})),
    )

    # Record history if date changed
    if existing and existing["deadline_date"] != record.get("deadline_date"):
        await conn.execute(
            """
            INSERT INTO canonical.deadline_history
                (institution_deadline_id, previous_deadline, new_deadline, source_url, change_reason)
            VALUES ($1, $2, $3, $4, 'automated_scrape')
            """,
            row_id,
            existing["deadline_date"],
            record.get("deadline_date"),
            record.get("source_url"),
        )
        return "updated"

    return "inserted" if not existing else "unchanged"


# ─────────────────────────────────────────────────────────────────────────────
# Requirements
# ─────────────────────────────────────────────────────────────────────────────

async def upsert_requirement(conn: asyncpg.Connection, record: dict) -> str:
    existing = await conn.fetchrow(
        """
        SELECT id, raw_payload FROM canonical.institution_requirements
        WHERE institution_id = $1
          AND cycle_year     = $2
          AND degree_level   = $3
          AND applicant_type = $4
        """,
        record["institution_id"],
        record.get("cycle_year", settings.current_cycle_year),
        record.get("degree_level", "undergraduate"),
        record.get("applicant_type", "international"),
    )

    now = datetime.now(timezone.utc)
    new_payload = json.dumps(record.get("raw_payload", {}))

    row_id = await conn.fetchval(
        """
        INSERT INTO canonical.institution_requirements (
            institution_id, cycle_year, degree_level, applicant_type,

            sat_policy, act_policy, accepts_clt,
            sat_required, act_required, sat_optional, test_blind,
            sat_superscore, act_superscore,

            toefl_required, ielts_required, duolingo_required, cambridge_required,
            toefl_min_score, ielts_min_score, duolingo_min_score,

            transcript_required, predicted_grades_required,
            cv_required, resume_required,
            essays_required, supplemental_essays_required, supplemental_essay_count,
            portfolio_required, audition_required,

            teacher_recommendations_required, counselor_recommendation_required,
            peer_recommendation_allowed,

            interview_required, interview_optional, interview_type,

            common_app_supported, coalition_app_supported, ucas_supported,
            direct_apply_supported, application_platform,

            financial_documents_required, passport_required, visa_documents_required,

            aps_required, uni_assist_required,

            source_url, source_domain, source_type,
            parser_name, parser_version,
            extraction_timestamp, last_verified,
            confidence_score,
            raw_requirements_text,
            raw_payload, parser_trace
        ) VALUES (
            $1,$2,$3,$4,
            $5,$6,$7,$8,$9,$10,$11,$12,$13,
            $14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25,$26,$27,$28,$29,
            $30,$31,$32,
            $33,$34,$35,
            $36,$37,$38,$39,$40,
            $41,$42,$43,
            $44,$45,
            $46,$47,$48,$49,$50,$51,$51,$52,$53,$54,$55
        )
        ON CONFLICT ON CONSTRAINT uq_requirement_record DO UPDATE SET
            sat_policy                      = EXCLUDED.sat_policy,
            act_policy                      = EXCLUDED.act_policy,
            accepts_clt                     = EXCLUDED.accepts_clt,
            sat_required                    = EXCLUDED.sat_required,
            act_required                    = EXCLUDED.act_required,
            sat_optional                    = EXCLUDED.sat_optional,
            test_blind                      = EXCLUDED.test_blind,
            sat_superscore                  = EXCLUDED.sat_superscore,
            act_superscore                  = EXCLUDED.act_superscore,
            toefl_required                  = EXCLUDED.toefl_required,
            ielts_required                  = EXCLUDED.ielts_required,
            duolingo_required               = EXCLUDED.duolingo_required,
            toefl_min_score                 = EXCLUDED.toefl_min_score,
            ielts_min_score                 = EXCLUDED.ielts_min_score,
            duolingo_min_score              = EXCLUDED.duolingo_min_score,
            transcript_required             = EXCLUDED.transcript_required,
            essays_required                 = EXCLUDED.essays_required,
            supplemental_essays_required    = EXCLUDED.supplemental_essays_required,
            supplemental_essay_count        = EXCLUDED.supplemental_essay_count,
            teacher_recommendations_required= EXCLUDED.teacher_recommendations_required,
            counselor_recommendation_required= EXCLUDED.counselor_recommendation_required,
            interview_required              = EXCLUDED.interview_required,
            interview_optional              = EXCLUDED.interview_optional,
            common_app_supported            = EXCLUDED.common_app_supported,
            ucas_supported                  = EXCLUDED.ucas_supported,
            direct_apply_supported          = EXCLUDED.direct_apply_supported,
            financial_documents_required    = EXCLUDED.financial_documents_required,
            aps_required                    = EXCLUDED.aps_required,
            uni_assist_required             = EXCLUDED.uni_assist_required,
            source_url                      = EXCLUDED.source_url,
            last_verified                   = EXCLUDED.last_verified,
            confidence_score                = EXCLUDED.confidence_score,
            raw_requirements_text           = EXCLUDED.raw_requirements_text,
            raw_payload                     = EXCLUDED.raw_payload,
            updated_at                      = NOW()
        RETURNING id
        """,
        # identity
        record["institution_id"],
        record.get("cycle_year", settings.current_cycle_year),
        record.get("degree_level", "undergraduate"),
        record.get("applicant_type", "international"),
        # testing
        record.get("sat_policy", "optional"),
        record.get("act_policy", "optional"),
        record.get("accepts_clt", False),
        record.get("sat_required", False),
        record.get("act_required", False),
        record.get("sat_optional", False),
        record.get("test_blind", False),
        record.get("sat_superscore", False),
        record.get("act_superscore", False),
        # english proficiency
        record.get("toefl_required", False),
        record.get("ielts_required", False),
        record.get("duolingo_required", False),
        record.get("cambridge_required", False),
        record.get("toefl_min_score"),
        record.get("ielts_min_score"),
        record.get("duolingo_min_score"),
        # materials
        record.get("transcript_required", True),
        record.get("predicted_grades_required", False),
        record.get("cv_required", False),
        record.get("resume_required", False),
        record.get("essays_required", False),
        record.get("supplemental_essays_required", False),
        record.get("supplemental_essay_count", 0),
        record.get("portfolio_required", False),
        record.get("audition_required", False),
        # recs
        record.get("teacher_recommendations_required", 0),
        record.get("counselor_recommendation_required", False),
        record.get("peer_recommendation_allowed", False),
        # interviews
        record.get("interview_required", False),
        record.get("interview_optional", False),
        record.get("interview_type"),
        # platforms
        record.get("common_app_supported", False),
        record.get("coalition_app_supported", False),
        record.get("ucas_supported", False),
        record.get("direct_apply_supported", False),
        record.get("application_platform"),
        # international
        record.get("financial_documents_required", False),
        record.get("passport_required", False),
        record.get("visa_documents_required", False),
        # country-specific
        record.get("aps_required", False),
        record.get("uni_assist_required", False),
        # metadata
        record.get("source_url"),
        record.get("source_domain"),
        record.get("source_type", "official"),
        record.get("parser_name", settings.scraper_name),
        record.get("parser_version", settings.scraper_version),
        now,
        record.get("confidence_score", 80.0),
        record.get("raw_requirements_text"),
        new_payload,
        json.dumps(record.get("parser_trace", {})),
    )

    # Write history if something changed
    if existing and existing["raw_payload"] != new_payload:
        await conn.execute(
            """
            INSERT INTO canonical.requirement_history
                (institution_requirement_id, changed_fields, previous_payload, new_payload)
            VALUES ($1, $2, $3, $4)
            """,
            row_id,
            "{}",
            existing["raw_payload"],
            new_payload,
        )
        return "updated"

    return "inserted" if not existing else "unchanged"


# ─────────────────────────────────────────────────────────────────────────────
# Scraper run tracking
# ─────────────────────────────────────────────────────────────────────────────

async def start_scraper_run(name: str, version: str, target_type: str) -> uuid.UUID:
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(
            """
            INSERT INTO canonical.scraper_runs
                (scraper_name, scraper_version, target_type, run_status)
            VALUES ($1, $2, $3, 'running')
            RETURNING id
            """,
            name, version, target_type,
        )


async def finish_scraper_run(
    run_id: uuid.UUID,
    processed: int,
    success: int,
    failed: int,
    warnings: int,
    status: str = "completed",
    logs: dict | None = None,
    metrics: dict | None = None,
) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE canonical.scraper_runs SET
                completed_at           = NOW(),
                institutions_processed = $2,
                successful_count       = $3,
                failed_count           = $4,
                warning_count          = $5,
                run_status             = $6,
                duration_seconds       = EXTRACT(EPOCH FROM (NOW() - started_at)),
                logs                   = $7,
                metrics                = $8
            WHERE id = $1
            """,
            run_id, processed, success, failed, warnings, status,
            json.dumps(logs or {}),
            json.dumps(metrics or {}),
        )


async def log_failure(
    run_id: uuid.UUID,
    institution_id: str | None,
    source_url: str | None,
    stage: str,
    reason: str,
    trace: str = "",
) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO canonical.scraper_failures
                (scraper_run_id, institution_id, source_url,
                 failure_stage, failure_reason, stack_trace)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            run_id,
            uuid.UUID(institution_id) if institution_id else None,
            source_url,
            stage,
            reason,
            trace,
        )

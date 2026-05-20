"""
CollegeOS Scraper — Orchestrator
Entry point for the daily GitHub Actions run.

Flow:
  1. Load all institutions from DB (or a filtered subset)
  2. Route each to the correct regional parser (US / India / Europe)
  3. Write deadlines + requirements with upsert + history tracking
  4. Log the scraper run (canonical.scraper_runs + scraper_failures)
  5. Exit 0 on success, 1 on critical failure

Usage:
  python orchestrator.py
  python orchestrator.py --country-codes US CA          # only North America
  python orchestrator.py --country-codes IN             # only India
  python orchestrator.py --country-codes GB DE NL FR    # only Europe
  python orchestrator.py --limit 100                    # test run
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import traceback
import uuid
from datetime import datetime, timezone

import aiohttp
import structlog

import db
from config import settings
from parsers.us import USParser
from parsers.india import IndiaParser
from parsers.europe import EuropeParser
from parsers.base import BaseParser

# ── Structured logging ────────────────────────────────────────────────────────
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ],
)
log = structlog.get_logger()

# ── Region → parser class ─────────────────────────────────────────────────────
NORTH_AMERICA = {"US", "CA"}
INDIA = {"IN"}
EUROPE = {"GB", "DE", "NL", "FR", "SE", "NO", "DK", "FI", "AT", "CH", "IT", "ES", "BE", "IE"}

def _pick_parser(country_code: str, session: aiohttp.ClientSession) -> BaseParser:
    if country_code in NORTH_AMERICA:
        return USParser(session)
    if country_code in INDIA:
        return IndiaParser(session)
    if country_code in EUROPE:
        return EuropeParser(session)
    # Default: try US-style direct page parsing
    return USParser(session)


# ── Per-institution worker ─────────────────────────────────────────────────────

async def process_institution(
    institution: dict,
    session: aiohttp.ClientSession,
    semaphore: asyncio.Semaphore,
    run_id: uuid.UUID,
) -> dict:
    """
    Returns a result dict with keys: status, deadlines_written, req_written, error
    """
    inst_id = str(institution["id"])
    name = institution["name"]
    country = institution.get("country_code", "US")

    async with semaphore:
        parser = _pick_parser(country, session)
        try:
            deadlines, req = await parser.parse(dict(institution))

            pool = await db.get_pool()
            deadlines_written = 0
            req_written = False

            async with pool.acquire() as conn:
                async with conn.transaction():
                    for dl in deadlines:
                        try:
                            await db.upsert_deadline(conn, dl.to_dict())
                            deadlines_written += 1
                        except Exception as exc:
                            log.warning("deadline_upsert_failed",
                                        institution=name,
                                        deadline_type=dl.deadline_type,
                                        error=str(exc))

                    if req:
                        try:
                            await db.upsert_requirement(conn, req.to_dict())
                            req_written = True
                        except Exception as exc:
                            log.warning("req_upsert_failed",
                                        institution=name,
                                        error=str(exc))

            log.info("institution_done",
                     institution=name,
                     country=country,
                     deadlines=deadlines_written,
                     req=req_written)

            return {
                "status": "success",
                "deadlines_written": deadlines_written,
                "req_written": req_written,
                "error": None,
            }

        except Exception as exc:
            tb = traceback.format_exc()
            log.error("institution_failed", institution=name, error=str(exc))
            await db.log_failure(
                run_id=run_id,
                institution_id=inst_id,
                source_url=institution.get("website_url"),
                stage="parse",
                reason=str(exc),
                trace=tb,
            )
            return {
                "status": "failed",
                "deadlines_written": 0,
                "req_written": False,
                "error": str(exc),
            }


# ── Main ──────────────────────────────────────────────────────────────────────

async def main(country_codes: list[str] | None, limit: int | None) -> int:
    log.info("scraper_start",
             version=settings.scraper_version,
             concurrency=settings.concurrency,
             country_codes=country_codes,
             limit=limit)

    # Track run in DB
    run_id = await db.start_scraper_run(
        name=settings.scraper_name,
        version=settings.scraper_version,
        target_type=",".join(country_codes) if country_codes else "all",
    )

    # Fetch institutions
    institutions = await db.fetch_all_institutions(
        country_codes=country_codes,
        limit=limit,
    )
    total = len(institutions)
    log.info("institutions_loaded", count=total)

    semaphore = asyncio.Semaphore(settings.concurrency)
    connector = aiohttp.TCPConnector(limit_per_host=3, ssl=False)
    timeout = aiohttp.ClientTimeout(total=60, connect=15)

    results = {"success": 0, "failed": 0, "warnings": 0,
               "total_deadlines": 0, "total_reqs": 0}

    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
        tasks = [
            process_institution(inst, session, semaphore, run_id)
            for inst in institutions
        ]

        # Process in batches to avoid memory blow-up with 8000 colleges
        BATCH = 200
        for i in range(0, len(tasks), BATCH):
            batch = tasks[i: i + BATCH]
            batch_results = await asyncio.gather(*batch, return_exceptions=True)

            for r in batch_results:
                if isinstance(r, Exception):
                    results["failed"] += 1
                elif r["status"] == "success":
                    results["success"] += 1
                    results["total_deadlines"] += r["deadlines_written"]
                    if r["req_written"]:
                        results["total_reqs"] += 1
                elif r["status"] == "failed":
                    results["failed"] += 1
                else:
                    results["warnings"] += 1

            log.info("batch_complete",
                     batch=i // BATCH + 1,
                     processed=min(i + BATCH, total),
                     total=total)

    await db.finish_scraper_run(
        run_id=run_id,
        processed=total,
        success=results["success"],
        failed=results["failed"],
        warnings=results["warnings"],
        status="completed",
        logs={"country_codes": country_codes},
        metrics={
            "total_deadlines_written": results["total_deadlines"],
            "total_requirements_written": results["total_reqs"],
        },
    )

    log.info("scraper_finished", **results)
    await db.close_pool()

    # Exit 1 if >10% failure rate
    failure_rate = results["failed"] / max(total, 1)
    return 1 if failure_rate > 0.10 else 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="CollegeOS Deadline + Requirements Scraper")
    parser.add_argument(
        "--country-codes", nargs="*",
        help="Filter to specific country codes e.g. US IN GB DE",
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Cap number of institutions (for testing)",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    exit_code = asyncio.run(main(args.country_codes, args.limit))
    sys.exit(exit_code)

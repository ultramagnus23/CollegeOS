#!/usr/bin/env python3
# CollegeOS Auto-generated scraper/orchestrator_worker.py — do not edit manually
"""
Python APScheduler Orchestrator Worker
────────────────────────────────────────
Runs as a standalone Railway/Render service (separate from the Node backend).
Schedules all Python scrapers and the ML training pipeline.

Schedule
────────
    reddit_scraper           every 6 hours
    admissions_scraper       every 24 hours (02:00 UTC)
    financial_scraper        every 24 hours (03:00 UTC)
    college_profile_scraper  every Sunday at 04:00 UTC
    training_pipeline        every 1 hour (internal threshold check skips if not needed)

After each run, writes a row to scraper_run_logs in Postgres so the
Node health endpoint can read it.

Required environment variables
───────────────────────────────
    DATABASE_URL
    REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET / REDDIT_USER_AGENT

Optional
────────
    DATA_GOV_API_KEY
    RETRAIN_THRESHOLD   (default: 100)
"""

import os
import sys
import logging
import subprocess
import datetime
from pathlib import Path

import psycopg2
import psycopg2.extras
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("orchestrator_worker")

DATABASE_URL = os.environ["DATABASE_URL"]
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent

# ── DB helpers ────────────────────────────────────────────────────────────────


def _get_conn():
    return psycopg2.connect(DATABASE_URL)


def log_run(job_name: str, started_at: datetime.datetime,
            finished_at: datetime.datetime, rows_upserted: int,
            status: str, error_message: str | None) -> None:
    try:
        conn = _get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO scraper_run_logs
                  (job_name, started_at, finished_at, rows_upserted, status, error_message)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (job_name, started_at, finished_at, rows_upserted, status, error_message),
            )
        conn.commit()
        conn.close()
    except Exception as e:
        log.warning(f"Failed to write scraper_run_logs for {job_name}: {e}")


# ── Generic runner ────────────────────────────────────────────────────────────


def run_script(job_name: str, cmd: list[str], cwd: Path | None = None) -> None:
    """
    Run a subprocess, capture output, and write results to scraper_run_logs.
    The script is expected to emit "ROWS_UPSERTED=<n>" on stdout.
    """
    started_at = datetime.datetime.utcnow()
    log.info(f"[JOB START] {job_name} — {started_at.isoformat()}")

    try:
        result = subprocess.run(
            cmd,
            cwd=str(cwd or SCRIPT_DIR),
            capture_output=True,
            text=True,
            env={**os.environ},
            timeout=3600,  # 1-hour hard limit
        )
        finished_at = datetime.datetime.utcnow()
        duration_ms = int((finished_at - started_at).total_seconds() * 1000)

        rows_upserted = 0
        for line in result.stdout.splitlines():
            if line.startswith("ROWS_UPSERTED="):
                try:
                    rows_upserted = int(line.split("=", 1)[1])
                except ValueError:
                    pass

        if result.returncode == 0:
            status = "success"
            error_message = None
            log.info(f"[JOB END] {job_name} — {rows_upserted} rows upserted in {duration_ms}ms")
        else:
            status = "failed"
            error_message = (result.stderr or result.stdout)[:2000]
            log.error(f"[JOB FAILED] {job_name} — exit {result.returncode}: {error_message[:300]}")

        log_run(job_name, started_at, finished_at, rows_upserted, status, error_message)

    except subprocess.TimeoutExpired:
        finished_at = datetime.datetime.utcnow()
        log.error(f"[JOB FAILED] {job_name} — timeout after 3600s")
        log_run(job_name, started_at, finished_at, 0, "failed", "Timeout after 3600s")

    except Exception as e:
        finished_at = datetime.datetime.utcnow()
        log.error(f"[JOB FAILED] {job_name} — {e}", exc_info=True)
        log_run(job_name, started_at, finished_at, 0, "failed", str(e))


# ── Individual job functions ──────────────────────────────────────────────────


def job_reddit():
    run_script("reddit", ["python3", str(SCRIPT_DIR / "reddit_scraper.py")])


def job_admissions():
    run_script("admissions", ["python3", str(SCRIPT_DIR / "admissions_scraper.py")])


def job_financial():
    run_script("financial_aid", ["python3", str(SCRIPT_DIR / "financial_scraper.py")])


def job_college_profiles():
    run_script("college_profiles", ["python3", str(SCRIPT_DIR / "college_profile_scraper.py")])


def job_ml_retrain():
    retrain_threshold = int(os.environ.get("RETRAIN_THRESHOLD", "100"))
    run_script(
        "ml_retrain",
        ["python3", str(SCRIPT_DIR / "training_pipeline.py")],
        cwd=SCRIPT_DIR,
    )


# ── Main ──────────────────────────────────────────────────────────────────────


def main() -> None:
    log.info("CollegeOS orchestrator_worker starting…")
    log.info("Schedules:")
    log.info("  reddit_scraper         — every 6 hours")
    log.info("  admissions_scraper     — daily at 02:00 UTC")
    log.info("  financial_scraper      — daily at 03:00 UTC")
    log.info("  college_profile_scraper— every Sunday at 04:00 UTC")
    log.info("  training_pipeline      — every 1 hour (with internal threshold)")

    scheduler = BlockingScheduler(timezone="UTC")

    # Reddit — every 6 hours
    scheduler.add_job(job_reddit, CronTrigger(hour="*/6"), id="reddit",
                      misfire_grace_time=300)

    # Admissions — daily at 02:00 UTC
    scheduler.add_job(job_admissions, CronTrigger(hour=2, minute=0), id="admissions",
                      misfire_grace_time=600)

    # Financial aid — daily at 03:00 UTC
    scheduler.add_job(job_financial, CronTrigger(hour=3, minute=0), id="financial_aid",
                      misfire_grace_time=600)

    # College profiles — every Sunday at 04:00 UTC
    scheduler.add_job(job_college_profiles, CronTrigger(day_of_week="sun", hour=4, minute=0),
                      id="college_profiles", misfire_grace_time=1800)

    # ML retrain check — every hour
    scheduler.add_job(job_ml_retrain, CronTrigger(minute=0), id="ml_retrain",
                      misfire_grace_time=300)

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        log.info("Orchestrator worker shutting down.")


if __name__ == "__main__":
    main()

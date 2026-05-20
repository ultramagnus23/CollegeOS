"""
CollegeOS Scraper — Configuration
All settings pulled from environment variables / .env
"""

import os
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    # ── Database ─────────────────────────────────────────────────────────────
    database_url: str = Field(..., env="DATABASE_URL")
    # e.g. postgresql://user:pass@host:5432/collegeos

    db_pool_min: int = 2
    db_pool_max: int = 10

    # ── Scraper behaviour ─────────────────────────────────────────────────────
    scraper_version: str = "1.0.0"
    scraper_name: str = "collegeos-unified"

    # How many colleges to process in parallel
    concurrency: int = Field(default=20, env="SCRAPER_CONCURRENCY")

    # Seconds to wait between requests to the same domain
    rate_limit_delay: float = Field(default=2.0, env="RATE_LIMIT_DELAY")

    # Max retries per URL
    max_retries: int = 3

    # Staleness threshold — if last_verified older than this many days, re-scrape
    stale_days: int = Field(default=7, env="STALE_DAYS")

    # ── Optional integrations ─────────────────────────────────────────────────
    sentry_dsn: str | None = Field(default=None, env="SENTRY_DSN")

    # Playwright headless browser (needed for JS-rendered pages)
    use_playwright: bool = Field(default=True, env="USE_PLAYWRIGHT")

    # Current admission cycle
    current_cycle_year: str = "2025-26"
    current_cycle_year_key: int = 2026

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()


SCRAPER_VERSION = settings.scraper_version

# ── User-Agent pool ───────────────────────────────────────────────────────────
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]

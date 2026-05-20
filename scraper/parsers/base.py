"""
CollegeOS Scraper — Base Parser
All regional parsers inherit from this.
Provides: async HTTP fetch, Playwright fetch, date normalisation, staleness check.
"""

from __future__ import annotations

import asyncio
import random
import re
import traceback
import urllib.parse
from datetime import date, datetime, timedelta, timezone
from typing import Any

import aiohttp
import structlog
from bs4 import BeautifulSoup
from dateutil import parser as dateparser
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from config import settings, USER_AGENTS

log = structlog.get_logger(__name__)


class ParsedDeadline:
    """Lightweight DTO for a single deadline row."""

    __slots__ = (
        "institution_id", "deadline_type", "deadline_date",
        "notification_date", "is_binding", "is_rolling", "is_estimated",
        "applicant_type", "degree_level", "intake_term",
        "source_url", "source_domain", "source_type",
        "confidence_score", "raw_payload", "parser_trace",
    )

    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)

    def to_dict(self) -> dict:
        return {s: getattr(self, s, None) for s in self.__slots__}


class ParsedRequirement:
    """Lightweight DTO for a requirements row."""

    def __init__(self, **kwargs):
        self._data = kwargs

    def to_dict(self) -> dict:
        return self._data


class BaseParser:
    """
    Base class for all regional parsers.

    Subclasses must implement:
        async def parse(self, institution: dict) -> tuple[list[ParsedDeadline], ParsedRequirement | None]
    """

    PARSER_NAME: str = "base"

    def __init__(self, session: aiohttp.ClientSession):
        self.session = session
        self._domain_last_hit: dict[str, float] = {}

    # ─── Staleness check ─────────────────────────────────────────────────────

    def is_stale(self, last_verified: datetime | None) -> bool:
        """Return True if data is older than stale_days or has never been fetched."""
        if last_verified is None:
            return True
        age = datetime.now(timezone.utc) - last_verified
        return age.days >= settings.stale_days

    # ─── HTTP helpers ─────────────────────────────────────────────────────────

    async def _respect_rate_limit(self, domain: str) -> None:
        loop = asyncio.get_event_loop()
        now = loop.time()
        last = self._domain_last_hit.get(domain, 0)
        gap = settings.rate_limit_delay - (now - last)
        if gap > 0:
            await asyncio.sleep(gap + random.uniform(0, 0.5))
        self._domain_last_hit[domain] = loop.time()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=retry_if_exception_type((aiohttp.ClientError, asyncio.TimeoutError)),
        reraise=True,
    )
    async def fetch_html(self, url: str, timeout: int = 30) -> str | None:
        domain = urllib.parse.urlparse(url).netloc
        await self._respect_rate_limit(domain)
        headers = {"User-Agent": random.choice(USER_AGENTS)}
        try:
            async with self.session.get(
                url, headers=headers, timeout=aiohttp.ClientTimeout(total=timeout)
            ) as resp:
                if resp.status == 200:
                    return await resp.text(errors="replace")
                log.warning("non_200", url=url, status=resp.status)
                return None
        except Exception as exc:
            log.error("fetch_failed", url=url, error=str(exc))
            raise

    async def fetch_soup(self, url: str) -> BeautifulSoup | None:
        html = await self.fetch_html(url)
        if html:
            return BeautifulSoup(html, "lxml")
        return None

    # ─── Playwright fetch for JS-heavy pages ──────────────────────────────────

    async def fetch_playwright(self, url: str) -> str | None:
        """
        Use Playwright headless Chromium for JS-rendered pages.
        Falls back gracefully if Playwright is disabled.
        """
        if not settings.use_playwright:
            return await self.fetch_html(url)
        try:
            from playwright.async_api import async_playwright
            async with async_playwright() as pw:
                browser = await pw.chromium.launch(headless=True)
                page = await browser.new_page(
                    user_agent=random.choice(USER_AGENTS)
                )
                await page.goto(url, wait_until="networkidle", timeout=40_000)
                content = await page.content()
                await browser.close()
                return content
        except Exception as exc:
            log.warning("playwright_failed", url=url, error=str(exc))
            return await self.fetch_html(url)

    # ─── Date utilities ───────────────────────────────────────────────────────

    @staticmethod
    def parse_date(raw: str) -> date | None:
        """
        Best-effort date parsing from messy strings like:
          'November 1, 2025', 'Nov 1', '1st November', '2025-11-01', etc.
        """
        if not raw:
            return None
        raw = raw.strip()
        # If no year mentioned, assume current cycle year
        if not re.search(r"\b20\d\d\b", raw):
            raw = f"{raw} {settings.current_cycle_year_key}"
        try:
            return dateparser.parse(raw, dayfirst=False).date()
        except Exception:
            return None

    @staticmethod
    def extract_score(text: str, pattern: str) -> float | None:
        m = re.search(pattern, text, re.IGNORECASE)
        return float(m.group(1)) if m else None

    @staticmethod
    def domain_of(url: str) -> str:
        return urllib.parse.urlparse(url).netloc

    # ─── Subclass interface ───────────────────────────────────────────────────

    async def parse(
        self, institution: dict
    ) -> tuple[list[ParsedDeadline], ParsedRequirement | None]:
        raise NotImplementedError

"""SPA-aware fetcher for masters program pages (JS-rendered).

The urllib-based http_program_adapter returns the *initial* HTML only. Many
graduate-program pages are single-page apps (React/Angular/Vue) whose
requirements, deadlines, and concentrations are injected by JavaScript after
load — so urllib sees an empty shell. This adapter renders the page in a
headless browser (Playwright) and returns the post-JS text, using the SAME
`FetchResult` shape as the HTTP adapter so it is a drop-in `Fetcher` for the
pipeline.

Robots.txt: every fetch is gated by the site's robots.txt (the previously
flagged "unverified robots.txt compliance" gap). Disallowed URLs are skipped,
not fetched.

Why Playwright (answering the brief's question): a headless browser step IS
required for SPA pages — there is no pure-HTTP way to obtain JS-injected
content. Playwright is preferred over Puppeteer here because it ships a single
Python package (`pip install playwright && playwright install chromium`) and a
sync API that fits this synchronous pipeline. The import is lazy and optional so
the rest of the scraper package still imports on machines without it.

Usage:
    from scraper.masters.adapters.spa_program_adapter import SpaFetcher
    fetch = SpaFetcher(min_interval_s=2.0)          # polite throttle
    records = build_records(refs, fetch)            # pipeline injection point
    fetch.close()
"""
from __future__ import annotations

import re
import time
import urllib.robotparser
from urllib.parse import urlparse, urlunparse

from scraper.masters.adapters.http_program_adapter import FetchResult

_TAGS = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")
_SCRIPT_STYLE = re.compile(r"<(script|style|noscript)[^>]*>.*?</\1>", re.S | re.I)
_CHROME = re.compile(r"<(nav|header|footer|aside)[^>]*>.*?</\1>", re.S | re.I)
_USER_AGENT = "CollegeOSBot/1.0 (+masters program research; respects robots)"


class SpaFetcher:
    """Callable[[str], str] fetcher that renders JS and respects robots.txt.

    Implements the pipeline's ``Fetcher`` protocol: calling the instance with a
    URL returns plain text (empty string when blocked or on error, so a single
    bad page never kills the run).
    """

    def __init__(self, *, min_interval_s: float = 2.0, timeout_ms: int = 25_000,
                 wait_until: str = "networkidle") -> None:
        self.min_interval_s = min_interval_s
        self.timeout_ms = timeout_ms
        self.wait_until = wait_until
        self._last_fetch_at = 0.0
        self._robots: dict[str, urllib.robotparser.RobotFileParser] = {}
        self._browser = None
        self._pw = None

    # ── robots.txt ────────────────────────────────────────────────────────
    def _allowed(self, url: str) -> bool:
        parts = urlparse(url)
        origin = (parts.scheme, parts.netloc)
        key = f"{parts.scheme}://{parts.netloc}"
        rp = self._robots.get(key)
        if rp is None:
            rp = urllib.robotparser.RobotFileParser()
            rp.set_url(urlunparse((origin[0], origin[1], "/robots.txt", "", "", "")))
            try:
                rp.read()
            except Exception:  # noqa: BLE001 - missing/broken robots ⇒ be conservative-permissive
                rp = None
            self._robots[key] = rp
        if rp is None:
            return True  # no robots.txt reachable → default allow (same as urllib adapter)
        return rp.can_fetch(_USER_AGENT, url)

    # ── lazy browser ──────────────────────────────────────────────────────
    def _ensure_browser(self):
        if self._browser is not None:
            return
        try:
            from playwright.sync_api import sync_playwright  # noqa: PLC0415 - optional dep
        except ImportError as exc:  # pragma: no cover - environment-dependent
            raise RuntimeError(
                "Playwright is required for SPA rendering. Install with:\n"
                "  pip install playwright && playwright install chromium"
            ) from exc
        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(headless=True)

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_fetch_at
        if elapsed < self.min_interval_s:
            time.sleep(self.min_interval_s - elapsed)
        self._last_fetch_at = time.monotonic()

    # ── fetch ─────────────────────────────────────────────────────────────
    def fetch(self, url: str) -> FetchResult:
        if not self._allowed(url):
            return FetchResult(url=url, ok=False, error="blocked_by_robots")
        try:
            self._ensure_browser()
            self._throttle()
            page = self._browser.new_page(user_agent=_USER_AGENT)
            try:
                page.goto(url, timeout=self.timeout_ms, wait_until=self.wait_until)
                html = page.content()
            finally:
                page.close()
            cleaned = _CHROME.sub(" ", _SCRIPT_STYLE.sub(" ", html))
            text = _WS.sub(" ", _TAGS.sub(" ", cleaned)).strip()
            return FetchResult(url=url, ok=True, text=text, bytes_len=len(html))
        except Exception as exc:  # noqa: BLE001 - one bad page must not kill the run
            return FetchResult(url=url, ok=False, error=f"{type(exc).__name__}: {exc}")

    def __call__(self, url: str) -> str:
        """Pipeline Fetcher protocol: URL -> text ('' on block/error)."""
        return self.fetch(url).text

    def close(self) -> None:
        if self._browser is not None:
            try:
                self._browser.close()
            finally:
                self._browser = None
        if self._pw is not None:
            try:
                self._pw.stop()
            finally:
                self._pw = None

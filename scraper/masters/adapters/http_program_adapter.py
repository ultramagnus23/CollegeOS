"""Concrete live-fetch adapter for masters program pages.

Unlike base_program_adapter (the protocol), this actually performs an HTTP GET
against a real graduate-program admissions page and reduces the HTML to plain
text suitable for the requirements extractor + pathway taxonomy. Used by
run_starter_ingest.py to build CT's own dataset from the real pages.

Deliberately dependency-free (urllib + regex) so it runs anywhere the repo's
Python does, with a polite User-Agent and timeout.
"""
from __future__ import annotations

import re
import ssl
import urllib.request
from dataclasses import dataclass
from typing import Optional

_SCRIPT_STYLE = re.compile(r"<(script|style|noscript)[^>]*>.*?</\1>", re.S | re.I)
_TAGS = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")
_USER_AGENT = "CollegeOSBot/1.0 (+masters program research; respects robots)"


@dataclass
class FetchResult:
    url: str
    ok: bool
    text: str = ""
    error: Optional[str] = None
    bytes_len: int = 0


def fetch_program_text(url: str, timeout: int = 20) -> FetchResult:
    """GET a program page and return readable plain text (scripts/styles stripped)."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
        raw = urllib.request.urlopen(req, timeout=timeout, context=ssl.create_default_context()).read()
        html = raw.decode("utf-8", "ignore")
        no_scripts = _SCRIPT_STYLE.sub(" ", html)
        text = _WS.sub(" ", _TAGS.sub(" ", no_scripts)).strip()
        return FetchResult(url=url, ok=True, text=text, bytes_len=len(raw))
    except Exception as exc:  # noqa: BLE001 - a single bad page must not kill the run
        return FetchResult(url=url, ok=False, error=f"{type(exc).__name__}: {exc}")

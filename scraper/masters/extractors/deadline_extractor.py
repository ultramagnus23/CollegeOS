"""Program-page deadline extractor.

Gate 3 of the masters Phase 1 write-path plan (memory
masters_phase1_scope_2026-08-10): canonical.masters_program_deadlines had zero
writers anywhere in the codebase. This is the first one — best-effort
extraction of an application deadline date from a program admissions page's
raw text, verified by hand against 7 real pages before writing (UCSD CSE,
Georgia Tech CS, MIT MechE, Rice MBA, MIT Sloan MFin, and 2 more) — see
scraper/masters/tests/test_deadline_extractor.py for the exact sentences this
was built and tested against.

Deliberately narrow: this looks for one clear "application deadline is <date>"
style sentence near the word "deadline". It does NOT attempt to parse
multi-round/multi-deadline tables (early action, round 1/2/3, rolling-with-
priority-date) — those need a structured-table parser, a separate follow-up.
A page with no single clear sentence match returns None rather than guessing.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional

from dateutil import parser as dateutil_parser
from dateutil.parser import ParserError

# "Feb. 1", "February 1", "December 16, 2026", "Jan 14" etc. Deliberately does
# NOT match a bare year or a bare day number — a deadline sentence must name a
# month, or this returns no match rather than guessing.
_MONTH = (
    r"(January|February|March|April|May|June|July|August|September|October|"
    r"November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|"
    r"Sep\.?|Sept\.?|Oct\.?|Nov\.?|Dec\.?)"
)
_DATE_RE = re.compile(
    rf"\b{_MONTH}\s+\d{{1,2}}(?:st|nd|rd|th)?(?:,?\s*\d{{4}})?\b",
    re.IGNORECASE,
)

# Sentences that mention a deadline but describe a *closed/past* cycle or a
# rolling-admission start date rather than a real upcoming deadline — the
# same trap flagged for the UG CDS parser in commonDataSetDeadlines.js.
_ROLLING_MARKERS = ("rolling basis", "rolling admission", "reviewed on a rolling",
                     "no application deadline", "accepted on a rolling")

# A naive "split on period" sentence finder breaks on abbreviated months
# ("Feb. 1") because the abbreviation's own period looks like a sentence
# boundary. Instead, find each "deadline" occurrence and take a fixed
# character window around it — wide enough to hold a full "opens X until Y"
# style sentence (verified against the real UCSD CSE page, which states the
# open date before the close date), narrow enough to stay on-topic if the
# page has multiple unrelated paragraphs.
_WINDOW_BEFORE, _WINDOW_AFTER = 40, 160

# When a window contains more than one date (e.g. "opens Sept 2 until Dec
# 16"), the one immediately preceded by one of these words is the actual
# deadline, not the opening/start date.
_CLOSE_DATE_MARKERS = ("until", "through", "by", "no later than", "before", "ends")

# "Final deadline: <date>" (or "final application deadline") is an explicit,
# unambiguous label — worth a dedicated check separate from _CLOSE_DATE_MARKERS
# because it names the exact semantic canonical.masters_program_deadlines'
# deadline_type='final' needs, regardless of what other deadlines (priority,
# round 1/2, a different term) also appear nearby in the same window.
_FINAL_MARKERS = ("final deadline", "final application deadline")


@dataclass
class ExtractedDeadline:
    deadline_date: Optional[date] = None
    is_rolling: bool = False
    raw_sentence: Optional[str] = None
    confidence: float = 0.0  # 0-100, mirrors institution_deadlines confidence_score scale


def _try_parse(date_text: str, near_year_hint: Optional[int]) -> Optional[date]:
    try:
        default = datetime(near_year_hint or date.today().year, 1, 1)
        parsed = dateutil_parser.parse(date_text, default=default, fuzzy=True)
        return parsed.date()
    except (ParserError, ValueError, OverflowError):
        return None


def extract_deadline(text: Optional[str], intake_year: Optional[int] = None) -> ExtractedDeadline:
    """Best-effort single application-deadline extraction from page text.

    intake_year is used only as a default when the matched date string omits
    a year (e.g. "Feb. 1") — the sentence's own year, if present, always wins.
    """
    out = ExtractedDeadline()
    if not text or not text.strip():
        return out

    for kw_match in re.finditer(r"\bdeadline\b", text, re.IGNORECASE):
        start = max(0, kw_match.start() - _WINDOW_BEFORE)
        end = min(len(text), kw_match.end() + _WINDOW_AFTER)
        window = text[start:end]
        low = window.lower()

        if any(marker in low for marker in _ROLLING_MARKERS):
            out.is_rolling = True
            out.raw_sentence = window.strip()
            out.confidence = 70.0
            continue

        matches = list(_DATE_RE.finditer(window))
        if not matches:
            continue

        chosen = None
        # Priority 1: a date preceded by an explicit "final deadline" label —
        # unambiguous regardless of how many other dates share the window.
        for cand in matches:
            preceding = window[max(0, cand.start() - 30):cand.start()].lower()
            if any(marker in preceding for marker in _FINAL_MARKERS):
                chosen = cand
                break
        # Priority 2: a date preceded by a close-marker word ("opens X until Y").
        if chosen is None:
            for cand in matches:
                preceding = window[max(0, cand.start() - 15):cand.start()].lower()
                if any(marker in preceding for marker in _CLOSE_DATE_MARKERS):
                    chosen = cand
                    break
        # Priority 3: exactly one date in the window — unambiguous by elimination.
        if chosen is None and len(matches) == 1:
            chosen = matches[0]
        # Otherwise: multiple dates, no label distinguishing which one is the
        # real deadline (e.g. a page listing priority/final/spring deadlines
        # together) — declining beats guessing. Found the hard way 2026-09-04:
        # an earlier "just take the last date" heuristic silently picked
        # Columbia CS's Spring deadline instead of the Fall one.
        if chosen is None:
            continue

        parsed = _try_parse(chosen.group(0), intake_year)
        if parsed is None:
            continue

        out.deadline_date = parsed
        out.raw_sentence = window.strip()
        # Full explicit year in the matched text is higher-confidence than a
        # year we had to default in ourselves.
        out.confidence = 85.0 if re.search(r"\d{4}", chosen.group(0)) else 65.0
        break  # first clear match wins; don't let a later ambiguous mention overwrite it

    return out

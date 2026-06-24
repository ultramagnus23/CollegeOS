"""Program-page requirements extractor.

Given the raw text/HTML of a single program's admissions page, pull the
structured requirement fields that populate canonical.masters_programs, plus the
free-text "how we evaluate" passage that feeds the pathway taxonomy normalizer.

The field-detection helpers here are pure functions over text so they are
unit-testable; the HTML-fetching/parsing wiring is added per the existing
scraper framework (cheerio/puppeteer on the Node side, requests/bs4 here).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ExtractedRequirements:
    gre_requirement: Optional[str] = None      # required|optional|waived|not_accepted|unknown
    gmat_requirement: Optional[str] = None
    min_gpa: Optional[float] = None
    is_stem_designated: Optional[bool] = None
    evaluation_text: str = ""                   # free-text -> pathway taxonomy
    raw_excerpts: list = field(default_factory=list)


_GRE_NOT = ("gre not required", "gre is not required", "do not require the gre", "gre is waived")
_GRE_OPT = ("gre optional", "gre is optional", "gre/gmat optional")
_GRE_REQ = ("gre required", "gre is required", "submit gre", "official gre scores")

_GMAT_NOT = ("gmat not required", "gmat is not required", "gmat is waived")
_GMAT_OPT = ("gmat optional", "gmat is optional")
_GMAT_REQ = ("gmat required", "gmat is required", "submit gmat")

_STEM = ("stem-designated", "stem designated", "stem-eligible", "stem opt", "cip code")
_GPA_RE = re.compile(r"minimum\s+(?:gpa|grade point average)\s+of\s+([0-9]\.[0-9]{1,2})", re.IGNORECASE)


def _classify_requirement(low: str, not_phrases, opt_phrases, req_phrases) -> Optional[str]:
    if any(p in low for p in not_phrases):
        return "waived"
    if any(p in low for p in opt_phrases):
        return "optional"
    if any(p in low for p in req_phrases):
        return "required"
    return None


def extract_requirements(text: Optional[str]) -> ExtractedRequirements:
    """Best-effort structured extraction from a program page's text."""
    out = ExtractedRequirements()
    if not text or not text.strip():
        return out

    low = text.lower()
    out.gre_requirement = _classify_requirement(low, _GRE_NOT, _GRE_OPT, _GRE_REQ)
    out.gmat_requirement = _classify_requirement(low, _GMAT_NOT, _GMAT_OPT, _GMAT_REQ)

    if any(s in low for s in _STEM):
        out.is_stem_designated = True

    gpa_match = _GPA_RE.search(text)
    if gpa_match:
        try:
            out.min_gpa = float(gpa_match.group(1))
        except ValueError:
            out.min_gpa = None

    # The whole admissions passage is what the pathway taxonomy classifies.
    out.evaluation_text = text.strip()
    return out

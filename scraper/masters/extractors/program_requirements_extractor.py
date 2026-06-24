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


_STEM = ("stem-designated", "stem designated", "stem-eligible", "stem opt", "cip code")
_GPA_RE = re.compile(r"minimum\s+(?:gpa|grade point average)\s+of\s+([0-9]\.[0-9]{1,2})", re.IGNORECASE)


def _classify_test(low: str, kind: str) -> Optional[str]:
    """Regex test-policy detection for 'gre'/'gmat'. Order matters: waived/optional
    are checked before required so 'GRE score is not required' is not mis-read as
    'required'. Allows words between the test name and the verdict ([^.]{0,40} stays
    within a sentence)."""
    if re.search(rf"\b{kind}\b[^.]{{0,40}}\b(not required|no longer required|not require|is waived|waived)\b", low):
        return "waived"
    if re.search(rf"\b{kind}\b[^.]{{0,40}}\boptional\b", low) or re.search(rf"\boptional\b[^.]{{0,20}}\b{kind}\b", low):
        return "optional"
    if re.search(rf"\b{kind}\b[^.]{{0,40}}\b(is required|are required|required|must be submitted)\b", low) \
            or re.search(rf"\bmust submit\b[^.]{{0,25}}\b{kind}\b", low):
        return "required"
    return None


def extract_requirements(text: Optional[str]) -> ExtractedRequirements:
    """Best-effort structured extraction from a program page's text."""
    out = ExtractedRequirements()
    if not text or not text.strip():
        return out

    low = text.lower()
    out.gre_requirement = _classify_test(low, "gre")
    out.gmat_requirement = _classify_test(low, "gmat")

    if any(s in low for s in _STEM):
        out.is_stem_designated = True

    gpa_match = _GPA_RE.search(text)
    if gpa_match:
        try:
            out.min_gpa = float(gpa_match.group(1))
        except ValueError:
            out.min_gpa = None
    # Plausibility bound: a published minimum GPA is on a 4.0 scale, so anything
    # >4.3 is a mis-grab (e.g. an early-admission threshold) — drop it rather than
    # store a wrong number.
    if out.min_gpa is not None and not (0 < out.min_gpa <= 4.3):
        out.min_gpa = None

    # The whole admissions passage is what the pathway taxonomy classifies.
    out.evaluation_text = text.strip()
    return out

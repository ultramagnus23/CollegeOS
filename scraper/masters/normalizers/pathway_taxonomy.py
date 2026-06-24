"""Pathway taxonomy normalizer.

Phase 2 of docs/MASTERS_TRACK_PLAN.md — the core deliverable: map a program's
scraped admission-requirement / "how we evaluate" text into one or more rows of
canonical.masters_program_pathways. This is what answers "how does THIS program
admit vs that one" — most programs are ``standard_test_based`` only; the value is
correctly flagging the ones with explicit alternate language.

The ``pathway_type`` values here MUST stay in sync with the CHECK constraint in
migration 120 (canonical.masters_program_pathways.pathway_type).

Pure-Python and deterministic so it is unit-testable without network or DB
(see scraper/masters/tests/test_pathway_taxonomy.py).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

# Canonical pathway types — keep identical to the DB CHECK constraint.
PATHWAY_TYPES: Tuple[str, ...] = (
    "standard_test_based",
    "test_waived_holistic",
    "work_experience_substitution",
    "portfolio_based",
    "bridge_certificate",
    "conditional_admission",
    "executive_part_time",
    "direct_entry_no_test",
)

# Which masters_profile fields each non-standard pathway typically weighs. Used to
# pre-populate masters_program_pathways.weighted_fields for the chancing engine.
WEIGHTED_FIELDS: Dict[str, List[str]] = {
    "standard_test_based": ["gre_verbal", "gre_quant", "undergrad_gpa"],
    "test_waived_holistic": ["undergrad_gpa", "research_experience", "work_experience_years"],
    "work_experience_substitution": ["work_experience_years", "work_experience_desc", "undergrad_gpa"],
    "portfolio_based": ["research_experience", "undergrad_gpa"],
    "bridge_certificate": ["undergrad_gpa"],
    "conditional_admission": ["undergrad_gpa"],
    "executive_part_time": ["work_experience_years", "work_experience_desc"],
    "direct_entry_no_test": ["undergrad_gpa"],
}

# Signal phrases per non-standard pathway. Order matters only for readability;
# all groups are scanned. Phrases are matched case-insensitively as substrings,
# except the regex group below.
_SIGNALS: Dict[str, List[str]] = {
    "work_experience_substitution": [
        "in lieu of",
        "may substitute",
        "can substitute",
        "substitute for the gre",
        "work experience may replace",
        "professional experience may replace",
        "waived for applicants with",
        "waiver for applicants with",
        "years of relevant work experience",
        "years of professional experience",
    ],
    "test_waived_holistic": [
        "gre not required",
        "gre is not required",
        "gmat not required",
        "gre/gmat optional",
        "gre optional",
        "gmat optional",
        "test optional",
        "test-optional",
        "gre waiver",
        "gmat waiver",
        "waiver available",
        "holistic review",
        "reviewed holistically",
    ],
    "executive_part_time": [
        "executive program",
        "executive ms",
        "executive mba",
        "part-time",
        "part time program",
        "for working professionals",
        "evening program",
        "weekend program",
    ],
    "portfolio_based": [
        "portfolio required",
        "portfolio review",
        "design portfolio",
        "creative portfolio",
        "submit a portfolio",
    ],
    "bridge_certificate": [
        "bridge program",
        "pre-master",
        "pre-masters",
        "pre master's",
        "qualifying program",
        "pathway program",
        "foundation program",
    ],
    "conditional_admission": [
        "conditional admission",
        "conditional offer",
        "provisional admission",
        "admitted conditionally",
    ],
    "direct_entry_no_test": [
        "no standardized test",
        "no gre or gmat",
        "no gre/gmat",
        "no entrance exam",
        "direct entry",
    ],
}

# "5+ years", "three or more years of experience", etc. -> work_experience_substitution.
# Matches digits OR spelled-out numbers (one..ten), since program pages use both.
_YEARS_EXPERIENCE_RE = re.compile(
    r"\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*\+?\s*"
    r"(?:or more\s+)?years?\b[^.]{0,40}\bexperience\b",
    re.IGNORECASE,
)

# Positive signals that a standard test IS required (raises standard confidence).
_STANDARD_SIGNALS: List[str] = [
    "gre required",
    "gre is required",
    "gmat required",
    "submit gre",
    "official gre scores",
    "gre general test is required",
]


@dataclass
class Pathway:
    pathway_type: str
    confidence: float
    matched_phrases: List[str] = field(default_factory=list)
    weighted_fields: List[str] = field(default_factory=list)

    def to_row(self, description: str, source_url: str | None = None) -> dict:
        """Shape a row for canonical.masters_program_pathways."""
        return {
            "pathway_type": self.pathway_type,
            "description": description,
            "weighted_fields": self.weighted_fields,
            "min_requirements": {},
            "confidence": round(self.confidence, 2),
            "source_url": source_url,
        }


def _confidence(num_matches: int) -> float:
    """More distinct matched phrases -> higher confidence, capped at 0.95."""
    if num_matches <= 0:
        return 0.0
    return min(0.5 + 0.15 * num_matches, 0.95)


def classify_pathways(text: str | None) -> List[Pathway]:
    """Classify requirement text into one or more admission pathways.

    Always returns at least one pathway. If no alternate-pathway language is
    found, returns a single ``standard_test_based`` pathway (higher confidence
    when explicit "GRE required" language is present, lower when the text is
    simply silent).
    """
    if not text or not text.strip():
        return [Pathway("standard_test_based", 0.3, [], WEIGHTED_FIELDS["standard_test_based"])]

    low = text.lower()
    found: List[Pathway] = []

    for pathway_type, phrases in _SIGNALS.items():
        matches = [p for p in phrases if p in low]
        if pathway_type == "work_experience_substitution":
            years = _YEARS_EXPERIENCE_RE.findall(text)
            if years:
                matches.append(f"{years[0]} years experience (regex)")
        if matches:
            found.append(
                Pathway(
                    pathway_type=pathway_type,
                    confidence=_confidence(len(matches)),
                    matched_phrases=matches,
                    weighted_fields=WEIGHTED_FIELDS[pathway_type],
                )
            )

    standard_matches = [p for p in _STANDARD_SIGNALS if p in low]
    if found:
        # A program can be standard AND have an alternate route; only add an
        # explicit standard pathway when the text positively says a test is required.
        if standard_matches:
            found.insert(
                0,
                Pathway(
                    "standard_test_based",
                    _confidence(len(standard_matches)),
                    standard_matches,
                    WEIGHTED_FIELDS["standard_test_based"],
                ),
            )
        return found

    # Nothing alternate matched -> standard only.
    return [
        Pathway(
            "standard_test_based",
            _confidence(len(standard_matches)) if standard_matches else 0.4,
            standard_matches,
            WEIGHTED_FIELDS["standard_test_based"],
        )
    ]

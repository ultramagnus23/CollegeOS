"""Target loader — reads the config-driven registry (targets.json).

Scaling to 100-120+ universities is done by editing targets.json (data), not this
file (code). load_targets() returns ProgramRef objects the ingest pipeline runs
through the same adapter -> extractor -> normalizer -> validator path for every
university, with zero per-university branching.
"""
from __future__ import annotations

import json
import os
from typing import List, Tuple

from scraper.masters.adapters.base_program_adapter import ProgramRef

_TARGETS_PATH = os.path.join(os.path.dirname(__file__), "targets.json")


def load_targets() -> List[Tuple[ProgramRef, dict]]:
    """Return [(ProgramRef, raw_entry)] from targets.json (raw_entry carries
    expected_model / stem metadata used only for QA reporting)."""
    with open(_TARGETS_PATH, encoding="utf-8") as fh:
        data = json.load(fh)
    out: List[Tuple[ProgramRef, dict]] = []
    for entry in data.get("programs", []):
        ref = ProgramRef(
            institution_name=entry["institution_name"],
            institution_country=entry["institution_country"],
            program_name=entry["program_name"],
            degree_type=entry["degree_type"],
            department=entry.get("department"),
            program_url=entry["program_url"],
        )
        out.append((ref, entry))
    return out

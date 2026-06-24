"""Masters ingestion pipeline (orchestration skeleton).

Wires adapter -> extractor -> normalizer into write-ready records. The actual
fetch (HTTP) and write (Supabase/Postgres upsert into canonical.masters_programs
+ canonical.masters_program_pathways) reuse the existing scraper framework's
throttle/robots and supabase writer — left as integration points so this module
stays unit-testable and side-effect-free by default.

Run end-to-end (once adapters + DB creds are wired):
    python -m scraper.masters.pipelines.masters_ingestion_pipeline --dry-run
"""
from __future__ import annotations

from typing import Callable, Iterable, List

from scraper.masters.adapters.base_program_adapter import ProgramRef
from scraper.masters.extractors.program_requirements_extractor import (
    ExtractedRequirements,
    extract_requirements,
)
from scraper.masters.normalizers.program_normalizer import normalize_program

# A fetcher maps a program URL -> raw page text. Injected so tests can pass a stub.
Fetcher = Callable[[str], str]


def build_records(
    refs: Iterable[ProgramRef],
    fetch: Fetcher,
    *,
    intake_term: str | None = None,
    intake_year: int | None = None,
) -> List[dict]:
    """Produce write-ready {'program', 'pathways'} records for the given refs.

    Pure orchestration: the only side effect is whatever ``fetch`` does.
    """
    records: List[dict] = []
    for ref in refs:
        try:
            page_text = fetch(ref.program_url)
        except Exception:  # noqa: BLE001 - a single bad page must not kill the run
            page_text = ""
        reqs: ExtractedRequirements = extract_requirements(page_text)
        records.append(
            normalize_program(ref, reqs, intake_term=intake_term, intake_year=intake_year)
        )
    return records


def summarize(records: List[dict]) -> dict:
    """Quick run summary — total programs and how many flagged a non-standard pathway."""
    non_standard = 0
    for rec in records:
        types = {p["pathway_type"] for p in rec["pathways"]}
        if types - {"standard_test_based"}:
            non_standard += 1
    return {"programs": len(records), "with_non_standard_pathway": non_standard}

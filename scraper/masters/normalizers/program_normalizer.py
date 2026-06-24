"""Program normalizer — assemble a write-ready masters_programs record.

Combines a ProgramRef (identity) + ExtractedRequirements (structured fields) +
the pathway taxonomy classification into the row shapes that the ingestion
pipeline writes to canonical.masters_programs (+ child pathways). Pure function,
unit-testable, no DB/network.
"""
from __future__ import annotations

from typing import List, Optional

from scraper.masters.adapters.base_program_adapter import ProgramRef
from scraper.masters.extractors.program_requirements_extractor import ExtractedRequirements
from scraper.masters.normalizers.pathway_taxonomy import classify_pathways


def normalize_program(
    ref: ProgramRef,
    reqs: ExtractedRequirements,
    *,
    intake_term: Optional[str] = None,
    intake_year: Optional[int] = None,
    data_source: str = "official",
) -> dict:
    """Return {'program': {...}, 'pathways': [...]} ready for upsert."""
    pathways: List[dict] = []
    for pathway in classify_pathways(reqs.evaluation_text):
        # A short, honest description; the pipeline can swap in the real source excerpt.
        desc = f"Detected from program page ({pathway.pathway_type})."
        pathways.append(pathway.to_row(desc, ref.program_url))

    program = {
        "canonical_institution_id": ref.canonical_institution_id,
        "institution_name": ref.institution_name,
        "institution_country": ref.institution_country,
        "department": ref.department,
        "program_name": ref.program_name,
        "degree_type": ref.degree_type,
        "cip_code": None,
        "is_stem_designated": reqs.is_stem_designated,
        "intake_term": intake_term,
        "intake_year": intake_year,
        "gre_requirement": reqs.gre_requirement or "unknown",
        "gmat_requirement": reqs.gmat_requirement or "unknown",
        "min_gpa": reqs.min_gpa,
        "program_url": ref.program_url,
        "data_source": data_source,
    }
    return {"program": program, "pathways": pathways}

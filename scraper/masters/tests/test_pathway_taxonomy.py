"""Unit tests for the masters pathway taxonomy normalizer.

Run: python -m pytest scraper/masters/tests/test_pathway_taxonomy.py
"""
from __future__ import annotations

from scraper.masters.normalizers.pathway_taxonomy import (
    PATHWAY_TYPES,
    classify_pathways,
)


def _types(text):
    return {p.pathway_type for p in classify_pathways(text)}


def test_empty_text_defaults_to_standard():
    result = classify_pathways("")
    assert len(result) == 1
    assert result[0].pathway_type == "standard_test_based"


def test_none_defaults_to_standard():
    result = classify_pathways(None)
    assert result[0].pathway_type == "standard_test_based"


def test_plain_gre_required_is_standard_only():
    text = "Applicants must submit official GRE scores. The GRE General Test is required."
    result = classify_pathways(text)
    assert _types(text) == {"standard_test_based"}
    # Explicit "required" language -> higher confidence than a silent program.
    assert result[0].confidence > 0.4


def test_gre_waived_flags_test_waived_holistic():
    text = "The GRE is not required. Applications are reviewed holistically."
    assert "test_waived_holistic" in _types(text)


def test_work_experience_substitution_phrase():
    text = "The GMAT may be waived for applicants with 5+ years of relevant work experience."
    types = _types(text)
    assert "work_experience_substitution" in types


def test_years_experience_regex_detected():
    text = "Candidates with three or more years experience in industry may qualify."
    assert "work_experience_substitution" in _types(text)


def test_mba_can_be_standard_and_work_experience():
    text = (
        "GMAT required for all applicants. However, the GMAT may be waived for "
        "applicants with 8+ years of professional experience."
    )
    types = _types(text)
    assert "standard_test_based" in types
    assert "work_experience_substitution" in types


def test_executive_part_time():
    text = "This is an executive MBA program designed for working professionals."
    assert "executive_part_time" in _types(text)


def test_portfolio_based():
    text = "A design portfolio is required. Submit a portfolio of recent work."
    assert "portfolio_based" in _types(text)


def test_no_test_direct_entry():
    text = "No GRE or GMAT required for this program. Direct entry based on transcripts."
    types = _types(text)
    assert "direct_entry_no_test" in types or "test_waived_holistic" in types


def test_every_returned_type_is_canonical():
    text = "GRE optional. Portfolio review. Conditional admission may be offered."
    for pathway in classify_pathways(text):
        assert pathway.pathway_type in PATHWAY_TYPES
        assert 0.0 <= pathway.confidence <= 0.95


def test_to_row_shape_matches_db_columns():
    pathway = classify_pathways("GRE not required, holistic review")[0]
    row = pathway.to_row("Holistic review of the whole application.", "https://example.edu")
    assert set(row.keys()) == {
        "pathway_type",
        "description",
        "weighted_fields",
        "min_requirements",
        "confidence",
        "source_url",
    }
    assert isinstance(row["weighted_fields"], list)
    assert isinstance(row["min_requirements"], dict)

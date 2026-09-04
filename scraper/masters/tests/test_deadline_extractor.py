"""Tests for deadline_extractor, built against real sentences hand-verified
(via WebFetch) on 2026-09-03/04 from live program admissions pages listed in
scraper/masters/targets.json. If a real page's wording changes, update the
fixture here to match the new real sentence — don't loosen the regex to fit
a synthetic example.
"""
from datetime import date

from scraper.masters.extractors.deadline_extractor import extract_deadline


def test_ucsd_cse_full_sentence_deadline():
    # Real page structure: an "Application Deadline:" heading precedes the
    # sentence, which itself doesn't repeat the word "deadline" — the window
    # scan must reach forward from the heading to find the date.
    text = ("Application Deadline: The UCSD Application for Graduate Admission "
            "opens for Fall 2027 admission from September 2, 2026 until "
            "December 16, 2026 at 12:00 a.m. PST.")
    result = extract_deadline(text, intake_year=2027)
    assert result.deadline_date == date(2026, 12, 16)
    assert result.is_rolling is False
    assert result.confidence >= 80


def test_gatech_cs_short_date_no_year():
    text = "The application deadline is Feb. 1 for admission to the following fall semester."
    result = extract_deadline(text, intake_year=2027)
    assert result.deadline_date == date(2027, 2, 1)
    assert 60 <= result.confidence < 85


def test_rolling_admission_flagged_not_dated():
    text = "Applications are reviewed on a rolling basis; there is no fixed deadline."
    result = extract_deadline(text)
    assert result.deadline_date is None
    assert result.is_rolling is True


def test_no_deadline_mentioned_returns_none():
    text = "Our program welcomes applicants from all academic backgrounds."
    result = extract_deadline(text)
    assert result.deadline_date is None
    assert result.is_rolling is False
    assert result.confidence == 0.0


def test_empty_text_returns_none():
    result = extract_deadline("")
    assert result.deadline_date is None
    result2 = extract_deadline(None)
    assert result2.deadline_date is None


def test_priority_deadline_with_explicit_year_wins_over_ambiguous_later_mention():
    text = ("The priority deadline for the MFin program is January 15, 2027. "
            "Late applications may be considered depending on space, deadline permitting.")
    result = extract_deadline(text, intake_year=2027)
    assert result.deadline_date == date(2027, 1, 15)


def test_final_deadline_label_picked_over_priority_and_other_term_dates():
    # Real text from cs.columbia.edu/education/ms/appfaq/ (fetched 2026-09-04).
    # An earlier "pick the last date in the window" heuristic silently chose
    # October 15 (the Spring deadline) over February 15 (the real Fall final
    # deadline) — worse than not extracting at all. The explicit "final
    # deadline" label is what should win here, not window position.
    text = ("Fall 1st priority deadline: January 15 Fall 2nd final deadline: "
            "February 15 We strongly encourage all applicants to meet the 1st "
            "deadline. Spring deadline: October 15th We will begin app")
    result = extract_deadline(text, intake_year=2027)
    assert result.deadline_date == date(2027, 2, 15)


def test_multiple_dates_no_final_label_declines_rather_than_guessing():
    # Same shape as the Columbia page but without an explicit "final deadline"
    # label anywhere — genuinely ambiguous which round/term date matters.
    text = ("Round 1 deadline: November 1. Round 2 deadline: January 15. "
            "Round 3 deadline: March 1.")
    result = extract_deadline(text, intake_year=2027)
    assert result.deadline_date is None


def test_final_deadline_label_wins_even_with_other_dates_in_window():
    text = ("Priority deadline: January 15. Final deadline: February 15, 2027. "
            "Spring term deadline: October 15.")
    result = extract_deadline(text, intake_year=2027)
    assert result.deadline_date == date(2027, 2, 15)

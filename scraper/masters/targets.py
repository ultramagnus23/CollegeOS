"""Starter target list for Phase 2 per-program scraping.

A small, representative spread across the in-scope countries (US/UK/CA/DE/NL/AU/SG)
and degree types (MS/MA/MBA) — NOT "every grad program". Get this pipeline solid
on a handful before widening. CT should confirm/expand this with his own
application targets (open decision in docs/MASTERS_TRACK_PLAN.md §11).

Each entry is intentionally just identity + the program-list URL; the per-program
URLs and requirement text are discovered by the adapter/extractor at run time.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class Target:
    institution_name: str
    country: str        # ISO-ish short code used in institution_country
    programs_url: str
    note: str = ""


STARTER_TARGETS: List[Target] = [
    Target("Massachusetts Institute of Technology", "US",
           "https://oge.mit.edu/programs/", "MS/MBA; STEM-heavy; Sloan work-experience pathway"),
    Target("Stanford University", "US",
           "https://www.stanford.edu/list/academic/", "MS/MBA; many GRE-optional post-2020"),
    Target("University of Oxford", "UK",
           "https://www.ox.ac.uk/admissions/graduate/courses", "MSc; 1-year; usually no GRE"),
    Target("University of Toronto", "CA",
           "https://www.sgs.utoronto.ca/programs/", "MS; funded research vs course-based split"),
    Target("Technical University of Munich", "DE",
           "https://www.tum.de/en/studies/degree-programs", "MSc; low/zero tuition; winter intake"),
    Target("Delft University of Technology", "NL",
           "https://www.tudelft.nl/en/education/programmes/masters", "MSc; English-taught; EU vs non-EU fees"),
    Target("University of Melbourne", "AU",
           "https://study.unimelb.edu.au/find/courses/graduate/", "MS; multiple intakes; GTE"),
    Target("National University of Singapore", "SG",
           "https://www.nus.edu.sg/oam/graduate-studies", "MS/MBA; coursework vs research"),
]

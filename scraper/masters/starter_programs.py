"""Starter per-program target list for Phase 2 ingest.

Five real programs chosen for genuinely DIFFERENT admission models so the pathway
taxonomy is exercised against real page text, not unit-test fixtures:
  - UCSD MS CS        — GRE not required (test-waived holistic)
  - Georgia Tech MSCS — GRE optional (test-waived holistic)
  - MIT MechE SM      — GRE not required (test-waived holistic)
  - Rice MBA          — GMAT/GRE waiver for 3+ yrs experience (work-experience substitution)
  - MIT Sloan MFin    — finance master's (expected standard test-based) — verifies the
                        default standard pathway against a program that still tests

Each entry is identity + the live URL the adapter fetches. CT can expand this
with his own application targets (open decision in docs/MASTERS_TRACK_PLAN.md).
"""
from __future__ import annotations

from scraper.masters.adapters.base_program_adapter import ProgramRef

STARTER_PROGRAMS = [
    ProgramRef(
        institution_name="University of California, San Diego",
        institution_country="US",
        program_name="MS in Computer Science",
        degree_type="MS",
        department="Computer Science & Engineering",
        program_url="https://cse.ucsd.edu/graduate/admissions",
    ),
    ProgramRef(
        institution_name="Georgia Institute of Technology",
        institution_country="US",
        program_name="MS in Computer Science",
        degree_type="MS",
        department="College of Computing",
        program_url="https://www.cc.gatech.edu/ms-computer-science-admission-requirements",
    ),
    ProgramRef(
        institution_name="Massachusetts Institute of Technology",
        institution_country="US",
        program_name="SM in Mechanical Engineering",
        degree_type="MS",
        department="Mechanical Engineering",
        program_url="https://meche.mit.edu/education/prospective-students/graduate/apply",
    ),
    ProgramRef(
        institution_name="Rice University",
        institution_country="US",
        program_name="Full-Time MBA",
        degree_type="MBA",
        department="Jones Graduate School of Business",
        program_url="https://business.rice.edu/mba-admissions/gmat-waiver",
    ),
    ProgramRef(
        institution_name="Massachusetts Institute of Technology",
        institution_country="US",
        program_name="Master of Finance (MFin)",
        degree_type="MS",
        department="MIT Sloan",
        program_url="https://mitsloan.mit.edu/mfin/apply/how-to-apply",
    ),
]

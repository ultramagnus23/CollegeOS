"""Proof the regex+scrub+validate path works, with zero Reddit access / API keys.
Uses a synthetic post in the r/collegeresults house style."""
import os
os.environ.setdefault("CR_SALT", "demo-salt-not-for-production")

from scrub import scrub_text, hash_id, coarsen_income
from extract import extract

SAMPLE = """\
Demographics: Asian male, first-gen, income ~$45,000, from the Midwest.
Attended Lincoln High School.  My blog: https://example.com/me  (u/someuser)
Academics: UW GPA: 3.92  W GPA: 4.45  SAT: 1520  9 APs
Decisions:
MIT - rejected
University of Michigan - accepted
Georgia Tech - waitlisted
Purdue - admitted
Case Western - deferred
"""

text = scrub_text(SAMPLE)
print("--- scrubbed text (identifiers stripped) ---")
print(text)
appl, method = extract(text)
appl.income_band = coarsen_income("~$45,000")
print("--- extraction method:", method)
print("applicant_id:", hash_id("t3_abc123"))
print("gpa_uw:", appl.gpa_uw, "gpa_w:", appl.gpa_w,
      "sat:", appl.sat_total, "num_ap:", appl.num_ap,
      "income_band:", appl.income_band)
print("--- exploded decision rows ---")
for c in appl.colleges:
    print(f"  {c.university_raw:<22} -> {c.decision.value}")

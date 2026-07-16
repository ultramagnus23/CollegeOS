"""Common Data Set section C fields -- no feed exists, so this is a per-school
scrape helper plus a manual-entry fallback. CDS PDFs/HTML vary in layout across
schools and years; the regexes below catch the common "Section C" phrasing but
will miss outliers -- always spot-check a sample before trusting the output.

Usage: build a CSV of {unitid, cds_url} once (search "<school> common data set"),
then run harvest_cds() per row. For schools where the regex fails, fill in
cds_manual.csv by hand -- the join in join.py prefers scraped values but falls
back to manual entries.
"""
from __future__ import annotations
import re
import pandas as pd

_GPA_BAND_RE = re.compile(
    r"(4\.0|3\.75\s*-\s*3\.99|3\.50\s*-\s*3\.74|3\.25\s*-\s*3\.49|3\.00\s*-\s*3\.24|"
    r"2\.50\s*-\s*2\.99|2\.00\s*-\s*2\.49|1\.00\s*-\s*1\.99|Below\s*1\.0)"
    r"\D{0,20}?(\d{1,3}(?:,\d{3})*)",
    re.I,
)
_WAITLIST_RE = re.compile(
    r"offered.{0,40}?wait.?list.{0,80}?(\d{1,4}).{0,200}?"
    r"accepted.{0,40}?place.{0,80}?(\d{1,4}).{0,200}?"
    r"admitted.{0,40}?wait.?list.{0,80}?(\d{1,4})",
    re.I | re.S,
)
_ED_RATE_RE = re.compile(
    r"early\s+decision.{0,200}?applied.{0,40}?(\d{1,5}).{0,200}?admitted.{0,40}?(\d{1,5})",
    re.I | re.S,
)


def parse_cds_text(text: str) -> dict:
    """Best-effort regex extraction from a CDS document's plain text."""
    gpa_dist = {}
    for band, count in _GPA_BAND_RE.findall(text):
        gpa_dist[band.strip()] = int(count.replace(",", ""))

    out = {"cds_gpa_dist": gpa_dist or None,
           "cds_waitlist_offered": None,
           "cds_waitlist_accepted": None,
           "cds_waitlist_admitted": None,
           "cds_ed_admit_rate": None}

    if m := _WAITLIST_RE.search(text):
        out["cds_waitlist_offered"] = int(m.group(1))
        out["cds_waitlist_accepted"] = int(m.group(2))
        out["cds_waitlist_admitted"] = int(m.group(3))

    if m := _ED_RATE_RE.search(text):
        applied, admitted = int(m.group(1)), int(m.group(2))
        if applied:
            out["cds_ed_admit_rate"] = admitted / applied

    return out


def harvest_cds(unitid: int, cds_text: str, cycle_year: int) -> dict:
    row = parse_cds_text(cds_text)
    row["unitid"] = unitid
    row["cds_source_year"] = cycle_year
    return row


def load_manual_overrides(path: str) -> pd.DataFrame:
    """cds_manual.csv columns: unitid, cycle_year, <any cds_* field you filled by hand>."""
    return pd.read_csv(path)

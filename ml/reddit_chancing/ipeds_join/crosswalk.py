"""university_raw (as posted on Reddit) -> IPEDS UnitID.

Build once from IPEDS HD (institutional characteristics) + hand-added aliases,
then resolve every applicant_outcomes.university_raw against it.
"""
from __future__ import annotations
import csv
import re
from dataclasses import dataclass, field

from rapidfuzz import process, fuzz

_STOPWORDS = re.compile(r"\b(university|college|the|of|at|campus)\b", re.I)
_PUNCT = re.compile(r"[^a-z0-9 ]")


def normalize(name: str) -> str:
    n = name.lower()
    n = _STOPWORDS.sub(" ", n)
    n = _PUNCT.sub(" ", n)
    return " ".join(n.split())


@dataclass
class Crosswalk:
    unitid_by_alias: dict[str, int] = field(default_factory=dict)
    canonical_name: dict[int, str] = field(default_factory=dict)
    _norm_index: dict[str, int] = field(default_factory=dict)   # normalized alias -> unitid

    def add(self, unitid: int, canonical: str, aliases: list[str]) -> None:
        self.canonical_name[unitid] = canonical
        for a in [canonical, *aliases]:
            self.unitid_by_alias[a] = unitid
            self._norm_index[normalize(a)] = unitid

    def resolve(self, university_raw: str, *, fuzzy_threshold: int = 90
                ) -> tuple[int | None, str]:
        """Returns (unitid, method). method in {EXACT, FUZZY, UNRESOLVED}."""
        if university_raw in self.unitid_by_alias:
            return self.unitid_by_alias[university_raw], "EXACT"
        norm = normalize(university_raw)
        if norm in self._norm_index:
            return self._norm_index[norm], "EXACT"
        match = process.extractOne(
            norm, self._norm_index.keys(), scorer=fuzz.token_set_ratio
        )
        if match and match[1] >= fuzzy_threshold:
            return self._norm_index[match[0]], "FUZZY"
        return None, "UNRESOLVED"


def load_crosswalk(hd_csv_path: str, aliases_csv_path: str | None = None) -> Crosswalk:
    """hd_csv_path: IPEDS HD####.csv (has UNITID, INSTNM).
    aliases_csv_path: optional CSV with columns unitid,alias for hand-added
    nicknames the fuzzy matcher won't catch ("UMich" -> Michigan's unitid, etc).
    """
    cw = Crosswalk()
    with open(hd_csv_path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            unitid = int(row["UNITID"])
            cw.add(unitid, row["INSTNM"], [])
    if aliases_csv_path:
        with open(aliases_csv_path, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                unitid = int(row["unitid"])
                if unitid in cw.canonical_name:
                    cw.unitid_by_alias[row["alias"]] = unitid
                    cw._norm_index[normalize(row["alias"])] = unitid
    return cw

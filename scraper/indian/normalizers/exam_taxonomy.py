from __future__ import annotations

from typing import Dict, List

EXAM_ALIASES: Dict[str, List[str]] = {
    "JEE Main": ["jee main", "jee-mains", "joint entrance examination main"],
    "JEE Advanced": ["jee advanced", "iit jee", "joint entrance examination advanced"],
    "CUET": ["cuet", "common university entrance test"],
    "NEET": ["neet", "neet ug", "national eligibility cum entrance test"],
    "CLAT": ["clat", "common law admission test"],
    "CAT": ["cat", "common admission test"],
    "XAT": ["xat", "xavier aptitude test"],
    "SAT": ["sat", "sat i"],
    "ACT": ["act"],
    "LNAT": ["lnat"],
    "UCAT": ["ucat"],
    "AP": ["ap", "advanced placement"],
    "IB": ["ib", "international baccalaureate"],
    "A-levels": ["a-level", "a levels", "a-levels"],
}


def normalize_exam_name(raw: str | None) -> str | None:
    if not raw:
        return None
    token = raw.strip().lower()
    for canonical, aliases in EXAM_ALIASES.items():
        if token == canonical.lower() or token in aliases:
            return canonical
    return raw.strip()

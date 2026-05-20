from __future__ import annotations

import re
from typing import Dict, List

from bs4 import BeautifulSoup


def parse_requirements(html: str) -> List[Dict]:
    soup = BeautifulSoup(html or "", "html.parser")
    text = soup.get_text("\n")
    rows = []

    requirement_patterns = {
        "essay": re.compile(r"essay|personal statement", re.IGNORECASE),
        "recommendation_letters": re.compile(r"recommendation|letter[s]? of recommendation", re.IGNORECASE),
        "transcript": re.compile(r"transcript", re.IGNORECASE),
        "sat_act": re.compile(r"\bSAT\b|\bACT\b", re.IGNORECASE),
        "ielts_toefl": re.compile(r"\bIELTS\b|\bTOEFL\b", re.IGNORECASE),
        "portfolio": re.compile(r"portfolio", re.IGNORECASE),
    }

    for line in [ln.strip() for ln in text.splitlines() if ln.strip()]:
        matched = [name for name, pattern in requirement_patterns.items() if pattern.search(line)]
        for requirement_type in matched:
            rows.append({
                "requirement_type": requirement_type,
                "requirement_text": line[:500],
            })

    dedup = {}
    for item in rows:
        dedup[(item["requirement_type"], item["requirement_text"])] = item
    return list(dedup.values())


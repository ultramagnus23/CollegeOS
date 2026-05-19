from __future__ import annotations

import re
from datetime import datetime
from typing import Dict, List

from bs4 import BeautifulSoup

DEADLINE_PATTERNS = {
    "early_decision": re.compile(r"early decision|ed\b", re.IGNORECASE),
    "early_action": re.compile(r"early action|ea\b", re.IGNORECASE),
    "regular_decision": re.compile(r"regular decision|rd\b", re.IGNORECASE),
    "rolling": re.compile(r"rolling", re.IGNORECASE),
    "transfer": re.compile(r"transfer", re.IGNORECASE),
    "scholarship": re.compile(r"scholarship", re.IGNORECASE),
    "fafsa": re.compile(r"fafsa", re.IGNORECASE),
    "css_profile": re.compile(r"css profile|css", re.IGNORECASE),
}

DATE_PATTERNS = [
    re.compile(r"\b([A-Za-z]+ \d{1,2}, \d{4})\b"),
    re.compile(r"\b(\d{4}-\d{2}-\d{2})\b"),
    re.compile(r"\b(\d{1,2}/\d{1,2}/\d{4})\b"),
]


def _parse_date(raw: str) -> str | None:
    for fmt in ("%B %d, %Y", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(raw.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return None


def parse_deadlines(html: str) -> List[Dict]:
    soup = BeautifulSoup(html or "", "html.parser")
    lines = [line.strip() for line in soup.get_text("\n").splitlines() if line.strip()]
    results = []
    for line in lines:
        line_lower = line.lower()
        tags = [k for k, pattern in DEADLINE_PATTERNS.items() if pattern.search(line)]
        if not tags:
            continue
        for date_pattern in DATE_PATTERNS:
            for match in date_pattern.findall(line):
                parsed = _parse_date(match)
                if not parsed:
                    continue
                for tag in tags:
                    results.append({
                        "deadline_type": tag,
                        "deadline_date": parsed,
                        "source_context": line[:500],
                    })
    dedup = {}
    for item in results:
        key = (item["deadline_type"], item["deadline_date"])
        dedup[key] = item
    return list(dedup.values())


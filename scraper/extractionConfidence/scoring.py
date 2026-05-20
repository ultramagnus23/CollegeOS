from __future__ import annotations

from typing import Dict


REQUIRED_FIELDS = {
    "admissions": ["acceptance_rate", "application_deadline", "source_url"],
    "financial": ["tuition_international", "net_cost_usd", "source_url"],
    "profile": ["name", "country", "official_website", "source_url"],
}


def extraction_confidence(payload: Dict, record_type: str) -> float:
    needed = REQUIRED_FIELDS.get(record_type, [])
    if not needed:
        return 0.5
    available = sum(1 for k in needed if payload.get(k) not in (None, "", []))
    base = available / len(needed)
    completeness_bonus = min(0.2, max(0.0, (len(payload.keys()) - len(needed)) * 0.01))
    return max(0.0, min(1.0, base + completeness_bonus))

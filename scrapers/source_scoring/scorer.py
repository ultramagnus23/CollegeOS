from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict


def compute_source_score(source_url: str, parser_confidence: float, extracted_at_iso: str | None = None) -> Dict:
    url = (source_url or "").lower()
    if ".edu" in url or "ac.uk" in url:
        trust = 1.0
        source_type = "official"
    elif ".gov" in url:
        trust = 0.9
        source_type = "government"
    elif "commonapp.org" in url or "ucas.com" in url:
        trust = 0.82
        source_type = "aggregator"
    else:
        trust = 0.65
        source_type = "community"

    extracted_at = datetime.now(timezone.utc)
    if extracted_at_iso:
        try:
            extracted_at = datetime.fromisoformat(extracted_at_iso.replace("Z", "+00:00"))
        except ValueError:
            pass

    age_days = max(0, (datetime.now(timezone.utc) - extracted_at).days)
    freshness_score = max(0.0, 1.0 - (age_days / 365))
    confidence = max(0.0, min(1.0, parser_confidence * 0.7 + trust * 0.3))

    return {
        "source_type": source_type,
        "trust_score": round(trust, 4),
        "freshness_score": round(freshness_score, 4),
        "confidence_score": round(confidence, 4),
        "stale": age_days > 180,
    }


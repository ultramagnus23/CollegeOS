from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlparse
from typing import Dict


def _host(url: str) -> str:
    parsed = urlparse(url if "://" in url else f"https://{url}")
    return (parsed.hostname or "").lower().strip(".")


def _host_matches(host: str, domain: str) -> bool:
    d = domain.lower()
    return host == d or host.endswith(f".{d}")


def compute_source_score(source_url: str, parser_confidence: float, extracted_at_iso: str | None = None) -> Dict:
    host = _host(source_url or "")
    if host.endswith(".edu") or _host_matches(host, "ac.uk"):
        trust = 1.0
        source_type = "official"
    elif host.endswith(".gov"):
        trust = 0.9
        source_type = "government"
    elif _host_matches(host, "commonapp.org") or _host_matches(host, "ucas.com"):
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

from __future__ import annotations

from typing import Dict, List

SOURCE_PRIORITY = {
    "official": 4,
    "government": 3,
    "aggregator": 2,
    "community": 1,
}


def resolve_conflicts(items: List[Dict]) -> List[Dict]:
    """
    Resolve duplicate deadline/requirement records using source confidence and recency.
    """
    best_by_key: Dict[str, Dict] = {}
    for item in items:
        key = str(item.get("unique_key") or f"{item.get('institution_id')}::{item.get('deadline_type') or item.get('requirement_type')}")
        source = str(item.get("source_type") or "aggregator").lower()
        source_score = SOURCE_PRIORITY.get(source, 0)
        confidence = float(item.get("confidence_score") or 0)
        freshness = float(item.get("freshness_score") or 0)
        rank = (source_score * 0.5) + (confidence * 0.4) + (freshness * 0.1)

        current = best_by_key.get(key)
        if current is None or rank > current["_rank"]:
            best = dict(item)
            best["_rank"] = rank
            best_by_key[key] = best

    result = []
    for item in best_by_key.values():
        item.pop("_rank", None)
        result.append(item)
    return result


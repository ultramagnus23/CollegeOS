from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple

FEATURE_ORDER = [
    "major_availability",
    "subject_ranking_alignment",
    "admissions_fit",
    "affordability_fit",
    "normalized_global_ranking",
    "popularity_score",
    "outcomes_alignment",
    "research_intensity_fit",
    "international_aid_match",
    "country_match",
    "selectivity_tier_score",
    "search_volume_signal",
]


@dataclass
class RankingRow:
    query_id: str
    institution_id: str
    label: float
    features: Dict[str, float]


def to_matrix(rows: Iterable[RankingRow]) -> Tuple[List[List[float]], List[float], List[str], List[dict]]:
    x: List[List[float]] = []
    y: List[float] = []
    qids: List[str] = []
    meta: List[dict] = []
    for row in rows:
        x.append([float(row.features.get(k, 0.0)) for k in FEATURE_ORDER])
        y.append(float(row.label))
        qids.append(str(row.query_id))
        meta.append({"query_id": row.query_id, "institution_id": row.institution_id})
    return x, y, qids, meta

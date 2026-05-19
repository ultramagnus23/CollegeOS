from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List


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
class FeatureRow:
    query_id: str
    institution_id: str
    label: int
    features: Dict[str, float]


def vectorize_rows(rows: List[FeatureRow]):
    x = []
    y = []
    qid = []
    meta = []
    for row in rows:
        x.append([float(row.features.get(f, 0.0)) for f in FEATURE_ORDER])
        y.append(int(row.label))
        qid.append(str(row.query_id))
        meta.append({"query_id": row.query_id, "institution_id": row.institution_id})
    return x, y, qid, meta


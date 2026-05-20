from __future__ import annotations

from pathlib import Path

import pandas as pd

from feature_generation import generate_features
from label_generation import generate_labels


def build_training_dataset(staging_input: Path, training_output: Path):
    features_path = Path("ml/data_pipeline/staging/features.parquet")
    labeled_path = Path("ml/data_pipeline/staging/labeled.parquet")

    generate_features(staging_input, features_path)
    frame = generate_labels(features_path, labeled_path)

    required = [
        "query_id",
        "institution_id",
        "label",
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

    for col in required:
        if col not in frame.columns:
            frame[col] = 0

    frame[required].to_csv(training_output, index=False)


if __name__ == "__main__":
    build_training_dataset(
        Path("ml/data_pipeline/staging/anonymized.parquet"),
        Path("ml/recommendation_ranker/training_data.csv"),
    )

from __future__ import annotations

from pathlib import Path

import pandas as pd


def clamp01(series):
    return series.fillna(0).clip(0, 1)


def generate_features(input_path: Path, output_path: Path):
    frame = pd.read_parquet(input_path)

    frame["major_availability"] = clamp01(frame.get("major_match", frame.get("major_match_score", 0)))
    frame["subject_ranking_alignment"] = 1 - frame.get("subject_rank", 300).fillna(300).clip(0, 300) / 300
    frame["admissions_fit"] = (frame.get("gpa_extracted", frame.get("gpa", 0)).astype(float).fillna(0) / 4.0).clip(0, 1)
    frame["affordability_fit"] = (
        frame.get("budget_usd", 0).astype(float).fillna(0) /
        frame.get("tuition", frame.get("net_cost", 1)).astype(float).replace(0, 1)
    ).clip(0, 1)
    frame["normalized_global_ranking"] = 1 - frame.get("global_rank", 1000).fillna(1000).clip(0, 1000) / 1000
    frame["popularity_score"] = frame.get("popularity_score", 0).fillna(0).clip(0, 1)
    frame["outcomes_alignment"] = frame.get("salary_alignment", 0).fillna(0).clip(0, 1)
    frame["research_intensity_fit"] = frame.get("research_intensity_fit", 0.4).fillna(0.4).clip(0, 1)
    frame["international_aid_match"] = frame.get("international_aid_match", 0).fillna(0).clip(0, 1)
    frame["country_match"] = frame.get("country_match", 0.5).fillna(0.5).clip(0, 1)
    frame["selectivity_tier_score"] = 1 - frame.get("acceptance_rate", 0.5).fillna(0.5).clip(0, 1)
    frame["search_volume_signal"] = frame.get("search_volume_signal", 0).fillna(0).clip(0, 1)

    frame.to_parquet(output_path, index=False)
    return frame


if __name__ == "__main__":
    generate_features(
        Path("ml/data_pipeline/staging/anonymized.parquet"),
        Path("ml/data_pipeline/staging/features.parquet"),
    )

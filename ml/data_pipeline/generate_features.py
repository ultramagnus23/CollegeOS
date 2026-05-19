from __future__ import annotations

from pathlib import Path

import pandas as pd


def safe_ratio(a, b, default=0.0):
    if pd.isna(a) or pd.isna(b) or b == 0:
        return default
    return max(0.0, min(1.5, float(a) / float(b)))


def main():
    in_file = Path("ml/data_pipeline/staging/cleaned.parquet")
    out_file = Path("ml/recommendation_ranker/training_data.csv")
    out_file.parent.mkdir(parents=True, exist_ok=True)
    if not in_file.exists():
        raise SystemExit(f"Missing input: {in_file}")

    frame = pd.read_parquet(in_file)
    required_cols = {"query_id", "institution_id", "label"}
    if not required_cols.issubset(set(frame.columns)):
        raise SystemExit("cleaned.parquet must include query_id, institution_id, label")

    frame["major_availability"] = frame.get("major_match", 0).fillna(0)
    frame["subject_ranking_alignment"] = 1 - frame.get("subject_rank", 300).fillna(300).clip(0, 300) / 300.0
    frame["admissions_fit"] = frame.apply(lambda r: safe_ratio(r.get("student_gpa"), r.get("college_gpa"), 0.45), axis=1)
    frame["affordability_fit"] = frame.apply(lambda r: safe_ratio(r.get("budget_usd"), r.get("net_cost"), 0.4), axis=1)
    frame["normalized_global_ranking"] = 1 - frame.get("global_rank", 1000).fillna(1000).clip(0, 1000) / 1000.0
    frame["popularity_score"] = frame.get("popularity_score", 0).fillna(0).clip(0, 1)
    frame["outcomes_alignment"] = frame.get("salary_alignment", 0).fillna(0).clip(0, 1)
    frame["research_intensity_fit"] = frame.get("research_intensity_fit", 0.4).fillna(0.4).clip(0, 1)
    frame["international_aid_match"] = frame.get("international_aid_match", 0).fillna(0).clip(0, 1)
    frame["country_match"] = frame.get("country_match", 0.5).fillna(0.5).clip(0, 1)
    frame["selectivity_tier_score"] = 1 - frame.get("acceptance_rate", 0.5).fillna(0.5).clip(0, 1)
    frame["search_volume_signal"] = frame.get("search_volume_signal", 0).fillna(0).clip(0, 1)

    keep = [
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
    frame[keep].to_csv(out_file, index=False)
    print(f"feature_rows={len(frame)}")


if __name__ == "__main__":
    main()


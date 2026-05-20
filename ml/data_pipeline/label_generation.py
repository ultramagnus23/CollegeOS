from __future__ import annotations

from pathlib import Path

import pandas as pd


def score_outcome(value: str) -> float:
    text = str(value or "")
    if text == "accepted":
        return 3.0
    if text == "waitlisted":
        return 1.5
    if text == "rejected":
        return 0.0
    return 1.0


def generate_labels(input_path: Path, output_path: Path):
    frame = pd.read_parquet(input_path)

    acceptance = frame.get("outcome_norm", "unknown").map(score_outcome)
    attendance = frame.get("attendance_likelihood", 0.5).fillna(0.5) * 2
    profile_fit = frame.get("major_availability", 0) * 1.5 + frame.get("admissions_fit", 0) * 1.2
    prestige = frame.get("normalized_global_ranking", 0) * frame.get("prestige_preference", 1.0)
    affordability = frame.get("affordability_fit", 0) * 1.3
    goals = frame.get("goal_alignment", 0.5).fillna(0.5) * 1.0

    frame["label"] = (acceptance + attendance + profile_fit + prestige + affordability + goals).clip(0, 10)
    frame.to_parquet(output_path, index=False)
    return frame


if __name__ == "__main__":
    generate_labels(
        Path("ml/data_pipeline/staging/features.parquet"),
        Path("ml/data_pipeline/staging/labeled.parquet"),
    )

from __future__ import annotations

from pathlib import Path

import pandas as pd


def normalize_outcome(value: str) -> str:
    text = str(value or "").lower()
    if "accept" in text:
        return "accepted"
    if "reject" in text or "deny" in text:
        return "rejected"
    if "wait" in text:
        return "waitlisted"
    return "unknown"


def extract_outcomes(input_path: Path, output_path: Path):
    frame = pd.read_parquet(input_path)
    frame["outcome_norm"] = frame["outcome"].map(normalize_outcome)
    frame.to_parquet(output_path, index=False)
    return frame


if __name__ == "__main__":
    extract_outcomes(
        Path("ml/data_pipeline/staging/profile_extracted.parquet"),
        Path("ml/data_pipeline/staging/outcomes_extracted.parquet"),
    )

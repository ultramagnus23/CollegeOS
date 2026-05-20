from __future__ import annotations

from pathlib import Path

import pandas as pd


def normalize_text(s: str) -> str:
    return " ".join(str(s or "").strip().lower().split())


def run_normalization(input_path: Path, output_path: Path):
    frame = pd.read_parquet(input_path)
    for col in ["institution_raw", "major_extracted", "intended_major"]:
        if col in frame.columns:
            frame[col] = frame[col].map(normalize_text)
    frame.to_parquet(output_path, index=False)
    return frame


if __name__ == "__main__":
    run_normalization(
        Path("ml/data_pipeline/staging/outcomes_extracted.parquet"),
        Path("ml/data_pipeline/staging/normalized.parquet"),
    )

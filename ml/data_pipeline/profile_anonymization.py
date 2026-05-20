from __future__ import annotations

import hashlib
from pathlib import Path

import pandas as pd


def hash_text(value: str) -> str:
    return hashlib.sha256(str(value or "").encode("utf-8")).hexdigest()[:16]


def anonymize_profiles(input_path: Path, output_path: Path):
    frame = pd.read_parquet(input_path)
    if "post_id" in frame.columns:
        frame["anonymized_user_id"] = frame["post_id"].map(hash_text)
    if "profile_text" in frame.columns:
        frame["profile_text"] = frame["profile_text"].map(lambda _: "[redacted]")
    frame.to_parquet(output_path, index=False)
    return frame


if __name__ == "__main__":
    anonymize_profiles(
        Path("ml/data_pipeline/staging/resolved.parquet"),
        Path("ml/data_pipeline/staging/anonymized.parquet"),
    )

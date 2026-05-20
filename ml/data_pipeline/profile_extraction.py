from __future__ import annotations

import re
from pathlib import Path

import pandas as pd


def extract_first(pattern: str, text: str):
    m = re.search(pattern, text, flags=re.IGNORECASE)
    return m.group(1) if m else None


def extract_profiles(input_path: Path, output_path: Path):
    frame = pd.read_parquet(input_path)
    text = frame["profile_text"].fillna("")
    frame["gpa_extracted"] = text.map(lambda t: extract_first(r"gpa\s*[:=]?\s*([0-4](?:\.\d+)?)", t))
    frame["sat_extracted"] = text.map(lambda t: extract_first(r"sat\s*[:=]?\s*(\d{3,4})", t))
    frame["act_extracted"] = text.map(lambda t: extract_first(r"act\s*[:=]?\s*(\d{1,2})", t))
    frame["major_extracted"] = text.map(lambda t: extract_first(r"major\s*[:=]?\s*([a-zA-Z\s/&-]+)", t))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(output_path, index=False)
    return frame


if __name__ == "__main__":
    extract_profiles(
        Path("ml/data_pipeline/staging/reddit_ingested.parquet"),
        Path("ml/data_pipeline/staging/profile_extracted.parquet"),
    )

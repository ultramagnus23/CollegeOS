from __future__ import annotations

from pathlib import Path

import pandas as pd


def deduplicate(input_path: Path, output_path: Path):
    frame = pd.read_parquet(input_path)
    cols = [c for c in ["source", "post_id", "institution_raw", "profile_text"] if c in frame.columns]
    frame = frame.drop_duplicates(subset=cols if cols else None)
    frame.to_parquet(output_path, index=False)
    return frame


if __name__ == "__main__":
    deduplicate(
        Path("ml/data_pipeline/staging/normalized.parquet"),
        Path("ml/data_pipeline/staging/deduped.parquet"),
    )

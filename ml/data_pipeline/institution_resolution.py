from __future__ import annotations

from pathlib import Path

import pandas as pd


def normalize(v: str) -> str:
    return str(v or "").strip().lower()


def resolve_institutions(input_path: Path, canonical_path: Path, output_path: Path):
    frame = pd.read_parquet(input_path)
    canonical = pd.read_csv(canonical_path)
    canonical["name_key"] = canonical["canonical_name"].map(normalize)

    frame["name_key"] = frame["institution_raw"].map(normalize)
    merged = frame.merge(canonical[["institution_id", "name_key", "canonical_name"]], on="name_key", how="left")
    merged.to_parquet(output_path, index=False)
    return merged


if __name__ == "__main__":
    resolve_institutions(
        Path("ml/data_pipeline/staging/deduped.parquet"),
        Path("ml/data_pipeline/raw/institution_lookup.csv"),
        Path("ml/data_pipeline/staging/resolved.parquet"),
    )

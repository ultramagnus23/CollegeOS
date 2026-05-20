from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


def read_any(path: Path) -> pd.DataFrame:
    if path.suffix == ".csv":
        return pd.read_csv(path)
    if path.suffix in {".json", ".jsonl"}:
        if path.suffix == ".jsonl":
            return pd.read_json(path, lines=True)
        return pd.DataFrame(json.loads(path.read_text(encoding="utf-8")))
    if path.suffix == ".parquet":
        return pd.read_parquet(path)
    raise ValueError(f"Unsupported file type: {path}")


def main():
    src_dir = Path("ml/data_pipeline/raw")
    out_file = Path("ml/data_pipeline/staging/merged_raw.parquet")
    out_file.parent.mkdir(parents=True, exist_ok=True)

    frames = []
    for p in src_dir.glob("*"):
        if p.is_file():
            try:
                frames.append(read_any(p))
            except Exception:
                continue
    if not frames:
        raise SystemExit("No raw source files found in ml/data_pipeline/raw")

    merged = pd.concat(frames, ignore_index=True)
    merged.to_parquet(out_file, index=False)
    print(f"merged_rows={len(merged)}")


if __name__ == "__main__":
    main()


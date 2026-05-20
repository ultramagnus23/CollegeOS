from __future__ import annotations

from pathlib import Path

import pandas as pd


def norm_country(raw: str) -> str:
    value = str(raw or "").strip().upper()
    mapping = {"US": "United States", "USA": "United States", "UK": "United Kingdom", "IN": "India"}
    return mapping.get(value, str(raw or "").title())


def main():
    in_file = Path("ml/data_pipeline/staging/merged_raw.parquet")
    out_file = Path("ml/data_pipeline/staging/cleaned.parquet")
    out_file.parent.mkdir(parents=True, exist_ok=True)
    if not in_file.exists():
        raise SystemExit(f"Missing input: {in_file}")

    frame = pd.read_parquet(in_file)
    frame.columns = [c.strip().lower() for c in frame.columns]
    frame = frame.drop_duplicates()

    if "country" in frame.columns:
        frame["country"] = frame["country"].map(norm_country)
    if "acceptance_rate" in frame.columns:
        frame["acceptance_rate"] = pd.to_numeric(frame["acceptance_rate"], errors="coerce")
        frame.loc[frame["acceptance_rate"] > 1, "acceptance_rate"] = frame["acceptance_rate"] / 100.0
    for col in ["gpa", "sat", "act", "tuition", "net_cost", "median_salary"]:
        if col in frame.columns:
            frame[col] = pd.to_numeric(frame[col], errors="coerce")

    frame.to_parquet(out_file, index=False)
    print(f"cleaned_rows={len(frame)}")


if __name__ == "__main__":
    main()


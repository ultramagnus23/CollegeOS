from __future__ import annotations

import json
from pathlib import Path
from typing import List

import numpy as np
import pandas as pd

from feature_engineering import FEATURE_ORDER


def load_training_rows(path: Path):
    frame = pd.read_parquet(path) if path.suffix == ".parquet" else pd.read_csv(path)
    required = {"query_id", "institution_id", "label", *FEATURE_ORDER}
    missing = sorted(required - set(frame.columns))
    if missing:
        raise ValueError(f"Missing columns: {missing}")
    return frame


def train_pairwise_ranker(frame: pd.DataFrame, model_path: Path):
    x = frame[FEATURE_ORDER].to_numpy(dtype=float)
    y = frame["label"].to_numpy(dtype=float)

    try:
        from xgboost import XGBRanker  # type: ignore

        group_sizes = frame.groupby("query_id").size().to_list()
        model = XGBRanker(
            objective="rank:pairwise",
            n_estimators=180,
            max_depth=6,
            learning_rate=0.06,
            subsample=0.9,
            colsample_bytree=0.9,
            reg_lambda=1.2,
            random_state=42,
        )
        model.fit(x, y, group=group_sizes, verbose=False)
        model.save_model(str(model_path))
        model_type = "xgboost_rank_pairwise"
    except Exception:
        # deterministic fallback that still yields rankable linear scores
        coef = np.linalg.lstsq(x + 1e-8, y, rcond=None)[0]
        payload = {"model_type": "linear_fallback", "coef": coef.tolist(), "intercept": 0.0}
        model_path.write_text(json.dumps(payload), encoding="utf-8")
        model_type = "linear_fallback"

    return model_type


def main():
    data_path = Path("ml/recommendation_ranker/training_data.csv")
    model_path = Path("ml/recommendation_ranker/model.json")
    meta_path = Path("ml/recommendation_ranker/model_meta.json")
    data_path.parent.mkdir(parents=True, exist_ok=True)

    if not data_path.exists():
        raise SystemExit(f"Training data not found: {data_path}")

    frame = load_training_rows(data_path)
    model_type = train_pairwise_ranker(frame, model_path)

    meta = {
        "model_type": model_type,
        "feature_order": FEATURE_ORDER,
        "rows": int(len(frame)),
        "queries": int(frame["query_id"].nunique()),
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps(meta))


if __name__ == "__main__":
    main()


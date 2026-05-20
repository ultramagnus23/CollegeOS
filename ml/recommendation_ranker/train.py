from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from datasets import load_dataset, split_by_query
from features import FEATURE_ORDER


def _train_xgboost(train_frame, model_path: Path):
    from xgboost import XGBRanker  # type: ignore

    x = train_frame[FEATURE_ORDER].to_numpy(dtype=float)
    y = train_frame["label"].to_numpy(dtype=float)
    group = train_frame.groupby("query_id").size().tolist()
    model = XGBRanker(
        objective="rank:pairwise",
        n_estimators=220,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_lambda=1.2,
        reg_alpha=0.05,
        random_state=42,
    )
    model.fit(x, y, group=group, verbose=False)
    model.save_model(str(model_path))
    return model


def _train_linear_fallback(train_frame, model_path: Path):
    x = train_frame[FEATURE_ORDER].to_numpy(dtype=float)
    y = train_frame["label"].to_numpy(dtype=float)
    coef = np.linalg.lstsq(x + 1e-9, y, rcond=None)[0]
    payload = {
        "model_type": "linear_fallback",
        "coef": coef.tolist(),
        "intercept": 0.0,
        "feature_order": FEATURE_ORDER,
    }
    model_path.write_text(json.dumps(payload), encoding="utf-8")
    return payload


def main():
    data_path = Path("ml/recommendation_ranker/training_data.csv")
    model_path = Path("ml/recommendation_ranker/model.json")
    meta_path = Path("ml/recommendation_ranker/model_meta.json")

    frame = load_dataset(data_path)
    train_frame, valid_frame = split_by_query(frame)

    model_type = "linear_fallback"
    try:
        _train_xgboost(train_frame, model_path)
        model_type = "xgboost_rank_pairwise"
    except Exception:
        _train_linear_fallback(train_frame, model_path)

    meta = {
        "model_type": model_type,
        "feature_order": FEATURE_ORDER,
        "rows": int(len(frame)),
        "train_rows": int(len(train_frame)),
        "valid_rows": int(len(valid_frame)),
        "queries": int(frame["query_id"].nunique()),
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps(meta))


if __name__ == "__main__":
    main()

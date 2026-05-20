from __future__ import annotations

import json
from itertools import product
from pathlib import Path

import pandas as pd

from datasets import load_dataset, split_by_query
from features import FEATURE_ORDER
from metrics import evaluate_ranking_frame


def train_and_score(train: pd.DataFrame, valid: pd.DataFrame, params):
    from xgboost import XGBRanker  # type: ignore

    model = XGBRanker(objective="rank:pairwise", random_state=42, **params)
    model.fit(
        train[FEATURE_ORDER].to_numpy(dtype=float),
        train["label"].to_numpy(dtype=float),
        group=train.groupby("query_id").size().tolist(),
        verbose=False,
    )
    valid = valid.copy()
    valid["pred_score"] = model.predict(valid[FEATURE_ORDER].to_numpy(dtype=float))
    metrics = evaluate_ranking_frame(valid)
    return metrics


def main():
    data_path = Path("ml/recommendation_ranker/training_data.csv")
    out_path = Path("ml/recommendation_ranker/hyperparameter_search.json")
    frame = load_dataset(data_path)
    train, valid = split_by_query(frame)

    grid = {
        "n_estimators": [150, 220],
        "max_depth": [5, 7],
        "learning_rate": [0.04, 0.07],
        "subsample": [0.85, 0.95],
        "colsample_bytree": [0.85, 0.95],
    }

    keys = list(grid.keys())
    best = {"ndcg@10": -1}
    results = []

    for values in product(*[grid[k] for k in keys]):
        params = dict(zip(keys, values))
        try:
            metrics = train_and_score(train, valid, params)
        except Exception:
            continue
        row = {"params": params, "metrics": metrics}
        results.append(row)
        if metrics["ndcg@10"] > best["ndcg@10"]:
            best = row

    payload = {"best": best, "trials": results[:20]}
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps(payload))


if __name__ == "__main__":
    main()

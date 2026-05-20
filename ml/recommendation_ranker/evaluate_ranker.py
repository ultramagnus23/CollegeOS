from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


def dcg(labels):
    score = 0.0
    for i, y in enumerate(labels, start=1):
        score += (2 ** y - 1) / (i.bit_length())
    return score


def ndcg_at_k(group: pd.DataFrame, k: int = 10):
    top = group.sort_values("pred_score", ascending=False).head(k)
    ideal = group.sort_values("label", ascending=False).head(k)
    denom = dcg(ideal["label"].tolist()) or 1e-9
    return dcg(top["label"].tolist()) / denom


def main():
    eval_path = Path("ml/recommendation_ranker/eval_predictions.csv")
    if not eval_path.exists():
        raise SystemExit(f"Missing eval predictions file: {eval_path}")

    frame = pd.read_csv(eval_path)
    if not {"query_id", "label", "pred_score"}.issubset(frame.columns):
        raise SystemExit("eval_predictions.csv requires query_id,label,pred_score columns")

    ndcg_scores = [ndcg_at_k(group, k=10) for _, group in frame.groupby("query_id")]
    metrics = {
        "queries": len(ndcg_scores),
        "ndcg@10_mean": float(sum(ndcg_scores) / max(1, len(ndcg_scores))),
    }
    print(json.dumps(metrics))


if __name__ == "__main__":
    main()


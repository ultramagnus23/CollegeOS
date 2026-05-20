from __future__ import annotations

from typing import Dict

import numpy as np
import pandas as pd


def _dcg(labels):
    labels = np.asarray(labels, dtype=float)
    discounts = np.log2(np.arange(2, len(labels) + 2))
    gains = np.power(2, labels) - 1
    return float(np.sum(gains / discounts))


def ndcg_at_k(group: pd.DataFrame, k: int = 10) -> float:
    pred = group.sort_values("pred_score", ascending=False).head(k)
    ideal = group.sort_values("label", ascending=False).head(k)
    denom = _dcg(ideal["label"].values)
    if denom <= 0:
        return 0.0
    return _dcg(pred["label"].values) / denom


def precision_at_k(group: pd.DataFrame, k: int = 10, threshold: float = 1.0) -> float:
    top = group.sort_values("pred_score", ascending=False).head(k)
    if top.empty:
        return 0.0
    return float((top["label"] >= threshold).mean())


def recall_at_k(group: pd.DataFrame, k: int = 10, threshold: float = 1.0) -> float:
    rel = (group["label"] >= threshold).sum()
    if rel == 0:
        return 0.0
    top = group.sort_values("pred_score", ascending=False).head(k)
    return float((top["label"] >= threshold).sum() / rel)


def reciprocal_rank(group: pd.DataFrame, threshold: float = 1.0) -> float:
    top = group.sort_values("pred_score", ascending=False).reset_index(drop=True)
    for idx, label in enumerate(top["label"].tolist(), start=1):
        if label >= threshold:
            return 1.0 / idx
    return 0.0


def average_precision(group: pd.DataFrame, threshold: float = 1.0) -> float:
    sorted_group = group.sort_values("pred_score", ascending=False).reset_index(drop=True)
    rel_count = 0
    running = 0.0
    for idx, label in enumerate(sorted_group["label"].tolist(), start=1):
        if label >= threshold:
            rel_count += 1
            running += rel_count / idx
    return running / rel_count if rel_count else 0.0


def calibration_error(frame: pd.DataFrame) -> float:
    pred = frame["pred_score"].astype(float).to_numpy()
    labels = frame["label"].astype(float).to_numpy()
    if len(pred) == 0:
        return 0.0
    pred_norm = (pred - pred.min()) / max(1e-9, pred.max() - pred.min())
    label_norm = labels / max(1e-9, labels.max())
    return float(np.mean(np.abs(pred_norm - label_norm)))


def diversity_score(frame: pd.DataFrame) -> float:
    if "group_key" not in frame.columns:
        return 0.0
    diversities = []
    for _, group in frame.groupby("query_id"):
        top = group.sort_values("pred_score", ascending=False).head(10)
        diversities.append(top["group_key"].nunique() / max(1, len(top)))
    return float(np.mean(diversities)) if diversities else 0.0


def evaluate_ranking_frame(frame: pd.DataFrame) -> Dict[str, float]:
    grouped = [group for _, group in frame.groupby("query_id")]
    metrics = {
        "queries": float(len(grouped)),
        "ndcg@10": float(np.mean([ndcg_at_k(g, 10) for g in grouped])) if grouped else 0.0,
        "map": float(np.mean([average_precision(g) for g in grouped])) if grouped else 0.0,
        "precision@10": float(np.mean([precision_at_k(g, 10) for g in grouped])) if grouped else 0.0,
        "recall@10": float(np.mean([recall_at_k(g, 10) for g in grouped])) if grouped else 0.0,
        "mrr": float(np.mean([reciprocal_rank(g) for g in grouped])) if grouped else 0.0,
        "calibration_error": calibration_error(frame),
        "diversity": diversity_score(frame),
    }
    return metrics

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

from feature_engineering import FEATURE_ORDER


def load_model(model_path: Path):
    if not model_path.exists():
        raise FileNotFoundError(str(model_path))
    text = model_path.read_text(encoding="utf-8")
    if model_path.suffix == ".json":
        try:
            payload = json.loads(text)
            if payload.get("model_type") == "linear_fallback":
                return payload
        except json.JSONDecodeError:
            pass
    return {"model_type": "xgboost", "path": str(model_path)}


def score_rows(model, rows):
    x = np.array([[float(r["features"].get(f, 0.0)) for f in FEATURE_ORDER] for r in rows], dtype=float)
    if model["model_type"] == "linear_fallback":
        coef = np.array(model["coef"], dtype=float)
        scores = (x @ coef) + float(model.get("intercept", 0.0))
    else:
        from xgboost import XGBRanker  # type: ignore

        ranker = XGBRanker()
        ranker.load_model(model["path"])
        scores = ranker.predict(x)
    return scores.tolist()


def contribution_map(row, score):
    feats = row["features"]
    total = sum(abs(float(v)) for v in feats.values()) or 1.0
    return {k: round((float(v) / total) * float(score), 6) for k, v in feats.items()}


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    rows = payload.get("rows") or []
    model = load_model(Path("ml/recommendation_ranker/model.json"))
    scores = score_rows(model, rows)
    predictions = []
    max_score = max(scores) if scores else 1
    min_score = min(scores) if scores else 0
    spread = max(max_score - min_score, 1e-6)

    for row, score in zip(rows, scores):
        confidence = 0.35 + ((score - min_score) / spread) * 0.6
        predictions.append({
            "institution_id": row["institution_id"],
            "score": float(score),
            "confidence": float(round(confidence, 6)),
            "contributions": contribution_map(row, score),
        })
    print(json.dumps({"predictions": predictions}))


if __name__ == "__main__":
    main()


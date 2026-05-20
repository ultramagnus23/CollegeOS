from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from metrics import evaluate_ranking_frame


def main():
    eval_path = Path("ml/recommendation_ranker/eval_predictions.csv")
    out_path = Path("ml/recommendation_ranker/eval_metrics.json")
    if not eval_path.exists():
        raise SystemExit(f"Missing eval file: {eval_path}")

    frame = pd.read_csv(eval_path)
    needed = {"query_id", "label", "pred_score"}
    if not needed.issubset(frame.columns):
        raise SystemExit(f"eval_predictions.csv must include {sorted(needed)}")

    metrics = evaluate_ranking_frame(frame)
    out_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics))


if __name__ == "__main__":
    main()

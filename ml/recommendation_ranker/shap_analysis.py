from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from features import FEATURE_ORDER


def fallback_global_importance(frame: pd.DataFrame):
    corr = {}
    labels = frame["label"].astype(float)
    for feature in FEATURE_ORDER:
        if feature in frame.columns:
            value = frame[feature].astype(float)
            corr[feature] = float(abs(value.corr(labels)) if len(frame) > 1 else 0)
    return corr


def main():
    data_path = Path("ml/recommendation_ranker/training_data.csv")
    out_path = Path("ml/recommendation_ranker/shap_summary.json")
    frame = pd.read_csv(data_path)

    try:
        import shap  # type: ignore
        from xgboost import XGBRanker  # type: ignore

        model = XGBRanker()
        model.load_model("ml/recommendation_ranker/model.json")
        x = frame[FEATURE_ORDER]
        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(x)
        importance = {
            feature: float(abs(shap_values[:, idx]).mean())
            for idx, feature in enumerate(FEATURE_ORDER)
        }
    except Exception:
        importance = fallback_global_importance(frame)

    payload = {
        "feature_importance": dict(sorted(importance.items(), key=lambda kv: kv[1], reverse=True)),
        "rows": int(len(frame)),
    }
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps(payload))


if __name__ == "__main__":
    main()

"""
ml/predict.py
──────────────
Standalone inference module.  Exposes a single public function:

    predict_chances(student_profile: dict, colleges: list[dict]) -> list[dict]

The function is called by ml/hf_app/app.py and can also be used directly for
local testing.  It deliberately has no server or Gradio dependency — it is pure
Python so it can be imported anywhere.

The returned list is sorted by probability descending and each item contains:
    college_id      (int)
    college_name    (str)
    probability     (float, clamped to [0.03, 0.97])
    label           ("Likely" ≥ 0.70 | "Target" 0.40–0.70 | "Reach" < 0.40)
    acceptance_rate (float)
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)

# ── Paths — resolved relative to this file so they work from any CWD ─────────

_HERE = Path(__file__).resolve().parent
_MODEL_PATH = _HERE / "model" / "chancing_model.ubj"
_FEATURES_PATH = _HERE / "model" / "features.txt"

# ── Module-level singletons (loaded once at import time) ──────────────────────

_model = None
_features: Optional[list[str]] = None

# ── Probability clamp ─────────────────────────────────────────────────────────

PROB_MIN = 0.03
PROB_MAX = 0.97


def _load_model():
    """Load the XGBoost model from disk (once, then cached in _model)."""
    global _model
    if _model is not None:
        return _model

    from xgboost import XGBClassifier

    if not _MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Model not found at {_MODEL_PATH}. "
            "Run `python ml/train.py` to train and save the model."
        )

    m = XGBClassifier()
    m.load_model(str(_MODEL_PATH))
    _model = m
    log.info(f"Model loaded from {_MODEL_PATH}")
    return _model


def _safe_float(value) -> float | None:
    """Convert a value to float, returning None for zero/missing/falsy values."""
    if value is None:
        return None
    try:
        f = float(value)
        return f if f != 0.0 else None
    except (TypeError, ValueError):
        return None
    """Load the canonical feature list from features.txt (once, then cached)."""
    global _features
    if _features is not None:
        return _features

    if not _FEATURES_PATH.exists():
        raise FileNotFoundError(
            f"features.txt not found at {_FEATURES_PATH}. "
            "Run `python ml/train.py` to regenerate it."
        )

    with open(_FEATURES_PATH) as fh:
        _features = [line.strip() for line in fh if line.strip()]
    log.info(f"Loaded {len(_features)} features from {_FEATURES_PATH}")
    return _features


# ── Feature engineering (must match train.py exactly) ────────────────────────


def _engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply the same feature engineering used during training.
    Any deviation here would corrupt predictions silently.
    """
    df = df.copy()

    # SAT midpoints from band
    sat_25 = df.get("sat_25", pd.Series(np.nan, index=df.index)).fillna(0)
    sat_75 = df.get("sat_75", pd.Series(np.nan, index=df.index)).fillna(0)
    df["median_sat_midpoint"] = ((sat_25 + sat_75) / 2.0).where(
        sat_25 > 0, other=1000.0
    )

    act_25 = df.get("act_25", pd.Series(np.nan, index=df.index)).fillna(0)
    act_75 = df.get("act_75", pd.Series(np.nan, index=df.index)).fillna(0)
    df["median_act_midpoint"] = ((act_25 + act_75) / 2.0).where(
        act_25 > 0, other=22.0
    )

    df["ranking_us_news"] = df.get(
        "ranking_us_news", pd.Series(999, index=df.index)
    ).fillna(999).astype(int)

    df["sat_ratio"] = df["sat_score"] / df["median_sat_midpoint"].clip(lower=1)
    df["gpa_quality"] = df["gpa_unweighted"] * (
        1 + (df["gpa_weighted"] - df["gpa_unweighted"]).clip(lower=0)
    )
    df["leadership_ratio"] = df["leadership_positions"] / df["extracurriculars"].clip(lower=1)
    df["is_highly_selective"] = (df["acceptance_rate"] < 0.15).astype(int)

    return df


# ── Label helpers ─────────────────────────────────────────────────────────────


def _label(prob: float) -> str:
    """Return a human-readable admission tier label for a probability."""
    if prob >= 0.70:
        return "Likely"
    if prob >= 0.40:
        return "Target"
    return "Reach"


# ── Public API ────────────────────────────────────────────────────────────────


def predict_chances(
    student_profile: dict,
    colleges: list[dict],
) -> list[dict]:
    """
    Predict admission probabilities for a student against a list of colleges.

    Parameters
    ──────────
    student_profile : dict
        Student features.  Required keys:
          sat_score, act_score, gpa_unweighted, gpa_weighted,
          extracurriculars, leadership_positions, essays_quality,
          first_gen, legacy, recruited_athlete, income_bracket.
        Any missing key defaults to a sensible null-value (0 or median).

    colleges : list[dict]
        College records.  Each must have at minimum:
          id, name, acceptance_rate.
        Optional but improves accuracy:
          sat_25, sat_75, act_25, act_75, total_enrollment, ranking_us_news.

    Returns
    ───────
    list[dict], sorted by probability descending.  Each item:
        {
          "college_id":      int,
          "college_name":    str,
          "probability":     float,   # clamped to [0.03, 0.97]
          "label":           str,     # "Likely", "Target", or "Reach"
          "acceptance_rate": float,
        }
    """
    if not colleges:
        return []

    model = _load_model()
    features = _load_features()

    # Build a DataFrame: one row per college, student fields broadcast
    rows = []
    for college in colleges:
        row = {
            # Student fields
            "sat_score":           float(student_profile.get("sat_score") or 1050),
            "act_score":           float(student_profile.get("act_score") or 22),
            "gpa_unweighted":      float(student_profile.get("gpa_unweighted") or 3.4),
            "gpa_weighted":        float(student_profile.get("gpa_weighted") or 3.7),
            "extracurriculars":    float(student_profile.get("extracurriculars") or 5),
            "leadership_positions": float(student_profile.get("leadership_positions") or 1),
            "essays_quality":      float(student_profile.get("essays_quality") or 3),
            "first_gen":           float(bool(student_profile.get("first_gen", False))),
            "legacy":              float(bool(student_profile.get("legacy", False))),
            "recruited_athlete":   float(bool(student_profile.get("recruited_athlete", False))),
            "income_bracket":      float(student_profile.get("income_bracket") or 2),
            # College fields
            "acceptance_rate":     float(college.get("acceptance_rate") or 0.50),
            "sat_25":              _safe_float(college.get("sat_25") or college.get("median_sat_25")),
            "sat_75":              _safe_float(college.get("sat_75") or college.get("median_sat_75")),
            "act_25":              _safe_float(college.get("act_25") or college.get("median_act_25")),
            "act_75":              _safe_float(college.get("act_75") or college.get("median_act_75")),
            "total_enrollment":    float(college.get("total_enrollment") or 0),
            "ranking_us_news":     college.get("ranking_us_news"),
            # Metadata (not in feature matrix but needed for output)
            "_college_id":   college.get("id"),
            "_college_name": college.get("name", ""),
        }
        rows.append(row)

    df = pd.DataFrame(rows)

    # Engineer features
    df = _engineer_features(df)

    # Build feature matrix in canonical order, null-filling with 0
    X = df[features].astype(float).fillna(0.0)

    # Predict
    probs_raw = model.predict_proba(X)[:, 1]

    # Build output
    results = []
    for i, (prob_raw, row) in enumerate(zip(probs_raw, rows)):
        prob = float(np.clip(prob_raw, PROB_MIN, PROB_MAX))
        results.append({
            "college_id":      row["_college_id"],
            "college_name":    row["_college_name"],
            "probability":     round(prob, 4),
            "label":           _label(prob),
            "acceptance_rate": row["acceptance_rate"],
        })

    # Sort by probability descending
    results.sort(key=lambda r: r["probability"], reverse=True)
    return results

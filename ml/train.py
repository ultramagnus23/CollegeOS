#!/usr/bin/env python3
"""
ml/train.py
────────────
Loads ml/data/training_data.parquet, engineers features, trains an XGBoost
binary classifier, validates on a 20% hold-out set, and saves:
  - ml/model/chancing_model.ubj  (XGBoost native binary format)
  - ml/model/features.txt        (ordered feature list — single source of truth)

Validation targets (will retry with stronger params if not met on first pass):
  - AUC-ROC ≥ 0.82
  - Brier score ≤ 0.18

Prints all metrics clearly to stdout so GitHub Actions logs show pass/fail.
"""

import sys
import logging
from pathlib import Path

import numpy as np
import pandas as pd
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, brier_score_loss
from sklearn.calibration import CalibratedClassifierCV

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("train")

# ── Paths ─────────────────────────────────────────────────────────────────────

ML_DIR = Path(__file__).resolve().parent
DATA_PATH = ML_DIR / "data" / "training_data.parquet"
MODEL_DIR = ML_DIR / "model"
MODEL_PATH = MODEL_DIR / "chancing_model.ubj"
FEATURES_PATH = MODEL_DIR / "features.txt"

# ── Feature list (canonical order — must match features.txt) ──────────────────

FEATURE_COLS = [
    # Student
    "sat_score",
    "act_score",
    "gpa_unweighted",
    "gpa_weighted",
    "extracurriculars",
    "leadership_positions",
    "essays_quality",
    "first_gen",
    "legacy",
    "recruited_athlete",
    "income_bracket",
    # College
    "acceptance_rate",
    "median_sat_midpoint",
    "median_act_midpoint",
    "total_enrollment",
    "ranking_us_news",
    # Engineered
    "sat_ratio",
    "gpa_quality",
    "leadership_ratio",
    "is_highly_selective",
]

TARGET_COL = "admitted"

AUC_THRESHOLD = 0.82
BRIER_THRESHOLD = 0.18

# ── Feature engineering ───────────────────────────────────────────────────────


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add engineered features to the DataFrame.
    This function is the single canonical implementation — it is imported
    by evaluate.py and predict.py to guarantee identical feature construction
    at training time and inference time.
    """
    df = df.copy()

    # SAT composite midpoint of the college's band
    sat_25 = df["sat_25"].fillna(0)
    sat_75 = df["sat_75"].fillna(0)
    has_sat = df["sat_25"].notna() | df["sat_75"].notna()
    df["median_sat_midpoint"] = ((sat_25 + sat_75) / 2.0).where(has_sat, other=1000.0)

    act_25 = df["act_25"].fillna(0)
    act_75 = df["act_75"].fillna(0)
    has_act = df["act_25"].notna() | df["act_75"].notna()
    df["median_act_midpoint"] = ((act_25 + act_75) / 2.0).where(has_act, other=22.0)

    # Ranking — null-fill with 999
    df["ranking_us_news"] = df["ranking_us_news"].fillna(999).astype(int)

    # Engineered features
    df["sat_ratio"] = df["sat_score"] / df["median_sat_midpoint"].clip(lower=1)
    df["gpa_quality"] = df["gpa_unweighted"] * (
        1 + (df["gpa_weighted"] - df["gpa_unweighted"]).clip(lower=0)
    )
    df["leadership_ratio"] = df["leadership_positions"] / df["extracurriculars"].clip(lower=1)
    df["is_highly_selective"] = (df["acceptance_rate"] < 0.15).astype(int)

    # Null-fill remaining numeric columns with 0
    for col in FEATURE_COLS:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = df[col].fillna(0.0)

    return df


# ── Model training ────────────────────────────────────────────────────────────


def build_model(n_estimators: int = 400, learning_rate: float = 0.05) -> XGBClassifier:
    """
    Return an XGBClassifier configured for binary admission classification.
    Uses tree_method='hist' (CPU-friendly, fast on tabular data).
    scale_pos_weight handles class imbalance automatically.
    """
    return XGBClassifier(
        n_estimators=n_estimators,
        learning_rate=learning_rate,
        max_depth=5,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=10,
        gamma=0.1,
        reg_alpha=0.1,
        reg_lambda=1.0,
        tree_method="hist",
        eval_metric="logloss",
        use_label_encoder=False,
        random_state=42,
        n_jobs=-1,
    )


def train_and_validate(X_train, y_train, X_val, y_val, n_estimators=400, lr=0.05):
    """
    Train a model and compute AUC-ROC and Brier score on the validation set.
    Returns (model, auc, brier).
    """
    # Scale class weights for imbalanced data (most applications are rejections)
    pos_rate = float(y_train.mean())
    neg_rate = 1.0 - pos_rate
    scale = neg_rate / max(pos_rate, 1e-6)

    model = build_model(n_estimators=n_estimators, learning_rate=lr)
    model.set_params(scale_pos_weight=scale)

    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        verbose=False,
    )

    probs = model.predict_proba(X_val)[:, 1]
    auc = roc_auc_score(y_val, probs)
    brier = brier_score_loss(y_val, probs)

    return model, auc, brier


# ── Main ──────────────────────────────────────────────────────────────────────


def main() -> int:
    """Load data, train model, validate, save artefacts."""
    log.info("train.py started")
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    # ── Load data ─────────────────────────────────────────────────────────────
    if not DATA_PATH.exists():
        log.error(f"Training data not found at {DATA_PATH}. Run generate_training_data.py first.")
        return 1

    df = pd.read_parquet(DATA_PATH)
    log.info(f"Loaded {len(df):,} rows from {DATA_PATH}")

    df = engineer_features(df)

    X = df[FEATURE_COLS].astype(float)
    y = df[TARGET_COL].astype(int)

    log.info(f"Label distribution: {y.mean():.3f} positive rate ({y.sum():,} admitted)")
    log.info(f"Feature matrix: {X.shape[0]:,} rows × {X.shape[1]} features")

    # Split: 70% train, 10% val, 20% test
    X_temp, X_test, y_temp, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )
    X_train, X_val, y_train, y_val = train_test_split(
        X_temp, y_temp, test_size=0.125, random_state=42, stratify=y_temp
    )
    # Result: ~70% train / ~10% val / ~20% test
    # (test_size=0.125 applied to 80% of data → 0.125 × 0.80 = 10% of total)
    log.info(f"Split: train={len(X_train):,}, val={len(X_val):,}, test={len(X_test):,}")

    # ── First training attempt ────────────────────────────────────────────────
    log.info("Training XGBoost (attempt 1: n_estimators=400, lr=0.05)…")
    model, auc, brier = train_and_validate(X_train, y_train, X_val, y_val, n_estimators=400, lr=0.05)

    log.info(f"  AUC-ROC : {auc:.4f}  (threshold ≥ {AUC_THRESHOLD})")
    log.info(f"  Brier   : {brier:.4f}  (threshold ≤ {BRIER_THRESHOLD})")

    # ── Retry with stronger params if targets not met ─────────────────────────
    if auc < AUC_THRESHOLD or brier > BRIER_THRESHOLD:
        log.warning("Targets not met — retrying with stronger params (n_estimators=800, lr=0.03)")
        model, auc, brier = train_and_validate(
            X_train, y_train, X_val, y_val, n_estimators=800, lr=0.03
        )
        log.info(f"  AUC-ROC : {auc:.4f}")
        log.info(f"  Brier   : {brier:.4f}")

    # ── Final check ───────────────────────────────────────────────────────────
    passed = True
    if auc < AUC_THRESHOLD:
        log.error(f"AUC-ROC {auc:.4f} < {AUC_THRESHOLD} — model does not meet quality bar")
        passed = False
    if brier > BRIER_THRESHOLD:
        log.error(f"Brier {brier:.4f} > {BRIER_THRESHOLD} — model calibration too poor")
        passed = False

    if not passed:
        return 1

    # ── Validate test-set metrics ─────────────────────────────────────────────
    test_probs = model.predict_proba(X_test)[:, 1]
    test_auc = roc_auc_score(y_test, test_probs)
    test_brier = brier_score_loss(y_test, test_probs)

    log.info("─" * 55)
    log.info("VALIDATION RESULTS (held-out set)")
    log.info(f"  AUC-ROC  : {auc:.4f}")
    log.info(f"  Brier    : {brier:.4f}")
    log.info("TEST RESULTS (unseen test set)")
    log.info(f"  AUC-ROC  : {test_auc:.4f}")
    log.info(f"  Brier    : {test_brier:.4f}")
    log.info("─" * 55)

    # ── Save model ────────────────────────────────────────────────────────────
    model.save_model(str(MODEL_PATH))
    log.info(f"✓ Model saved to {MODEL_PATH}")

    # ── Save feature list (canonical order) ───────────────────────────────────
    with open(FEATURES_PATH, "w") as fh:
        fh.write("\n".join(FEATURE_COLS) + "\n")
    log.info(f"✓ Feature list saved to {FEATURES_PATH}")

    # ── Save test set for evaluate.py ─────────────────────────────────────────
    test_df = X_test.copy()
    test_df["admitted"] = y_test.values
    test_df.to_parquet(ML_DIR / "data" / "test_data.parquet", index=False)
    log.info(f"✓ Test set saved to ml/data/test_data.parquet")

    log.info("train.py complete ✓")
    return 0


if __name__ == "__main__":
    sys.exit(main())

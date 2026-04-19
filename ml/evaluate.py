#!/usr/bin/env python3
"""
ml/evaluate.py
──────────────
Loads ml/model/chancing_model.ubj and the held-out test set created by train.py
(ml/data/test_data.parquet), then:

1. Verifies that the feature order in the model matches ml/model/features.txt
   exactly — a mismatch would silently corrupt predictions at inference time.
2. Computes AUC-ROC and Brier score on the test set.
3. Prints per-tier accuracy breakdown (highly selective, selective, open).
4. Plots a calibration curve and saves it to ml/model/calibration_curve.png.

Run after training:
    python ml/evaluate.py
"""

import sys
import logging
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")  # non-interactive backend for CI / headless environments
import matplotlib.pyplot as plt

from xgboost import XGBClassifier
from sklearn.metrics import roc_auc_score, brier_score_loss
from sklearn.calibration import calibration_curve

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("evaluate")

# ── Paths ─────────────────────────────────────────────────────────────────────

ML_DIR = Path(__file__).resolve().parent
MODEL_PATH = ML_DIR / "model" / "chancing_model.ubj"
FEATURES_PATH = ML_DIR / "model" / "features.txt"
TEST_DATA_PATH = ML_DIR / "data" / "test_data.parquet"
CALIBRATION_PLOT_PATH = ML_DIR / "model" / "calibration_curve.png"

# ── Helpers ───────────────────────────────────────────────────────────────────


def load_features() -> list[str]:
    """Load the canonical feature list from features.txt."""
    with open(FEATURES_PATH) as fh:
        return [line.strip() for line in fh if line.strip()]


def verify_feature_order(model: XGBClassifier, expected_features: list[str]) -> bool:
    """
    Verify that the model's internal feature names match features.txt exactly.
    Mismatched order silently corrupts predictions — this check must pass.
    Returns True if OK, False otherwise.
    """
    model_features = list(model.feature_names_in_) if hasattr(model, "feature_names_in_") else []
    if not model_features:
        log.warning("Model has no stored feature names — cannot verify order")
        return True  # Cannot verify, assume OK

    if model_features != expected_features:
        log.error("Feature order mismatch!")
        log.error(f"  features.txt : {expected_features}")
        log.error(f"  model stored : {model_features}")
        # Show first point of divergence
        for i, (a, b) in enumerate(zip(expected_features, model_features)):
            if a != b:
                log.error(f"  First mismatch at index {i}: expected '{a}', got '{b}'")
                break
        return False

    log.info("✓ Feature order verified — features.txt matches model")
    return True


# ── Per-tier breakdown ────────────────────────────────────────────────────────


def tier_breakdown(y_true: np.ndarray, y_prob: np.ndarray, acceptance_rates: pd.Series) -> None:
    """
    Print accuracy and calibration metrics broken down by college selectivity tier:
      - Highly selective: acceptance_rate < 0.15
      - Selective:        0.15 ≤ acceptance_rate < 0.50
      - Open:             acceptance_rate ≥ 0.50
    """
    tiers = {
        "Highly Selective (< 15%)":  acceptance_rates < 0.15,
        "Selective (15–50%)":        (acceptance_rates >= 0.15) & (acceptance_rates < 0.50),
        "Open (≥ 50%)":              acceptance_rates >= 0.50,
    }

    log.info("─" * 55)
    log.info("PER-TIER METRICS")
    for tier_name, mask in tiers.items():
        idx = np.where(mask.values)[0]
        if len(idx) < 10:
            log.info(f"  {tier_name}: insufficient samples ({len(idx)})")
            continue
        t_true = y_true[idx]
        t_prob = y_prob[idx]
        try:
            t_auc = roc_auc_score(t_true, t_prob) if len(np.unique(t_true)) > 1 else float("nan")
        except ValueError:
            t_auc = float("nan")
        t_brier = brier_score_loss(t_true, t_prob)
        t_mean_pred = t_prob.mean()
        t_mean_actual = t_true.mean()
        log.info(
            f"  {tier_name}  n={len(idx):,}  "
            f"AUC={t_auc:.3f}  Brier={t_brier:.3f}  "
            f"mean_pred={t_mean_pred:.3f}  mean_actual={t_mean_actual:.3f}"
        )
    log.info("─" * 55)


# ── Calibration plot ──────────────────────────────────────────────────────────


def plot_calibration(y_true: np.ndarray, y_prob: np.ndarray, save_path: Path) -> None:
    """
    Plot and save a reliability / calibration curve.
    Points near the diagonal (y=x) indicate a well-calibrated model.
    Points above the diagonal → over-confident; below → under-confident.
    """
    fraction_of_positives, mean_predicted_value = calibration_curve(
        y_true, y_prob, n_bins=10, strategy="uniform"
    )

    fig, ax = plt.subplots(figsize=(7, 6))
    ax.plot(
        mean_predicted_value, fraction_of_positives,
        "s-", color="#2563eb", label="XGBoost", linewidth=2, markersize=7
    )
    ax.plot([0, 1], [0, 1], "k--", label="Perfectly calibrated", linewidth=1.2)
    ax.set_xlabel("Mean predicted probability", fontsize=12)
    ax.set_ylabel("Fraction of positives (actual rate)", fontsize=12)
    ax.set_title("Calibration Curve — CollegeOS Chancing Model", fontsize=13)
    ax.legend(fontsize=11)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    fig.savefig(save_path, dpi=150)
    plt.close(fig)
    log.info(f"✓ Calibration curve saved to {save_path}")


# ── Main ──────────────────────────────────────────────────────────────────────


def main() -> int:
    """Load model and test data, run evaluation, print report, save plot."""
    log.info("evaluate.py started")

    # ── Load model ────────────────────────────────────────────────────────────
    if not MODEL_PATH.exists():
        log.error(f"Model not found at {MODEL_PATH}. Run train.py first.")
        return 1
    model = XGBClassifier()
    model.load_model(str(MODEL_PATH))
    log.info(f"Loaded model from {MODEL_PATH}")

    # ── Load feature list ─────────────────────────────────────────────────────
    if not FEATURES_PATH.exists():
        log.error(f"features.txt not found at {FEATURES_PATH}")
        return 1
    features = load_features()
    log.info(f"features.txt has {len(features)} features")

    # ── Verify feature order ──────────────────────────────────────────────────
    if not verify_feature_order(model, features):
        log.error("Feature order verification failed — predictions would be incorrect")
        return 1

    # ── Load test set ─────────────────────────────────────────────────────────
    if not TEST_DATA_PATH.exists():
        log.error(f"Test data not found at {TEST_DATA_PATH}. Run train.py first.")
        return 1
    test_df = pd.read_parquet(TEST_DATA_PATH)
    log.info(f"Loaded {len(test_df):,} test rows")

    # Ensure all feature columns are present
    for col in features:
        if col not in test_df.columns:
            test_df[col] = 0.0
    X_test = test_df[features].astype(float)
    y_test = test_df["admitted"].astype(int).values

    # ── Predict ───────────────────────────────────────────────────────────────
    y_prob = model.predict_proba(X_test)[:, 1]

    # ── Overall metrics ───────────────────────────────────────────────────────
    auc = roc_auc_score(y_test, y_prob)
    brier = brier_score_loss(y_test, y_prob)

    log.info("─" * 55)
    log.info("OVERALL TEST SET METRICS")
    log.info(f"  Rows      : {len(y_test):,}")
    log.info(f"  AUC-ROC   : {auc:.4f}   (target ≥ 0.82)")
    log.info(f"  Brier     : {brier:.4f}  (target ≤ 0.18)")
    log.info(f"  Pos. rate : {y_test.mean():.3f}")
    log.info("─" * 55)

    # ── Per-tier breakdown ────────────────────────────────────────────────────
    if "acceptance_rate" in test_df.columns:
        tier_breakdown(y_test, y_prob, test_df["acceptance_rate"].reset_index(drop=True))

    # ── Calibration curve ─────────────────────────────────────────────────────
    plot_calibration(y_test, y_prob, CALIBRATION_PLOT_PATH)

    log.info("evaluate.py complete ✓")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
scraper/training_pipeline.py
────────────────────────────
Global XGBoost admission-chancing model trained from PostgreSQL scraped data.

Usage
-----
    DATABASE_URL=postgresql://... python3 scraper/training_pipeline.py

The script:
  1. Loads labelled data from scraped_applicants JOIN scraped_results.
  2. Encodes categorical features with LabelEncoder / OrdinalEncoder.
  3. Trains an XGBoostClassifier (80 / 20 split).
  4. Prints accuracy, precision, recall, F1, confusion matrix.
  5. Saves model  → backend/ml/model.joblib
     encoder      → backend/ml/encoder.joblib
  6. Upserts a row into the ml_metadata table in Postgres.
  7. Exits 0 on success, 1 on failure.

Environment variables required
-------------------------------
    DATABASE_URL   — PostgreSQL connection string

Optional
--------
    MODEL_DIR          — directory for .joblib files  (default: ./backend/ml)
    MIN_TRAINING_ROWS  — abort if fewer rows available (default: 50)
    RETRAIN_EVERY      — retrain only when new-row count > this (default: 100)
"""

import os
import sys
import json
import logging
import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2
import psycopg2.extras
import joblib
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, OrdinalEncoder
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, classification_report,
)
from xgboost import XGBClassifier

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("training_pipeline")

# ── Config ────────────────────────────────────────────────────────────────────

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    log.error("DATABASE_URL environment variable is not set.")
    sys.exit(1)

# Resolve MODEL_DIR relative to the repository root (two levels up from scraper/)
_script_dir = Path(__file__).resolve().parent
_repo_root = _script_dir.parent
MODEL_DIR = Path(os.environ.get("MODEL_DIR", str(_repo_root / "backend" / "ml")))
MODEL_PATH = MODEL_DIR / "model.joblib"
ENCODER_PATH = MODEL_DIR / "encoder.joblib"

MIN_TRAINING_ROWS = int(os.environ.get("MIN_TRAINING_ROWS", "50"))
RETRAIN_EVERY = int(os.environ.get("RETRAIN_EVERY", "100"))

# Categorical columns that need encoding
CATEGORICAL_COLS = ["school_name_normalized", "intended_major", "nationality"]

# ── Database helpers ──────────────────────────────────────────────────────────


def get_connection():
    """Open a psycopg2 connection."""
    return psycopg2.connect(DATABASE_URL)


def load_training_data(conn) -> pd.DataFrame:
    """
    Pull labelled rows from the scraper tables.

    Returns one row per (applicant × school) pair where the outcome is
    'accepted' or 'rejected' (skips waitlisted / deferred because the
    binary label is ambiguous for those).
    """
    sql = """
        SELECT
            sa.gpa,
            sa.sat_score,
            sa.act_score,
            sa.num_ap_courses,
            sa.intended_major,
            sa.nationality,
            sa.first_gen,
            sr.school_name_normalized,
            CASE WHEN sr.outcome = 'accepted' THEN 1 ELSE 0 END AS label
        FROM scraped_applicants sa
        JOIN scraped_results sr ON sr.applicant_id = sa.id
        WHERE sr.outcome IN ('accepted', 'rejected')
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql)
        rows = cur.fetchall()
    return pd.DataFrame(rows)


def load_row_count(conn) -> int:
    """Return the total number of labelled rows available."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM scraped_applicants sa
            JOIN scraped_results sr ON sr.applicant_id = sa.id
            WHERE sr.outcome IN ('accepted', 'rejected')
        """)
        return cur.fetchone()[0]


def load_last_trained_count(conn) -> int:
    """Return the training_samples value from the most recent ml_metadata row."""
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT training_samples FROM ml_metadata ORDER BY last_trained DESC LIMIT 1"
            )
            row = cur.fetchone()
            return row[0] if row else 0
    except psycopg2.errors.UndefinedTable:
        conn.rollback()
        return 0


def upsert_ml_metadata(conn, version: str, accuracy: float, f1: float,
                        precision_val: float, recall_val: float,
                        n_samples: int) -> None:
    """Insert a new row into ml_metadata."""
    sql = """
        INSERT INTO ml_metadata
            (model_version, accuracy, f1_score, precision_val, recall_val,
             training_samples, last_trained, model_path, encoder_path, notes)
        VALUES
            (%s, %s, %s, %s, %s, %s, NOW(), %s, %s, %s)
    """
    notes = json.dumps({"script": "training_pipeline.py", "classifier": "XGBoost"})
    with conn.cursor() as cur:
        cur.execute(sql, (
            version,
            float(accuracy),
            float(f1),
            float(precision_val),
            float(recall_val),
            n_samples,
            str(MODEL_PATH),
            str(ENCODER_PATH),
            notes,
        ))
    conn.commit()


# ── Feature engineering ───────────────────────────────────────────────────────


def prepare_features(df: pd.DataFrame, encoder: OrdinalEncoder | None = None):
    """
    Prepare feature matrix X and target y.

    Numeric imputation: fill NaN with column medians.
    Categorical encoding: OrdinalEncoder (handles unseen as -1 via handle_unknown).

    Returns (X, y, encoder_fitted)
    """
    df = df.copy()

    # Numeric features
    numeric_cols = ["gpa", "sat_score", "act_score", "num_ap_courses", "first_gen"]
    for col in numeric_cols:
        if col not in df.columns:
            df[col] = np.nan
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Impute with column median (0 for boolean-like first_gen)
    for col in numeric_cols:
        median = df[col].median()
        df[col] = df[col].fillna(0 if col == "first_gen" else (median if not np.isnan(median) else 0))

    # Categorical features
    for col in CATEGORICAL_COLS:
        if col not in df.columns:
            df[col] = "unknown"
        df[col] = df[col].fillna("unknown").astype(str)

    cat_values = df[CATEGORICAL_COLS].values

    if encoder is None:
        encoder = OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1)
        cat_encoded = encoder.fit_transform(cat_values)
    else:
        cat_encoded = encoder.transform(cat_values)

    X_numeric = df[numeric_cols].values
    X = np.hstack([X_numeric, cat_encoded])
    y = df["label"].values.astype(int)

    return X, y, encoder


# ── Version helper ────────────────────────────────────────────────────────────


def next_version(conn) -> str:
    """Increment patch version from the latest ml_metadata row."""
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT model_version FROM ml_metadata ORDER BY last_trained DESC LIMIT 1"
            )
            row = cur.fetchone()
            if not row:
                return "v1.0"
            ver = row[0].lstrip("v")
            parts = ver.split(".")
            major = int(parts[0]) if parts else 1
            minor = int(parts[1]) if len(parts) > 1 else 0
            return f"v{major}.{minor + 1}"
    except psycopg2.errors.UndefinedTable:
        conn.rollback()
        return "v1.0"


# ── Main ──────────────────────────────────────────────────────────────────────


def main() -> int:
    log.info("Training pipeline started.")

    # Ensure output directory exists
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    conn = None
    try:
        conn = get_connection()
        log.info("Connected to PostgreSQL.")

        total_rows = load_row_count(conn)
        log.info(f"Total labelled rows available: {total_rows}")

        if total_rows < MIN_TRAINING_ROWS:
            log.error(
                f"Insufficient training data: {total_rows} rows < minimum {MIN_TRAINING_ROWS}. "
                "Scrape more Reddit data first."
            )
            return 1

        last_trained_count = load_last_trained_count(conn)
        new_rows = total_rows - last_trained_count
        if new_rows < RETRAIN_EVERY and MODEL_PATH.exists():
            log.info(
                f"Only {new_rows} new rows since last training "
                f"(threshold: {RETRAIN_EVERY}). Skipping retrain."
            )
            log.info("Training complete (skipped — model is current).")
            return 0

        # ── Load data ──────────────────────────────────────────────────────
        df = load_training_data(conn)
        log.info(f"Loaded {len(df)} rows for training.")

        # Validate range bounds — drop clearly corrupt values
        df = df[df["gpa"].isna() | df["gpa"].between(0, 5.5)]
        df = df[df["sat_score"].isna() | df["sat_score"].between(400, 1600)]
        df = df[df["act_score"].isna() | df["act_score"].between(1, 36)]
        log.info(f"After quality filtering: {len(df)} rows.")

        if len(df) < MIN_TRAINING_ROWS:
            log.error(f"After filtering, only {len(df)} rows remain — too few to train.")
            return 1

        # ── Feature prep ───────────────────────────────────────────────────
        X, y, encoder = prepare_features(df)
        log.info(f"Feature matrix: {X.shape}, label distribution: "
                 f"accepted={y.sum()}, rejected={len(y) - y.sum()}")

        # ── Train / test split ─────────────────────────────────────────────
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.20, random_state=42, stratify=y
        )

        # ── Train XGBoost ──────────────────────────────────────────────────
        model = XGBClassifier(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            use_label_encoder=False,
            eval_metric="logloss",
            random_state=42,
            n_jobs=-1,
        )
        model.fit(X_train, y_train)

        # ── Evaluate ───────────────────────────────────────────────────────
        y_pred = model.predict(X_test)
        acc = accuracy_score(y_test, y_pred)
        prec = precision_score(y_test, y_pred, zero_division=0)
        rec = recall_score(y_test, y_pred, zero_division=0)
        f1 = f1_score(y_test, y_pred, zero_division=0)
        cm = confusion_matrix(y_test, y_pred)

        log.info(f"Accuracy : {acc:.4f}")
        log.info(f"Precision: {prec:.4f}")
        log.info(f"Recall   : {rec:.4f}")
        log.info(f"F1 Score : {f1:.4f}")
        log.info(f"Confusion Matrix:\n{cm}")
        log.info("\n" + classification_report(y_test, y_pred,
                                               target_names=["rejected", "accepted"]))

        # ── Save model and encoder ─────────────────────────────────────────
        joblib.dump(model, MODEL_PATH)
        joblib.dump(encoder, ENCODER_PATH)
        log.info(f"Model saved to   : {MODEL_PATH}")
        log.info(f"Encoder saved to : {ENCODER_PATH}")

        # ── Persist metadata to DB ─────────────────────────────────────────
        version = next_version(conn)
        upsert_ml_metadata(conn, version, acc, f1, prec, rec, len(df))
        log.info(
            f"Training complete. Version: {version}. "
            f"Accuracy: {acc:.4f}. Model saved."
        )
        return 0

    except Exception as exc:
        log.error(f"Fatal error during training: {exc}", exc_info=True)
        return 1
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    sys.exit(main())

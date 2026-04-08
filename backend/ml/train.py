#!/usr/bin/env python3
# CollegeOS Auto-generated backend/ml/train.py — do not edit manually
"""
ML Training Entry-Point (backend/ml/train.py)
──────────────────────────────────────────────
Thin wrapper that delegates to scraper/training_pipeline.py.
Called by the Node orchestrator as:
    python3 backend/ml/train.py

It sets the correct MODEL_DIR to backend/ml/ (the same directory as this file)
and then imports and runs the shared training logic.

This avoids duplicating training code; the single source of truth is
scraper/training_pipeline.py.

Required environment variables
───────────────────────────────
    DATABASE_URL

Optional
────────
    MIN_TRAINING_ROWS   (default: 50)
    RETRAIN_EVERY       (default: 100)
"""

import os
import sys
from pathlib import Path

# ── Path setup ────────────────────────────────────────────────────────────────
_THIS_DIR = Path(__file__).resolve().parent        # backend/ml/
_REPO_ROOT = _THIS_DIR.parent.parent               # repo root
_SCRAPER_DIR = _REPO_ROOT / "scraper"

# Point MODEL_DIR at this directory so model.joblib lands in backend/ml/
os.environ.setdefault("MODEL_DIR", str(_THIS_DIR))

# Add scraper dir to sys.path so training_pipeline can be imported directly
sys.path.insert(0, str(_SCRAPER_DIR))

# ── Delegate to training_pipeline ────────────────────────────────────────────
import training_pipeline  # noqa: E402 — imported after path manipulation

if __name__ == "__main__":
    sys.exit(training_pipeline.main())

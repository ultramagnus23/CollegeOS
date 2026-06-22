# ML_STATUS.md

_Verified against codebase + live DB on 2026-06-22._

## Which model is actually used

One chancing path, no legacy duplicates in use:

- **Service:** `backend/src/services/consolidatedChancingService.js` (model-first, heuristic fallback). Legacy Flask/FastAPI chancing services were already removed; `cdsChancingService` removed.
- **Inference:** `backend/src/services/ml/chancingModel.js` loads the artifact `backend/ml/chancing_model.json`.
- **Trainer:** `backend/ml/trainChancingModel.js` (dependency-free logistic regression via gradient descent).
- **Route:** `backend/src/routes/chancing.js` (`/calculate`, `/batch`, `/outcome`, `/brier-score`, …).

## Is it a real trained model? — Yes, but on SIMULATED labels

There are **0 real labeled admission outcomes** in the system (`ml_training_data`, `prediction_logs`, `admission_outcomes` all empty). So the model is fit on applicants **simulated from real per-college statistics** (acceptance rate + median SAT). This is honest and calibrated, but it is **not** validated against real admits/rejects.

- Features (also used at inference): `sat_z` (student SAT vs college median), `gpa_centered`, `logit(acceptance_rate)`.
- GPA uses a generic SAT-correlated prior because `median_gpa_admitted` is 0% populated.

## Metrics (synthetic holdout — see caveat)

From `backend/ml/model_metrics.json` (regenerated each train; stochastic):

| Metric | Value |
|---|---|
| ROC-AUC | ~0.86 |
| Brier | ~0.15 |
| Precision / Recall / F1 @0.5 | ~0.76 / 0.72 / 0.74 |
| Calibration | well-aligned across deciles |

Feature importance (`backend/ml/feature_importance.json`): acceptance-rate ~0.40, sat_z ~0.36, gpa ~0.23.

> These are **synthetic-holdout** metrics — they measure recovery of the stats-grounded simulation, NOT accuracy against real outcomes. The "Brier < 0.15" target is met on synthetic data only; it is not evidence of real predictive skill.

## Versioning & retraining

- Every train appends to `backend/ml/model_versions.jsonl` (version, git sha, synthetic flag, metrics) and bumps the artifact `version`.
- `backend/src/jobs/mlRetraining.js` exists; the orchestrator that schedules it was mis-pathed and never ran until PR #143 (now fixed, but enabling the scheduler is a conscious choice).

## Real-label path (the loop, now closed)

1. `POST /api/chancing/outcome` writes real outcomes to `ml_training_data` + upserts `prediction_logs` (transactional; fixed in PR #140 — it previously targeted nonexistent columns and silently 500'd).
2. The trainer **auto-switches to real labels** once `ml_training_data` has ≥`MIN_REAL` (200) accepted/rejected rows with both classes; otherwise it trains on simulation and marks `dataset.synthetic: true`.

## Gap vs the completion mandate (Phases 10–13)

- **No real training dataset yet.** Building one (50–100 verified cases from Reddit/CollegeConfidential/Kaggle) is a separate data-collection effort; r/chanceme is unstructured and self-reported.
- **No LightGBM/XGBoost/CatBoost.** Current trainer is dependency-free JS logistic regression. Adding Python GBMs adds a Python ML stack + `model.pkl` artifact path. Justified only once real labels exist (a GBM on simulated data would just overfit the simulation).
- **Calibration (Platt/Isotonic)** is meaningful only against real outcomes; the current model is already calibrated to its synthetic holdout.

**Honest recommendation:** accumulate real outcomes first (capture now works), then introduce GBM candidates + real-label calibration. Until then, more model complexity adds no real accuracy.

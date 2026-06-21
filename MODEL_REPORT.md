# MODEL_REPORT.md — CollegeOS chancing model

_Last updated 2026-06-21._

## TL;DR / honesty statement

This is a **calibrated logistic-regression admission-probability model fit on applicants
SIMULATED from real per-college statistics** — **not** a model trained on real admission
outcomes, because no labeled per-applicant outcome data exists anywhere in the system yet
(`admission_outcomes`, `prediction_logs.actual_outcome`, `ml_training_data`, `chance_me_posts`
are all empty). The metrics below are **synthetic-holdout** metrics: they measure how well the
model recovers the stats-grounded relationship it was trained on, **not** real predictive
accuracy against actual admit/reject decisions. Treat the number it produces as a calibrated,
base-rate-anchored estimate — a better-grounded version of the heuristic — not a validated
prediction.

## Method

- **Trainer:** `backend/ml/trainChancingModel.js` (dependency-free; logistic regression via
  standardized batch gradient descent).
- **Real inputs:** `college_admissions_stats` — 795 colleges that have both a real
  `acceptance_rate` and a real `median_sat`. (`median_gpa_admitted` is unavailable in the data,
  so GPA is simulated from a generic SAT-correlated population prior — documented, not faked.)
- **Simulation:** for each college, applicants' SAT are drawn around the college's real median
  SAT; each applicant's admit label is drawn from `sigmoid(1.2·satZ + 0.8·gpaCentered +
  logit(acceptance_rate) + noise)`. This anchors each college's simulated admit rate to its
  **real** acceptance rate and makes stronger-vs-median applicants more likely to be admitted.
- **Features (also used at inference):** `sat_z` (student SAT vs college median), `gpa_centered`,
  `logit(acceptance_rate)`.
- **Artifact:** `backend/ml/chancing_model.json` (weights + standardization). Metrics:
  `backend/ml/model_metrics.json`.

## Metrics (synthetic holdout — see honesty statement)

- **Dataset:** ~47,700 simulated cases from 795 real colleges; positive (admit) rate ~44.6%.
- **ROC-AUC:** ~**0.86** (discrimination on the simulated holdout).
- **Brier score:** ~**0.15**.
- **Precision / Recall / F1 @0.5:** ~**0.76 / 0.72 / 0.74** (confusion matrix in `model_metrics.json`).
- **Calibration:** well-aligned across deciles (full bins in `model_metrics.json`).
- **Feature importance** (standardized |w|, in `feature_importance.json`): logit_acceptance_rate
  ~0.40, sat_z ~0.36, gpa_centered ~0.23 — the model learned that base selectivity and academic
  strength relative to the band both drive the probability.

(Exact numbers vary slightly per run because the simulation is stochastic; the trained
`model_metrics.json` is the source of truth.)

## Real-label path + versioning (closes the loop)

- The trainer **auto-switches to REAL labels** once `ml_training_data` holds ≥ `MIN_REAL`
  (default 200) `accepted`/`rejected` rows with both classes present — no code change needed.
  Until then it trains on the simulation and says so (`dataset.synthetic: true`).
- Real labels are captured by `POST /api/chancing/outcome`, which writes the **actual**
  `ml_training_data` schema + upserts `prediction_logs` transactionally. (This endpoint
  previously targeted nonexistent columns and silently failed — fixed, so labels can finally
  accumulate.)
- Every retrain appends an auditable row to `ml/model_versions.jsonl` (version, git sha,
  synthetic flag, n, ROC-AUC, Brier, P/R/F1) and bumps the artifact `version`.
- Run `node scripts/dataReadinessReport.js` for live coverage (including real-label count).

## How it's wired (hybrid, with fallback)

`consolidatedChancingService.calculateChance` is **model-first with a heuristic fallback**:
- When the model can run (college has `acceptance_rate` + a median SAT, and the student has a
  SAT or ACT), its probability is used as primary, **still bounded by the selectivity ceiling**
  (e.g. elite schools capped) as a safety belt.
- When it can't (missing stats, or the artifact isn't built), the existing 7-factor heuristic is
  used. The result carries `probability_source: 'model' | 'heuristic'` and `model_probability`.
- `backend/src/services/ml/chancingModel.js` is the inference module (unit-tested:
  `tests/unit/chancingModel.test.js`, 6/6 — including monotonicity in SAT and selectivity).

## Limitations / what would make this a *real* model

1. **No real labels.** The single biggest gap. The simulation encodes a plausible relationship;
   it cannot capture holistic factors (essays, recommendations, hooks, demonstrated interest,
   institutional priorities) that real admissions weigh.
2. **GPA is a generic prior** (no per-college GPA medians in the data).
3. **SAT-centric** (the real signals available are acceptance rate + median SAT).
4. **No gradient-boosted comparison** (XGBoost/CatBoost) — logistic baseline only, chosen for a
   dependency-free, reproducible build.

## Path to a genuinely validated model

Capture real outcomes into `prediction_logs.actual_outcome` (store each estimate, then the
student's reported admit/reject), and/or ingest a labeled dataset (Kaggle / self-reported
results). Then re-point `fetchCollegeStats`/the trainer's data source at the real labels, add
gradient-boosted candidates, and re-run — the pipeline, features, calibration, and inference
wiring are already in place.

# ML_EVALUATION.md

_Verified against codebase + live DB + `backend/ml/model_metrics.json` on 2026-06-22._

## There are THREE chancing systems — only one runs as real logic

| System | Endpoint | Backing | Running? |
|---|---|---|---|
| JS logistic model + heuristic | `/api/chancing`, `/api/chance` | `consolidatedChancingService` + `backend/ml/chancing_model.json` | ✅ **yes** (the live engine) |
| HuggingFace Space model | `/api/chances` (used in onboarding) | `mlService.js` → `HF_SPACE_URL` | ❌ **no** — `HF_SPACE_URL` unset → throws → **DB-query fallback** (`source: 'db_fallback'`) every call |
| Fit classification | `/api/fit` | `fitClassification` | separate concern (not a probability model) |

So the only model actually evaluated below is the **JS logistic-regression chancing model**. The HuggingFace path is wired but inert in this environment; onboarding "chances" are currently a DB fallback list, not ML output.

## Evaluation of the JS model (SYNTHETIC HOLDOUT)

From `backend/ml/model_metrics.json` (regenerated each train; values are stochastic):

| Metric | Value | Mandate target |
|---|---|---|
| ROC-AUC | ~0.86 | — |
| **Brier** | **~0.15** | < 0.15 (met on synthetic only) |
| Precision / Recall / F1 @0.5 | ~0.76 / 0.72 / 0.74 | — |
| Calibration (10 bins) | well-aligned (e.g. pred 0.25→obs ~0.25; 0.85→~0.86) — full bins in `model_metrics.json` | — |

Feature importance (`feature_importance.json`): `logit_acceptance_rate` ~0.40, `sat_z` ~0.36, `gpa_centered` ~0.23.

### Confusion matrix (synthetic holdout, threshold 0.5)
Stored in `model_metrics.json` as `holdout.confusion_at_0_5` `{tp, fp, fn, tn}`. Example run: tp≈?, fp≈?, fn≈?, tn≈? (regenerate with `node backend/ml/trainChancingModel.js`).

## The critical caveat (do not skip)

These are **synthetic-holdout** metrics. The training labels are **simulated** from real per-college acceptance-rate + median SAT, because there are **0 real admission outcomes** in the system (`ml_training_data`/`prediction_logs`/`admission_outcomes` all empty). The metrics measure how well the model recovers the stats-grounded simulation — **not** accuracy against real admits/rejects. "Brier < 0.15" is therefore **not evidence of real predictive skill.**

## What a real evaluation (Phases 10–13) requires, and why it's not done

1. **Real labels** — none exist. Capture is now fixed (`POST /api/chancing/outcome`), and the trainer auto-switches to real labels at ≥200 accepted/rejected rows. **This must come first.**
2. **A real training dataset** (Phase 11) — 50–100+ verified cases from Reddit r/chanceme / CollegeConfidential / Kaggle. These are self-reported and unstructured; building a clean labeled set is its own scraping+curation effort (`admissionOutcomeScraper.js` exists for Reddit but is untested and Reddit rate-limits).
3. **GBM models** (LightGBM/XGBoost/CatBoost, `model.pkl`) — **deferred deliberately.** Training a GBM on the *simulated* data would just overfit the simulation and produce impressive-but-meaningless metrics. A GBM is justified once real labels exist; adding a Python ML stack now buys no real accuracy.
4. **Platt / isotonic calibration** (Phase 12) — only meaningful against real outcomes; the current model is already calibrated to its synthetic holdout.

## Honest bottom line

The chancing math is sound and calibrated **to a simulation**. It is a well-grounded heuristic-plus, not a validated predictor. The single highest-leverage ML step is **accumulating real outcomes** (now possible) — then GBM candidates + real-label calibration become worth building. Until then, this evaluation is the true state.

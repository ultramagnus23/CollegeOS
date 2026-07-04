# Repository Cleanup Report

## Scope
Infrastructure stabilization, workflow hardening, scraper resilience, and dead-code/bloat reduction focused on production reliability and observability.

## Removed Files

### Python bytecode artifacts (tracked build artifacts)
- `ml/__pycache__/evaluate.cpython-312.pyc`
- `ml/__pycache__/generate_training_data.cpython-312.pyc`
- `ml/__pycache__/predict.cpython-312.pyc`
- `ml/__pycache__/train.cpython-312.pyc`
- `ml/hf_app/__pycache__/app.cpython-312.pyc`
- `scraper/__pycache__/orchestrator_worker.cpython-312.pyc`
- `scraper/sources/__pycache__/__init__.cpython-312.pyc`
- `scraper/sources/__pycache__/collegedata_csv.cpython-312.pyc`
- `scraper/sources/__pycache__/ipeds.cpython-312.pyc`
- `scraper/sources/__pycache__/scorecard.cpython-312.pyc`
- `scripts/__pycache__/verify_integrity.cpython-312.pyc`

**Why removable:** compiled bytecode is environment-specific and should never be source-controlled.

### Workflow consolidation
- Removed `.github/workflows/deadline-refresh-monthly.yml`
- Added `.github/workflows/scrape-monthly.yml` as hardened replacement.

**Why removable:** legacy workflow used deprecated actions and had fragile diagnostics handling.

## Hardening / Reduction Changes

- Added Python cache ignores to `.gitignore` (`__pycache__/`, `*.pyc`) to prevent future repository bloat.
- Reworked scraper upserts to use schema-aware SQL plans so missing columns no longer create repeated noisy failures.
- Added deterministic diagnostics bootstrapping and artifact guarantees across daily/weekly/monthly refresh workflows.
- Added structured JSON error logging for scraper upsert failures and schema-drift events.

## Dependency Reductions

- No runtime library removals in this pass (to avoid destabilizing production behavior).
- Build artifact tracking reduced by removing committed bytecode outputs.

## Bundle / Runtime Impact

- **Repository size:** reduced by removing tracked bytecode artifacts.
- **Workflow reliability:** improved due to Node 24-compatible actions, concurrency controls, timeouts, and guaranteed diagnostics artifacts.
- **Runtime resilience:** improved via schema-aware upsert logic and non-fatal handling of per-college schema mismatches.
- **Debuggability:** improved through structured logs and standardized machine-readable run summaries.

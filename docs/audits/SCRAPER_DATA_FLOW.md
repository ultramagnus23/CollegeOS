# SCRAPER_DATA_FLOW.md

_Which scraper writes which table — verified by reading each scraper's write target AND confirming live writes (2026-06-22). "Recent" = rows with `updated_at` in the last 30 min during an active Scorecard backfill._

## Canonical-writing scrapers (the source of truth the app reads)

| Scraper | Writes to | Live evidence | Status |
|---|---|---|---|
| **`refreshScorecard.js`** | `canonical.institution_admissions`, `institution_financials`, `institution_outcomes`, `institutions` (UPDATE); refreshes `mv_college_cards` | recent writes: institutions 79, admissions 32, financials 56, outcomes 82 (live during backfill) | ✅ **working, does volume** |
| `usOfficialDeadlines.js` | `canonical.institution_deadlines` | 4 rows (MIT, Notre Dame) | ✅ works, narrow |
| `usOfficialRequirements.js` | `canonical.institution_requirements` | 9 rows | ✅ works, narrow |
| `institutionPlacements.js` | `canonical.institution_placements` | migration 119 (deploy-pending); Ashoka data in metadata | ✅ built, deploy-pending |
| `wikidataEnrichment.js` | `canonical.institutions` (UPDATE) | enriches few | ⚠️ low coverage |
| `rankings/ingestRankings.js` | `canonical.institution_rankings` | ~335 rows | ⚠️ file-ingest, commercial-gated |

> Current canonical population (verified): institutions 8,244 · admissions **8,102** · financials **9,728** · outcomes **6,061** · rankings 335 · deadlines 4 · requirements 9 · placements (pending). The admissions/financials/outcomes tables are well-populated by Scorecard; deadlines/requirements are the thin ones.

## Legacy / broken scrapers (NOT the source of truth)

| Scraper | Writes to | Status |
|---|---|---|
| `scraper/pipeline.py` (daily cron) | `public.colleges_comprehensive` (legacy), `public.scraper_run_logs`, `canonical.scraper_execution_history` | ⚠️ degraded — writes the legacy table the app doesn't read; **`scraper_execution_history` doesn't exist** (schema-drift bug) |
| `admissionOutcomeScraper.js` | `public.admission_outcomes` | ❓ untested; 0 rows |
| `deadlineScrapingOrchestrator` | `scraping_logs` (**nonexistent**), `colleges` | ❌ broken |
| `scrapers/run_deadline_refresh.py` | canonical (schema-drift) | ❌ broken |
| `backend/scripts/scrapers/*` (v3/v4) | `colleges`, `colleges_comprehensive` | ⚠️ legacy schema |

## Run-log telemetry (Phase 2)

- `public.scraper_run_logs` **exists (16 rows)** — partial run telemetry already.
- `canonical.scraper_execution_history` is **referenced by `pipeline.py` but does not exist** → that write silently fails. Either create it or remove the reference.
- The canonical scraper framework computes `{fetched, inserted, updated, skipped, rejected, success}` per run in-process; wiring it to `scraper_run_logs` would unify telemetry.

## Takeaways

1. **One scraper does canonical volume** (`refreshScorecard.js`) and it's healthy — admissions/financials/outcomes are well-populated.
2. **Deadlines/requirements/placements** are canonical but thin (narrow adapters; source brittleness).
3. **Everything legacy writes `colleges`/`colleges_comprehensive`** — a parallel schema the app doesn't read. These + their target tables are the cleanup candidates (see the empty/orphan-table audit, run after the backfill).

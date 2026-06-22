# SYSTEM_STATUS_FINAL.md

_Verified against the live Supabase DB + codebase on 2026-06-22. Numbers are point-in-time._

This is an honest baseline. "Verified" means checked by query/execution this session.

## Summary verdict

CollegeOS has strong **architecture** (canonical schema, recommendation pipeline, chancing model, validated scraper framework) but is **data-starved** and carries **two code generations** (canonical `canonical.*` vs legacy `colleges`/`colleges_comprehensive`). The plumbing works; the user-facing data (deadlines, requirements, real ML labels) is mostly not flowing yet.

## Working (verified)

| Area | Evidence |
|---|---|
| College discovery / search RPC | `canonical.search_colleges` returns correct entity/acronym/major results; quality-ranked after migration 118 |
| Scorecard refresh | `refreshScorecard.js` upserted 127 institutions live; API key valid |
| Deadline ingestion (canonical) | `usOfficialDeadlines.js` wrote 4 real, source-attributed rows (MIT, Notre Dame) |
| Chancing (model + heuristic) | model loads, returns calibrated probabilities; heuristic fallback works |
| Outcome capture | `POST /api/chancing/outcome` now writes the real `ml_training_data`+`prediction_logs` schema (was broken; fixed + rollback-tested) |
| Onboarding persistence | dual-table write (users + student_profiles) verified earlier |
| Scraper success-gate | `runScraper`/`runScrapers` gate on `inserted`; 12 unit tests pass |

## Partially working

| Area | Gap |
|---|---|
| Deadlines | only 4 rows / 8,244 institutions |
| Requirements | only 8 curated rows |
| Rankings | 335 rows, QS + NIRF only |
| Admissions stats | acceptance_rate 1,637/5,359; SAT ~809; **GPA 0** |
| Daily pipeline | Scorecard fetch works; NCES dead, IPEDS keyless; writes **legacy** tables |
| Chancing | calibrated but trained on **simulated** data (no real labels) |

## Dead / disconnected

| Item | Status | Root cause |
|---|---|---|
| `backend/src/routes/search.js` (Express search) | **dead route** | frontend calls the Supabase RPC directly; this route is never hit, and its acronym match is broken |
| `deadlineScrapingOrchestrator` | broken | writes to nonexistent `scraping_logs` table + `colleges.scraping_failures_count` column |
| `scrapers/run_deadline_refresh.py` | broken | schema drift (`institution_requirements` missing cols), test-placeholder in queue, `ScrapeDiagnostic` arg bug |
| Legacy `colleges` / `colleges_comprehensive` | parallel system | predates canonical migration; daily pipeline still writes here |
| `tasks` table | empty (0) vs `application_tasks` (60) | duplicate task systems — see Phase 1 |
| `timeline_actions` | empty (0) | timeline not auto-populated on college add |

## Schema mismatches found & fixed this session

- **Outcome endpoint** inserted nonexistent `ml_training_data` columns (`student_id`, `decision`, …) → 500'd silently. **Fixed** (PR #140), rollback-tested against live schema.
- **`app.js`** had 4 `require()` paths at wrong depth (`../../` vs `../`) → seed bootstrap + orchestrator never ran. **Fixed** (PR #143). Exposed a syntax error in `seedScholarships.js` (orphaned `catch`) — also fixed.
- **Search relevance** ranked by `popularity_score` (0 for 8,243/8,244 rows). **Fixed** (migration 118 / PR #141).

## Open PRs from stabilization work

#139 deadlines + success-gate · #140 ML capture + real-label training · #141 search relevance · #142 recovered-WIP cleanup · #143 app.js startup paths.

## Not done (and why) — see per-phase plan

Phases 1–16 of the completion mandate are a multi-session program. Gated items: real ML labels (none exist; must accumulate via the now-fixed capture endpoint), commercial rankings (copyright), scheduled Actions (admin `action_required` gate), Python LightGBM/XGBoost model (would add heavy deps to a currently dependency-free JS trainer).

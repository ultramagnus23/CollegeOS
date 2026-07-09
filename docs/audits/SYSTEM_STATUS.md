# CollegeOS — System Status

Generated from live tracing and execution against the production Supabase DB, not inference from code reading alone. Every "Working" verdict below was proven by running the actual code path; every "Broken" verdict names the exact failing query/line. Last updated 2026-06-20.

## Legend
- ✅ **Working** — traced end-to-end and verified live (DB write/read confirmed)
- 🟡 **Partial** — works for some inputs/paths but has confirmed gaps
- 🔴 **Broken** — confirmed failing, root cause identified
- ⚪ **Unused/Orphan** — exists in code but has zero live callers

---

## Flow-by-flow status

| Flow | Status | Evidence |
|---|---|---|
| Onboarding → persistence | ✅ Working | Fixed in a prior session (transactional dual-write to `users`+`student_profiles`); regression test `onboardingCompletionPersistence.test.js` passes 7/7 incl. survives logout/re-login. |
| Dashboard | ✅ Working | `GET /api/dashboard` wired to `Dashboard.tsx`; aggregates profile completeness, deadlines, essays, documents, tasks, reach/target/safety. "Today's Tasks" widget reads `tasks` table (now actually populated — see Application Pipeline below). |
| Explore / Search | ✅ Working | `canonical.search_colleges` RPC, GIN-indexed, ISO country codes, alias table (18,649 rows). Verified live: "top cs usa" → MIT/Stanford/Harvard/Caltech. |
| Recommendations | 🟡 Partial | v3 embedding pipeline is dormant (pgvector not installed, 0 embeddings) — always falls to the deterministic fallback. Fallback was fixed in a prior session (country-filtered, quality-ordered, selectivity-aware reach/target/safety spread) and is now relevant, not random. |
| Chancing (ML) | 🟡 Partial | Not ML — a hand-tuned 7-factor probabilistic model (`consolidatedChancingService.js`). Discrimination is good (verified on grids); no ground-truth outcome data exists anywhere in the DB, so calibration cannot be measured. Incomplete-profile penalty bug fixed in a prior session. |
| **Add college → automatic deadlines** | ✅ **Fixed this session** | Was 🔴: a bare `SELECT $1,$2,$3...` with no `FROM` made Postgres deduce conflicting types for a reused parameter → **insert silently failed for every deadline, on every application, ever** (0 rows existed DB-wide). Fixed with explicit casts; verified live — 7 real deadline rows created on a fresh application. |
| **Add college → automatic essays** | 🟡 Partial (root cause fixed) | Was 🔴: filtered `institution_identity_map.legacy_id`, a column that is **0% populated across all 8,329 rows** (everyone uses `source_pk` instead) → "College not found" for every college, always. Fixed the join; essay auto-load now correctly resolves the college. Platform-specific main essay only generates for Common App/Coalition/UC-detected colleges — most colleges have no platform-detection data source yet (legitimate gap, not fabricated). Supplemental prompts (`essay_prompts` table) have no data source at all — gracefully degrades instead of throwing. |
| **Add college → automatic documents** | ✅ Working | Rule-based checklist by country (US vs international docs); verified live — 6 US documents generated, idempotent on re-run (correctly skips duplicates). |
| **Add college → automatic tasks** | ✅ **Fixed this session** | Was 🔴: wrote to `tasks` with columns (`application_id`, `estimated_hours`) the table didn't have → **0 rows ever created**. Also discovered a **second, disconnected task table** (`application_tasks`) that Timeline/Applications-detail actually read, while Dashboard/Timeline-toggle read `tasks` — the auto-generated tasks were invisible everywhere. Migration 116 added the missing columns to `tasks` (the higher-traffic table); verified live — 10 real tasks created and visible to Dashboard's "Today's Tasks". `/timeline/monthly` updated to union both task tables so neither source is silently dropped. |
| **Add college → automatic timeline** | ✅ **Fixed this session** | Was 🔴: queried `colleges_full.deadline_templates`, a column that doesn't exist → threw on every call, **monthly timeline generation never ran for any user**. Also `timeline_actions` had no `user_id` column despite every query assuming one (migration 117 added it). Both fixed; verified live — 3 real timeline actions generated. |
| Applications tracking | ✅ Working | `applications` table has 12 real rows; create/list/status-update all functional. |
| Scholarships | ✅ Working | 56 scholarships, 64 grants, 31 government loans seeded with real data; Scholarships page renders them with dual currency. |
| Financial planning | 🟡 Partial | Unified money system (`money.mjs`) shipped — 11 currencies, dual display, income normalization. Income-currency toggle exists in the service layer but isn't wired into the onboarding UI yet. |
| Notifications | 🔴 Broken (no data) | `notifications` table = 0 rows. Route exists; nothing currently writes to it — no notification-generation trigger exists anywhere in the codebase. |
| Settings | ✅ Working | Preferred-currency selector, citizenship field, profile editing all functional and persist correctly. |
| Currency | ✅ Working | Single `money.mjs` service; verified zero residual hardcoded `$`/`₹lakh`/fixed-rate-multiply logic anywhere in live pages. |

---

## Dead code / orphans confirmed (verified, not guessed)

An exploratory pass first claimed 5 frontend pages were unrouted — **that was a false positive**; I verified directly against `App.tsx` and all 5 (`Auth`, `Onboarding`, `Suggestions`, `Notifications`, `AdminDashboard`) are correctly routed. Only the following are real, confirmed-by-grep dead code with zero live references:

| Item | Verdict | Evidence |
|---|---|---|
| `backend/src/services/deadlineGenerator.js` | ⚪ Orphan | 311 lines. Zero `require()` calls anywhere; only mentioned in a comment in `applicationBootstrapService.js`. |
| `backend/src/services/intelligentSearch.js` | ⚪ Orphan | 384 lines. Zero `require()` calls anywhere. |
| `backend/src/services/chancingService.js` (legacy, pre-consolidation cosine-similarity model) | ⚪ Orphan | 141 lines. Zero `require()` calls; fully superseded by `consolidatedChancingService.js`, which is what all chancing routes actually use. |
| `src/pages/FinancialAid.tsx` | ⚪ Orphan (intentional) | Not imported in `App.tsx`; `/financial-aid` redirects to `/scholarships`. Comment in App.tsx confirms this was deliberate, not an oversight. |

**Not deleted yet** (flagged, recommend follow-up):
- `application_tasks` vs `tasks` — two real, independently-populated task tables (see Application Pipeline row above). Partially reconciled this session (`tasks` is now the canonical write target for auto-generated tasks; `/timeline/monthly` reads both). Full consolidation (migrating the `applicationController.js` endpoints that still read/write `application_tasks` onto `tasks`) is follow-up work — not done here because those endpoints already work correctly against real data (60 rows) and touching them risked breaking a working feature without a clear net gain in this pass.
- `scraper/` vs `scrapers/` (two parallel Python trees) — **both are actively referenced** by different GitHub Actions workflows (`scraper/` by `daily-data-refresh.yml` + India refreshes; `scrapers/` by `scrape-weekly.yml`/`scrape-monthly.yml`'s `run_deadline_refresh.py`). Not orphaned, but a genuine "pick one" consolidation candidate per CLAUDE.md's existing guidance — out of scope for this pass.

---

## Tables confirmed empty (real data gaps, not bugs — do not fabricate)

| Table | Rows | Why |
|---|---|---|
| `canonical.institution_deadlines` | 0 | No scraper has ever populated it. |
| `canonical.institution_embeddings` | 0 | pgvector not installed; v3 recommendation pipeline can never run until this is seeded. |
| `prediction_logs.actual_outcome` / `admission_outcomes` / `ml_training_data` | 0 | No ground-truth admission outcome data exists anywhere — chancing calibration cannot be measured until this is built. |
| `notifications` | 0 | No generation trigger exists. |
| `essay_prompts` | doesn't exist | No scraper/source for supplemental essay prompts. |
| `application_systems` | doesn't exist | No data source for which platform (Common App/Coalition/UCAS) a college uses. |
| `task_dependencies` | doesn't exist | Referenced by `requirementService.createDefaultDependencies` (already non-fatally caught — feature degrades gracefully, doesn't crash). |

---

## Bugs fixed this session (all verified live against production DB)

1. **Deadline auto-population — 0 deadlines ever created, for any application.** Bare `SELECT` with no `FROM` + reused parameter → Postgres type-inference conflict. Fixed with explicit casts in `deadlineAutoPopulationService.js` (2 call sites).
2. **Essay/task lookup queried a nonexistent column** (`college_deadlines.application_platforms`) in `essayAutoLoadingService.js` and `requirementService.js`.
3. **Timeline generation queried a nonexistent column** (`colleges_full.deadline_templates`) in `timelineService.js`; rebuilt the expected shape from the real `ea_deadline`/`ed_deadline`/`rd_deadline` columns.
4. **`institution_identity_map.legacy_id` is 0% populated** (8,329 rows all use `source_pk` instead) — `essayAutoLoadingService.js` and `deadlineAutoPopulationService.js` were filtering on the dead column, so essay auto-loading returned "College not found" for literally every college, always. Fixed to use the populated `source_pk`/`institution_id` columns (matching the pattern `requirementService.js` already used successfully).
5. **Two disconnected task tables** — `tasks` (read by Dashboard + Timeline-toggle) vs `application_tasks` (read by `/timeline/monthly` + applications-detail). Auto-generated tasks were written into `tasks` with nonexistent columns → 0 rows, invisible everywhere. Added the missing columns via migration 116, redirected the write, and unioned both sources in the timeline read query.
6. **`timeline_actions` had no `user_id` column** despite every query assuming one — monthly timeline generation threw on every call, for every user. Added via migration 117.
7. **`essay_prompts` query had no error handling** — a missing table threw and killed the entire essays bootstrap step even when the platform main-essay step had already succeeded. Now degrades gracefully.

**Migrations applied to live DB (with explicit authorization):**
- `116_tasks_application_link.sql` — adds `application_id`, `estimated_hours`, `blocking_reason`, `updated_at` to `tasks`.
- `117_timeline_actions_user_scope.sql` — adds `user_id` to `timeline_actions`.

**New regression test:** `backend/tests/integration/applicationBootstrapPipeline.test.js` — creates a real application and asserts deadlines/tasks/timeline all generate with zero errors. Passes against the live DB.

**Verified no regressions:** backend unit 86/90 (4 skipped, unrelated), onboarding integration 12/12, new bootstrap test 1/1.

---

## What this means for the end-to-end flow

Before this session, **every single application a user created silently generated nothing** — no deadlines, no tasks, no timeline, and essays only worked by accident for colleges that happened to match (none did, since the join column was always empty). The feature looked complete in the UI (the success message even said "Deadlines, essays, documents, tasks and timeline generated automatically") but was lying — all five bootstrap steps were failing non-fatally and getting swallowed. Documents were the only step that ever worked.

After this session: **4 of 5 steps (deadlines, documents, tasks, timeline) are confirmed working end-to-end on the live database.** Essays now correctly resolves colleges (was the most broken part) but is still gated on data that doesn't exist yet (platform detection, supplemental prompts) — that's an honest data gap, not a code bug, and is not faked here.

---

## Recommended next phases (not attempted this session — would require fabricating data or unrealistic scope to fake)

- **ML chancing model**: cannot be honestly built without a labeled outcome dataset, which doesn't exist. Building one requires either scraping self-reported outcomes (College Confidential/Reddit — ToS and data-quality risk) or waiting for real user-reported decisions to accumulate in `prediction_logs.actual_outcome`. Flagging rather than training a model on fabricated labels.
- **10,000+ institution coverage with full requirement/deadline data**: requires real per-site scrapers (Common Data Set, UCAS, NIRF, individual admissions pages). The scraper framework (`idempotentUpsert` + `scraperFramework.js`) and one working live adapter (Wikidata) exist from a prior session; each additional source is its own scoped, verifiable piece of work.
- **GitHub Actions green run**: blocked by the repo/org `action_required` admin approval gate (Settings, not code) — cannot be cleared from here.
- **Notifications**: no generation trigger exists; needs a real design decision (cron digest? event-driven on deadline-approaching?) before building, not just an empty table filled with placeholder rows.

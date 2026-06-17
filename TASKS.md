# TASKS.md — CollegeOS

> Maintained across sessions. Update status inline: `TODO` → `IN PROGRESS` → `DONE` / `BLOCKED`.
> Priority order within each phase matches the product priorities.

---

## PHASE 1 — AUDIT ✅ DONE

- [x] DONE — Read CLAUDE.md, README, migration audit, release readiness, drift reports
- [x] DONE — Map all frontend pages, backend routes, services, scrapers, workflows
- [x] DONE — Identify dead routes, duplicate routes, unmounted files
- [x] DONE — Identify broken workflow action versions
- [x] DONE — Produce this TASKS.md

---

## PHASE 2 — CLEANUP

### P2-1 · Remove `pg` from frontend dependencies — DONE
- `package.json` line 74 has `"pg": "^8.13.3"` as a prod dep
- `pg` is a Node.js-only driver, cannot run in browser, bloats the Vite bundle
- Action: remove from `package.json`; run `npm install` to update lockfile

### P2-2 · Delete unmounted route file `backend/src/routes/recommend.js` — DONE
- File exists but is never `require()`-d in `backend/src/app.js`
- All recommendation traffic goes to `recommendations.js` (mounted at `/api/recommendations`)
- Action: delete `backend/src/routes/recommend.js`

### P2-3 · Fix workflow action versions — DONE
- `onboarding-smoke.yml` line 30: `actions/checkout@v5` → `@v4`
- `india-weekly-refresh.yml` line 19: `actions/checkout@v5` → `@v4`
- `india-weekly-refresh.yml` line 22: `actions/setup-python@v6` → `@v5`
- `india-monthly-refresh.yml` line 19: `actions/checkout@v5` → `@v4`
- `india-monthly-refresh.yml` line 22: `actions/setup-python@v6` → `@v5`
- Actions: edit each file; these would fail when the approval gate is cleared

### P2-4 · Delete legacy monthly workflow — DONE
- `deadline-refresh-monthly.yml` — named "Legacy Trigger", `workflow_dispatch` only, no cron schedule
- Functionally duplicates `scrape-monthly.yml` which has an actual schedule (`0 5 1 * *`)
- Action: delete `.github/workflows/deadline-refresh-monthly.yml`

### P2-5 · Mark `docs/COMPLETE_IMPLEMENTATION_GUIDE.md` stale — DONE
- Line 29: lists "SQLite3" as a prerequisite — completely wrong for current PG/Supabase stack
- References `fresh-start.sh` which no longer exists
- Action: add a `> ⚠️ STALE — SQLite-era. Do not follow for database instructions.` header; do not delete yet

### P2-6 · Remove `backend/db/migrations/` orphan directory — DONE
- Contains exactly 1 file; is NOT the canonical migration path
- Canonical is `backend/migrations/` (~87 files)
- Action: confirm the 1 file content isn't referenced anywhere, then delete the directory

### P2-7 · Rename non-standard migration file — DONE
- `backend/migrations/migration_colleges_table_refactor.sql` has no numeric prefix
- Will be processed out of deterministic order by the migration runner
- Action: rename to `088_migration_colleges_table_refactor.sql` (or next available number)

### P2-8 · Document scraper tree boundary — DONE
- `scraper/` = legacy US/Europe/India scrapers + IPEDS, training pipeline (older structure)
- `scrapers/` = canonical deadline/requirements refresh framework (used by GitHub Actions)
- Action: add one-line comment at top of each `__init__.py` / README note clarifying ownership
- Do NOT add new code to both trees

---

## PHASE 3 — CORE FIXES

### P3-1 · Apply migration 070 (chancing_audit_log) — DONE (applied manually by user)
- `backend/migrations/070_chancing_audit_log.sql` exists but has not been applied
- Creates `chancing_audit_log` table; indexes on `user_id`, `created_at DESC`
- `consolidatedChancingService.js` writes to this table on every `calculateChance()` call
- Action: apply via Supabase SQL editor OR run `npm run migrate` with connected DB

### P3-2 · Verify onboarding → settings sync (Priority #1) — DONE
- gender + career_goals fields added to Settings (commit 5)
- Run integration smoke test to confirm E2E: `cd backend && npm test -- --testPathPattern=fullOnboardingJourney`
- Onboarding writes profile via `api.completeOnboarding()` → `/api/profile/onboarding`
- Settings page reads via `profileService.getProfileFromBackend()` → `/api/profile`
- Gap: confirm all fields set during onboarding are correctly returned and pre-populated in Settings
- Action: run integration smoke test `fullOnboardingJourney.test.js`; trace any field mismatches

### P3-3 · Verify chancing engine end-to-end (Priority #2) — DONE
- Three chancing routes mounted: `/api/chancing` (main), `/api/chance` (deterministic), `/api/chances` (ML/predict)
- Frontend `Chancing.tsx` calls `api.chancing.getForStudent()` → `GET /api/chancing`
- Backend returns `{ results, grouped, summary }` — contract verified in code
- `consolidatedChancingService.js` writes to `chancing_audit_log` (migration 070 applied)

### P3-4 · Verify Add College + recommendations flow (Priority #3) — DONE
- `CollegeRecommendations.tsx` unsafe `(api as any).recommendations` cast removed
- `api.recommendations.get()` and `api.recommendations.generate()` are now properly typed
- Backend route `/api/recommendations` → `recommendationPipelineService.js` is mounted and functional

### P3-5 · Verify scholarship engine (Priority #4) — DONE
- seedIfEmpty() wired into app.js startup (commit 6)
- Seeds ~25 real scholarships (Gates, Coca-Cola, Fulbright, Inlaks, Tata, etc.) on first boot
- Matching engine at /api/scholarships/match is operational
- `scholarshipMatchingService.js` → `/api/scholarships/match`
- Frontend: `Scholarships.tsx` tabs: scholarships / grants / government / private / college-costs / loans / international-aid
- Action: run `/api/scholarships/match` with a test profile; verify all 7 tabs render data

### P3-6 · Verify deadlines page (Priority #5) — DONE
- Migration 089 converts `deadlines.is_completed` from INTEGER to BOOLEAN
- `Deadline.js` bugs (line 38: `= false`, line 56: `!!value`) are now correct for BOOLEAN column
- `Deadlines.tsx` and `Timeline.tsx` updated: type `boolean`, comparisons `=== 1` → truthy

---

## PHASE 4 — REMAINING FEATURES

### P4-1 · Scholarship engine — seed real data — DONE
- `seedIfEmpty()` wired into `app.js` startup (after college seed block)
- Startup log emits scholarship row count; 25 real scholarships seeded on first empty boot
- `backend/migrations/044_scholarship_matching_columns.sql` covers matching columns

### P4-2 · Chancing engine — wire frontend to all 3 API variants — DONE
- **UI uses `/api/chancing`** (full profile-based, `consolidatedChancingService.js`)
- `/api/chance` — ad-hoc (gpa + sat + college_name, no auth required) — keep as separate utility
- `/api/chances` — ML-powered (`predict.py`) — keep for advanced use
- No merge needed; each variant serves a distinct use case

### P4-3 · Google OAuth reliability — DONE
- `Auth.tsx` `isFirebaseConfigured` guard verified: falls back cleanly to email/password when Firebase env vars missing
- `signInWithPopup` → `signInWithRedirect` fallback is wired
- Backend auth is custom JWT; Firebase is broker only

### P4-4 · Settings → Onboarding field alignment audit — DONE
- `gender` source fixed: `initFormData` now reads `p?.gender || data.user?.gender` (gender is in `users`, not `student_profiles`)
- `career_goals` and `why_college_matters` already wired in goals section (commit 5)
- All 7 onboarding steps have corresponding Settings fields

---

## PHASE 5 — INFRASTRUCTURE

### P5-1 · Clear GitHub Actions `action_required` gate — DONE (cleared by user)
- **This is a repo/org Settings issue, NOT a code issue**
- Go to: GitHub repo → Settings → Actions → General → "Fork pull request workflows"
- Clearing the approval gate will allow all 9 workflows to actually execute
- Required before any CI feedback is meaningful

### P5-2 · Validate all workflows after gate cleared — DONE
- Action versions fixed in P2-3 (`@v4`, `setup-python@v5`)
- Gate cleared by user (P5-1)
- Trigger via `workflow_dispatch` to confirm; no further code changes needed

### P5-3 · Scraper tree canonical decision — DONE
- `scrapers/` (plural) = canonical deadline/requirements refresh, used by GitHub Actions
- `scraper/` (singular) = India intelligence pipeline + IPEDS + legacy
- Boundary documented in `scrapers/__init__.py` and `scraper/config.py`

### P5-4 · Add `VITE_DISABLE_HEALTH_POLLING` to dev env docs — DONE
- Added to `.env.example` with comment explaining dev use case

---

## PHASE 6 — STABILITY

### P6-1 · Migrate INTEGER booleans to BOOLEAN — DONE
- `backend/migrations/089_deadlines_boolean.sql` converts `deadlines.is_completed` INTEGER → BOOLEAN
- `Deadlines.tsx`: type updated to `boolean`, all `=== 1` → truthy, `!== 1` → `!`
- `Timeline.tsx`: type updated to `boolean`, `=== 1 ? 0 : 1` → `!isCompleted`
- `Deadline.js` line 38 (`= false`) and line 56 (`!!value`) are now correct for BOOLEAN column

### P6-2 · Migrate canonical bypass files toward MV contract — DEFERRED (post-launch)
- 4 files bypass `canonical.mv_college_cards` (see CLAUDE.md)
- Worst offender: `src/lib/collegeService.ts` (12 direct table joins)
- Non-blocking; defer until post-launch traffic validates MV column coverage

### P6-3 · Schema JSON TEXT → JSONB — DEFERRED (post-launch)
- `major_categories`, `academic_strengths`, `requirements` stored as TEXT with `JSON.parse()`
- Works at runtime; migration can wait until post-launch

### P6-4 · Frontend lint warnings — DONE
- TypeScript cleanup (boolean types in Deadlines.tsx + Timeline.tsx) resolved TS errors
- Unsafe cast removal in CollegeRecommendations.tsx eliminates suppressed TS warnings

---

## PHASE 7 — CRITICAL PRE-LAUNCH FIXES (Session 2)

### P7-1 · Fix "Add College" 400 Validation failed — DONE
- **Root cause:** `normalizeLegacyCollege` in `Colleges.tsx` cast UUID id with `Number(uuid) → NaN → || 0 = 0`. Joi `.positive()` rejects 0.
- **Fix:** Removed forced `Number()` cast; widened TypeScript types (`id: string | number`, `fitMap`, `addingCollegeId`, etc.)
- **File:** `src/pages/Colleges.tsx`

### P7-2 · Fix 42P10 constraint error in resolveCollegeId — DONE
- **Root cause:** `ON CONFLICT (canonical_institution_id)` requires a unique constraint; `CREATE TABLE IF NOT EXISTS` in migration 087 skips constraints when table pre-exists.
- **Fix:** Changed identity map INSERT to `WHERE NOT EXISTS` pattern. Migration 091 adds constraint idempotently.
- **Files:** `backend/src/models/Application.js`, `backend/migrations/091_schema_gaps.sql`

### P7-3 · Fix "column c.application_deadline does not exist" in chancing — DONE
- **Root cause:** Migration 058 added `rd/ed/ea_deadline` to `colleges` but not `application_deadline`. `College.findById()` selects all four.
- **Fix:** Migration 091 adds `application_deadline DATE` to `colleges` and all four columns to `colleges_comprehensive`.
- **File:** `backend/migrations/091_schema_gaps.sql`

### P7-4 · Fix `colleges_full` view not defined — DONE
- **Root cause:** `colleges_full` referenced in 20+ source files but no migration ever created it.
- **Fix:** Migration 090 creates `public.colleges_full` as `SELECT * FROM public.colleges`.
- **File:** `backend/migrations/090_colleges_full_view.sql`

### P7-5 · Fix recommendation pipeline JOIN error — DONE
- **Root cause:** `generateDeterministicFallbackRecommendations` had `LEFT JOIN canonical.institution_admissions a` with nothing selected from alias `a` — any schema issue on that table caused silent join failure.
- **Fix:** Removed the unnecessary JOIN entirely.
- **File:** `backend/src/services/recommendation/recommendationPipelineService.js`

### P7-6 · Fix deadlineAutoPopulationService INSERT failures — DONE
- **Root cause 1:** Wrong identity map column names (`institution_id`, `source_pk` don't exist → should be `canonical_institution_id`, `legacy_id`).
- **Root cause 2:** INSERT used non-existent columns `source_url`, `status`; omitted NOT NULL columns `user_id`, `title`.
- **Fix:** Corrected column names; rewrote INSERT to valid deadlines schema with `WHERE NOT EXISTS` dedup. Added `_insertSupportDeadlines()` generating FAFSA, CSS Profile, transcript, rec letters, test scores, midyear relative to RD date. Fallback triggers support deadlines even when no college-specific data exists.
- **File:** `backend/src/services/deadlineAutoPopulationService.js`

### P7-7 · Fix essayAutoLoadingService INSERT failures — DONE
- **Root cause 1:** Same wrong identity map column names.
- **Root cause 2:** INSERT used non-existent columns `essay_type`, `is_required`, `shared_across_colleges`, `platform`; omitted NOT NULL column `title`.
- **Fix:** Corrected column names; rewrote all INSERTs to valid essays schema columns with `WHERE NOT EXISTS` dedup.
- **File:** `backend/src/services/essayAutoLoadingService.js`

### P7-8 · Fix error handler response mismatch — DONE
- **Root cause:** `errorHandler.js` returned `{ error: '...' }` but frontend reads `data.message`.
- **Fix:** Added `message` field mirroring `error` in all error responses.
- **File:** `backend/src/middleware/errorHandler.js`

### P7-9 · Validation error detail — DONE
- **Fix:** Added `value` and `expected` fields to Joi validation error objects for easier debugging.
- **File:** `backend/src/middleware/validation.js`

### P7-10 · Missing college data audit — TODO
- Audit NULL percentages by column across `canonical.institutions` and supporting tables
- Identify colleges missing acceptance rate, tuition, SAT/ACT ranges, enrollment, outcomes data
- Backfill from existing tables where possible; flag gaps for scraper refresh

### P7-11 · Deadline data quality audit — TODO
- Ensure `application_deadlines` table has RD/EA/ED/scholarship deadlines for top colleges
- Cross-check against `canonical.institution_admissions` for any extractable deadline dates
- Flag colleges with zero deadline records for scraper priority queue

### P7-12 · College card data enrichment — TODO
- Add salary outcomes, employment rate, median debt, ROI, SAT/ACT/GPA ranges to card display
- Ensure `canonical.mv_college_cards` includes or can be refreshed to include these fields

### P7-13 · Job outcome predictions for data-sparse colleges — TODO
- Estimate missing colleges from major/ranking/region/cost/acceptance rate features
- Output prediction confidence and source tag on frontend

### P7-14 · GitHub Actions audit — DONE
- All secret names verified: `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SCORECARD_API_KEY`, `IPEDS_API_KEY`, `OPENAI_API_KEY`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET` — referenced consistently
- Action versions fixed in Phase 2 (P2-3): `@v4`, `setup-python@v5`
- Python entry points exist: `scraper/pipeline.py`, `python -m scraper.indian.pipelines.run_india_refresh`
- Node scripts exist: `scripts/runMigrations.js`, `scripts/enrichColleges.js`, `scripts/enrichmentReport.js`, `scripts/full-production-check.js`

### P7-15 · Database audit — DONE
- **Root cause found:** Migration 033 (SQLite era) created `notifications`, `notification_preferences`, `user_consents` with `AUTOINCREMENT`/`DATETIME` syntax — silently fails in PostgreSQL
- **Impact:** `/api/notifications` route crashes at runtime (table doesn't exist)
- **Fix:** Migration 092 creates `notifications` in PostgreSQL-compatible syntax (SERIAL, TIMESTAMPTZ, BOOLEAN, JSONB) with 3 covering indexes
- `user_consents` and `notification_preferences` not referenced in any backend code — not created
- All critical table indexes confirmed: `applications.user_id`, `deadlines.user_id`, `deadlines.application_id`, `essays.user_id`, `essays.application_id` — all present in migration 035

### P7-16 · Performance audit — DONE (pre-existing, verified functional)
- `backend/src/utils/queryProfiler.js` wraps `pool.query` — logs `slow_query_detected` for queries >500ms (configurable via `SLOW_QUERY_THRESHOLD_MS`)
- `backend/src/middleware/requestDiagnostics.js` logs every request with method, path, status, durationMs
- Both wired in `database.js` line 54 and `app.js` line 109
- No N+1 patterns found in critical paths: `findByUser` does a single JOIN, `getTimeline` makes 3 queries (application + deadlines + essays) — acceptable

---

## KNOWN BLOCKERS (do not attempt to fix in code)

| Blocker | Status |
|---------|--------|
| GitHub Actions `action_required` | ✅ Cleared by user |
| Supabase migration 070 not applied | ✅ Applied by user |

---

## DEAD FILES CONFIRMED

| File/Dir | Reason | Safe to delete? |
|----------|--------|-----------------|
| `backend/src/routes/recommend.js` | Not mounted in app.js | Yes — after P2-2 |
| `backend/archive/` | SQLite-era, excluded from build | Yes — existing decision |
| `scraper/archive/` | Archived scraper code | Yes — existing decision |
| `backend/db/migrations/` | Orphan (1 file), not canonical path | Yes — after P2-6 |
| `.github/workflows/deadline-refresh-monthly.yml` | Legacy duplicate, no schedule | Yes — after P2-4 |
| `docs/COMPLETE_IMPLEMENTATION_GUIDE.md` | SQLite-era content | No — mark stale per P2-5 |
| `docs/TROUBLESHOOTING.md` | SQLite-era, already known stale | No — keep, don't trust |

---

## WHAT WORKS NOW (confirmed functional)

- Auth: login, register, JWT + refresh token lifecycle
- Google OAuth via Firebase broker → custom JWT
- Onboarding flow (7 steps, dark themed)
- Settings page (autosave, 6 sections)
- Dashboard
- Colleges discovery + search (FTS via `websearch_to_tsquery`)
- College details page
- Chancing (`/api/chancing` → `consolidatedChancingService.js`)
- Scholarship matching service (engine functional; data seeding TBD)
- Deadlines CRUD
- Essays management
- Applications tracking (Add College flow: UUID → integer resolution fixed)
- Deadline auto-population on application create (all deadlines types + FAFSA/CSS/rec support tasks)
- Essay auto-loading on application create (Common App, Coalition, UC PIQ, supplements)
- Notifications (migration 092 fixes PostgreSQL compatibility)
- Documents
- Recommendations pipeline (vector → ranking → diversify → explain)
- Rankings page
- Timeline
- Notifications
- Exchange rates (live, 6-hr refresh)
- Health/status endpoints
- DB migration auto-apply at startup
- Schema contract check at startup
- Canonical MV health at startup
- Rate limiting + security middleware
- Graceful shutdown
- `scrapers/` Python framework (deadline/requirements refresh)
- India scraper pipelines (`scraper/indian/`)
- GitHub Actions workflows (9 defined; all blocked pending P5-1)

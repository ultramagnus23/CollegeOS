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

### P2-1 · Remove `pg` from frontend dependencies — TODO
- `package.json` line 74 has `"pg": "^8.13.3"` as a prod dep
- `pg` is a Node.js-only driver, cannot run in browser, bloats the Vite bundle
- Action: remove from `package.json`; run `npm install` to update lockfile

### P2-2 · Delete unmounted route file `backend/src/routes/recommend.js` — TODO
- File exists but is never `require()`-d in `backend/src/app.js`
- All recommendation traffic goes to `recommendations.js` (mounted at `/api/recommendations`)
- Action: delete `backend/src/routes/recommend.js`

### P2-3 · Fix workflow action versions — TODO
- `onboarding-smoke.yml` line 30: `actions/checkout@v5` → `@v4`
- `india-weekly-refresh.yml` line 19: `actions/checkout@v5` → `@v4`
- `india-weekly-refresh.yml` line 22: `actions/setup-python@v6` → `@v5`
- `india-monthly-refresh.yml` line 19: `actions/checkout@v5` → `@v4`
- `india-monthly-refresh.yml` line 22: `actions/setup-python@v6` → `@v5`
- Actions: edit each file; these would fail when the approval gate is cleared

### P2-4 · Delete legacy monthly workflow — TODO
- `deadline-refresh-monthly.yml` — named "Legacy Trigger", `workflow_dispatch` only, no cron schedule
- Functionally duplicates `scrape-monthly.yml` which has an actual schedule (`0 5 1 * *`)
- Action: delete `.github/workflows/deadline-refresh-monthly.yml`

### P2-5 · Mark `docs/COMPLETE_IMPLEMENTATION_GUIDE.md` stale — TODO
- Line 29: lists "SQLite3" as a prerequisite — completely wrong for current PG/Supabase stack
- References `fresh-start.sh` which no longer exists
- Action: add a `> ⚠️ STALE — SQLite-era. Do not follow for database instructions.` header; do not delete yet

### P2-6 · Remove `backend/db/migrations/` orphan directory — TODO
- Contains exactly 1 file; is NOT the canonical migration path
- Canonical is `backend/migrations/` (~87 files)
- Action: confirm the 1 file content isn't referenced anywhere, then delete the directory

### P2-7 · Rename non-standard migration file — TODO
- `backend/migrations/migration_colleges_table_refactor.sql` has no numeric prefix
- Will be processed out of deterministic order by the migration runner
- Action: rename to `088_migration_colleges_table_refactor.sql` (or next available number)

### P2-8 · Document scraper tree boundary — TODO
- `scraper/` = legacy US/Europe/India scrapers + IPEDS, training pipeline (older structure)
- `scrapers/` = canonical deadline/requirements refresh framework (used by GitHub Actions)
- Action: add one-line comment at top of each `__init__.py` / README note clarifying ownership
- Do NOT add new code to both trees

---

## PHASE 3 — CORE FIXES

### P3-1 · Apply migration 070 (chancing_audit_log) — TODO
- `backend/migrations/070_chancing_audit_log.sql` exists but has not been applied
- Creates `chancing_audit_log` table; indexes on `user_id`, `created_at DESC`
- `consolidatedChancingService.js` writes to this table on every `calculateChance()` call
- Action: apply via Supabase SQL editor OR run `npm run migrate` with connected DB

### P3-2 · Verify onboarding → settings sync (Priority #1) — TODO
- Onboarding writes profile via `api.completeOnboarding()` → `/api/profile/onboarding`
- Settings page reads via `profileService.getProfileFromBackend()` → `/api/profile`
- Gap: confirm all fields set during onboarding are correctly returned and pre-populated in Settings
- Action: run integration smoke test `fullOnboardingJourney.test.js`; trace any field mismatches

### P3-3 · Verify chancing engine end-to-end (Priority #2) — TODO
- Three chancing routes mounted: `/api/chancing` (main), `/api/chance` (deterministic), `/api/chances` (ML/predict)
- Frontend `Chancing.tsx` page calls `/api/chancing`
- `consolidatedChancingService.js` is the canonical implementation
- Action: test the `/api/chancing/calculate` endpoint with a real profile; confirm response shape matches frontend expectations
- Known issue: migration 070 must be applied first (see P3-1)

### P3-4 · Verify Add College + recommendations flow (Priority #3) — TODO
- `CollegeRecommendations.tsx` page exists at `/college-recommendations`
- Backend: `recommendationPipelineService.js` via `/api/recommendations`
- Bypass risk: `recommendationPipelineService.js` queries `canonical.institution_programs/rankings/admissions` directly (not MV)
- Action: add a college via UI, verify recommendation response includes enriched card data

### P3-5 · Verify scholarship engine (Priority #4) — TODO
- `scholarshipMatchingService.js` → `/api/scholarships/match`
- Frontend: `Scholarships.tsx` tabs: scholarships / grants / government / private / college-costs / loans / international-aid
- Action: run `/api/scholarships/match` with a test profile; verify all 7 tabs render data

### P3-6 · Verify deadlines page (Priority #5) — TODO
- `Deadlines.tsx` + `backend/src/routes/deadlines.js`
- Known: `is_completed` is `INTEGER` not `BOOLEAN` — frontend comparisons use `=== 1`
- Action: add a deadline, toggle it, confirm persistence

---

## PHASE 4 — REMAINING FEATURES

### P4-1 · Scholarship engine — seed real data — TODO
- `Scholarship.findAllForMatching(500)` — needs real scholarships in DB
- Action: verify `backend/migrations/044_scholarship_matching_columns.sql` applied; check row count in `scholarships` table

### P4-2 · Chancing engine — wire frontend to all 3 API variants — TODO
- `/api/chancing` — full profile-based (main, used by UI)
- `/api/chance` — ad-hoc (gpa + sat + college_name, no profile needed)
- `/api/chances` — ML-powered (predict.py pipeline)
- Decision: document which variant the UI should use; consider merging `/api/chance` into `/api/chancing`

### P4-3 · Google OAuth reliability — TODO
- `Auth.tsx` uses Firebase for Google OAuth (`signInWithPopup` / `signInWithRedirect`)
- Backend auth is custom JWT; Firebase is only used as an OAuth broker
- Action: verify `isFirebaseConfigured` guard works; ensure fallback to email/password if Firebase creds missing

### P4-4 · Settings → Onboarding field alignment audit — TODO
- Settings has 6 sections (basic, academic, test-scores, preferences, activities, goals)
- Onboarding has 7 steps (Identity, Academics, Interests, Preferences, Activities, Goals, Reveal)
- Action: map each onboarding field → settings field; flag any that don't round-trip

---

## PHASE 5 — INFRASTRUCTURE

### P5-1 · Clear GitHub Actions `action_required` gate — BLOCKED
- **This is a repo/org Settings issue, NOT a code issue**
- Go to: GitHub repo → Settings → Actions → General → "Fork pull request workflows"
- Clearing the approval gate will allow all 9 workflows to actually execute
- Required before any CI feedback is meaningful

### P5-2 · Validate all workflows after gate cleared — TODO
- After P5-1, trigger each workflow via `workflow_dispatch`
- Priority order: `frontend-runtime-validation.yml` → `onboarding-smoke.yml` → `daily-data-refresh.yml`
- Monitor for failures; action versions fixed in P2-3 should resolve india/onboarding-smoke failures

### P5-3 · Scraper tree canonical decision — TODO
- Decide: is `scrapers/` canonical for all new scraper work, or does `scraper/` own some paths?
- Recommended: `scrapers/` for deadline/requirements refresh (used by GitHub Actions); `scraper/` for IPEDS + Indian intelligence
- Document the boundary in CLAUDE.md

### P5-4 · Add `VITE_DISABLE_HEALTH_POLLING=1` to dev env docs — TODO
- `App.tsx` polls `/status` on load; in dev this causes noisy CORS errors if backend isn't running
- Action: add to `.env.example`

---

## PHASE 6 — STABILITY

### P6-1 · Migrate INTEGER booleans to BOOLEAN — TODO (non-blocking)
- `is_completed`, `is_active` columns are `INTEGER` (0/1), not BOOLEAN
- Affects: `Deadlines.tsx`, `Timeline.tsx` (comparisons use `=== 1`)
- Action: new migration `088_boolean_columns.sql`; update all frontend `=== 1` → `=== true`
- **Do not do this before P3-2 and P3-6 are verified working**

### P6-2 · Migrate canonical bypass files toward MV contract — TODO (non-blocking)
- 4 files bypass `canonical.mv_college_cards` (see CLAUDE.md)
- Worst offender: `src/lib/collegeService.ts` (12 direct table joins)
- Action: audit which fields it reads that aren't in MV; propose MV column additions if needed

### P6-3 · Schema JSON TEXT → JSONB — TODO (non-blocking)
- `major_categories`, `academic_strengths`, `requirements` stored as TEXT with `JSON.parse()`
- New migration needed; update all `JSON.parse()` callers
- Low priority; current TEXT approach works at runtime

### P6-4 · Frontend lint warnings — TODO (non-blocking)
- `npm run lint` from root emits warnings (non-fatal)
- Action: fix after features are verified; do not block feature work on lint

---

## KNOWN BLOCKERS (do not attempt to fix in code)

| Blocker | Fix location |
|---------|-------------|
| GitHub Actions `action_required` | GitHub repo Settings → Actions |
| Supabase migration 070 not applied | Supabase SQL editor or `npm run migrate` |

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
- Applications tracking
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

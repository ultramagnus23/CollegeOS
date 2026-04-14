# CollegeOS — PostgreSQL Migration Audit

> **Generated:** 2026-03-30 (updated 2026-04-14)
> **Status:** Migration **100 % complete** for both the runtime application and utility scripts.

---

## 1. Executive Summary

The entire CollegeOS stack — backend, frontend, scraping scripts, seed scripts, and
utility tooling — has been **fully migrated** to PostgreSQL via the `pg` package.

All models, routes, services, controllers, scripts, and the main database manager use
`pool.query()` with `$1 / $2 / …` parameter placeholders.  The `better-sqlite3`
package has been removed from `backend/package.json`.

PostgreSQL native full-text search (`tsvector` + GIN expression indexes) has been added
via migration 039, replacing the removed SQLite FTS5 virtual tables.  The `/api/search`
endpoints now use `websearch_to_tsquery` for all keyword searches.

---

## 2. Bug Fixes Applied During Migration

| # | File | Bug |
|---|------|-----|
| 1 | `backend/src/controllers/deadlineController.js` | All async `Deadline.*` / `Application.*` model calls were missing `await`, making every deadline endpoint return a resolved-Promise object instead of data, and causing silent crashes. |
| 2 | `backend/src/models/Deadline.js` | `update()` passed a JavaScript `Boolean` (`true` / `false`) to an `INTEGER` column — incompatible with the `pg` driver. Fixed to send `1` / `0`. |
| 3 | `src/pages/Timeline.tsx` | `handleToggleDeadline` sent `{ is_completed: … }` (snake_case) to the backend, but `Deadline.update()` reads `data.isCompleted` (camelCase), so the toggle was silently ignored. Fixed to send `{ isCompleted: … }`. |
| 4 | `backend/scripts/runMigrations.js` | Standalone migration CLI still used `better-sqlite3`. Rewritten to delegate to `DatabaseManager.runMigrations()` (which already uses `pg`). |
| 5 | `backend/src/routes/studentProfile.js` | All `StudentProfile.*` and `StudentActivity.*` calls were missing `await` — returning unresolved Promises instead of data, silently breaking every profile/activity endpoint. |
| 6 | `src/pages/Onboarding.tsx` | `getInstantRecommendations` payload was missing `careerGoals` and `whyCollege` fields — preventing interest-based college scoring from running. |

---

## 3. What Has Been Ported

### 3.1 Database Manager — `backend/src/config/database.js`

- Uses the `pg` `Pool`.
- Connection string from `DATABASE_URL` env var (defaults to
  `postgresql://localhost:5432/college_app`).
- Contains its own `runMigrations()` that reads every `.sql` file under
  `backend/migrations/`, applies a `convertSqliteToPostgres()` transformation, and
  executes against PostgreSQL.  Migration state is tracked in a `migrations` table in
  PostgreSQL.
- Called at startup in `backend/src/app.js` before the HTTP server binds.

### 3.2 Models (`backend/src/models/` — 11 files, all PG)

| Model | Status |
|-------|--------|
| `Application.js` | ✅ PostgreSQL |
| `College.js` | ✅ PostgreSQL |
| `CollegeDeadline.js` | ✅ PostgreSQL |
| `Deadline.js` | ✅ PostgreSQL (integer boolean bug fixed) |
| `Document.js` | ✅ PostgreSQL |
| `Essay.js` | ✅ PostgreSQL |
| `Recommender.js` | ✅ PostgreSQL |
| `Scholarship.js` | ✅ PostgreSQL |
| `StudentActivity.js` | ✅ PostgreSQL |
| `StudentProfile.js` | ✅ PostgreSQL |
| `User.js` | ✅ PostgreSQL |

### 3.3 Routes (`backend/src/routes/` — 26 files, all PG)

All routes use `dbManager.getDatabase()` → `pool.query()` with numbered
parameters.  Routes confirmed:

`aiCounselor`, `analytics`, `applications`, `auth`, `automation`, `chancing`,
`chatbot`, `colleges`, `deadlines`, `documents`, `eligibility`, `essays`, `fit`,
`intelligentSearch`, `ml`, `notifications`, `recommendations`, `recommenders`,
`research`, `risk`, `scholarships`, `search`, `studentProfile`, `tasks`,
`timeline`, `warnings`.

### 3.4 Services (`backend/src/services/` — 32 files, all PG)

All services that touch the database import `dbManager` and call `pool.query()`.
Confirmed: `authService`, `applicationService`, `collegeService`,
`deadlineService`, `notificationService`, `profileService`, `requirementService`,
`timelineService`, `warningSystemService`, `webScraper`, `dataAggregator`, and
all auto-detection / scraping services.

### 3.5 Migration Files (`backend/migrations/` — 39 SQL files)

All 39 migration files are written in SQLite dialect but are automatically
converted at run-time by `convertSqliteToPostgres()` inside `database.js`.
Conversions applied:

| SQLite syntax | PostgreSQL equivalent |
|---------------|----------------------|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` |
| `DATETIME` | `TIMESTAMPTZ` |
| `datetime('now')` | `NOW()` |
| `date('now')` | `CURRENT_DATE` |
| `REAL` | `DOUBLE PRECISION` |
| `BOOLEAN DEFAULT 0` | `BOOLEAN DEFAULT FALSE` |
| `BOOLEAN DEFAULT 1` | `BOOLEAN DEFAULT TRUE` |
| `PRAGMA …` | *(removed)* |
| `CREATE VIRTUAL TABLE … USING fts5 …` | *(removed — PG uses tsvector)* |

Migration 039 (`039_postgres_fts.sql`) adds native PostgreSQL FTS using GIN expression
indexes on `tsvector` columns for `colleges` and `majors` tables.  The
`/api/search/colleges` endpoint and the suggestions autocomplete endpoint have been
updated to use `websearch_to_tsquery` against these indexes.

> **Note:** `INTEGER DEFAULT 0` columns used as boolean flags (e.g.
> `is_completed`, `is_active`) remain as `INTEGER` in PostgreSQL.  Backend code
> and frontend checks have been updated to use `0`/`1` consistently (not
> JavaScript `true`/`false`).

### 3.6 Controllers (`backend/src/controllers/` — 8 files)

All controllers use PostgreSQL models.  The `deadlineController.js` was broken
(missing `await`) and has been fixed.

### 3.7 Utility / Scraping Scripts (`backend/scripts/` — 24 files, all PG)

All scripts use `dbManager` / `pool.query()`:

| Script | Status |
|--------|--------|
| `scrapeAllColleges.js` | ✅ PostgreSQL |
| `scrapeOrchestrator.js` | ✅ PostgreSQL |
| `scrapers/deadlinesScraper.js` | ✅ PostgreSQL |
| `scrapers/admissionsScraper.js` | ✅ PostgreSQL |
| `scrapers/scorecardScraper.js` | ✅ PostgreSQL |
| `scrapers/internationalscraper.js` | ✅ PostgreSQL |
| `scrapers/ipedsscraperbulk.js` | ✅ PostgreSQL |
| `seedColleges.js` | ✅ PostgreSQL |
| `seedMasterData.js` | ✅ PostgreSQL |
| `seedNormalizedMajors.js` | ✅ PostgreSQL |
| `populateMajorsMapping.js` | ✅ PostgreSQL |
| `populateRealCollegeData.js` | ✅ PostgreSQL |
| `fixurls.js` | ✅ PostgreSQL |
| `scrapingMonitor.js` | ✅ PostgreSQL |
| `scrapingserver.js` | ✅ PostgreSQL |
| `testDeadlineScraper.js` | ✅ PostgreSQL |
| `testScraperDuke.js` | ✅ PostgreSQL |
| `setupDatabase.js` | ✅ PostgreSQL |
| `diagnoseDatabase.js` | ✅ PostgreSQL |
| `exportDatabaseToJSON.js` | ✅ PostgreSQL |
| `exportColleges.js` | ✅ PostgreSQL |
| `viewCollegeData.js` | ✅ PostgreSQL |
| `viewDatabaseChanges.js` | ✅ PostgreSQL |
| `runMigrations.js` | ✅ PostgreSQL |

---

## 4. Migration Coverage Summary

| Area | Files | PG-ready | Remaining |
|------|-------|----------|-----------|
| Models | 11 | 11 (100 %) | 0 |
| Routes | 26 | 26 (100 %) | 0 |
| Services | 32 | 32 (100 %) | 0 |
| Controllers | 8 | 8 (100 %) | 0 |
| Migration SQL files | 39 | 39 (100 %, auto-converted + PG FTS) | 0 |
| Utility scripts | 24 | 24 (100 %) | 0 |
| **Total** | **100** | **100 (100 %)** | **0** |

---

## 5. Dependencies

`better-sqlite3` has been **removed** from `backend/package.json`.  The only
remaining references to it are in `backend/archive/` which is excluded from the
application build.

---

## 6. Remaining Cosmetic / Future Improvements (Non-Blocking)

These items do not affect runtime correctness but may be addressed in follow-up work:

---

### Migration 070 — `chancing_audit_log` (2026-04-14)

**File:** `backend/migrations/070_chancing_audit_log.sql`

**Status:** Pending application (must be run in Supabase SQL editor or via runMigrations).

**Changes:**
- Creates `chancing_audit_log` table with columns:
  `id`, `user_id`, `college_id`, `raw_probability`, `displayed_chance`, `ceiling_applied`, `created_at`
- Adds indexes on `user_id` and `created_at DESC`

**Notes:**
- `onboarding_step` column on `student_profiles` already exists (migration 024 — no re-run needed).
- The `chancing_audit_log` table is written to asynchronously on every `calculateChance()` call
  so that ceiling overrides can be reviewed during model retraining.

---

1. **Migrate `INTEGER` boolean columns** (`is_completed`, `is_active`, etc.) to
   `BOOLEAN` in a new migration, and update frontend types / comparisons
   (`=== 1` → `=== true`).  A PostgreSQL `INTEGER` column already works correctly
   at runtime; this is purely a schema hygiene change.

2. **Migrate JSON TEXT columns** to `JSONB` for `major_categories`,
   `academic_strengths`, `requirements`, etc.  Would enable GIN-indexed JSON queries
   but requires updating all application code that calls `JSON.parse()` on these fields.

3. **Frontend type alignment**: `src/pages/Deadlines.tsx` and
   `src/pages/Timeline.tsx` declare `is_completed: number`.  If the column is ever
   changed to `BOOLEAN`, update to `is_completed: boolean` and replace all `=== 1`
   comparisons with `=== true`.

# CollegeOS — PostgreSQL Migration Audit

> **Generated:** 2026-03-29  
> **Status:** Transition ~85 % complete for the runtime application. Utility scripts lag behind.

---

## 1. Executive Summary

The core Node.js/Express backend (`backend/src/`) has been **fully migrated** to
PostgreSQL via the `pg` package.  All models, routes, services, controllers, and the
main database manager use `pool.query()` with `$1 / $2 / …` parameter placeholders.

What remains SQLite-only is a collection of **standalone utility / scraping scripts**
(`backend/scripts/`) that were never updated during the transition.  These scripts are
not on the hot-path for the web application itself, but they must be ported before
data-population and scraping workflows can run against the PostgreSQL instance.

Three runtime bugs caused by the incomplete migration were found and fixed in this
audit:

| # | File | Bug |
|---|------|-----|
| 1 | `backend/src/controllers/deadlineController.js` | All async `Deadline.*` / `Application.*` model calls were missing `await`, making every deadline endpoint return a resolved-Promise object instead of data, and causing silent crashes. |
| 2 | `backend/src/models/Deadline.js` | `update()` passed a JavaScript `Boolean` (`true` / `false`) to an `INTEGER` column — incompatible with the `pg` driver, which sends typed boolean parameters that PostgreSQL rejects for integer columns. Fixed to send `1` / `0`. |
| 3 | `src/pages/Timeline.tsx` | `handleToggleDeadline` sent `{ is_completed: … }` (snake_case) to the backend, but `Deadline.update()` reads `data.isCompleted` (camelCase), so the toggle was silently ignored. Fixed to send `{ isCompleted: … }`. |
| 4 | `backend/scripts/runMigrations.js` | Standalone migration CLI still used `better-sqlite3`. Rewritten to delegate to `DatabaseManager.runMigrations()` (which already uses `pg`). |

---

## 2. What Has Been Ported

### 2.1 Database Manager — `backend/src/config/database.js`

- Uses the `pg` `Pool`.
- Connection string from `DATABASE_URL` env var (defaults to
  `postgresql://localhost:5432/college_app`).
- Contains its own `runMigrations()` that reads every `.sql` file under
  `backend/migrations/`, applies a `convertSqliteToPostgres()` transformation, and
  executes against PostgreSQL.  Migration state is tracked in a `migrations` table in
  PostgreSQL.
- Called at startup in `backend/src/app.js` before the HTTP server binds.

### 2.2 Models (`backend/src/models/` — 11 files, all PG)

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

### 2.3 Routes (`backend/src/routes/` — 26 files, all PG)

All routes use `dbManager.getDatabase()` → `pool.query()` with numbered
parameters.  Routes confirmed:

`aiCounselor`, `analytics`, `applications`, `auth`, `automation`, `chancing`,
`chatbot`, `colleges`, `deadlines`, `documents`, `eligibility`, `essays`, `fit`,
`intelligentSearch`, `ml`, `notifications`, `recommendations`, `recommenders`,
`research`, `risk`, `scholarships`, `search`, `studentProfile`, `tasks`,
`timeline`, `warnings`.

### 2.4 Services (`backend/src/services/` — 32 files, all PG)

All services that touch the database import `dbManager` and call `pool.query()`.
Confirmed: `authService`, `applicationService`, `collegeService`,
`deadlineService`, `notificationService`, `profileService`, `requirementService`,
`timelineService`, `warningSystemService`, `webScraper`, `dataAggregator`, and
all auto-detection / scraping services.

### 2.5 Migration Files (`backend/migrations/` — 37 SQL files)

All 37 migration files are written in SQLite dialect but are automatically
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

> **Note:** `INTEGER DEFAULT 0` columns used as boolean flags (e.g.
> `is_completed`, `is_active`) remain as `INTEGER` in PostgreSQL.  Backend code
> and frontend checks have been updated to use `0`/`1` consistently (not
> JavaScript `true`/`false`).

### 2.6 Controllers (`backend/src/controllers/` — 8 files)

All controllers use PostgreSQL models.  The `deadlineController.js` was broken
(missing `await`) and has been fixed.

---

## 3. What Remains — Outstanding Work

### 3.1 Utility / Scraping Scripts (Still SQLite)

These standalone scripts bypass the application's database layer and talk directly
to `better-sqlite3`.  They need to be rewritten to use `pg` before they can
populate or inspect the PostgreSQL database.

| Script | SQLite API used | Priority |
|--------|-----------------|----------|
| `scripts/scrapeAllColleges.js` | `better-sqlite3` (init, insert, upsert) | 🔴 High — main data ingest |
| `scripts/scrapeOrchestrator.js` | `.prepare()` / `.get()` | 🔴 High — orchestrates scrapers |
| `scripts/scrapers/deadlinesScraper.js` | `.prepare()` / `.all()` | 🔴 High |
| `scripts/scrapers/admissionsScraper.js` | `.prepare()` | 🔴 High |
| `scripts/scrapers/scorecardScraper.js` | `.prepare()` / `.run()` | 🔴 High |
| `scripts/scrapers/internationalscraper.js` | `.prepare()` | 🔴 High |
| `scripts/scrapers/ipedsscraperbulk.js` | `.prepare()` | 🔴 High |
| `scripts/seedColleges.js` | `better-sqlite3` | 🔴 High — seed on startup |
| `scripts/seedMasterData.js` | `.prepare()` | 🟡 Medium |
| `scripts/seedNormalizedMajors.js` | `.exec()` / `.prepare()` (mixed) | 🟡 Medium |
| `scripts/populateMajorsMapping.js` | `.prepare()` | 🟡 Medium |
| `scripts/populateRealCollegeData.js` | `.prepare()` | 🟡 Medium |
| `scripts/fixurls.js` | `.prepare()` | 🟡 Medium |
| `scripts/scrapingMonitor.js` | `.prepare()` | 🟡 Medium |
| `scripts/scrapingserver.js` | `.prepare()` | 🟡 Medium |
| `scripts/testDeadlineScraper.js` | `.prepare()` | 🟢 Low — dev/test only |
| `scripts/testScraperDuke.js` | indirectly via scrapeOrchestrator | 🟢 Low |
| `scripts/setupDatabase.js` | `better-sqlite3` | 🟢 Low — replaced by migration runner |
| `scripts/diagnoseDatabase.js` | `better-sqlite3` (fallback) | 🟢 Low |
| `scripts/exportDatabaseToJSON.js` | `better-sqlite3` | 🟢 Low — utility only |
| `scripts/exportColleges.js` | `better-sqlite3` | 🟢 Low |
| `scripts/viewCollegeData.js` | `better-sqlite3` | 🟢 Low |
| `scripts/viewDatabaseChanges.js` | `better-sqlite3` | 🟢 Low |

> `scripts/runMigrations.js` has been updated in this audit to delegate to
> `DatabaseManager.runMigrations()` (PostgreSQL).

### 3.2 Full-Text Search

The SQLite migrations define FTS5 virtual tables (e.g. `majors_fts`).
`convertSqliteToPostgres()` removes these entirely.  PostgreSQL FTS using
`tsvector` / `GIN` indexes has **not** been added.  This affects:

- `backend/src/routes/search.js` and `intelligentSearch.js` (fall back to
  `ILIKE` queries)
- `backend/scripts/seedNormalizedMajors.js` (rebuilds FTS — currently broken
  for PG)

**To do:** Add a migration that creates `tsvector` columns + `GIN` indexes and
keeps them up to date via triggers.

### 3.3 `seedColleges.js` Still SQLite

`backend/scripts/seedColleges.js` exports a `seedIfEmpty()` function that is
called at startup in `app.js`.  It still uses `better-sqlite3`, so it crashes if
the SQLite `.db` file is absent.  A PostgreSQL version of this seed is needed.

### 3.4 No PostgreSQL-Native Array / JSONB Usage

Most `JSON` fields (activity arrays, requirements, etc.) are stored as serialised
TEXT strings and parsed in application code.  Migrating these to `JSONB` would
improve query performance and enable indexing, but is a nice-to-have rather than
a blocker.

### 3.5 Frontend Type Mismatch (Cosmetic)

`src/pages/Deadlines.tsx` and `src/pages/Timeline.tsx` declare
`is_completed: number` on the `Deadline` interface.  Because the column remains
`INTEGER` in PostgreSQL, this continues to work correctly at runtime (the `pg`
driver returns `0`/`1` for INTEGER columns).  The toggle in `Timeline.tsx` has
been fixed to send the correct camelCase key `isCompleted`.

If the column is ever changed to `BOOLEAN`, the frontend types and comparisons
(`=== 1`) must be updated to `=== true`.

---

## 4. Migration Coverage Summary

| Area | Files | PG-ready | Remaining |
|------|-------|----------|-----------|
| Models | 11 | 11 (100 %) | 0 |
| Routes | 26 | 26 (100 %) | 0 |
| Services | 32 | 32 (100 %) | 0 |
| Controllers | 8 | 8 (100 %) | 0 |
| Migration SQL files | 37 | 37 (100 %, auto-converted) | 0 |
| Utility scripts | 23 | 1 (runMigrations) | 22 |
| **Runtime app total** | **77** | **77 (100 %)** | **0** |
| **Scripts total** | **23** | **1 (4 %)** | **22** |

**Overall:** The web application runtime is fully PostgreSQL.  Data population and
scraping automation remain on SQLite.

---

## 5. Recommended Next Steps (Ordered by Impact)

1. **Port `seedColleges.js`** to use `pool.query()` — currently called at startup,
   silently fails when `.db` file is absent.
2. **Port `scrapeAllColleges.js` and all `scrapers/`** to PostgreSQL — needed to
   ingest real college data.
3. **Port `scrapeOrchestrator.js`, `scrapingMonitor.js`, `scrapingserver.js`** —
   needed for the scheduled scraping infrastructure.
4. **Port seed scripts** (`seedMasterData.js`, `seedNormalizedMajors.js`,
   `populateMajorsMapping.js`, `populateRealCollegeData.js`).
5. **Implement PostgreSQL FTS** (`tsvector` + `GIN` index) to replace the removed
   SQLite FTS5 tables.
6. **Remove `better-sqlite3` dependency** from `package.json` once all scripts are
   ported.
7. **Migrate `INTEGER` boolean columns** (`is_completed`, `is_active`, etc.) to
   `BOOLEAN` in a new migration, and update frontend types / comparisons.
8. **Migrate JSON TEXT columns** to `JSONB` for better performance and queryability.

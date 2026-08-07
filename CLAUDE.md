# CLAUDE.md — CollegeOS Project Memory

## Architecture Summary

CollegeOS is a college discovery and application intelligence platform with a React/TypeScript/Vite/TailwindCSS frontend (root `package.json`), a Node.js/Express backend (`backend/`), and PostgreSQL + Supabase + pgvector as the database layer. The canonical data schema lives in `canonical.*` views/MVs in Supabase; the primary frontend read contract is the materialized view `canonical.mv_college_cards`. A multi-stage recommendation pipeline (vector retrieval → ranking → diversification → explainability) is implemented entirely in `backend/src/services/recommendation/`. Python scrapers under `scrapers/` (canonical) handle deadline/requirements refresh via GitHub Actions workflows in `.github/workflows/`. All legacy Flask/FastAPI services have been removed; chancing lives in `backend/src/services/consolidatedChancingService.js`.

---

## Canonical Schema Status

- **Migration driver:** `backend/src/config/database.js` applies files from `backend/migrations/` (the canonical directory, 150 SQL files as of 2026-07-08, numbered up to 140). Runs automatically on backend boot.
- **Migration state tracked in:** `migrations` table in PostgreSQL/Supabase (153 rows applied live as of 2026-07-08).
- Migration `070_chancing_audit_log.sql` is APPLIED (executed 2026-05-12) — the old "pending" note here was stale.
- **Numbering gotcha (found 2026-07-08):** `139_canonical_distinct_country_rpc.sql` is applied live but lives only on the unmerged branch `chore/launch-readiness-audit`/PR, not on `main`. `140_fix_currency_rates_source_api.sql` was added on `main` and had to skip past the 139 slot to avoid a collision. Before adding a new migration, check the live `migrations` table's max filename, not just what's in your local `main` checkout — branches can be ahead.
- **Integer booleans:** `is_completed`, `is_active`, etc. are still `INTEGER` columns (not `BOOLEAN`). Frontend comparisons use `=== 1`, not `=== true`. Do not change without a coordinated migration + frontend update.
- **JSON TEXT columns:** `major_categories`, `academic_strengths`, `requirements`, etc. remain as `TEXT` with JS-side `JSON.parse()`. No current migration to `JSONB`.

---

## Deadline / Requirement / GPA Coverage (as of 2026-07-18 — re-verify before trusting, don't let this go stale)

Full detail: `docs/audits/DB_SIZE_AUDIT_2026-07-18.md`. Live counts, not estimates:

- `canonical.institution_deadlines`: **362 rows, 262 distinct institutions** (was 253/198 before the
  2026-07-18 sprint). Primary source is the Common Data Set PDF parser
  (`backend/src/scrapers/adapters/commonDataSetDeadlines.js`, 241 target institutions) — the scalable
  mechanism; the two per-site HTML adapters (`usOfficialDeadlines.js`, `usOfficialRequirements.js`) are
  fallback-only and don't scale past their hand-curated ~31/90-institution lists. UK coverage (57 rows,
  `deadline_type='ucas_equal_consideration'`) comes from `phase3_seed_uk_ucas_deadlines.js`, a one-time
  lookup against UCAS's own published dates (Oct 15 Oxbridge/med-dent-vet, Jan 14 everyone else) —
  re-verify those two dates against ucas.com before reusing this script in a future cycle, they change
  year to year.
- `canonical.institution_requirements`: **271 rows, 271 distinct institutions** (was 268/268). Real
  schema is a flat ~50-typed-column table (`sat_policy`, `toefl_required`, `essays_required`, etc.), NOT
  a category/name/value EAV shape — don't assume otherwise from a future task description.
- **Undergrad GPA**: `canonical.institution_admissions.gpa_avg`, 428/8,280 populated (5.2%, unchanged
  this sprint — genuinely hard to source, see the audit doc §3). There is no `median_gpa_admitted`
  column anywhere; if a task references one, that's a stale/incorrect premise.
- **Masters track**: `canonical.masters_programs` — 510 programs, 74-ish institutions by name (112 by
  `canonical_institution_id`, which is now 321/510 populated, was 216/510). Only 21/510 rows have a real
  `program_url` — that's the actual ceiling on how much of this table can be deepened without a
  dedicated per-program URL-sourcing effort (a separate, large task, not a quick follow-up).
- **Known extraction gotcha**: linear PDF-text extraction of a CDS scrambles column-aligned tables (the
  GPA distribution table, the C7 requirements-importance checkboxes) — don't add extraction logic for
  those without verifying the label and its value stay adjacent in a real sample first. Also watch for
  rolling-admission schools whose CDS still carries a blank "Application closing date" label; the
  nearest nearby date is often the rolling-start date, not a real deadline (guarded in
  `commonDataSetDeadlines.js`, but the same trap could recur in any similar per-institution parser).

---

## Dead / Duplicate Code — Do Not Touch or Extend

**Removed 2026-07-08** (verified zero external references before deletion): `backend/archive/`
(2.9 MB, old SQLite-era code), `scraper/archive/` (84 KB), `backend/src/services/deadlineGenerator.js`
(builds objects but never persists — superseded by `deadlineAutoPopulationService.js`),
`src/pages/FinancialAid.tsx` (unrouted; `/financial-aid` still redirects to `/scholarships`).
`backend/db/migrations/` (1-file orphan), `backend/src/routes/search.js`,
`backend/src/services/intelligentSearch.js`, and the legacy `chancingService.js` were already
removed in PR #152 (2026-07-04) — this table previously listed them as still-present; that was stale.

| Path | Status |
|------|--------|
| `scraper/` | One of two parallel Python scraper trees. **Actively used** — 6 live workflows (`daily-data-refresh`, `global-data-refresh`, `india-weekly/monthly-refresh`, `uk-data-refresh`) call scripts under here, plus `scraper/masters/*` (masters track scrapers). |
| `scrapers/` | The other Python scraper tree. Used by only 2 workflows (`scrape-weekly.yml`, `scrape-monthly.yml`), both calling `scrapers/run_deadline_refresh.py`, which is **confirmed broken** (schema drift — writes to nonexistent `institution_requirements` columns, has a test-placeholder institution in its queue, `ScrapeDiagnostic.__init__()` arg bug — finds 0 deadlines). Consolidation decision needed: point those 2 workflows at `scraper/`'s working deadline adapter (`backend/src/scrapers/adapters/usOfficialDeadlines.js` via the #139 framework) and delete `scrapers/`, or fix `run_deadline_refresh.py` in place. Not done yet — touches live cron jobs, needs explicit sign-off before changing workflow YAML. |
| `backend/data/` | Large static data files. Do not grep/read in full. |
| `scholarships` vs `scholarships_new` (DB tables) | Duplicate schemas, 56 vs 36 rows, neither is canonical yet. Consolidation tracked in `docs/SCOPE_OF_WORK_2026-07.md` WS2. |

**Exclusion list — never grep these in full:**
`backend/data/`, `tmp/`, `node_modules/`

---

## Stale Documentation

- **`docs/TROUBLESHOOTING.md`** — SQLite-era. All instructions in it are wrong for the current PostgreSQL/Supabase stack. Do not follow its instructions. Do not delete yet. Do not trust it.

---

## Deployment & CI Status (corrected 2026-08-08 — the "Real Release Blocker" note below was stale)

**The GitHub Actions approval gate is CLEARED, not blocked.** Live workflow runs are scheduled and green
(`gh run list` shows `canonical-data-refresh`, `scorecard-refresh`, `deadlines-requirements-refresh`,
`masters-scraper-refresh`, `global-data-refresh`, `frontend-runtime-validation`, `onboarding-smoke` all
completing successfully on their schedules, not sitting in `action_required`). If you see a genuinely
stuck run, re-verify against `gh run list` before assuming this note — don't trust either version blind.

**The backend is deployed and live**: `https://collegeos.onrender.com/api/colleges/comprehensive/stats`
returns 200. Launch readiness is now a product-completeness question (deadline read path, admin
reachability, masters write path — see `docs/audits/` and memory `audit_full_app_2026-08-08`), not an
infrastructure-approval one.

---

## Files That Bypass `canonical.mv_college_cards` / Read Legacy Tables

The canonical frontend contract is `canonical.mv_college_cards`. This table previously said "4 files
bypass it" — that was stale. A 2026-08-08 grep for `FROM colleges`/`FROM colleges_full`/
`FROM college_admissions_stats` (excluding comments) found **23 backend files** still reading the legacy
model, not 4:

`jobs/dataRefresh.js`, `jobs/deadlineScrapingScheduler.js`, `jobs/mlRetraining.js`, `jobs/scraperScheduler.js`,
`models/Application.js`, `models/College.js`, `models/CollegeDeadline.js`, `models/Deadline.js`,
`models/Essay.js`, `routes/chancing.js`, `routes/colleges.js`, `routes/counsellor.js`, `routes/deadlines.js`,
`routes/insights.js`, `routes/signals.js`, `routes/tasks.js` *(archived 2026-08-08, see below)*,
`routes/timeline.js`, `services/collegeDeadlineIntelligenceService.js`, `services/dashboardService.js`,
`services/deadlineDependencyService.js`, `services/deadlineRiskService.js`,
`services/deadlineScrapingOrchestrator.js`, `services/notificationService.js`,
`services/timelineService.js`, `services/warningSystemService.js`,
`src/lib/collegeService.ts`, `backend/src/services/recommendation/recommendationPipelineService.js`.

**Runtime reality check before touching any of these**: three of the four legacy in-process cron jobs
(`dataRefresh.js`, `deadlineScrapingScheduler.js`, `scraperScheduler.js`, plus `jobs/orchestrator.js`)
only start if `ENABLE_LEGACY_SCRAPERS==='true'` (`backend/src/app.js`) — **unset in `render.yaml`, so they
do NOT run in production today**. `render.yaml` separately sets `ENABLE_SCRAPING_JOBS=false`, which is
**never read by any code** (only a stale comment references that name) — harmless today since both
resolve to "off," but a landmine if someone "fixes" the wrong variable expecting it to do something.
`mlRetraining.js` is the one job that DOES run live (gated on `NODE_ENV==='production'`, which is true).

Full legacy cutover (retiring `colleges`/`colleges_full`/`college_admissions_stats` and updating all 23
readers) is deliberately **not done** — it's its own phase, explicitly deferred as of 2026-08-08 to avoid
destabilizing the deadline path while masters is the flagship focus. Don't attempt it opportunistically.

Mitigation for the mv_college_cards drift specifically: card/list endpoints should be pinned to
`canonical.mv_college_cards` fields. Contract is enforced at startup via
`backend/src/utils/schemaContractChecker.js` and `src/contracts/frontendCollegeCardContract.ts`.

---

## 2026-08-08 Scope Cut — Archived Modules

To narrow the product to one loop (search institutions → calibrated admission chance → real upcoming
deadlines), the following were removed from `main` and preserved on
`archive/documents-tasks-admin-essays-2026-08-08` (full code + a JSON export of the live rows at cut time):

- **Admin dashboard** (`src/pages/AdminDashboard.tsx`, `backend/src/routes/admin.js`,
  `backend/src/services/scraperHealthService.js`) — deleted outright, not archived-with-data: it was
  unreachable in production (zero users have `role='admin'`, no nav link ever existed).
- **Documents** (`src/pages/Documents.tsx`, `backend/src/routes/documents.js`) and **Tasks**
  (`backend/src/routes/tasks.js`, `src/components/dashboard/TodaysTasks.tsx`) — archived with a full data
  export. `public.documents`/`public.tasks` tables were NOT dropped; only rows for two synthetic test
  accounts (`user_id` 401, 405) were purged (migration 158). A real user's rows were left untouched.
- **Essays page only** (`src/pages/Essays.tsx`) — the essay data model, `routes/essays.js`, and every
  service reading essay status as a chancing/profile-strength signal were explicitly KEPT. Essay status
  now surfaces inline in `ApplicationDetail.tsx` instead of a standalone editor page.
- **`ml_metadata`, `chance_me_posts`, `scraper_logs`, `scraper_run_logs`** — moved to the `archive` schema
  (migration 158, same `ALTER TABLE ... SET SCHEMA archive` pattern as `150_archive_schema_and_colleges_legacy.sql`).
  **`prediction_logs` was deliberately NOT touched** despite being on the original cut list — it's
  actively written/read by `routes/chancing.js` on every real chancing prediction (core loop); archiving
  it would break chancing, not remove dead weight.

---

## GitHub Actions Workflows Summary

The workflow table here previously listed `daily-data-refresh.yml`, `scrape-weekly.yml`,
`scrape-monthly.yml`, and `deadline-refresh-monthly.yml` — **none of these files exist anymore**. The
real, current set as of 2026-08-08:

| File | Trigger | Permissions |
|------|---------|-------------|
| `canonical-data-refresh.yml` | `schedule: 0 4 * * *`, `workflow_dispatch` | `contents: read` |
| `data-quality.yml` | `schedule: 0 6 * * 1`, `workflow_dispatch` | `contents: read` |
| `deadlines-requirements-refresh.yml` | `schedule: 0 6 * * 3`, `workflow_dispatch` | `contents: read` |
| `enrich-colleges.yml` | `workflow_dispatch`, `schedule: 0 2 * * 0` | `contents: read`, `actions: read`, `checks: read` |
| `frontend-runtime-validation.yml` | `pull_request`, `pull_request_target`, `workflow_dispatch` | `contents: read`, `actions: read`, `checks: read` |
| `global-data-refresh.yml` | `schedule: 0 3 * * 3`, `workflow_dispatch` | `contents: read` |
| `india-monthly-refresh.yml` | `schedule: 0 3 1 * *`, `workflow_dispatch` | `contents: read` |
| `india-weekly-refresh.yml` | `schedule: 0 2 * * 1`, `workflow_dispatch` | `contents: read` |
| `masters-scraper-refresh.yml` | `schedule: 0 6 * * 3`, `workflow_dispatch` | `contents: read` |
| `onboarding-smoke.yml` | `pull_request`, `pull_request_target`, `push`, `workflow_dispatch` | `contents: read`, `actions: read`, `checks: read` |
| `scorecard-refresh.yml` | `schedule: 30 4 * * *`, `workflow_dispatch` | `contents: read` |
| `scraper-enrich.yml` | `schedule: 0 5 * * 2`, `workflow_dispatch` | `contents: read` |
| `uk-data-refresh.yml` | `schedule: 0 4 15 * *`, `workflow_dispatch` | `contents: read` |

All workflows set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`. `masters-scraper-refresh.yml` runs
`scraper/masters/run_starter_ingest.py`, which by design never writes to the DB directly — it stages
`tmp/scrape_inserts.sql` for manual human review/apply. Nobody has ever applied one; this is the real
blocker on masters data freshness, tracked as a separate follow-up ("masters Phase 1: unblock the write
path"), not fixed in this pass.

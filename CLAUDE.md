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

## Real Release Blocker

GitHub Actions workflows are stuck in **`action_required`** state. This is a **pre-job platform approval gate** controlled in repo/org **Settings → Actions**, not a code or YAML issue.

**Do NOT attempt to fix this by editing workflow YAML files.** The YAML itself is correct. The approval gate must be cleared through the GitHub UI/Settings by a repo admin.

Affected workflows (all currently blocked): `frontend-runtime-validation.yml`, `onboarding-smoke.yml`, `daily-data-refresh.yml`, `enrich-colleges.yml`, and others.

Launch is **Conditional GO** once Actions approvals are cleared and a full green CI run completes with jobs actually executing.

---

## Files That Bypass `canonical.mv_college_cards`

The canonical frontend contract is `canonical.mv_college_cards`. These 4 files bypass it with direct `canonical.institution_*` table references and are tracked as drift vectors:

1. **`src/lib/collegeService.ts`** — joins 12 direct canonical tables (institutions, admissions, financials, outcomes, deadlines, requirements, rankings, demographics, campus_life, programs, completeness, quality_scores)
2. **`backend/src/routes/search.js`** — references `canonical.institution_programs`
3. **`backend/src/routes/colleges.js`** — references canonical.institutions, institution_completeness, institution_quality_scores, institution_admissions
4. **`backend/src/services/recommendation/recommendationPipelineService.js`** — references canonical.institution_programs, institution_rankings, institution_admissions

Mitigation: card/list endpoints should be pinned to `canonical.mv_college_cards` fields. Contract is enforced at startup via `backend/src/utils/schemaContractChecker.js` and `src/contracts/frontendCollegeCardContract.ts`.

---

## GitHub Actions Workflows Summary

| File | Trigger | Permissions |
|------|---------|-------------|
| `daily-data-refresh.yml` | `schedule: 0 3 * * *`, `workflow_dispatch` | `contents: read` |
| `scrape-weekly.yml` | `schedule: 0 4 * * 0`, `workflow_dispatch` | `contents: read` |
| `scrape-monthly.yml` | `schedule: 0 5 1 * *`, `workflow_dispatch` | `contents: read` |
| `deadline-refresh-monthly.yml` | `workflow_dispatch` only (legacy) | `contents: read` |
| `enrich-colleges.yml` | `schedule: 0 2 * * 0`, `workflow_dispatch` | `contents: read`, `actions: read`, `checks: read` |
| `frontend-runtime-validation.yml` | `push` (main/master/copilot/**), `pull_request`, `pull_request_target`, `workflow_dispatch` | `contents: read`, `actions: read`, `checks: read` |
| `onboarding-smoke.yml` | `push` (main/master/copilot/**), `pull_request`, `pull_request_target`, `workflow_dispatch` | `contents: read`, `actions: read`, `checks: read` |
| `india-weekly-refresh.yml` | `schedule: 0 2 * * 1`, `workflow_dispatch` | `contents: read` |
| `india-monthly-refresh.yml` | `schedule: 0 3 1 * *`, `workflow_dispatch` | `contents: read` |

All workflows set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`.

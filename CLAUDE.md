# CLAUDE.md — CollegeOS Project Memory

## Architecture Summary

CollegeOS is a college discovery and application intelligence platform with a React/TypeScript/Vite/TailwindCSS frontend (root `package.json`), a Node.js/Express backend (`backend/`), and PostgreSQL + Supabase + pgvector as the database layer. The canonical data schema lives in `canonical.*` views/MVs in Supabase; the primary frontend read contract is the materialized view `canonical.mv_college_cards`. A multi-stage recommendation pipeline (vector retrieval → ranking → diversification → explainability) is implemented entirely in `backend/src/services/recommendation/`. Python scrapers under `scrapers/` (canonical) handle deadline/requirements refresh via GitHub Actions workflows in `.github/workflows/`. All legacy Flask/FastAPI services have been removed; chancing lives in `backend/src/services/consolidatedChancingService.js`.

---

## Canonical Schema Status

- **Migration driver:** `backend/src/config/database.js` applies files from `backend/migrations/` (the canonical directory, ~98 SQL files, numbered up to 070+).
- **Migration state tracked in:** `migrations` table in PostgreSQL/Supabase.
- **Pending:** Migration `070_chancing_audit_log.sql` — creates `chancing_audit_log` table with indexes on `user_id` and `created_at DESC`. Must be applied in Supabase SQL editor or via `npm run migrate`.
- **Integer booleans:** `is_completed`, `is_active`, etc. are still `INTEGER` columns (not `BOOLEAN`). Frontend comparisons use `=== 1`, not `=== true`. Do not change without a coordinated migration + frontend update.
- **JSON TEXT columns:** `major_categories`, `academic_strengths`, `requirements`, etc. remain as `TEXT` with JS-side `JSON.parse()`. No current migration to `JSONB`.

---

## Dead / Duplicate Code — Do Not Touch or Extend

| Path | Status |
|------|--------|
| `backend/archive/` | Dead — old SQLite-era code, excluded from build. `better-sqlite3` references live here only. |
| `scraper/archive/` | Dead — archived scraper code. Do not extend. |
| `backend/db/migrations/` | **Orphan** — 1 file only; NOT the canonical migration path. Canonical is `backend/migrations/` (~98 files). |
| `scraper/` | One of two parallel Python scraper trees. The README references this one (`scraper/pipeline.py`, `scraper/requirements.txt`). |
| `scrapers/` | The other Python scraper tree. Do not add code to both trees — pick one and be explicit about which is active. |
| `backend/data/` | Large static data files. Do not grep/read in full. |

**Exclusion list — never grep these in full:**
`backend/data/`, `backend/archive/`, `scraper/archive/`, `tmp/`, `node_modules/`

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

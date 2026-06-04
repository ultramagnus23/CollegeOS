# Operational Hardening Report

## Workflow Audit Report
- Added preflight diagnostics and secret/script validation to all workflows under `.github/workflows`.
- Standardized `workflow-diagnostics/` artifact uploads with `if: always()`.
- Added workflow summary output for preflight checks.

## Scraper Audit Report
- Added canonical execution history table migration: `scripts/migrations/038_scraper_execution_history.sql`.
- Added execution history writes and dry-run/resume controls in:
  - `scrapers/run_deadline_refresh.py`
  - `scraper/pipeline.py`
  - `scraper/indian/pipelines/run_india_refresh.py`

## Field Coverage Report
- Added `scripts/field-coverage-analytics.js` to generate null percentages, source quality, stale detection, and per-country completeness outputs under `workflow-diagnostics/`.

## Ingestion Health Dashboard
- Added `GET /api/admin/scraper-health` in `backend/src/routes/admin.js`.

## Frontend Richness + Query Hardening
- Added section column contracts in `src/contracts/collegeContracts.ts`.
- Added section-based detail fetch support and cache TTL in `src/lib/collegeService.ts`.
- Removed wildcard selects in backend canonical completeness/quality queries.

## Performance Optimization Report
- Reduced wildcard read usage for canonical detail hydration.
- Added section-level fetch controls and short-lived detail caching.

## Unresolved Technical Debt
- Legacy mixed scraper stacks (`/scraper`, `/scrapers`) still need deeper normalization around shared retry taxonomy.
- Existing backend unit test baseline currently fails unrelated suites and needs separate remediation.
- Some historical workflow files referenced in problem statement are not present in current repository.

## Remaining Data-Gap Report
- Execute `npm run field-coverage-analytics` with Supabase env vars set.
- Review generated `workflow-diagnostics/field-coverage-report.json` for country-level null hotspots.

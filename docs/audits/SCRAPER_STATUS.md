# SCRAPER_STATUS.md

_Verified by running each scraper against the live DB on 2026-06-21/22._

## Headline

There are **two scraper generations**. Current code writes `canonical.*`; legacy code writes `colleges`/`colleges_comprehensive`. Only two scrapers genuinely work against the canonical schema. Coverage growth should extend the canonical framework, not revive the broken legacy stack.

## Status matrix

| Scraper | Target | Verdict | Evidence / root cause |
|---|---|---|---|
| `backend/scripts/refreshScorecard.js` | `canonical.institutions` (+admissions/financials) | ✅ WORKING | Fetched 127/200 real records, upserted 127; API key valid (MIT→0.0455); idempotent; refreshes MV |
| `backend/src/scrapers/adapters/usOfficialDeadlines.js` | `canonical.institution_deadlines` | ✅ WORKING | MIT + Notre Dame, 4 real rows, dates read live from official pages; skips JS/403/moved pages |
| `deadlineScrapingOrchestrator` (`testDeadlineScraper.js`) | canonical deadlines | ❌ BROKEN | fetches pages but finds 0 deadlines; writes to nonexistent `scraping_logs` table + `colleges.scraping_failures_count` column |
| `scrapers/run_deadline_refresh.py` (scrape-weekly) | canonical | ❌ BROKEN | schema drift (`institution_requirements` missing `requirement_category`/`requirement_name`), test placeholder `test.example.edu` in queue, `ScrapeDiagnostic.__init__()` arg bug |
| `scraper/pipeline.py` (daily-data-refresh) | `colleges_comprehensive` (legacy) | ⚠️ DEGRADED | Scorecard fetch works (~6,273); NCES download dead (HTTP error ×3); IPEDS skipped (no key); schema drift skips columns; writes legacy tables the app doesn't read |
| `backend/scripts/rankings/ingestRankings.js` | `canonical.institution_rankings` | ⚠️ GATED | file ingester (not live scraper); source `college_rankings_export.json` is commercial (QS/THE/US News) — excluded by primary+open-only policy |
| `backend/scripts/scrapers/*` (scorecard v4, admissions v3, ipedsbulk, …) | `colleges`/`colleges_comprehensive` | ⚠️ LEGACY | write the pre-canonical schema; superseded by `refreshScorecard.js` |
| `admissionOutcomeScraper.js` | `admission_outcomes` (0 rows) | ❓ UNTESTED | Reddit r/collegeresults + Scorecard; could seed real-ish ML labels; not run (Reddit rate-limits) |
| Essay scraper | — | ➖ N/A | none exists; no essay-prompt table |

## Success-gate (implemented)

`backend/src/scrapers/scraperFramework.js`: `runScraper` returns `success`, keyed on `inserted` (NEW rows). `updated` does **not** count — `ON CONFLICT DO UPDATE` reports an "update" even for byte-identical rows. `runScrapers()` throws if any adapter adds 0 new rows, so cron/CI exits non-zero instead of a hollow "success." (12 unit tests pass.)

> This is the foundation for the Phase 2 `SCRAPER_RUN_LOG` requirement: the per-run `{fetched, inserted, updated, skipped, rejected, success}` object already exists in-process; persisting it to a `scraper_run_log` table is the remaining step.

## GitHub Actions

Workflows exist (`daily-data-refresh.yml`, `scrape-weekly.yml`, `scrape-monthly.yml`, india + enrich) but are **gated in `action_required`** at the repo/org level — a platform approval gate, not a code issue. They do not run automatically until an admin clears it. (Per project memory; not fixable in code.)

## Recommendation

1. Persist run telemetry to a `scraper_run_log` table (Phase 2).
2. Extend the canonical framework with requirements + more deadline adapters (Phases 6–7).
3. Quarantine/remove the broken legacy scrapers and the dead Express search route (Phase 15).

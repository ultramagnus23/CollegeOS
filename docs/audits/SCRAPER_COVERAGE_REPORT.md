# SCRAPER_COVERAGE_REPORT.md

_Verified against the live DB on 2026-06-22. Coverage = distinct institutions with data ÷ 8,244 total institutions._

## Coverage by domain

| Domain | Institutions covered | Coverage % | Producing scraper | State |
|---|---:|---:|---|---|
| Programs | 5,024 | **60.9%** | (seeded / Scorecard) | OK |
| Recently refreshed (≤2 days) | 1,057 | 12.8% | `refreshScorecard.js` | ✅ working, rolling |
| Rankings | 329 | **4.0%** | `ingestRankings.js` (file) | QS+NIRF only; commercial gated |
| Requirements | 8 | **0.1%** | curated seed | ❌ no live scraper |
| Deadlines | 2 | **0.02%** | `usOfficialDeadlines.js` | ✅ works, tiny target list |

## Per-scraper attempted / resolved / updated / failed

Numbers below are from the verified runs this session.

**`refreshScorecard.js`** (College Scorecard → canonical) — ✅ working
- attempted: 200 · resolved (API returned data): 127 · upserted: 127 · no-data: 6 · errors: 0
- coverage mechanism: rolling oldest-N; ~6,200 US institutions refresh in ~a week at `--batch=1000`

**`usOfficialDeadlines.js`** (official pages → canonical deadlines) — ✅ works, narrow
- attempted: 2 targets (MIT, Notre Dame) · resolved: 2 · inserted: 4 deadlines · skipped (no parse): others
- coverage gated by a hand-verified target list; expanding it is per-school work (many .edu pages are JS-rendered / 403 / move URLs)

**`scraper/pipeline.py`** (daily refresh → legacy) — ⚠️ degraded
- Scorecard fetch: 6,273 · NCES: 0 (download dead) · IPEDS: skipped (no key) → 1/3 sources
- writes legacy `colleges_comprehensive` (schema drift; not read by the canonical app)

**`run_deadline_refresh.py`** / **`deadlineScrapingOrchestrator`** — ❌ broken (0 rows). See `SCRAPER_STATUS.md`.

## Why coverage is low (root causes)

1. **Only one canonical-writing scraper does volume** (`refreshScorecard.js`); it covers US Scorecard fields only.
2. **Deadlines/requirements have no volume scraper** — the canonical adapter works but ships a tiny verified target list; the legacy volume scrapers are broken on schema drift.
3. **Rankings** are policy-gated to open sources (QS+NIRF present; commercial excluded).
4. **Wikidata enrichment adapter** enriches very few institutions (the "5 colleges" concern) — needs expansion or replacement by the Scorecard/primary path.

## Missing telemetry (Phase 2 follow-up)

The framework already computes `{fetched, inserted, updated, skipped, rejected, success}` per run, but there is **no `scraper_run_log` table** persisting it. Adding that table is the remaining Phase-2 step so coverage/freshness is queryable over time rather than only in logs.

## What "good coverage" requires

- Run `refreshScorecard.js` on the daily rolling schedule (needs the scheduler / Actions gate cleared).
- Build the **requirements adapter** + **expand deadline targets** (UCAS open feed for UK + a curated, verified US/India set).
- Add NIRF/ARWU open-ranking adapters.
- Persist `scraper_run_log`.

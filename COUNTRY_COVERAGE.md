# COUNTRY_COVERAGE.md

_Verified against the live DB on 2026-06-22. This answers: "are non-US colleges being updated?" Honest answer: **no — only US.**_

## Institutions by country (8,244 total)

| Country | Institutions | Has acceptance_rate data |
|---|---:|---:|
| US | 6,237 | **3,794** |
| Germany (DE) | 366 | **0** |
| India (IN) | 326 | **0** |
| South Korea (KR) | 314 | **0** |
| France (FR) | 269 | **0** |
| Canada (CA) | 251 | **0** |
| UK (GB) | 118 | **0** |
| Australia (AU) | 82 | **0** |
| Switzerland / Ireland / Japan / Sweden … | ~250 | **0** |

**Every non-US country has ZERO admissions data.** ~2,000 non-US institutions exist as name-only shells.

## Why: only one volume scraper, and it's US-only

`refreshScorecard.js` (US Dept. of Education College Scorecard API) is the only working volume scraper. It cannot return non-US data. There is **no working scraper** populating admissions/financials for EU, India, Australia, UK, Korea, etc.

## India specifically (you asked about JEE / NIRF / NEET)

| Asset | State |
|---|---|
| India scraper (`scraper/indian/pipelines/run_india_refresh.py`) | **exists but is a no-op** — runs clean but scrapes 0 institutions (no targets configured; only a `shiksha.yaml` source); logs to `canonical.scraper_execution_history` which **doesn't exist** |
| `india_admission_criteria` / `jee_cutoffs` tables | **MISSING** |
| JEE opening/closing ranks, CUET, NEET cutoffs | **not in the system** |
| NIRF rankings | only **31** rows (NIRF publishes ~1,300 ranked institutions) |

So JEE ranking/preference, NEET-for-biology, and India admissions are **not covered** today.

## Honest fix plan (by addressability)

1. **India — most addressable** (open government data exists):
   - **NIRF** (nirfindia.org / data.gov.in) — rankings + underlying scores for ~1,300 institutions. Expand from 31.
   - **JoSAA** — JEE Advanced/Main opening & closing ranks per institute+branch (open, published yearly) → real JEE cutoff data.
   - **NEET/MCC** — medical counselling cutoffs (open).
   - Fix the India pipeline (create the missing log table or remove the reference; configure real targets).
2. **UK** — UCAS (deadlines) + HESA (some open stats); per-institution pages for the rest.
3. **EU / Australia** — no single open API like Scorecard. Germany (Hochschulkompass), Australia (no open admissions API) → per-country sourcing, slow.

## Bottom line

The app's data is **US-only** for anything beyond a name. This is the single biggest coverage gap. India is the highest-value + most-addressable next target (open NIRF + JoSAA data, and you're building for Indian students). EU/Australia admissions data has no easy open source and will stay sparse without licensed feeds.

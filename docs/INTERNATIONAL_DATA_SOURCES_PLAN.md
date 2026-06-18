# International (non-US) College Data Plan

US is handled: `refreshScorecard.js` pulls real College Scorecard data into the
canonical tables on a rolling weekly cycle (≈6,236 US institutions, keyed on the
IPEDS unit id). This plan extends the same pattern to the ~2,000 non-US institutions.

## Current non-US distribution (live, by country_code)

| Country | Count | Country | Count |
|---|---|---|---|
| DE Germany | 366 | IE Ireland | 65 |
| IN India | 319 | JP Japan | 38 |
| KR South Korea | 314 | SE Sweden | 36 |
| FR France | 269 | NZ New Zealand | 29 |
| CA Canada | 251 | SG Singapore | 26 |
| GB United Kingdom | 118 | HK Hong Kong | 1 |
| AU Australia | 82 | CH Switzerland | 70 |

~2,000 institutions, concentrated in DE, IN, KR, FR, CA, GB, AU.

## The bridge problem (this is the real work)

Scorecard works because every US institution carries an `ipeds` id in
`canonical_external_ids`. Non-US institutions have **no equivalent stable id** — the
`canonical_external_ids` jsonb has empty slots (`nirf`, `ucas`, `qs_ranking_id`).
So before any source can refresh them, we need a **stable join key per institution**.

**Plan:** add a universal id by matching name+country against:
- **ROR** (Research Organization Registry) — free API, global, returns a stable `ror` id, country, city, links, established year. → store as `canonical_external_ids.ror`.
- **Wikidata QID** — free SPARQL/REST, fallback + rich fields. → `canonical_external_ids.wikidata`.

A one-time `backfillExternalIds.js` (name+country → ROR/Wikidata) gives every non-US
institution a join key, after which the per-source adapters below are straightforward.

## Sources (tiered — official open data first, then rankings, then global fill)

Each adapter mirrors `refreshScorecard.js`: select N least-recently-updated
institutions in scope → fetch → map to canonical columns → upsert with
`source_attribution` (source, source_url, last_verified, confidence) → refresh MV.

### Tier 1 — official open datasets (Scorecard-equivalents)
| Region | Source | Type | Gives | Effort |
|---|---|---|---|---|
| UK (GB+IE ≈183) | **Discover Uni / HESA** Unistats dataset | Free bulk download | cost, outcomes, satisfaction, course data | Med |
| Europe (DE,FR,CH,SE… ≈740) | **ETER** (European Tertiary Education Register) | Free API/download | enrollment, staff, finance, location, type | Med |
| Australia (AU 82) | **QILT / ComparED** + Dept of Education HE stats | Free download | graduate outcomes, salaries, satisfaction | Med |
| India (IN 319) | **AISHE** (All India Survey on Higher Ed) | Free download | enrollment, programs | Med-High (matching) |

### Tier 2 — rankings (populate `institution_rankings`, all countries)
| Source | Slot | Notes |
|---|---|---|
| **QS World University Rankings** | `qs_ranking_id` | published lists; partial open data |
| **THE** | — | published lists (scrape/import) |
| **NIRF** (India) | `nirf` | annual gov rankings |
| **CWUR**, **Shanghai/ARWU** | — | published lists |

### Tier 3 — global profile fill (everything not covered above: KR, CA, JP, SG, NZ, HK…)
| Source | Type | Gives |
|---|---|---|
| **Wikidata** | Free SPARQL/REST | enrollment, founded, website, city, endowment, logo |
| **ROR / OpenAlex** | Free API | canonical name, country, city, research output (level proxy) |

### Deadlines & requirements (separate, harder — no clean APIs anywhere)
`institution_deadlines` / `institution_requirements` are empty for ALL countries
(including US — Scorecard doesn't carry them). These need dedicated scrapers:
Common App / Coalition (US), UCAS (UK, `ucas` slot), OUAC (Canada-Ontario),
JoSAA/CSAB (India), official admissions pages. This is the keystone for essays/
timeline feeling "real" and should be its own workstream.

## Rollout priority (by coverage × data availability)

1. **`backfillExternalIds.js`** — ROR/Wikidata join keys for all non-US (unblocks everything).
2. **Europe via ETER** (~740, biggest single win) → adapter + weekly workflow.
3. **UK via Discover Uni** (~183).
4. **Global Wikidata fill** (~all remaining: KR/CA/AU/JP/SG/NZ — basic profile + enrollment + website + logo).
5. **India via AISHE + NIRF**.
6. **Rankings importer** (QS/THE/NIRF/CWUR → `institution_rankings`).
7. **Deadlines/requirements scrapers** (separate workstream; gates essays/timeline).

## Automation

One workflow per source, staggered, same shape as `scorecard-refresh.yml`
(daily/weekly cron + `workflow_dispatch`, `SUPABASE_DB_URL` secret, rolling
least-recently-updated batches). All Actions are currently behind the repo's
approval gate; every adapter is runnable immediately via `npm run` / server cron
in the meantime.

## Realism notes
- ETER/Discover Uni/AISHE/QILT are bulk **downloads**, not live REST like Scorecard — the adapter ingests a cached dataset file refreshed periodically, not per-request.
- QS/THE rankings are **licensed**; use published/open lists, store provenance.
- Name→institution matching for non-US is the main accuracy risk; the ROR/Wikidata id backfill (step 1) is what makes the rest reliable.
- No fabricated values anywhere: every field carries `source_attribution`.

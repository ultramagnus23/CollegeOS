# Scraper Architecture — CollegeOS (Phase 8)

**Generated:** 2026-06-18
**Companion to:** `database_quality_report.md`, `missing_data_report.md`
**Goal:** A layered, provenance-tracked, never-overwrite ingestion pipeline that fills the genuine data gaps (deadlines, requirements, 30+ majors) without destroying verified data.

---

## 1. Guiding principle

Every scraper writes **facts with provenance**, never bare values. A fact is:
`(institution_id, field, value, source_tier, source_url, confidence, observed_at)`.
The conflict resolver — not the scraper — decides which fact wins. Higher-tier / higher-confidence / fresher data is never overwritten by a lower one.

This is already half-built: the canonical schema carries `source_attribution`, `source_priority` (1–6), `verification_status`, and the `canonical.source_tier` enum; the `scrapers/` tree already has source scoring + conflict resolution. Phase 8 is about **consolidating** the two trees onto this model and **populating** the empty provenance tables, not a rewrite.

---

## 2. Current state (what exists today)

### Two parallel Python trees (must consolidate — Phase 12)

| Tree | Role | Key modules | Status |
|---|---|---|---|
| **`scraper/`** | Bulk dataset ingestion (the source of today's 8,236 institutions) | `sources/ipeds.py`, `sources/scorecard.py`, `sources/collegedata_csv.py`, `ipeds/build_majors.py`, `ipeds/build_college_majors.py`, `parsers/{us,india,europe}.py`, `orchestrator.py`, `pipeline.py` | Active; feeds legacy `public.*` |
| **`scrapers/`** | Per-field refresh framework (deadlines/requirements) | `adapters/{base,http}_adapter.py`, `parsers/{deadline,requirements}_parser.py`, `source_scoring/scorer.py`, `conflict_resolution/resolver.py`, `validators/payload_validator.py`, `schedulers/runner.py` | Framework ready; **not yet populating canonical** |

**Recommendation:** keep **`scrapers/`** as the canonical framework (it has scoring + conflict resolution + validators) and fold `scraper/sources/*` into it as **Tier adapters**. Retire `scraper/` once its IPEDS/Scorecard sources are ported. Do not extend both.

### Provenance tables (exist, all currently EMPTY — Phase 8 must populate)

| Table | Purpose |
|---|---|
| `canonical.institution_sources` | One row per (institution, fact, source) — `source_tier`, `source_priority`, `source_url`, `source_payload` |
| `canonical.institution_source_registry` | Crawl targets: `source_url`, `source_domain`, `parser_strategy`, `crawl_frequency_days`, `is_active` |
| `canonical.source_reliability` | Feedback loop: `trust_score`, `extraction_accuracy`, `freshness_score`, `conflict_rate` per `source_key` |
| `canonical.scraper_runs` / `scraper_failures` | Run telemetry: counts, timing, per-institution failures |
| `canonical.institution_identity_map` | Entity resolution: external id ↔ `institution_id` (already populated, 8,329 rows) |

---

## 3. The 6-tier source hierarchy

Maps Phase 8's tiers onto the existing `canonical.source_tier` enum and `source_priority` (1 = most trusted … 6 = least). **Community/manual never overwrites verified data.**

| Priority | `source_tier` enum | Phase 8 tier | Sources | Populates | Existing module |
|---:|---|---|---|---|---|
| 1 | `government_dataset` | Tier 2/3 | **IPEDS**, **College Scorecard** | admissions, financials, outcomes, demographics, programs | `scraper/sources/ipeds.py`, `scorecard.py` |
| 2 | `official_institution_data` | Tier 1 | University `.edu`/`.ac.uk` sites | deadlines, requirements, essays, tuition | `scrapers/adapters/http_adapter.py` + parsers |
| 3 | `common_data_set` | Tier 4 | CDS PDFs | requirements, admit rates, SAT/ACT, deadlines | *(to build — CDS parser)* |
| 4 | `verified_import` | — | Curated bulk CSVs | bootstrap import | `scraper/sources/collegedata_csv.py` |
| 5 | `scraped_third_party` | Tier 5 | **QS, THE, US News** | rankings | *(rankings adapter — extend 096 source)* |
| 6 | `inferred_generated` | Tier 6 | AI/heuristic estimates | last-resort gap fill, flagged | `scraper/fill_missing.py` |

`source_scoring/scorer.py` already implements the trust function: `.edu`/`.ac.uk` → 1.0 (official), `.gov` → 0.9 (government), commonapp/ucas → 0.82 (aggregator), else 0.65 (community), blended with parser confidence and a 365-day freshness decay.

---

## 4. Unified scraper contract

Every adapter, regardless of tier, MUST:

1. **Resolve identity** via `canonical.institution_identity_map` (never invent `institution_id`).
2. **Emit facts**, not rows: `{institution_id, field, value, source_tier, source_url, confidence, observed_at}`.
3. **Upsert idempotently** — `ON CONFLICT` on the table's natural key; **never** blind `INSERT`/`UPDATE`.
4. **Stamp provenance** into `source_attribution` (per-field) and append a row to `canonical.institution_sources`.
5. **Respect precedence** — only overwrite an existing value when
   `(new.source_priority, new.confidence, new.observed_at)` outranks the stored one (see §5).
6. **Record the run** in `canonical.scraper_runs`; per-institution errors in `scraper_failures`.

This contract is exactly what migrations `094`–`101` already follow (idempotent upserts, `source_attribution` with `source`/`confidence`/`last_verified_at`, never-overwrite via `COALESCE` / `ON CONFLICT DO NOTHING`) — they are the SQL-side reference implementation.

---

## 5. Conflict resolution & never-overwrite

`conflict_resolution/resolver.py` ranks duplicate facts by
`rank = source_priority*0.5 + confidence*0.4 + freshness*0.1` and keeps the max.

Promote this to a **DB-enforced precedence** so even a buggy scraper cannot clobber verified data:

```
write value ONLY IF
  incoming.source_priority < stored.source_priority          -- more trusted tier
  OR (equal tier AND incoming.confidence > stored.confidence)
  OR (equal tier AND confidence AND incoming.observed_at > stored.observed_at)
  OR stored value IS NULL                                     -- gap fill always allowed
```

`canonical.source_reliability` closes the loop: when sources disagree, increment the loser's `conflict_rate` and decay its `trust_score`, so chronically-wrong sources lose precedence over time.

---

## 6. Run telemetry & scheduling

- **`scraper_runs`** — one row per execution: `scraper_name`, `scraper_version`, `institutions_processed`, `successful_count`, `failed_count`, timing. Powers the Phase 9 quality trend.
- **`scraper_failures`** — per-institution failure detail for retry.
- **Cadence** (from `institution_source_registry.crawl_frequency_days`):
  - government datasets (IPEDS/Scorecard): annual + on-release
  - official sites (deadlines/requirements): monthly in cycle, weekly Aug–Jan
  - rankings: annual on publication
- GitHub Actions already define `daily-data-refresh`, `scrape-weekly`, `scrape-monthly`, plus the new `data-quality.yml`. (All gated by the repo Actions approval — see `CLAUDE.md`.)

---

## 7. Build priorities (mapped to the real gaps)

Ordered by launch impact, from `missing_data_report.md` §9:

1. **Deadlines** (Tier 2, `official_institution_data`) — `scrapers/parsers/deadline_parser.py` → `canonical.institution_deadlines`. 100% missing today. CommonApp + official sites. Highest user-facing gap.
2. **Requirements** (Tier 2/3) — `scrapers/parsers/requirements_parser.py` + a **CDS parser** → `canonical.institution_requirements`. 100% missing.
3. **30+ majors** (Tier 1/2) — extend the majors loader to ingest `public.college_programs` (19,049 granular names) and live `.edu` program catalogs, since IPEDS CIP (37 categories) caps at ~8.7 majors/college.
4. **Rankings breadth** (Tier 5) — add **THE** and **US News** adapters; today only QS + NIRF exist (335 rows). Write through the same path as migration 096.
5. **Field gaps in populated tables** (Tier 1/3) — `acceptance_rate` (69% null), SAT/ACT (~83% null), `avg_financial_aid` (no source) → Scorecard + CDS.

---

## 8. Definition of done (per source)

A source adapter is "launch-ready" when:
- it resolves ≥95% of its targets via `institution_identity_map`,
- every written fact has `source_tier` + `source_url` + `confidence` + `observed_at`,
- re-running it is a no-op (idempotent),
- it records a `scraper_runs` row, and
- the Phase 9 `fn_data_quality_issues()` scan shows the targeted gap shrinking with **zero new impossible-value rows**.

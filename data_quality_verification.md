# Data Quality Verification — CollegeOS

**Generated:** 2026-06-18
**Method:** Loaded the **complete** `supabase_dump.sql` (all 179 tables, real data) into a throwaway PostgreSQL 18 instance, applied migrations `094`–`102` via the production runner (`runMigrations.js`), then scanned all **8,236 institutions** with the Phase 9 engine.
**Verdict:** **Materially improved, not yet "top quality."** The frontend now renders; several 100%-NULL fields are filled; the completeness engine no longer lies. Real gaps remain (deadlines, requirements, acceptance_rate) that require *sourcing*, not backfill.

---

## Before → After (full 8,236-institution dataset)

| Metric | Before (dump) | After (094–102) |
|---|---:|---:|
| `mv_college_cards` usable rows | **0** (`WITH NO DATA`) | **8,236** |
| cards with `global_rank` | 0 | 298 |
| `institution_programs` | 0 | **43,613** (5,024 institutions) |
| `institution_rankings` | 0 | 335 |
| `institution_demographics` | 0 | 6,232 |
| `institution_campus_life` | 0 | 8,236 |
| `outcomes.graduation_rate_4yr` filled | 0% | **100%** (6,061/6,061) |
| `outcomes.employment_rate` filled | 0% | **100%** |
| `outcomes.retention_rate` filled | 0% | **100%** |
| `financials.net_price_low_income` filled | 0% | 4,842/6,236 |
| `financials.avg_debt` filled | 76.3% | 4,763/6,236 |
| **Impossible values** (out-of-range) | n/a | **0** ✅ |

### Completeness engine (M1) — now honest

| Domain | Before | After |
|---|---:|---:|
| **overall_score** | **75.7** (inflated — counted only admissions+financials) | **30.1** (all 8 domains) |
| outcomes_score | 0.0 (despite 6,061 rows) | 48.6 |
| demographics_score | 0.0 | 75.7 |
| programs_score | 0.0 | 17.6 |
| rankings_score | 0.0 | 4.0 |

> The overall score **dropping** from 75.7 → 30.1 is the fix working, not a regression: the old engine ignored 6 domains and reported a falsely high number. 30.1 is the truthful figure with deadlines/requirements still empty.

---

## What is now launch-quality ✅
- College cards render from the canonical contract (were blank).
- Majors, rankings, demographics, campus-life, and outcomes are populated and scale-correct (rates 0–100, no out-of-range values).
- All writes carry provenance (`source_attribution` with source/confidence/last_verified) and are idempotent.
- Completeness scoring is honest and per-domain; a daily quality scan exists.

## What is NOT yet top quality ❌ (tracked, needs sourcing — Phases 4–8)
| Gap | Scale | Path |
|---|---|---|
| **Deadlines** | 100% missing (8,236) | Tier-1/2 scrape → `institution_deadlines` |
| **Requirements / essays** | 100% missing | CDS + official sites |
| **acceptance_rate** | 69% NULL (source sparsity, both schemas) | Scorecard/CDS |
| **SAT/ACT** | ~83% NULL | Scorecard/CDS |
| **30+ majors/college** | ~8.7 today (37-CIP cap) | ingest `college_programs` (19,049) |
| **avg_financial_aid** | no source (column empty) | Scorecard/IPEDS |
| **rankings breadth** | QS/NIRF only | add THE + US News |
| **3,212 institutions** | no majors at all | source coverage |

---

## How this was validated (reproducible)
1. `iconv -f UTF-16LE` the dump → UTF-8; load full dump into local PG 18 (0 canonical/public load errors).
2. `runMigrations.js` applied 094–102 (recorded in `migrations` table; 001–093 already applied on prod).
3. `fn_data_quality_issues()` scan + `dataQualityReport.js` → `daily_data_quality_report.md`.
4. Verified: row counts, field-fill %, value ranges, completeness recompute, zero impossible values.

**Production note:** these migrations were verified against a *copy* of prod, not applied to the live Supabase DB (no destructive operations; `REFRESH MATERIALIZED VIEW` is non-concurrent and briefly locks card reads). Apply on prod via `npm run migrate`.

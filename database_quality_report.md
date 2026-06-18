# Database Quality Report — CollegeOS

**Generated:** 2026-06-18
**Source of truth:** `supabase_dump.sql` (pg_dump of PostgreSQL 17.6, dumped 2026-06-18 14:08)
**Scope:** Phase 1 — Full Database Audit
**Schemas in scope:** `canonical` (46 tables), `public` (98 tables). Supabase system schemas (`auth`, `storage`, `realtime`, `graphql`, `vault`, `pgbouncer`, `supabase_migrations`) are out of scope.

---

## TL;DR

The schema design is sound — `canonical.*` already carries provenance (`source_attribution`, `source_priority`, `confidence`/`completeness_score`, `verification_status`, `updated_at`). **The problem is population, not structure.**

The canonical migration moved **only 7 of ~20 satellite tables**. The frontend's contract view joins tables that are **completely empty**, and the contract view itself has **never been refreshed**. As a result, college cards built from the canonical layer would render almost entirely blank, even though the underlying data exists in the legacy `public` schema (e.g. 184,800 major rows) or is genuinely absent (deadlines, requirements, essays — zero rows anywhere).

**There are 3 launch-blocking HIGH findings. Fix these before anything else.**

---

## Row-count census (key tables)

| Domain | Legacy `public` (rows) | Canonical `canonical` (rows) | Verdict |
|---|---|---|---|
| Institutions / colleges | `colleges` 5,333; `colleges_comprehensive` 8,330; `colleges_legacy` 6,207 | `institutions` **8,236** | Canonical populated ✅ |
| Admissions | `college_admissions` 6,327 | `institution_admissions` **6,236** | Populated, but field-sparse ⚠️ |
| Financials | `cost_of_attendance` 6,387; `college_financial_data` 6,327 | `institution_financials` **6,236** | Populated, but field-sparse ⚠️ |
| Outcomes | `academic_outcomes` 6,149; `career_outcomes_detail` 8,330 | `institution_outcomes` **6,061** | Populated, but field-sparse ⚠️ |
| **Majors / programs** | `college_majors` **184,800**; `college_programs` 19,049; `majors` 37 | `institution_programs` **0**; `major_ontology` **0** | **NOT migrated** ❌ |
| **Rankings** | `college_rankings` 748 | `institution_rankings` **0** | **NOT migrated** ❌ |
| **Demographics** | `student_demographics` 6,323 | `institution_demographics` **0** | **NOT migrated** ❌ |
| **Campus life** | `campus_life` 8,552 | `institution_campus_life` **0** | **NOT migrated** ❌ |
| **Quality scores** | — | `institution_quality_scores` **0** | Empty ❌ |
| **Deadlines** | `deadlines` 0; `college_deadlines` 0; `application_deadlines` 0; `deadline_history` 0 | `institution_deadlines` **0** | **No data anywhere** ❌ |
| **Requirements** | `college_requirements` 0; `course_requirements` 0 | `institution_requirements` **0** | **No data anywhere** ❌ |
| **Essays** | `essays` 0; `essay_examples` 0 | (n/a) | **No data anywhere** ❌ |
| Completeness | — | `institution_completeness` **8,236** | Populated but mis-scored ⚠️ |

---

# HIGH SEVERITY (launch blockers — fix first)

### H1 — The frontend contract MV is empty: `canonical.mv_college_cards` is `WITH NO DATA`

`canonical.mv_college_cards` is a **materialized view created `WITH NO DATA`** and there is **no `COPY` block for it in the dump** — confirming it has never been refreshed. Per `CLAUDE.md`, this MV is *the* primary frontend read contract. Until `REFRESH MATERIALIZED VIEW canonical.mv_college_cards;` runs, **every card-list/discovery query against the canonical contract returns zero rows.**

- **Impact:** Discovery page, search results, and any card grid sourced from the contract are blank.
- **Fix:** Refresh the MV (after H2/H3 so it refreshes with real data), and add a populated-row-count assertion to the startup `canonical MV health` check rather than just existence.
- **Evidence:** definition ends `... WHERE (i.canonical_name IS NOT NULL) WITH NO DATA;`

### H2 — Canonical satellite tables the cards depend on are empty (incomplete migration)

The card/detail contract reads from canonical satellite tables, but **7 of them are empty** while their legacy `public` equivalents are populated. The migration `public → canonical` was never completed for:

| Empty canonical table | Data lives in (legacy) | Rows available |
|---|---|---|
| `institution_programs` | `public.college_majors` / `college_programs` | **184,800 / 19,049** |
| `major_ontology` | `public.majors` | 37 |
| `institution_rankings` | `public.college_rankings` | 748 |
| `institution_demographics` | `public.student_demographics` | 6,323 |
| `institution_campus_life` | `public.campus_life` | 8,552 |
| `institution_quality_scores` | — (never computed) | 0 |
| `institution_search_index` | — (never built) | 0 |

- **Impact:** Cards show no majors, no rank, no demographics, no campus life. `mv_college_cards` joins `institution_rankings` for `global_rank` → **always NULL**. Directly blocks Phase 3, 4, and 10.
- **Fix:** Backfill these canonical tables from the legacy `public` sources first (Phase 3 rule: "backfill from existing tables first"), mapping `public.colleges.canonical_institution_id` / `canonical.institution_identity_map` (8,329 rows) for the ID bridge. Use upserts, set `source`/`confidence`, never overwrite higher-confidence rows.

### H3 — Populated canonical tables are field-sparse on the exact card fields

Even the migrated tables are missing the highest-value card fields. % NULL on populated canonical rows:

| Table | Field (card-critical) | % NULL |
|---|---|---|
| `institution_outcomes` | `graduation_rate_4yr` | **100%** |
| `institution_outcomes` | `employment_rate` | **100%** |
| `institution_outcomes` | `retention_rate` | **100%** |
| `institution_financials` | `avg_financial_aid` | **100%** |
| `institution_financials` | `net_price_low/mid/high_income` | **100%** |
| `institution_financials` | `cost_of_attendance` | 49.7% |
| `institution_financials` | `tuition_*` | ~41% |
| `institution_admissions` | `acceptance_rate` | 68.9% |
| `institution_admissions` | `sat_50` / `act_50` | 80.7% / 85.0% |
| `institution_admissions` | ED/EA/RD/yield/volume rates | **100%** |
| `institutions` | `description` (col) | 100% (MV reads `metadata->>'description'` instead) |
| `institutions` | `logo_url` | 94.1% |

- **Impact:** `mv_college_cards` exposes `graduation_rate_4yr`, `employment_rate`, `avg_financial_aid`, and `global_rank` that are **always NULL** even after a refresh. Violates Phase 10 "no placeholder values / never leave cards empty."
- **Note on acceptance_rate:** 68.9% NULL appears in **both** `canonical` and `public.college_admissions` (66% in `public.colleges`) — this is genuine source sparsity (IPEDS universe includes many non-reporting / sub-baccalaureate institutions), **not** a migration loss. Backfilling won't fix it; sourcing (Scorecard/CDS) will.
- **Fix:** Re-run the canonical loaders mapping the fields that *do* exist in legacy (`public.academic_outcomes.graduation_rate` → `graduation_rate_4yr`/`6yr`; `public.cost_of_attendance` breakdown → `net_price_*`/`avg_financial_aid`). Then close residual gaps via Phase 5/6 sourcing.

---

# MEDIUM SEVERITY

### M1 — Completeness engine is broken and inflates its own score
`institution_completeness` (8,236 rows) computes `overall_score` from **only** `admissions_score` + `financials_score`. Self-reported means:

```
admissions_score   mean 75.72  (75.7% nonzero)
financials_score   mean 75.72  (75.7% nonzero)
outcomes_score     mean  0.00  (0% nonzero)   ← despite 6,061 outcome rows existing
rankings_score     mean  0.00
programs_score     mean  0.00
demographics_score mean  0.00
requirements_score mean  0.00
deadlines_score    mean  0.00
overall_score      mean 75.72                 ← misleadingly high
```
The engine reports **75.7% complete** while ignoring outcomes (which has data) and 5 empty domains. Any dashboard or gate trusting `overall_score`/`completeness_score` is being misled. **Fix:** recompute all 8 sub-scores and make `overall_score` a weighted blend across them.

### M2 — Massive duplicate "colleges" surface (tables + views)
The `public` schema carries **3 college tables** (`colleges` 5,333, `colleges_comprehensive` 8,330, `colleges_legacy` 6,207) and **5 college views** (`clean_colleges`, `colleges_canonical`, `colleges_full`, `colleges_public`, `mv_college_cards`) — all conceptually the same entity, now superseded by `canonical.institutions`. Row counts disagree (5,333 vs 8,330 vs 8,236), so they are **not** in sync. This is the core "duplicate tables / duplicate schemas" finding for Phase 12. **Fix (Phase 12):** designate `canonical.institutions` + `mv_college_cards` as sole source; reduce `public.*` college objects to thin compatibility views or drop after consumers are migrated. Do not drop until the 4 drift-vector files in `CLAUDE.md` are repointed.

### M3 — Two `mv_college_cards`, only one materialized, neither populated
`canonical.mv_college_cards` is a **materialized** view (`WITH NO DATA`); `public.mv_college_cards` is a **plain** view. Having both under the contract name is an ambiguity/drift risk — code may read either. **Fix:** pick one (canonical), make the other a redirect or remove it.

### M4 — Per-domain deadline/requirement fragmentation (many empty parallel tables)
Deadlines are spread across **6 empty tables** (`deadlines`, `college_deadlines`, `application_deadlines`, `deadline_history`, `deadline_alerts`, `user_deadlines`) plus `canonical.institution_deadlines`. Requirements across `college_requirements` + `course_requirements` + `canonical.institution_requirements`. All zero rows. This is both a **data gap** (see H-adjacent / Phase 6) and a **leanness** problem (Phase 12) — consolidate to one canonical table per domain before populating.

### M5 — Field-sparsity in `institutions` identity columns
`short_name` 100% NULL, `address` 100%, `control_type` 73.2%, `established_year` 78.5%, `postal_code` 64.5%, `logo_url` 94.1%, `latitude`/`longitude` 12.7%. These feed card chrome and filters. **Fix:** backfill from IPEDS (control_type, established_year, address, lat/long are all IPEDS Directory fields) — high-confidence, single-source.

---

# LOW SEVERITY

### L1 — `CLAUDE.md` migration note is stale
`CLAUDE.md` says migration `070_chancing_audit_log.sql` is "pending." The applied-migrations log shows the chain has progressed to `093_deadlines_essays_columns.sql` (applied 2026-06-17). `chancing_audit_log` exists with 56 rows. Update `CLAUDE.md`.

### L2 — Gaps in `public.migrations` id sequence
Applied-migration `id` jumps 70 → 75 (ids 71–74 absent), and filename order is non-monotonic (090 applied after 091/092/093). Cosmetic, but verify no migration was silently skipped vs. merely re-numbered.

### L3 — Two parallel Python scraper trees persist
`scraper/` and `scrapers/` both exist (per `CLAUDE.md`). Not a DB issue but a Phase 8/12 leanness item — pick one tree before the scraper refactor.

### L4 — `academic_year` / generated-key columns 100% NULL but harmless
`institution_financials.academic_year` is 100% NULL (only `data_year` is set); the `*_key` generated columns then default to `'n/a'`/`-1`. Functional, but the dedup keys lose resolution. Low priority.

---

## What's already good (do not "fix")

- **Provenance is built in.** `canonical.*` satellite tables carry `source_attribution jsonb`, `raw_payload jsonb`, `source_priority` (1–6, IPEDS→manual), `verification_status`, `completeness_score`, `created_at`/`updated_at`. Phase 2's "add provenance everywhere" is **structurally already done** for canonical — the work is *populating* it per-row, not adding columns.
- **CHECK constraints exist** for impossible values (`completeness_score` 0–100, `established_year` 1000–now+10, `source_priority` 1–6). Phase 9's validation has a foundation.
- **FK integrity:** 160 FK constraints in the dump; 35 reference `institution_id`. Referential structure is in place.
- **ID bridge exists:** `canonical.institution_identity_map` (8,329) + `public.colleges.canonical_institution_id` give a clean path for backfilling legacy → canonical.

---

## Recommended execution order (HIGH first)

1. **H2** — Backfill empty canonical satellites (`institution_programs`, `rankings`, `demographics`, `campus_life`, `major_ontology`) from legacy `public` via the identity map. *(Phase 3/4)*
2. **H3** — Re-map sparse fields in `outcomes`/`financials`/`admissions` from legacy sources. *(Phase 3/5)*
3. **H1** — `REFRESH MATERIALIZED VIEW canonical.mv_college_cards` + add populated-count startup assertion.
4. **M1** — Fix the completeness engine to score all 8 domains.
5. **M2/M3/M4** — Consolidate duplicate college objects and deadline/requirement tables. *(Phase 12)*
6. Source genuinely-absent domains: **deadlines** (Phase 6), **requirements/essays** (Phase 7) — zero rows anywhere, must be scraped/sourced, not backfilled.

---

## Deliverables status

| Output | Status |
|---|---|
| `database_quality_report.md` | ✅ this file |
| `missing_data_report.md` | ⏳ next (field-level gap matrix per college) |
| `scraper_architecture.md` | ⏳ Phase 8 |
| SQL migrations | ⏳ to follow per HIGH item |
| Launch blockers | ✅ H1, H2, H3 above |
| Remaining data gaps | ✅ summarized; detailed in `missing_data_report.md` |

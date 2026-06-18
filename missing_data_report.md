# Missing Data Report — CollegeOS

**Generated:** 2026-06-18
**Source of truth:** `supabase_dump.sql`
**Companion to:** `database_quality_report.md` (Phase 1 audit)
**Purpose:** Field-level gap matrix + the exact source→target column mapping used by the H2/H3 backfill migrations (`backend/migrations/094`–`099`).

---

## 1. The ID bridge (used by every backfill)

Legacy satellite tables key to `public.colleges_comprehensive(id)` (integer, 8,330 rows) — **not** `public.colleges`. The bridge to the canonical UUID is:

```
public.<legacy_satellite>.college_id  (int)
   └─ = public.colleges_comprehensive.id
        └─ canonical.institution_identity_map.source_pk   (text, source_table='public.colleges_comprehensive')
             └─ canonical.institution_identity_map.institution_id  (uuid)
                  └─ = canonical.institutions.id
```

Canonical join snippet (reused in all migrations):

```sql
JOIN canonical.institution_identity_map idm
  ON idm.source_table = 'public.colleges_comprehensive'
 AND idm.source_pk    = legacy.college_id::text
 AND idm.is_canonical_match = true
-- idm.institution_id is the canonical FK
```

`institution_identity_map` has 8,329 rows (≈ 1:1 with `colleges_comprehensive`), so coverage of the bridge itself is ~100%.

---

## 2. Backfill coverage summary (what H2 recovers)

| Canonical target (currently 0 rows) | Legacy source | Rows recoverable | Card/feature unblocked |
|---|---|---|---|
| `institution_programs` | `college_majors` ⋈ `majors` | **184,800** | Top majors, majors list (Phase 4/10) |
| `major_ontology` | `majors` | 37 (seed) | Major normalization (Phase 4) |
| `institution_rankings` | `college_rankings` | 748 (628 QS + 120 NIRF) | `global_rank` on card / Rankings page |
| `institution_demographics` | `student_demographics` | 6,323 | International %, diversity (Phase 10) |
| `institution_campus_life` | `campus_life` | 8,552 (partial — see §6) | Housing, setting (partial) |

After these run + `REFRESH MATERIALIZED VIEW canonical.mv_college_cards`, the canonical contract goes from **0 usable card rows** to ~8,236 with majors, rank, and demographics attached.

---

## 3. `institution_programs` ← `college_majors` ⋈ `majors`

Source `college_majors` (184,800 rows) is uniformly `awlevel = 6` (undergraduate program offerings); joins `majors` (37 CIP-coded canonical majors) on `major_id`.

| Target column | Source expression | Notes |
|---|---|---|
| `institution_id` | via identity bridge | |
| `program_name` | `majors.name` | |
| `normalized_program_name` | `lower(regexp_replace(majors.name,'[^a-z0-9]','','gi'))` | NOT NULL |
| `degree_type` | `'Bachelor'` | awlevel uniformly 6 = undergrad; raw code kept in `metadata` |
| `field_category` | `majors.broad_category` | |
| `enrollment` | `college_majors.completions_count` | IPEDS completions as proxy |
| `metadata` | `{cip_code, is_stem, awlevel, completions_pct}` | preserves STEM flag (Phase 4) |
| `source_attribution` | `{source:'IPEDS', confidence:0.9, last_verified_at}` | tier-2 source |

**Idempotency:** add `UNIQUE(institution_id, normalized_program_name, degree_type_key)`; `ON CONFLICT DO NOTHING`.
**Verified result (local run on real data):** 184,800 source rows → **43,613 distinct programs across 5,024 institutions (~8.7 majors each)**. The other 3,212 institutions have no `college_majors` data (flagged `missing_majors` by the Phase 9 engine).
**Residual gap — Phase 4 "30+ majors" NOT met from this source:** `public.majors` has only **37 CIP categories**, so per-college distinct majors caps low. Hitting 30+ requires the granular `public.college_programs` (19,049 rows, free-text names) or external sourcing — a follow-up, not part of migration 094.
**Residual gap:** `acceptance_rate` per program — not in source (genuine gap, Phase 5).

---

## 4. `major_ontology` ← `majors` (seed)

Seeds the alias→canonical map with 37 identity rows so university-specific names can later resolve.

| Target | Source | Notes |
|---|---|---|
| `id` | `MAX(id)+row_number()` | bigint, no sequence default |
| `canonical_major` | `majors.name` | |
| `alias` | `majors.name` | identity alias (base layer) |
| `parent_major` | `majors.broad_category` | |
| `confidence` | `0.9` | |

**Idempotency:** `UNIQUE(canonical_major, alias)`; `ON CONFLICT DO NOTHING`.
**Residual gap:** real-world aliases/synonyms (e.g. "CS" → "Computer Science") must be added by the Phase 4 normalizer; this is only the canonical seed.

---

## 5. `institution_rankings` ← `college_rankings`

Source distribution: **QS** 610, **QS_2024** 18, **NIRF** 120. `ranking_value` is clean integer text. No US News / THE present (genuine gap).

| Target | Source expression | Notes |
|---|---|---|
| `ranking_body` | `QS`/`QS_2024`→`'QS'`; `NIRF`→`'NIRF'` | |
| `ranking_year` | `college_rankings.ranking_year` | |
| `global_rank` | `ranking_value::int` **when body = QS** | QS is a global ranking |
| `national_rank` | `ranking_value::int` **when body = NIRF** | NIRF is India-national |
| `source_attribution` | `{source:'QS'|'NIRF', confidence:0.85}` | tier-5 |

Filter `ranking_value ~ '^[0-9]+$'`. **Conflict key already exists:** `(institution_id, ranking_body, ranking_year)` → `ON CONFLICT DO NOTHING`.
**Post-step:** call `canonical.refresh_popularity_score_from_rankings()` (defined in migration 082) so `popularity_score` reflects the new ranks.
**Residual gap:** US News / THE ranks (Phase 8 sourcing); only ~9% of institutions have any ranking.

---

## 6. `institution_demographics` ← `student_demographics`

Source has rich race/income breakdowns; target wants a jsonb distribution + indices.

| Target | Source expression | Notes |
|---|---|---|
| `data_year` | `data_year` | |
| `percent_international` | `percent_international` | |
| `gender_ratio` | `round(percent_male)||':'||round(percent_female)` | text |
| `ethnic_distribution` | `jsonb_build_object('white',percent_white,'black',percent_black,'hispanic',percent_hispanic,'asian',percent_asian,'native_american',percent_native_american,'pacific_islander',percent_pacific_islander,'multiracial',percent_multiracial,'unknown',percent_unknown_race)` | |
| `socioeconomic_index` | `socioeconomic_diversity_score` | |
| `geographic_diversity_index` | `political_diversity_score`? → **left NULL** | no clean source |
| `source_attribution` | `{source:'IPEDS', confidence:0.85}` | |

**Idempotency:** `UNIQUE(institution_id, data_year_key)`; `ON CONFLICT DO NOTHING`.
**Residual gap:** `percent_first_gen`, `legacy_percent`, `athlete_percent`, `transfer_percent` — not in source (Phase 5/CDS sourcing).

---

## 7. `institution_campus_life` ← `campus_life` (PARTIAL — weak overlap)

The source (8,552 rows) is detailed on greek life / dining / weather; the target axis is safety / satisfaction / cost-of-living / athletics. **Only one field maps cleanly:**

| Target | Source | Status |
|---|---|---|
| `housing_guarantee` | `housing_guarantee::text` | ✅ maps |
| `climate_zone` | `weather_description` (loose) | ⚠️ approximate |
| `campus_safety_score` | — | ❌ no source |
| `cost_of_living_index` | — | ❌ no source |
| `student_satisfaction_score` | — | ❌ no source |
| `athletics_division` | — | ❌ (lives in `public.athletics`/`varsity_sports_detail`) |
| `club_count` | — | ❌ no source |
| `mental_health_rating` | — | ❌ no source |

Backfill maps `housing_guarantee` + stashes the full source row in `raw_payload` for later extraction. **Flagged as a genuine gap**, not "done." Athletics division should later come from `public.athletics` / `public.varsity_sports_detail`.

---

## 8. Field-sparsity gaps in ALREADY-populated canonical tables (H3)

These need re-mapping from legacy (where the data exists) or external sourcing (where it doesn't):

| Table.field | % NULL | Recoverable from legacy? | Action |
|---|---|---|---|
| `institution_outcomes.graduation_rate_4yr` | 100% | `public.academic_outcomes.graduation_rate` (19.5% null) — but it's generic, not 4yr-specific | Map to `graduation_rate_6yr`; source true 4yr from Scorecard |
| `institution_outcomes.employment_rate` | 100% | No | Scorecard/CDS (Phase 5) |
| `institution_outcomes.retention_rate` | 100% | No | IPEDS (Phase 5) |
| `institution_financials.avg_financial_aid` | 100% | ❌ `college_financial_aid.avg_financial_aid_package` is itself **100% NULL** (verified) | **Genuine gap** — source Scorecard/IPEDS (Phase 5) |
| `institution_financials.net_price_*` | 100% | ✅ `college_financial_aid.avg_net_price_*` (4,923 populated) | **Filled by migration 101** |
| `institution_financials.avg_debt` | 23.7% | ✅ `academic_details.median_debt` | **Filled by migration 101** |
| `institution_admissions.sat_50/act_50` | 81–85% | `public.colleges.sat_25/75` partial | Scorecard/CDS |
| `institution_admissions.acceptance_rate` | 68.9% | No (69% null in legacy too) | **Genuine source sparsity** — Scorecard/CDS |
| `institutions.control_type` | 73% | IPEDS Directory | Phase 3 (M5) |
| `institutions.established_year` | 78% | IPEDS Directory | Phase 3 (M5) |
| `institutions.logo_url` | 94% | No | Clearbit/scrape (Phase 8) |

> H3 financial/outcome re-mapping is **not** in the 094–099 batch (it needs per-field source validation). It is the immediate Phase 3/5 follow-up.

---

## 9. Genuine gaps — NO data exists anywhere (must source, not backfill)

| Domain | All candidate tables | Phase |
|---|---|---|
| **Deadlines** | `institution_deadlines`, `deadlines`, `college_deadlines`, `application_deadlines`, `deadline_history`, `deadline_alerts`, `user_deadlines` — **all 0** | Phase 6 (CommonApp / official sites) |
| **Requirements** | `institution_requirements`, `college_requirements`, `course_requirements` — **all 0** | Phase 7 (CDS) |
| **Essays / prompts** | `essays`, `essay_examples` — **all 0** | Phase 7 |
| **Quality scores** | `institution_quality_scores` — 0 (never computed) | Phase 9 |
| **Search index / embeddings** | `institution_search_index`, `institution_embeddings` — 0 | Phase 8 |

---

## 10. Execution order (matches migrations 094–099)

1. `094` — `institution_programs` (biggest win: 184,800 rows → majors on every card)
2. `095` — `major_ontology` seed
3. `096` — `institution_rankings` + `refresh_popularity_score_from_rankings()`
4. `097` — `institution_demographics`
5. `098` — `institution_campus_life` (partial)
6. `099` — recompute `institution_completeness` across all 8 domains (M1) + `REFRESH MATERIALIZED VIEW canonical.mv_college_cards` (H1)

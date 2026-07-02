# Duplicate Institution Merge Plan

Read-only analysis. **No merge, UPDATE, or DELETE was executed** — this is planning only,
per explicit instruction. All queries re-run fresh against the live DB for this report.

## The pattern (found via aggregate query + one detailed example)

**42 duplicate groups confirmed**, every group exactly 2 rows, one older (`A`, created
2026-05-18) and one newer (`B`, created 2026-06-29/30 — matching migration
`128_seed_global_institutions.sql` / `129_seed_global_enrichment.sql`, the "seed 166
global institutions + full enrichment" batch referenced in the git log).

**Every single `B` row has exactly 32 related rows across the 12 checked content
tables; every `A` row has between 10-18.** This is not a coincidence — it strongly
indicates the global-institution re-seed in migrations 128/129 inserted a *fresh*
institution row for universities that already existed from an earlier ingestion,
instead of matching against `canonical_name` + `country_code` first. Root cause is a
migration/seeding gap, not random data corruption — worth fixing at the seeder level too
so this class of duplicate doesn't recur on the next seeding run (see "Prevention"
below).

### Detailed example — University of Toronto (representative, not unique to this pair)

| Table | A (older, `bb9e851e...`) | B (newer, `277ceb9e...`) |
|---|---|---|
| `institution_financials` | 1 row (data_year 2024) | 1 row (data_year 2024) |
| `institution_admissions` | 1 row (data_year 2024) | 1 row (data_year 2024) |
| `institution_programs` | 0 | **24** |
| `institution_rankings` | 4 | 1 |
| `institution_demographics` | 0 | 1 |
| `institution_campus_life` | 1 | 0 |
| `institution_outcomes` | 0 | 1 |
| `institution_completeness` | 1 | 1 |
| `institution_quality_scores` | 1 | 0 |
| `institution_deadlines` | 0 | 1 |
| `institution_requirements` | 0 | 1 |
| `institution_aliases` | 6 | 0 |

**This is the critical finding: neither side is a strict subset of the other.** `A`
uniquely holds `institution_campus_life`, `institution_quality_scores`, and 6
`institution_aliases` rows that `B` has none of. `B` uniquely holds the bulk of
`institution_programs` (24 vs 0 — a huge, valuable difference), `institution_demographics`,
`institution_outcomes`, `institution_deadlines`, `institution_requirements`. **Both**
sides independently have a `2024` row in `institution_financials`, `institution_admissions`,
and `institution_completeness` — meaning a naive `UPDATE ... SET institution_id = B WHERE
institution_id = A` on those three tables **will hit a real UNIQUE constraint violation**
(confirmed live: `institution_financials` has `UNIQUE (institution_id, data_year_key,
academic_year_key)`, `institution_admissions` has `UNIQUE (institution_id, data_year,
admissions_cycle)` — both would collide with B's existing 2024 row).

This is now confirmed to be the **same unresolved conflict shape** as the 6,016
duplicate `institution_financials` rows already flagged in `undergrad_cleanup_report.md`
— a merge here would need the same "which of the two 2024 rows is right" human judgment
call, not an automatic pick.

## Foreign-key surface

30 tables in `canonical.*` carry an `institution_id` column:
`application_tasks, applications, eu_admissions_profile, india_admissions_profile,
india_financial_aid, institution_admissions, institution_aliases,
institution_campus_life, institution_completeness, institution_deadlines,
institution_demographics, institution_embeddings, institution_financials,
institution_identity_map, institution_outcomes, institution_placements,
institution_programs, institution_quality_scores, institution_rankings,
institution_requirements, institution_search_index, institution_source_registry,
popularity_index, recommendation_feedback, scraper_failures, stg_institution_matches,
uk_admissions_profile, uk_financial_support, us_admissions_profile, us_financial_aid,
user_recommendation_events`.

12 of these (the core content tables) were checked in full for all 42 pairs; the
remaining 18 (mostly per-country admissions-profile tables, scraper/staging metadata,
and user-facing tables like `applications`/`recommendation_feedback`) were **not**
row-counted per pair in this pass — flagged as needing the same check before any real
merge executes, since a merge that misses a table with real user data
(`applications`, `recommendation_feedback`) would silently orphan a student's saved
application.

## Merge difficulty/risk classification

**All 42 pairs are "hard" merges, not "easy" ones.** Every pair has real, independent
data on both sides (0 pairs where one side is empty), and the financials/admissions/
completeness tables carry a genuine unique-constraint collision risk on every pair
(both sides have a `2024` row in `institution_financials`/`institution_admissions` in
the one pair inspected in full depth — the aggregate query confirms the same "both sides
have rows" shape across all 42, though the exact `data_year` collision was verified for
Toronto specifically, not individually re-verified for all 42 — that per-pair
verification is listed as a required pre-merge step below, not assumed).

| Risk factor | Present in all 42 pairs? |
|---|---|
| Both sides have independent real data (not a simple duplicate-and-delete) | Yes, 42/42 |
| Likely UNIQUE constraint collision on `institution_financials`/`institution_admissions`/`institution_completeness` | Confirmed for 1/42 in full; strongly implied for the rest by the identical aggregate pattern — must be re-verified per-pair before executing |
| One side holds data invisible to the other (aliases, quality_scores, campus_life on the "A" side; programs/demographics/outcomes/deadlines/requirements on the "B" side) | Yes, matches the Toronto pattern in every pair inspected |
| User-facing tables (`applications`, `recommendation_feedback`) not yet checked per pair | Unknown — flagged as required pre-merge work |

**Overall risk: Medium-High.** Not catastrophic (no evidence of orphaned user data yet,
since that wasn't checked), but definitely not a "just delete the extra row" fix.

## Recommended merge direction

Based on the consistent 32-vs-10-18 pattern: **`B` (the newer, migration 128/129 row)
should generally be the survivor** — it carries the institution's programs, demographics,
outcomes, deadlines, and requirements, which are larger and more valuable datasets than
what `A` uniquely holds (aliases, one campus_life row, one quality_scores row). But this
is a recommendation based on strong aggregate evidence and one fully-inspected example,
**not a verified decision for all 42 pairs individually** — a few pairs may deviate from
the pattern and should be spot-checked before the migration runs.

## Rollback-safe migration plan (NOT executed)

Proposed as migration `130_merge_duplicate_institutions.sql` (next available number
after `129_seed_global_enrichment.sql`) or later depending on what else lands first
(see `provenance_migration_report.md` for whether `130`+ is already claimed).

```sql
BEGIN;

-- Step 0: audit table, so every merge is reversible by re-reading this log even
-- after step 4's hard delete.
CREATE TABLE IF NOT EXISTS canonical.institution_merge_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survivor_institution_id UUID NOT NULL,
  merged_institution_id UUID NOT NULL,
  merged_institution_snapshot JSONB NOT NULL,  -- full row from canonical.institutions before delete
  merged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  merged_by TEXT
);

-- Step 1: snapshot the row about to be removed, for every pair, BEFORE touching anything.
-- (one INSERT per pair, generated from the 42-pair list in this report)

-- Step 2: for tables with NO collision risk (the one-sided tables: institution_aliases,
-- institution_campus_life, institution_quality_scores, institution_programs,
-- institution_demographics, institution_outcomes, institution_deadlines,
-- institution_requirements, institution_embeddings) - straight reassignment, since the
-- aggregate data shows these are populated on only one side per pair in the inspected
-- example. MUST be re-verified per-pair first (a pair could differ from the pattern):
UPDATE canonical.institution_aliases SET institution_id = :survivor_id WHERE institution_id = :merged_id;
UPDATE canonical.institution_campus_life SET institution_id = :survivor_id WHERE institution_id = :merged_id
  AND NOT EXISTS (SELECT 1 FROM canonical.institution_campus_life WHERE institution_id = :survivor_id);
-- (repeat pattern per table, each guarded by a NOT EXISTS check against the survivor
--  so this step is a no-op instead of a constraint violation if a pair doesn't match
--  the assumed one-sided shape)

-- Step 3: for collision-risk tables (institution_financials, institution_admissions,
-- institution_completeness, institution_rankings), do NOT blindly reassign. This is the
-- same unresolved problem as the 6,016 duplicate institution_financials rows in
-- undergrad_cleanup_report.md. Recommended: reassign only rows from the merged
-- institution where the survivor has NO row for that (data_year[, cycle]) combination;
-- for years where BOTH have a row, leave the merged institution's row in place but
-- re-point it to a holding table (institution_financials_merge_conflicts) for a human
-- to resolve, rather than picking one automatically:
INSERT INTO canonical.institution_financials_merge_conflicts
  SELECT * FROM canonical.institution_financials f
  WHERE f.institution_id = :merged_id
    AND EXISTS (
      SELECT 1 FROM canonical.institution_financials s
      WHERE s.institution_id = :survivor_id AND s.data_year_key = f.data_year_key
    );
-- then reassign only the non-conflicting rows:
UPDATE canonical.institution_financials SET institution_id = :survivor_id
  WHERE institution_id = :merged_id
    AND NOT EXISTS (
      SELECT 1 FROM canonical.institution_financials s
      WHERE s.institution_id = :survivor_id AND s.data_year_key = institution_financials.data_year_key
    );

-- Step 4: user-facing tables (applications, recommendation_feedback, application_tasks) -
-- MUST be checked per-pair for real user data before this step is written concretely.
-- Placeholder only - do not run until that check is done:
-- UPDATE applications SET institution_id = :survivor_id WHERE institution_id = :merged_id;

-- Step 5: institution_identity_map - has a UNIQUE(canonical_institution_id) constraint,
-- so re-pointing needs care if both duplicate IDs are already mapped.

-- Step 6: only after steps 1-5 succeed and are verified, soft-archive (do NOT hard
-- delete in the same transaction/run) the merged institutions row:
UPDATE canonical.institutions SET deprecated_duplicate_of = :survivor_id, updated_at = NOW()
  WHERE id = :merged_id;
-- A separate, later migration (after a verification window) does the actual:
-- DELETE FROM canonical.institutions WHERE deprecated_duplicate_of IS NOT NULL;

COMMIT;
```

This structure is rollback-safe because: (a) it's wrapped in a transaction so a failure
partway through rolls back everything, (b) the audit table + `deprecated_duplicate_of`
soft-marker mean the "duplicate" row is never hard-deleted until a separate, later,
explicitly-approved cleanup migration runs, and (c) conflicting financial/admissions rows
are moved to a review table instead of silently dropped or auto-picked.

## Required before this can actually run

1. Per-pair verification that the "B has 32 rows, A has 10-18" pattern holds for all 42
   (not assumed from the one detailed example).
2. Per-pair check of the 18 not-yet-inspected tables, especially `applications` and
   `recommendation_feedback` (real user data — orphaning these would be a genuine user-
   facing regression, not just a data-quality nit).
3. A human decision on the financials/admissions/completeness/rankings conflicts once
   they're surfaced in the `_merge_conflicts` holding tables from Step 3.
4. `institution_search_index` and `institution_embeddings` likely need regeneration
   rather than row-reassignment (vector/search-index content tied to the institution ID)
   — flagged, not resolved here.

## Prevention (recommended, not executed)

The root cause — migration 128/129's seeding not matching against existing
`canonical_name`/`country_code` before inserting — should be fixed in the seeder script
itself so the next global-institution seeding pass doesn't recreate this same class of
duplicate. Not fixed in this pass since it's a scraper/seeder code change, out of scope
for a database-analysis task.

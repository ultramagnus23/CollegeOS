# Institution Merge Report

Executed live against production per explicit authorization. Confirmed before execution
(this session and the prior PR): zero rows in `applications`, `application_tasks`,
`recommendation_feedback`, `user_recommendation_events`, `scraper_failures`, or
`stg_institution_matches` reference any of the 42 duplicate institutions — no real
user-generated content was at risk. **No institution was hard-deleted.**

## Canonical institution selection

For all 42 pairs, the survivor ("canonical" institution) is the **newer** row (created
2026-06-29/30, from the migration 128/129 global-institution seed) — established in the
prior session's analysis as consistently the more complete record (32 related rows vs.
10-18 for the older row, verified across all 42 pairs via aggregate row counts).

## Foreign key reassignment

| Table | Rows reassigned to survivor |
|---|---|
| `institution_aliases` | 212 (done in PR #162) |
| `institution_campus_life` | 42 (done in PR #162) |
| `institution_quality_scores` | 42 (done in PR #162) |
| `institution_financials` | conflicts resolved per `financial_resolution_report.md` (42 conflicting pairs + any non-conflicting rows) |
| `institution_admissions` | 42 conflicts resolved; 0 additional non-conflicting rows |
| `institution_rankings` | 43 conflicts resolved; 0 additional non-conflicting rows |
| `institution_completeness` | 42 older-side rows archived (not reassigned — will be recomputed for the survivor) |
| `institution_programs`, `institution_demographics`, `institution_outcomes`, `institution_deadlines`, `institution_requirements`, `institution_embeddings` | 0 rows needed reassignment — the older institution had no rows in these tables for any of the 42 pairs (already correctly on the survivor from the original seed) |

`institution_requirements` had 4 rows with a real conflict (both institutions had a row
for the same cycle/degree/applicant_type) that were **not** resolved, since this table
has no `verification_status` column (not part of migration 130's scope) and therefore no
principled way to pick a winner under the authorized priority rule — left untouched,
flagged below.

## Alias preservation

All 212 `institution_aliases` rows from the 42 older institutions were reassigned (not
duplicated or dropped) to the survivor in the prior PR — the older institution's known
alternate names remain searchable under the canonical institution.

## Merge history

Created `canonical.institution_merge_history` (new table, additive): one row per merged
pair recording `canonical_institution_id` (survivor), `merged_institution_id`
(deprecated), name, country, the list of tables touched, and a timestamped note
describing the exact resolution method used. **42 rows**, one per pair — this is the
audit trail for reversing or reviewing any individual merge decision.

## Duplicate archival (soft, not hard delete)

Added `deprecated_duplicate_of` (UUID, self-referencing FK) and `deprecated_at`
(timestamp) columns to `canonical.institutions`. All 42 older institution rows now have
`deprecated_duplicate_of` pointing at their survivor and `deprecated_at` set — **the rows
still exist in full**, nothing was deleted.

## Verification performed

- `institution_merge_history` row count (42) matches the duplicate-pair count exactly.
- Spot-checked University of Toronto: the deprecated row correctly shows
  `deprecated_duplicate_of` pointing at the survivor UUID; the survivor row shows `NULL`.
- `mv_college_cards` refreshed after all changes.

## Manual review required / not done in this pass

1. **`institution_requirements`**: 4 conflicting rows across the 42 pairs, left
   unresolved (no `verification_status` column to apply the priority rule to).
2. **`mv_college_cards` does not yet filter deprecated institutions.** Confirmed live:
   querying the view for "University of Toronto" still returns **2 rows** (both the
   survivor and the deprecated duplicate) — the soft-mark alone does not hide the
   duplicate from search/detail pages yet. Fixing this requires altering the
   materialized view's `WHERE` clause, which means dropping and recreating it along
   with all of its indexes (materialized views don't support `CREATE OR REPLACE` in
   Postgres). Given the risk of getting index recreation wrong on a core,
   heavily-queried view under time pressure, this was deliberately **not attempted** in
   this pass — flagged as the single most important remaining step to make the merge
   have real user-facing effect, and recommended as its own carefully-tested change
   rather than a rushed one here.
3. **Institutions were not hard-deleted** (per explicit instruction) — a future cleanup
   migration, after a verification window, would be the place to actually remove the 42
   deprecated rows, once confidence is established that no code path still reads them
   directly by ID.

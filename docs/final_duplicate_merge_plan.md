# Duplicate Institution — Final Merge Preparation

Supersedes the risk classification in `institution_merge_plan.md` with new, decisive
evidence on user-data safety. **No merge was executed in this pass** — this is the
"before any merge" verification step, per instruction; execution is still a follow-up
step, not completed here (see "Why not executed now" below).

## New verification: user-generated / analytics data is NOT at risk

Checked every table that could hold user-generated content or analytics tied to an
institution, for rows referencing any of the 84 UUIDs in the 42 duplicate pairs:

| Table | Rows referencing duplicate institutions |
|---|---|
| `applications` | **0** |
| `application_tasks` | **0** |
| `recommendation_feedback` | **0** |
| `user_recommendation_events` | **0** |
| `scraper_failures` | **0** |
| `stg_institution_matches` | **0** |
| `popularity_index` | 42 (one row per institution — an analytics score, not user data) |

No `favorites`/`saved`/`wishlist`-style table exists in `public.*` at all, so there is no
separate "saved colleges" surface to check beyond `applications` (already 0).

**This means no real student's application, task, feedback, or saved-college record
would be silently orphaned or duplicated by a merge.** The risk profile from
`institution_merge_plan.md` is revised down for the user-data dimension specifically.

## Revised classification

| Category | Tables | Status |
|---|---|---|
| **Merge-safe (no conflict possible)** | `institution_aliases`, `institution_campus_life`, `institution_quality_scores`, `institution_programs`, `institution_demographics`, `institution_outcomes` (where the survivor has no row for that year), `institution_deadlines`, `institution_requirements`, `institution_embeddings` | Confirmed one-sided in the fully-inspected example (Toronto: `A` has aliases/campus_life/quality_scores, `B` has programs/demographics/outcomes/deadlines/requirements — no overlap) and structurally consistent across all 42 pairs (every `B` has exactly 32 rows, every `A` has 10-18, per the aggregate check in the prior report) |
| **Merge-safe (no user impact, but needs a pick-one rule)** | `popularity_index` | 1 row per institution, no unique-constraint conflict risk found, but merging two scores requires a decision (sum? max? keep survivor's?) — trivial but still a real product decision, not mechanical |
| **Human-review required (real conflict risk)** | `institution_financials`, `institution_admissions`, `institution_completeness`, `institution_rankings` | Confirmed live for the Toronto pair: **both sides have an independent 2024 row**, and `institution_financials` / `institution_admissions` both have `UNIQUE (institution_id, data_year_key/data_year, ...)` constraints that a blind reassignment would violate. Same unresolved shape as the 6,016 duplicate financial rows already flagged separately. |
| **Impossible merges** | none found | Every pair has a clear survivor candidate (the newer, migration-128/129-seeded row) and no table showed truly irreconcilable structural conflicts — only "which of two real values is correct," a data question, not a schema blocker |

## Why not executed now

Per-pair verification of the "one side has more data" pattern was done rigorously for
1 of 42 pairs in depth (Toronto) and confirmed structurally for all 42 via aggregate row
counts (32 vs. 10-18, consistently) — but not every one of the 42 pairs has had its
*individual* financials/admissions/completeness/rankings rows inspected for the exact
nature of their conflict (e.g., do they actually disagree on values, or could some pairs
be exact duplicates after all). Executing a 42-pair production merge without that
individual confirmation risks silently picking the wrong value for at least one
institution's public-facing tuition or acceptance rate — precisely the class of error
this whole session has been fixing. Given the "prioritize correctness over speed"
directive, the remaining step is mechanical but should be a dedicated, reviewable
migration run (with the conflict rows visibly surfaced to a `_merge_conflicts` table,
per the rollback-safe plan in `institution_merge_plan.md`), not something to execute
inline as a side effect of a QA/hardening pass.

## What would need to happen to execute

1. Run the "merge-safe" table reassignments (aliases, campus_life, quality_scores,
   programs, demographics, outcomes/deadlines/requirements where non-conflicting,
   embeddings) for all 42 pairs — genuinely mechanical, guarded by `NOT EXISTS` checks,
   loses no information.
2. For `popularity_index`: decide the pick-one rule (recommend: keep the higher score,
   since popularity is roughly additive/cumulative and the survivor's higher count
   likely reflects the same real popularity split across two IDs).
3. For the four collision tables: run the `_merge_conflicts` archival step from
   `institution_merge_plan.md`'s migration SQL, surface both values side-by-side, and
   have a human (or a follow-up session with explicit per-row authorization) pick the
   correct one per institution before the duplicate row is soft-marked
   `deprecated_duplicate_of`.
4. Only after 1-3 are confirmed clean: soft-mark (not hard-delete) the 42 duplicate
   `institutions` rows, refresh `mv_college_cards`, and monitor before a later hard-delete
   pass.

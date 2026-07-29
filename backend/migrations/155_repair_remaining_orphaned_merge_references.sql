-- Migration 155: repair remaining orphaned FKs left by the institution dedup run
-- ============================================================================
-- PURPOSE
--   Follow-up to 154 (which fixed institution_deadlines). A full sweep across
--   every table backend/scripts/dedupeInstitutions.js knows how to merge
--   found 13 more tables with rows still pointing at a deprecated (loser)
--   institution_id — up to 9,162 in institution_programs alone. Reassigns
--   every row that is safely reassignable (no equivalent row already exists
--   on the survivor, verified per-table via the exact identity-key rule
--   dedupeInstitutions.js itself uses) and archives+removes true conflicts
--   for the two tables that have a real *_merge_archive table
--   (institution_rankings, institution_completeness) — same pattern already
--   used successfully for new merges by that script. True conflicts on
--   tables with NO archive table (institution_requirements,
--   institution_outcomes, the remainder of institution_embeddings/
--   institution_quality_scores) are correctly left in place, unchanged —
--   the survivor already has equivalent data, so nothing is lost by leaving
--   them orphaned/inert.
--
--   Real counts verified live via a dry-run of
--   backend/scripts/repairOrphanedMergeReferences.js (2026-07-27):
--     Reassignable: institution_programs 1566, institution_rankings 36,
--     institution_identity_map 46, institution_demographics 29,
--     institution_search_index 45, popularity_index 45,
--     institution_embeddings 3, institution_aliases 13,
--     institution_quality_scores 3, institution_campus_life 3,
--     institution_completeness 3, institution_placements 3.
--     Archived-as-conflict: institution_rankings 347, institution_completeness 42.
--     Left-in-place-as-conflict (no archive table): institution_deadlines 37
--     (handled by 154), institution_requirements 42, institution_programs 7596,
--     institution_outcomes 31, institution_embeddings 42,
--     institution_quality_scores 42.
--
-- SAFETY
--   * Every UPDATE is scoped to institution_id (or canonical_institution_id
--     for masters_programs — not touched here, verified 0 orphaned live)
--     pointing at a deprecated institution AND no equivalent identity-key
--     row already exists on the survivor — exactly the same conflict rule
--     dedupeInstitutions.js already uses for new merges.
--   * The two archive operations (institution_rankings,
--     institution_completeness) insert the full source row plus
--     archived_at/archive_reason/winning_row_id into the existing
--     *_merge_archive table BEFORE deleting — same as
--     dedupeInstitutions.js's mergeCompositeArchive/mergeSingleArchive.
--   * Idempotent: every WHERE clause re-evaluates live state, so re-running
--     finds nothing left to do once applied.
--   * No institution rows touched — only FK columns on the tables below.
-- ============================================================================

-- institution_programs (composite: normalized_program_name, degree_type_key)
UPDATE canonical.institution_programs l
SET institution_id = i.deprecated_duplicate_of
FROM canonical.institutions i
WHERE l.institution_id = i.id
  AND i.deprecated_at IS NOT NULL AND i.deprecated_duplicate_of IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM canonical.institution_programs s
    WHERE s.institution_id = i.deprecated_duplicate_of
      AND s.normalized_program_name IS NOT DISTINCT FROM l.normalized_program_name
      AND s.degree_type_key IS NOT DISTINCT FROM l.degree_type_key
  );

-- institution_demographics (composite: data_year_key)
UPDATE canonical.institution_demographics l
SET institution_id = i.deprecated_duplicate_of
FROM canonical.institutions i
WHERE l.institution_id = i.id
  AND i.deprecated_at IS NOT NULL AND i.deprecated_duplicate_of IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM canonical.institution_demographics s
    WHERE s.institution_id = i.deprecated_duplicate_of
      AND s.data_year_key IS NOT DISTINCT FROM l.data_year_key
  );

-- institution_embeddings (composite: model_name)
UPDATE canonical.institution_embeddings l
SET institution_id = i.deprecated_duplicate_of
FROM canonical.institutions i
WHERE l.institution_id = i.id
  AND i.deprecated_at IS NOT NULL AND i.deprecated_duplicate_of IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM canonical.institution_embeddings s
    WHERE s.institution_id = i.deprecated_duplicate_of
      AND s.model_name IS NOT DISTINCT FROM l.model_name
  );

-- institution_aliases (composite: normalized_alias)
UPDATE canonical.institution_aliases l
SET institution_id = i.deprecated_duplicate_of
FROM canonical.institutions i
WHERE l.institution_id = i.id
  AND i.deprecated_at IS NOT NULL AND i.deprecated_duplicate_of IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM canonical.institution_aliases s
    WHERE s.institution_id = i.deprecated_duplicate_of
      AND s.normalized_alias IS NOT DISTINCT FROM l.normalized_alias
  );

-- institution_placements (composite: cycle_year)
UPDATE canonical.institution_placements l
SET institution_id = i.deprecated_duplicate_of
FROM canonical.institutions i
WHERE l.institution_id = i.id
  AND i.deprecated_at IS NOT NULL AND i.deprecated_duplicate_of IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM canonical.institution_placements s
    WHERE s.institution_id = i.deprecated_duplicate_of
      AND s.cycle_year IS NOT DISTINCT FROM l.cycle_year
  );

-- institution_identity_map (composite: source_table, source_pk)
UPDATE canonical.institution_identity_map l
SET institution_id = i.deprecated_duplicate_of
FROM canonical.institutions i
WHERE l.institution_id = i.id
  AND i.deprecated_at IS NOT NULL AND i.deprecated_duplicate_of IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM canonical.institution_identity_map s
    WHERE s.institution_id = i.deprecated_duplicate_of
      AND s.source_table IS NOT DISTINCT FROM l.source_table
      AND s.source_pk IS NOT DISTINCT FROM l.source_pk
  );

-- institution_search_index (single-row-per-institution, no archive)
UPDATE canonical.institution_search_index l
SET institution_id = i.deprecated_duplicate_of
FROM canonical.institutions i
WHERE l.institution_id = i.id
  AND i.deprecated_at IS NOT NULL AND i.deprecated_duplicate_of IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM canonical.institution_search_index s WHERE s.institution_id = i.deprecated_duplicate_of);

-- popularity_index (single-row-per-institution, no archive)
UPDATE canonical.popularity_index l
SET institution_id = i.deprecated_duplicate_of
FROM canonical.institutions i
WHERE l.institution_id = i.id
  AND i.deprecated_at IS NOT NULL AND i.deprecated_duplicate_of IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM canonical.popularity_index s WHERE s.institution_id = i.deprecated_duplicate_of);

-- institution_quality_scores (single-row-per-institution, no archive)
UPDATE canonical.institution_quality_scores l
SET institution_id = i.deprecated_duplicate_of
FROM canonical.institutions i
WHERE l.institution_id = i.id
  AND i.deprecated_at IS NOT NULL AND i.deprecated_duplicate_of IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM canonical.institution_quality_scores s WHERE s.institution_id = i.deprecated_duplicate_of);

-- institution_campus_life (single-row-per-institution, no archive)
UPDATE canonical.institution_campus_life l
SET institution_id = i.deprecated_duplicate_of
FROM canonical.institutions i
WHERE l.institution_id = i.id
  AND i.deprecated_at IS NOT NULL AND i.deprecated_duplicate_of IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM canonical.institution_campus_life s WHERE s.institution_id = i.deprecated_duplicate_of);

-- institution_rankings (composite: ranking_year_key, ranking_body; HAS an archive table)
-- Step 1: archive true conflicts (survivor already has an equivalent ranking row)
INSERT INTO canonical.institution_rankings_merge_archive
  (id, institution_id, ranking_year, ranking_year_key, ranking_body, national_rank, global_rank,
   subject_rank, ranking_score, source_attribution, raw_payload, created_at, niche_rank, wsj_rank,
   forbes_rank, guardian_rank, complete_uk_rank, shanghai_rank, nirf_rank, employer_reputation_rank,
   academic_reputation_rank, faculty_student_rank, citations_rank, intl_student_rank, qs_rank,
   the_rank, us_news_rank, qs_overall_score, verification_status, last_verified_at,
   archived_at, archive_reason, winning_row_id)
SELECT
   l.id, l.institution_id, l.ranking_year, l.ranking_year_key, l.ranking_body, l.national_rank, l.global_rank,
   l.subject_rank, l.ranking_score, l.source_attribution, l.raw_payload, l.created_at, l.niche_rank, l.wsj_rank,
   l.forbes_rank, l.guardian_rank, l.complete_uk_rank, l.shanghai_rank, l.nirf_rank, l.employer_reputation_rank,
   l.academic_reputation_rank, l.faculty_student_rank, l.citations_rank, l.intl_student_rank, l.qs_rank,
   l.the_rank, l.us_news_rank, l.qs_overall_score, l.verification_status, l.last_verified_at,
   now(), 'repair pass: conflicting ranking_year_key/ranking_body on institution_id', s.id
FROM canonical.institution_rankings l
JOIN canonical.institutions i ON i.id = l.institution_id AND i.deprecated_at IS NOT NULL AND i.deprecated_duplicate_of IS NOT NULL
JOIN canonical.institution_rankings s
  ON s.institution_id = i.deprecated_duplicate_of
 AND s.ranking_year_key IS NOT DISTINCT FROM l.ranking_year_key
 AND s.ranking_body IS NOT DISTINCT FROM l.ranking_body;

-- Step 2: delete the now-archived conflicting rows
DELETE FROM canonical.institution_rankings l
USING canonical.institutions i
WHERE l.institution_id = i.id AND i.deprecated_at IS NOT NULL AND i.deprecated_duplicate_of IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM canonical.institution_rankings s
    WHERE s.institution_id = i.deprecated_duplicate_of
      AND s.ranking_year_key IS NOT DISTINCT FROM l.ranking_year_key
      AND s.ranking_body IS NOT DISTINCT FROM l.ranking_body
  );

-- Step 3: reassign the remaining, non-conflicting rows
UPDATE canonical.institution_rankings l
SET institution_id = i.deprecated_duplicate_of
FROM canonical.institutions i
WHERE l.institution_id = i.id AND i.deprecated_at IS NOT NULL AND i.deprecated_duplicate_of IS NOT NULL;

-- institution_completeness (single-row-per-institution; HAS an archive table)
-- Step 1: archive true conflicts (survivor already has a completeness row)
INSERT INTO canonical.institution_completeness_merge_archive
  (institution_id, admissions_score, financials_score, outcomes_score, rankings_score, programs_score,
   demographics_score, requirements_score, deadlines_score, overall_score, score_breakdown, updated_at,
   archived_at, archive_reason, winning_row_id)
SELECT
   l.institution_id, l.admissions_score, l.financials_score, l.outcomes_score, l.rankings_score, l.programs_score,
   l.demographics_score, l.requirements_score, l.deadlines_score, l.overall_score, l.score_breakdown, l.updated_at,
   now(), 'repair pass: survivor already has a completeness row', i.deprecated_duplicate_of
FROM canonical.institution_completeness l
JOIN canonical.institutions i ON i.id = l.institution_id AND i.deprecated_at IS NOT NULL AND i.deprecated_duplicate_of IS NOT NULL
WHERE EXISTS (SELECT 1 FROM canonical.institution_completeness s WHERE s.institution_id = i.deprecated_duplicate_of);

-- Step 2: delete the now-archived conflicting rows
DELETE FROM canonical.institution_completeness l
USING canonical.institutions i
WHERE l.institution_id = i.id AND i.deprecated_at IS NOT NULL AND i.deprecated_duplicate_of IS NOT NULL
  AND EXISTS (SELECT 1 FROM canonical.institution_completeness s WHERE s.institution_id = i.deprecated_duplicate_of);

-- Step 3: reassign the remaining, non-conflicting rows
UPDATE canonical.institution_completeness l
SET institution_id = i.deprecated_duplicate_of
FROM canonical.institutions i
WHERE l.institution_id = i.id AND i.deprecated_at IS NOT NULL AND i.deprecated_duplicate_of IS NOT NULL;

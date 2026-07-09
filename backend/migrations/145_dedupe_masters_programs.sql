-- Migration 145: Remove duplicate masters_programs rows from a double import
--
-- The user-compiled masters programs Excel (36 subject sheets, ~513 real rows)
-- was imported twice under two different data_source tags one day apart
-- (`excel_import:<sheet name>` on 2026-06-29, then `excel_import_postgrad_2026`
-- on 2026-06-30, which re-imported a 190-row subset of the same programs).
-- 138 (institution_name, program_name) pairs ended up with 2+ rows -- the only
-- difference between duplicates is `degree_type` (MA vs MS), which the import
-- guessed inconsistently between the two runs since the source Excel's
-- "Program" column just said "Masters" without specifying the exact type.
--
-- Verified live before writing this migration: zero masters_applications and
-- zero masters_admission_datapoints reference any row in the duplicate set,
-- and none of the 6 existing masters_program_pathways rows touch it either --
-- this is a clean, no-data-loss dedup, not a merge of real user activity.
--
-- Keeps one row per (institution_name, program_name): prefers a row with
-- canonical_institution_id already linked (more complete), falling back to
-- the earliest-imported row as a stable tie-break.

DELETE FROM canonical.masters_programs mp
WHERE mp.id NOT IN (
  SELECT DISTINCT ON (institution_name, program_name) id
  FROM canonical.masters_programs
  ORDER BY institution_name, program_name,
           (canonical_institution_id IS NOT NULL) DESC,
           created_at ASC
);

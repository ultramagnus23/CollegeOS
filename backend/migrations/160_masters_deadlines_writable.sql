-- Migration 160: masters data-buildout Gate 0 schema fixes
--
-- Part of the parked Phase 1 masters write-path plan (memory
-- masters_phase1_scope_2026-08-10), resumed 2026-09-03. Gate 0 discovery found
-- two schema gaps that block Gate 1/3 (direct-write masters deadlines):
--
-- 1. canonical.masters_pathways (0 rows) has zero readers/writers anywhere in
--    the codebase (confirmed via full-repo grep) — an abandoned schema
--    iteration superseded by canonical.masters_program_pathways (6 rows, has
--    a real writer in scraper/masters/pipelines/excel_loader.py). Archived
--    per the same ALTER TABLE ... SET SCHEMA archive convention used in
--    migration 150/158.
--
-- 2. canonical.masters_program_deadlines has no unique constraint, so the
--    "never downgrade confidence" ON CONFLICT upsert pattern already proven
--    on canonical.institution_deadlines (uq_deadline_record) can't be
--    applied. Adding the equivalent constraint + a confidence_score column
--    so the same pattern can be reused directly.
--
-- canonical.masters_admission_datapoints deliberately gets NO unique
-- constraint here: unlike deadlines (one true value per program/cycle), this
-- table is an append-only log of individual scraped/reported outcomes (one
-- row per applicant per source) — many legitimate rows can share the same
-- program_id. A supporting index is added instead of a uniqueness rule.
--
-- ROLLBACK PLAN:
--   ALTER TABLE archive.masters_pathways SET SCHEMA canonical;
--   ALTER TABLE canonical.masters_program_deadlines DROP CONSTRAINT IF EXISTS uq_masters_deadline_record;
--   ALTER TABLE canonical.masters_program_deadlines DROP COLUMN IF EXISTS confidence_score, DROP COLUMN IF EXISTS updated_at;
--   DROP INDEX IF EXISTS canonical.idx_masters_admission_datapoints_program;
-- Fully reversible; no data is dropped (masters_pathways has 0 rows to move).

CREATE SCHEMA IF NOT EXISTS archive;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'canonical' AND table_name = 'masters_pathways') THEN
    EXECUTE 'ALTER TABLE canonical.masters_pathways SET SCHEMA archive';
    RAISE NOTICE 'moved canonical.masters_pathways -> archive.masters_pathways';
  END IF;
END $$;

ALTER TABLE canonical.masters_program_deadlines
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_masters_deadline_record'
      AND conrelid = 'canonical.masters_program_deadlines'::regclass
  ) THEN
    ALTER TABLE canonical.masters_program_deadlines
      ADD CONSTRAINT uq_masters_deadline_record
      UNIQUE (masters_program_id, deadline_type, intake_term, intake_year);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_masters_admission_datapoints_program
  ON canonical.masters_admission_datapoints(masters_program_id);

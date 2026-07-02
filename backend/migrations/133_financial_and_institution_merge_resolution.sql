-- 133_financial_and_institution_merge_resolution.sql
-- ----------------------------------------------------------------------------
-- Schema/infrastructure for the authorized financial-duplicate and
-- institution-duplicate resolution executed live on 2026-07-02 (see
-- docs/financial_resolution_report.md, docs/institution_merge_report.md).
-- This migration documents the archive/history tables already created live;
-- it does NOT re-run the data resolution itself (idempotent CREATE TABLE IF
-- NOT EXISTS / ADD COLUMN IF NOT EXISTS only).
-- ----------------------------------------------------------------------------

-- Archive tables (one per provenance-bearing table touched by the resolution).
-- LIKE ... INCLUDING DEFAULTS, no unique/primary key constraints copied, since
-- an archive intentionally holds multiple rows per institution/year.
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['institution_financials', 'institution_admissions', 'institution_rankings', 'institution_completeness'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS canonical.%I (LIKE canonical.%I INCLUDING DEFAULTS)', t || '_merge_archive', t);
    EXECUTE format('ALTER TABLE canonical.%I ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NOW()', t || '_merge_archive');
    EXECUTE format('ALTER TABLE canonical.%I ADD COLUMN IF NOT EXISTS archive_reason TEXT', t || '_merge_archive');
    EXECUTE format('ALTER TABLE canonical.%I ADD COLUMN IF NOT EXISTS winning_row_id UUID', t || '_merge_archive');
  END LOOP;
END $$;

-- Merge history: one row per resolved duplicate-institution pair.
CREATE TABLE IF NOT EXISTS canonical.institution_merge_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_institution_id UUID NOT NULL REFERENCES canonical.institutions(id),
  merged_institution_id UUID NOT NULL,
  merged_institution_name TEXT,
  merged_institution_country TEXT,
  tables_touched TEXT[] NOT NULL,
  merged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

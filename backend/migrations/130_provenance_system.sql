-- 130_provenance_system.sql
-- ----------------------------------------------------------------------------
-- Implements the standardized data-provenance system designed in
-- docs/data_provenance_design.md, following this session's data-integrity
-- cleanup (fabricated tuition/acceptance-rate/masters-derived-score values
-- found and remediated - see docs/synthetic_data_inventory.md).
--
-- Schema-only. DOES NOT backfill verification_status/last_verified_at for
-- existing rows - new columns default to 'unknown' so nothing is silently
-- marked as verified without a real classification pass. Backfilling is
-- explicitly deferred (see docs/provenance_migration_report.md "Remaining
-- for a future backfill pass").
--
-- Extends the EXISTING canonical.verification_status enum (defined in
-- migration 079, currently used only by canonical.institutions) rather than
-- creating a new type, so institution-level and field-level verification
-- share one vocabulary. New values added: scraped, imported, inferred,
-- estimated, user_supplied, unknown. Existing values (unverified, verified,
-- government_verified, deprecated) are untouched - 'unverified' remains the
-- convention on canonical.institutions.verification_status; 'unknown' is the
-- new default for the per-domain-table columns this migration adds, matching
-- docs/data_provenance_design.md's 9-value target list minus the pre-existing
-- 'unverified'/'verified'/'government_verified'/'deprecated'.
-- ----------------------------------------------------------------------------

-- ── 1. Extend canonical.verification_status enum ────────────────────────────
-- ALTER TYPE ... ADD VALUE cannot run inside the same transaction block as a
-- later statement that USES the new value in a DEFAULT clause parsed before
-- the ADD VALUE commits, so each of these must commit independently before
-- section 2 runs. This file is intended to be applied statement-by-statement
-- (matching how backend/src/config/database.js applies migrations), not
-- wrapped in a single BEGIN/COMMIT.

ALTER TYPE canonical.verification_status ADD VALUE IF NOT EXISTS 'scraped';
ALTER TYPE canonical.verification_status ADD VALUE IF NOT EXISTS 'imported';
ALTER TYPE canonical.verification_status ADD VALUE IF NOT EXISTS 'inferred';
ALTER TYPE canonical.verification_status ADD VALUE IF NOT EXISTS 'estimated';
ALTER TYPE canonical.verification_status ADD VALUE IF NOT EXISTS 'user_supplied';
ALTER TYPE canonical.verification_status ADD VALUE IF NOT EXISTS 'unknown';

-- ── 2. Add verification_status + last_verified_at to every table that has
--       source_attribution (the tables this session's audit already treats
--       as provenance-bearing) ──────────────────────────────────────────────

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'institution_admissions', 'institution_campus_life', 'institution_demographics',
    'institution_financials', 'institution_outcomes', 'institution_programs',
    'institution_rankings', 'eu_admissions_profile', 'india_admissions_profile',
    'india_financial_aid', 'uk_admissions_profile', 'uk_financial_support',
    'us_admissions_profile', 'us_financial_aid'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'ALTER TABLE canonical.%I ADD COLUMN IF NOT EXISTS verification_status canonical.verification_status NOT NULL DEFAULT %L',
      t, 'unknown'
    );
    EXECUTE format(
      'ALTER TABLE canonical.%I ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ',
      t
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_verification_status ON canonical.%I (verification_status)',
      t, t
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_last_verified_at ON canonical.%I (last_verified_at)',
      t, t
    );
  END LOOP;
END $$;

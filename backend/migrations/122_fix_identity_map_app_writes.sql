-- Migration 122: Reconcile canonical.institution_identity_map schema drift
--
-- ROOT CAUSE (see backend/src/models/Application.js _recordIdentityMapping):
-- Two migrations declared a table with the SAME name but DIFFERENT columns,
-- both using CREATE TABLE IF NOT EXISTS (so the second was silently skipped):
--
--   079_migration_0_0_canonical_rebuild.sql:
--     institution_id, source_table, source_pk, source_tier, source_priority,
--     match_method  -- all NOT NULL, no default
--
--   087_college_id_compatibility.sql:
--     canonical_institution_id, legacy_id, source
--
-- Production ended up with a hybrid table. The application's auto-mapping insert
-- only populated 087's columns, so 079's `institution_id NOT NULL` raised
-- 23502 and the failure was mis-reported to users as "College not found".
--
-- This migration makes every write path agree, defensively and idempotently:
--   1. Ensure 087's columns exist (for deployments that only have 079's).
--   2. Backfill the canonical-UUID alias columns to each other (they are the
--      same value — both FK to canonical.institutions(id)).
--   3. Give 079's provenance columns sane DEFAULTS so any writer that omits
--      them (app, future scrapers) no longer hits a NOT NULL violation.
--
-- Row-specific columns (institution_id, source_pk) intentionally get NO default:
-- they must be supplied per row, and the app now does so.

DO $$
DECLARE
  has_institution_id      BOOLEAN;
  has_canonical_id        BOOLEAN;
  has_source_table        BOOLEAN;
  has_source_pk           BOOLEAN;
  has_source_tier         BOOLEAN;
  has_source_priority     BOOLEAN;
  has_match_method        BOOLEAN;
BEGIN
  -- Bail out quietly if the table doesn't exist at all.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'canonical' AND table_name = 'institution_identity_map'
  ) THEN
    RAISE NOTICE 'institution_identity_map not present; skipping migration 122';
    RETURN;
  END IF;

  -- 1. Ensure 087-style columns exist (nullable; the app populates them).
  ALTER TABLE canonical.institution_identity_map
    ADD COLUMN IF NOT EXISTS canonical_institution_id UUID,
    ADD COLUMN IF NOT EXISTS legacy_id INTEGER,
    ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual';

  -- Re-read column presence after the ADDs.
  SELECT
    bool_or(column_name = 'institution_id'),
    bool_or(column_name = 'canonical_institution_id'),
    bool_or(column_name = 'source_table'),
    bool_or(column_name = 'source_pk'),
    bool_or(column_name = 'source_tier'),
    bool_or(column_name = 'source_priority'),
    bool_or(column_name = 'match_method')
  INTO
    has_institution_id, has_canonical_id, has_source_table, has_source_pk,
    has_source_tier, has_source_priority, has_match_method
  FROM information_schema.columns
  WHERE table_schema = 'canonical' AND table_name = 'institution_identity_map';

  -- 2. Backfill the two canonical-UUID alias columns to each other.
  IF has_institution_id AND has_canonical_id THEN
    UPDATE canonical.institution_identity_map
      SET canonical_institution_id = institution_id
      WHERE canonical_institution_id IS NULL AND institution_id IS NOT NULL;
    UPDATE canonical.institution_identity_map
      SET institution_id = canonical_institution_id
      WHERE institution_id IS NULL AND canonical_institution_id IS NOT NULL;
  END IF;

  -- 3. Sane DEFAULTS for 079's provenance columns so future inserts that omit
  --    them succeed. (Existing rows already have values; this only affects
  --    columns left out of future INSERTs.)
  IF has_source_table THEN
    ALTER TABLE canonical.institution_identity_map ALTER COLUMN source_table SET DEFAULT 'app_user_added';
  END IF;
  IF has_source_tier THEN
    ALTER TABLE canonical.institution_identity_map ALTER COLUMN source_tier SET DEFAULT 'inferred_generated'::canonical.source_tier;
  END IF;
  IF has_source_priority THEN
    ALTER TABLE canonical.institution_identity_map ALTER COLUMN source_priority SET DEFAULT 6;
  END IF;
  IF has_match_method THEN
    ALTER TABLE canonical.institution_identity_map ALTER COLUMN match_method SET DEFAULT 'auto';
  END IF;

  RAISE NOTICE 'Migration 122 applied: identity_map reconciled (institution_id=%, canonical_id=%, provenance defaults set)',
    has_institution_id, has_canonical_id;
END
$$;

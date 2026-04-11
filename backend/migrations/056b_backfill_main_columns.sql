-- Migration 056b: Backfill state, type, setting, website from legacy column names
--
-- STEP 2 of 7 — run AFTER 056a.
--
-- Copies data from the old column names that migration 011 created into the
-- new canonical column names expected by all downstream code.
--
-- Each UPDATE only touches rows where the destination is NULL and the source
-- is NOT NULL, so it is safe to re-run.
--
-- If any of the old columns do not exist on your database (because migration
-- 011 was already patched), the IF EXISTS guard silently skips that block.

DO $$
BEGIN
  -- state_region → state
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'colleges_comprehensive'
      AND column_name  = 'state_region'
  ) THEN
    EXECUTE '
      UPDATE colleges_comprehensive
      SET    state = state_region
      WHERE  state IS NULL
        AND  state_region IS NOT NULL
    ';
  END IF;

  -- institution_type → type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'colleges_comprehensive'
      AND column_name  = 'institution_type'
  ) THEN
    EXECUTE '
      UPDATE colleges_comprehensive
      SET    type = institution_type
      WHERE  type IS NULL
        AND  institution_type IS NOT NULL
    ';
  END IF;

  -- urban_classification → setting
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'colleges_comprehensive'
      AND column_name  = 'urban_classification'
  ) THEN
    EXECUTE '
      UPDATE colleges_comprehensive
      SET    setting = urban_classification
      WHERE  setting IS NULL
        AND  urban_classification IS NOT NULL
    ';
  END IF;

  -- website_url → website
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'colleges_comprehensive'
      AND column_name  = 'website_url'
  ) THEN
    EXECUTE '
      UPDATE colleges_comprehensive
      SET    website = website_url
      WHERE  website IS NULL
        AND  website_url IS NOT NULL
    ';
  END IF;
END $$;

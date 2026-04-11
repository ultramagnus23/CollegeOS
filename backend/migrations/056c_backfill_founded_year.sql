-- Migration 056c: Backfill founded_year from legacy founding_year column
--
-- STEP 3 of 7 — run AFTER 056b.
--
-- Migration 011 named the column "founding_year"; all downstream code expects
-- "founded_year" (different spelling).  This copies the value across.
--
-- Safe to re-run (only updates rows where founded_year IS NULL).

DO $$
BEGIN
  -- founding_year (old name, migration 011) → founded_year (new expected name)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'colleges_comprehensive'
      AND column_name  = 'founding_year'
  ) THEN
    EXECUTE '
      UPDATE colleges_comprehensive
      SET    founded_year = founding_year
      WHERE  founded_year IS NULL
    ';
  END IF;
END $$;

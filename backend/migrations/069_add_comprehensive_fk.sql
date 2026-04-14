-- Migration: 069_add_comprehensive_fk.sql
-- ---------------------------------------------------------------------------
-- Adds a `comprehensive_id` foreign key column to the `colleges` table that
-- references the canonical `colleges_comprehensive` row.
--
-- This replaces fragile name-based joins with a reliable integer join so that
-- all future cross-table queries can use:
--   ON c.comprehensive_id = cc.id
-- instead of the unreliable:
--   ON LOWER(TRIM(c.name)) = LOWER(TRIM(cc.name))
--
-- Steps:
--   1. Add comprehensive_id column (nullable INT, no constraint yet)
--   2. Backfill via name-match (case-insensitive, trimmed)
--   3. Add foreign key constraint (deferred so partial backfill is safe)
--   4. Add index for join performance
-- ---------------------------------------------------------------------------

-- 1. Add column
ALTER TABLE colleges
  ADD COLUMN IF NOT EXISTS comprehensive_id INT;

-- 2. Backfill from name match
UPDATE colleges c
SET comprehensive_id = cc.id
FROM colleges_comprehensive cc
WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(cc.name))
  AND c.comprehensive_id IS NULL;

-- 3. Foreign key (deferred — rows without a match remain NULL, which is valid)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'colleges_comprehensive_id_fkey'
      AND table_name = 'colleges'
  ) THEN
    ALTER TABLE colleges
      ADD CONSTRAINT colleges_comprehensive_id_fkey
      FOREIGN KEY (comprehensive_id)
      REFERENCES colleges_comprehensive(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Index for join performance
CREATE INDEX IF NOT EXISTS idx_colleges_comprehensive_id
  ON colleges (comprehensive_id)
  WHERE comprehensive_id IS NOT NULL;

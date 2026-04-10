-- Migration 056: Fix colleges_comprehensive column schema mismatch
--
-- ROOT CAUSE
-- ----------
-- The colleges_comprehensive table was originally created by migration 011
-- with column names: state_region, institution_type, urban_classification,
-- website_url, founding_year — none of which match the column names expected
-- by every piece of code that followed:
--
--   • search_colleges_filtered RPC (migrations 047 + 054) uses c.state, c.type, c.setting
--   • get_distinct_states RPC uses state column
--   • college_profile_scraper.py writes state, type, setting columns
--   • fill_missing.py reads website, description, founded_year, latitude, longitude
--   • backend/src/routes/colleges.js queries cc.state, cc.type, cc.setting
--   • src/lib/supabase.ts CollegeRow interface defines state, type, setting, website, etc.
--
-- This mismatch causes error 42703 (undefined_column) whenever
-- search_colleges_filtered is called, completely preventing college loading.
--
-- FIX
-- ---
-- 1. Add all expected columns using ADD COLUMN IF NOT EXISTS (safe to re-run).
-- 2. Copy data from old column names where they exist, so any existing scraped
--    data is preserved.
-- 3. Re-grant RLS so anon role can read the updated table.
--
-- IMPORTANT: Run this in the Supabase SQL Editor for your project.
--   Dashboard → SQL Editor → New query → paste → Run

-- ─── 1. Add missing columns ──────────────────────────────────────────────────

ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS state           TEXT;
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS type            TEXT;
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS setting         TEXT;
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS control         TEXT;
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS size_category   TEXT;
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS logo_url        TEXT;
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS description     TEXT;
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS website         TEXT;
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS founded_year    INTEGER;
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS latitude        DOUBLE PRECISION;
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS longitude       DOUBLE PRECISION;

-- ─── 2. Back-fill from old column names (when they exist) ─────────────────

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

  -- founding_year (migration 011 original name) → founded_year (new expected name)
  -- Note: these are two *different* column names: "founding_year" vs "founded_year"
  -- The EXECUTE block copies the old "founding_year" value into the new "founded_year"
  -- column added by ALTER TABLE above.
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

-- ─── 3. Add indexes for the new filter columns ────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_colleges_comp_state   ON colleges_comprehensive (state);
CREATE INDEX IF NOT EXISTS idx_colleges_comp_type    ON colleges_comprehensive (type);
CREATE INDEX IF NOT EXISTS idx_colleges_comp_setting ON colleges_comprehensive (setting);

-- ─── 4. Ensure RLS public-read policies still cover the updated table ─────────

-- The GRANT and policy are idempotent (re-running this file is safe).
GRANT SELECT ON colleges_comprehensive TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'colleges_comprehensive' AND policyname = 'public_read'
  ) THEN
    ALTER TABLE IF EXISTS colleges_comprehensive ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read ON colleges_comprehensive
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- ─── 5. Recreate search_colleges_filtered with explicit column references ─────
--
-- The previous version (migrations 047 + 054) was written assuming the table
-- would have state, type, setting columns, which did not yet exist. This
-- recreation is identical in logic but runs AFTER the columns have been added,
-- so PostgreSQL will successfully validate the column references.

CREATE OR REPLACE FUNCTION search_colleges_filtered(
  p_query          text    DEFAULT NULL,
  p_country        text    DEFAULT NULL,
  p_state          text    DEFAULT NULL,
  p_type           text    DEFAULT NULL,
  p_setting        text    DEFAULT NULL,
  p_min_acceptance float8  DEFAULT NULL,
  p_max_acceptance float8  DEFAULT NULL,
  p_max_tuition    float8  DEFAULT NULL,
  p_sort_by        text    DEFAULT 'name',
  p_page           int     DEFAULT 1,
  p_page_size      int     DEFAULT 20
)
RETURNS TABLE (total int, ids json)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sort_by text;
BEGIN
  IF p_sort_by NOT IN ('name', 'acceptance_rate', 'tuition') THEN
    v_sort_by := 'name';
  ELSE
    v_sort_by := p_sort_by;
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      c.id,
      c.name,
      ca.acceptance_rate,
      COALESCE(cf.tuition_out_state, cf.tuition_international) AS tuition
    FROM   colleges_comprehensive c
    LEFT JOIN LATERAL (
      SELECT acceptance_rate
      FROM   college_admissions
      WHERE  college_id = c.id
      ORDER  BY id
      LIMIT  1
    ) ca ON TRUE
    LEFT JOIN LATERAL (
      SELECT tuition_out_state, tuition_international
      FROM   college_financial_data
      WHERE  college_id = c.id
      ORDER  BY id
      LIMIT  1
    ) cf ON TRUE
    WHERE
          (p_query          IS NULL OR c.name     ILIKE '%' || p_query || '%')
      AND (p_country        IS NULL OR c.country  =     p_country)
      AND (p_state          IS NULL OR c.state    =     p_state)
      AND (p_type           IS NULL OR c.type     =     p_type)
      AND (p_setting        IS NULL OR c.setting  =     p_setting)
      AND (p_min_acceptance IS NULL OR ca.acceptance_rate >= p_min_acceptance)
      AND (p_max_acceptance IS NULL OR ca.acceptance_rate <= p_max_acceptance)
      AND (
        p_max_tuition IS NULL
        OR COALESCE(cf.tuition_out_state, cf.tuition_international) <= p_max_tuition
      )
  ),
  counted AS (SELECT COUNT(*)::int AS total FROM filtered),
  paginated AS (
    SELECT id
    FROM   filtered
    ORDER BY
      CASE WHEN v_sort_by = 'acceptance_rate' THEN acceptance_rate END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'tuition'         THEN tuition         END ASC NULLS LAST,
      name ASC
    LIMIT  p_page_size
    OFFSET (p_page - 1) * p_page_size
  )
  SELECT
    c.total,
    COALESCE((SELECT json_agg(id) FROM paginated), '[]'::json)
  FROM counted c;
END;
$$;

GRANT EXECUTE ON FUNCTION search_colleges_filtered TO anon, authenticated;

-- ─── 6. Recreate get_distinct_states with guaranteed state column ─────────────

CREATE OR REPLACE FUNCTION get_distinct_states()
RETURNS TABLE (state text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT state
  FROM   colleges_comprehensive
  WHERE  state IS NOT NULL
  ORDER  BY state;
$$;

GRANT EXECUTE ON FUNCTION get_distinct_states TO anon, authenticated;

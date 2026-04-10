-- Migration 054: Fix Bug 6 — Supabase colleges not loading
--
-- TWO root causes identified:
--
-- 1. RETURNS json scalar ambiguity
--    The previous search_colleges_filtered used RETURNS json (a scalar).
--    PostgREST wraps scalar returns differently across versions:
--      • PostgREST < v12 returns [{"search_colleges_filtered": {...}}]
--        so rpcData[0].total is UNDEFINED → total = 0 → zero results.
--      • PostgREST v12+ returns the json value directly (no array).
--    Changing to RETURNS TABLE(total int, ids json) gives a consistent
--    [{"total": N, "ids": [...]}] shape in ALL PostgREST versions.
--
-- 2. Row-Level Security silently blocks Phase 2 direct table reads
--    The searchColleges() function has two phases:
--      Phase 1 – RPC with SECURITY DEFINER → bypasses RLS → returns IDs.
--      Phase 2 – direct anon-key SELECT .in('id', ids) → subject to RLS.
--    If RLS is enabled on colleges_comprehensive (the Supabase dashboard
--    encourages this for production), Phase 2 returns [] with no error.
--    The UI shows the correct total count but an empty college grid.
--    Fix: grant SELECT to anon/authenticated and add permissive read
--    policies so college data is publicly readable regardless of RLS state.
--
-- Safe to re-run (CREATE OR REPLACE / IF NOT EXISTS / IF EXISTS guards).

-- ─── 1. Re-create search_colleges_filtered with RETURNS TABLE ─────────────────

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
-- Changed from RETURNS json (scalar) to RETURNS TABLE so PostgREST always
-- returns [{total, ids}] regardless of version, making client-side
-- destructuring straightforward and consistent.
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
          (p_query          IS NULL OR c.name    ILIKE '%' || p_query || '%')
      AND (p_country        IS NULL OR c.country  =    p_country)
      AND (p_state          IS NULL OR c.state    =    p_state)
      AND (p_type           IS NULL OR c.type     =    p_type)
      AND (p_setting        IS NULL OR c.setting  =    p_setting)
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

-- Re-grant execute after the function was replaced
GRANT EXECUTE ON FUNCTION search_colleges_filtered TO anon, authenticated;

-- ─── 2. Grant SELECT on all college-related tables ────────────────────────────
--
-- Without these grants the anon/authenticated roles cannot read the tables
-- directly (Phase 2 of searchColleges, getCollegeById, compareColleges, etc.).
-- The grants are safe to run even if RLS is disabled — they simply ensure the
-- roles have the necessary privilege.

GRANT SELECT ON colleges_comprehensive     TO anon, authenticated;
GRANT SELECT ON college_admissions         TO anon, authenticated;
GRANT SELECT ON college_financial_data     TO anon, authenticated;
GRANT SELECT ON academic_details           TO anon, authenticated;
GRANT SELECT ON college_programs           TO anon, authenticated;
GRANT SELECT ON student_demographics       TO anon, authenticated;
GRANT SELECT ON campus_life                TO anon, authenticated;
GRANT SELECT ON college_rankings           TO anon, authenticated;
GRANT SELECT ON college_deadlines          TO anon, authenticated;
GRANT SELECT ON college_contact            TO anon, authenticated;

-- ─── 3. Permissive RLS read policies for public college data ─────────────────
--
-- If RLS was enabled on any of these tables (either by the Supabase dashboard
-- or a previous migration), an USING (true) policy makes all rows visible to
-- anon and authenticated without exposing any sensitive data.  College
-- information is publicly accessible data — there is no PII here.
--
-- Each DO block is idempotent: it only creates the policy when it does not
-- already exist, so re-running this migration is safe.

DO $$
BEGIN
  -- colleges_comprehensive
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'colleges_comprehensive' AND policyname = 'public_read'
  ) THEN
    ALTER TABLE IF EXISTS colleges_comprehensive ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read ON colleges_comprehensive
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  -- college_admissions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'college_admissions' AND policyname = 'public_read'
  ) THEN
    ALTER TABLE IF EXISTS college_admissions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read ON college_admissions
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  -- college_financial_data
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'college_financial_data' AND policyname = 'public_read'
  ) THEN
    ALTER TABLE IF EXISTS college_financial_data ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read ON college_financial_data
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  -- academic_details
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'academic_details' AND policyname = 'public_read'
  ) THEN
    ALTER TABLE IF EXISTS academic_details ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read ON academic_details
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  -- college_programs
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'college_programs' AND policyname = 'public_read'
  ) THEN
    ALTER TABLE IF EXISTS college_programs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read ON college_programs
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  -- student_demographics
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'student_demographics' AND policyname = 'public_read'
  ) THEN
    ALTER TABLE IF EXISTS student_demographics ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read ON student_demographics
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  -- campus_life
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'campus_life' AND policyname = 'public_read'
  ) THEN
    ALTER TABLE IF EXISTS campus_life ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read ON campus_life
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  -- college_rankings
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'college_rankings' AND policyname = 'public_read'
  ) THEN
    ALTER TABLE IF EXISTS college_rankings ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read ON college_rankings
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  -- college_deadlines
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'college_deadlines' AND policyname = 'public_read'
  ) THEN
    ALTER TABLE IF EXISTS college_deadlines ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read ON college_deadlines
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  -- college_contact
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'college_contact' AND policyname = 'public_read'
  ) THEN
    ALTER TABLE IF EXISTS college_contact ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read ON college_contact
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END$$;

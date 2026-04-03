-- Migration 047: Supabase RPC functions for college search & distinct lookups
--
-- Fixes three bugs introduced by the initial Supabase integration:
--
--  1. search_colleges_filtered – performs server-side JOINs on college_admissions
--     and college_financial_data before applying LIMIT/OFFSET, so acceptance_rate
--     and tuition filters are applied to the FULL dataset rather than to whatever
--     20 rows happened to be in the current page window.  Returns total count + an
--     ordered array of matching IDs for the requested page.
--
--  2. get_distinct_states / get_distinct_countries – use SELECT DISTINCT at the
--     database level so they never touch the 1,000-row PostgREST anon-key default
--     cap, regardless of how many rows colleges_comprehensive contains.
--
-- Safe to re-run (all objects are CREATE OR REPLACE).

-- ─── 1. search_colleges_filtered ─────────────────────────────────────────────

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
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH filtered AS (
  SELECT
    c.id,
    c.name,
    ca.acceptance_rate,
    COALESCE(cf.tuition_out_state, cf.tuition_international) AS tuition
  FROM   colleges_comprehensive c
  -- Pull the most recent admissions row for this college (LATERAL ensures 1 row max)
  LEFT JOIN LATERAL (
    SELECT acceptance_rate
    FROM   college_admissions
    WHERE  college_id = c.id
    ORDER  BY id
    LIMIT  1
  ) ca ON TRUE
  -- Pull the most recent financial row for this college
  LEFT JOIN LATERAL (
    SELECT tuition_out_state, tuition_international
    FROM   college_financial_data
    WHERE  college_id = c.id
    ORDER  BY id
    LIMIT  1
  ) cf ON TRUE
  WHERE
    (p_query          IS NULL OR c.name     ILIKE '%' || p_query || '%')
    AND (p_country    IS NULL OR c.country  =     p_country)
    AND (p_state      IS NULL OR c.state    =     p_state)
    AND (p_type       IS NULL OR c.type     =     p_type)
    AND (p_setting    IS NULL OR c.setting  =     p_setting)
    AND (p_min_acceptance IS NULL OR ca.acceptance_rate >= p_min_acceptance)
    AND (p_max_acceptance IS NULL OR ca.acceptance_rate <= p_max_acceptance)
    AND (
      p_max_tuition IS NULL
      OR COALESCE(cf.tuition_out_state, cf.tuition_international) <= p_max_tuition
    )
),
counted  AS (SELECT COUNT(*)::int AS total FROM filtered),
paginated AS (
  SELECT id
  FROM   filtered
  ORDER BY
    CASE WHEN p_sort_by = 'acceptance_rate' THEN acceptance_rate END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'tuition'         THEN tuition         END ASC NULLS LAST,
    name ASC
  LIMIT  p_page_size
  OFFSET (p_page - 1) * p_page_size
)
SELECT json_build_object(
  'total', c.total,
  'ids',   COALESCE((SELECT json_agg(id) FROM paginated), '[]'::json)
)
FROM counted c;
$$;

-- ─── 2. get_distinct_states ───────────────────────────────────────────────────

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

-- ─── 3. get_distinct_countries ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_distinct_countries()
RETURNS TABLE (country text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT country
  FROM   colleges_comprehensive
  WHERE  country IS NOT NULL
  ORDER  BY country;
$$;

-- ─── Grant execute to anon + authenticated roles ───────────────────────────────

GRANT EXECUTE ON FUNCTION search_colleges_filtered  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_distinct_states        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_distinct_countries     TO anon, authenticated;

-- Migration 056g: Recreate search_colleges_filtered + get_distinct_states
--
-- STEP 7 of 7 — run AFTER 056a (columns must exist) and AFTER 056d/056e
--               (indexes should exist so the planner can use them).
--
-- search_colleges_filtered (optimised)
-- -------------------------------------
-- Key improvement over migrations 047/054:
--
--   Old version: always performed two LATERAL JOINs (college_admissions +
--   college_financial_data) for every row, even when no acceptance/tuition
--   filter was active.  6,200 rows × 2 LATERAL JOINs = thousands of index
--   lookups → exceeds Supabase's 8-second anon statement_timeout.
--
--   New version: detects at function-entry time whether child-table data is
--   actually needed (only when filtering/sorting by acceptance_rate or tuition).
--   The common no-filter first-page load takes a fast path with ZERO LATERAL
--   JOINs, touching only the main table via btree/GIN indexes.
--
-- Safe to re-run (CREATE OR REPLACE).

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
  v_sort_by          text;
  v_needs_admissions bool;
  v_needs_financials bool;
BEGIN
  -- Validate sort field
  v_sort_by := CASE WHEN p_sort_by IN ('name','acceptance_rate','tuition') THEN p_sort_by ELSE 'name' END;

  -- Determine whether child-table joins are required
  v_needs_admissions := (p_min_acceptance IS NOT NULL
                         OR p_max_acceptance IS NOT NULL
                         OR v_sort_by = 'acceptance_rate');
  v_needs_financials := (p_max_tuition IS NOT NULL
                         OR v_sort_by = 'tuition');

  -- ── FAST PATH: no child-table joins needed ──────────────────────────────────
  -- When neither acceptance_rate nor tuition filtering/sorting is requested,
  -- skip both LATERAL JOINs entirely.  All 6,200+ rows are scanned using
  -- btree/GIN indexes on the main table alone.
  IF NOT v_needs_admissions AND NOT v_needs_financials THEN
    RETURN QUERY
    WITH filtered AS (
      SELECT c.id, c.name
      FROM   colleges_comprehensive c
      WHERE
            (p_query   IS NULL OR c.name    ILIKE '%' || p_query   || '%')
        AND (p_country IS NULL OR c.country =     p_country)
        AND (p_state   IS NULL OR c.state   =     p_state)
        AND (p_type    IS NULL OR c.type    =     p_type)
        AND (p_setting IS NULL OR c.setting =     p_setting)
    ),
    counted AS (SELECT COUNT(*)::int AS total FROM filtered),
    paginated AS (
      SELECT id FROM filtered
      ORDER BY name ASC
      LIMIT  p_page_size
      OFFSET (p_page - 1) * p_page_size
    )
    SELECT
      c.total,
      COALESCE((SELECT json_agg(id) FROM paginated), '[]'::json)
    FROM counted c;
    RETURN;
  END IF;

  -- ── FULL PATH: LATERAL JOINs for acceptance_rate / tuition ─────────────────
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

-- ── get_distinct_states ───────────────────────────────────────────────────────

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

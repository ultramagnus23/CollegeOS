-- 114_optimize_search_colleges.sql
-- PERF: search_colleges discovery was ~2s. The keyword filter was a correlated
-- EXISTS(institution_search_index @@ tsquery) evaluated per candidate row, so the
-- search_document GIN index couldn't drive the scan (25k+ buffer hits). Rewrite so
-- the keyword match is a single GIN-indexed CTE, and compare country_code directly
-- (it is normalized to ISO uppercase by migration 108) so mv_college_cards_idx_
-- country_rank is usable. Same signature + behavior, just faster.

CREATE OR REPLACE FUNCTION canonical.search_colleges(
  p_q              text    DEFAULT NULL,
  p_keywords       text    DEFAULT NULL,
  p_country        text    DEFAULT NULL,
  p_max_tuition    numeric DEFAULT NULL,
  p_min_acceptance numeric DEFAULT NULL,
  p_max_acceptance numeric DEFAULT NULL,
  p_test_optional  boolean DEFAULT NULL,
  p_sort           text    DEFAULT 'relevance',
  p_limit          integer DEFAULT 20,
  p_offset         integer DEFAULT 0
)
RETURNS TABLE (institution_id uuid, score real)
LANGUAGE sql
STABLE
SET search_path = canonical, public
AS $$
  WITH ent AS (
    SELECT s.institution_id, s.score
    FROM canonical.search_institutions(p_q, 1000, 0) s
    WHERE p_q IS NOT NULL AND length(btrim(p_q)) > 0
  ),
  kw AS (
    -- single GIN-indexed full-text scan for the major/keyword term
    SELECT si.institution_id
    FROM canonical.institution_search_index si
    WHERE p_keywords IS NOT NULL AND length(btrim(p_keywords)) > 0
      AND si.search_document @@ websearch_to_tsquery('english', p_keywords)
  ),
  filtered AS (
    SELECT m.id,
           m.global_rank, m.acceptance_rate, m.cost_of_attendance,
           m.median_start_salary, m.popularity_score,
           e.score AS ent_score
    FROM canonical.mv_college_cards m
    LEFT JOIN ent e ON e.institution_id = m.id
    WHERE (p_q IS NULL OR length(btrim(p_q)) = 0 OR e.institution_id IS NOT NULL)
      AND (p_keywords IS NULL OR length(btrim(p_keywords)) = 0 OR m.id IN (SELECT institution_id FROM kw))
      AND (p_country IS NULL OR m.country_code = upper(p_country))
      AND (p_max_tuition IS NULL OR m.cost_of_attendance <= p_max_tuition)
      AND (p_min_acceptance IS NULL OR m.acceptance_rate >= p_min_acceptance)
      AND (p_max_acceptance IS NULL OR m.acceptance_rate <= p_max_acceptance)
      AND (p_test_optional IS NULL OR m.test_optional = p_test_optional)
  )
  SELECT id, COALESCE(ent_score, 0)::real AS score
  FROM filtered
  ORDER BY
    CASE WHEN p_sort = 'ranking'    THEN global_rank END ASC NULLS LAST,
    CASE WHEN p_sort = 'tuition'    THEN cost_of_attendance END ASC NULLS LAST,
    CASE WHEN p_sort = 'salary'     THEN median_start_salary END DESC NULLS LAST,
    CASE WHEN p_sort = 'acceptance' THEN acceptance_rate END ASC NULLS LAST,
    CASE WHEN p_sort = 'relevance'  THEN COALESCE(ent_score, 0) END DESC NULLS LAST,
    popularity_score DESC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 20), 0)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION
  canonical.search_colleges(text, text, text, numeric, numeric, numeric, boolean, text, integer, integer)
  TO anon, authenticated, service_role;

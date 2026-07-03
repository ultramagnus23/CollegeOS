-- Migration 138: add institution-type filter to search_colleges
--
-- canonical.mv_college_cards.institution_type has real data for 8,368/8,500
-- institutions but with inconsistent casing across ingestion sources
-- ("Public" vs "public", "For-Profit" vs "for-profit", etc.) -- an ILIKE
-- (case-insensitive) exact match avoids silently missing half the real rows
-- for a given category, which a case-sensitive equality filter would do.

-- CREATE OR REPLACE does not replace a function when the parameter list
-- changes (learned the hard way in migration 137) -- it silently creates a
-- second overload instead, making calls with the old arg count ambiguous.
-- Drop the previous (11-arg) signature explicitly first.
DROP FUNCTION IF EXISTS canonical.search_colleges(
  text, text, text, numeric, numeric, numeric, boolean, text, integer, integer, text
);

CREATE OR REPLACE FUNCTION canonical.search_colleges(
  p_q text DEFAULT NULL::text,
  p_keywords text DEFAULT NULL::text,
  p_country text DEFAULT NULL::text,
  p_max_tuition numeric DEFAULT NULL::numeric,
  p_min_acceptance numeric DEFAULT NULL::numeric,
  p_max_acceptance numeric DEFAULT NULL::numeric,
  p_test_optional boolean DEFAULT NULL::boolean,
  p_sort text DEFAULT 'relevance'::text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_program text DEFAULT NULL::text,
  p_institution_type text DEFAULT NULL::text
)
RETURNS TABLE(institution_id uuid, score real)
LANGUAGE sql
STABLE
SET search_path TO 'canonical', 'public'
AS $function$
  WITH ent AS (
    SELECT s.institution_id, s.score
    FROM canonical.search_institutions(p_q, 1000, 0) s
    WHERE p_q IS NOT NULL AND length(btrim(p_q)) > 0
  ),
  kw AS (
    SELECT si.institution_id,
           ts_rank(si.search_document, websearch_to_tsquery('english', p_keywords)) AS kwrank
    FROM canonical.institution_search_index si
    WHERE p_keywords IS NOT NULL AND length(btrim(p_keywords)) > 0
      AND si.search_document @@ websearch_to_tsquery('english', p_keywords)
  ),
  filtered AS (
    SELECT m.id,
           m.global_rank, m.acceptance_rate, m.cost_of_attendance,
           m.median_start_salary, m.popularity_score,
           e.score AS ent_score,
           COALESCE(k.kwrank, 0) AS kw_rank
    FROM canonical.mv_college_cards m
    LEFT JOIN ent e ON e.institution_id = m.id
    LEFT JOIN kw  k ON k.institution_id = m.id
    WHERE (p_q IS NULL OR length(btrim(p_q)) = 0 OR e.institution_id IS NOT NULL)
      AND (p_keywords IS NULL OR length(btrim(p_keywords)) = 0 OR k.institution_id IS NOT NULL)
      AND (p_country IS NULL OR m.country_code = upper(p_country))
      AND (p_max_tuition IS NULL OR m.cost_of_attendance <= p_max_tuition)
      AND (p_min_acceptance IS NULL OR m.acceptance_rate >= p_min_acceptance)
      AND (p_max_acceptance IS NULL OR m.acceptance_rate <= p_max_acceptance)
      AND (p_test_optional IS NULL OR m.test_optional = p_test_optional)
      AND (p_program IS NULL OR length(btrim(p_program)) = 0 OR EXISTS (
        SELECT 1 FROM canonical.institution_programs ip
        WHERE ip.institution_id = m.id AND ip.program_name = p_program
      ))
      AND (p_institution_type IS NULL OR length(btrim(p_institution_type)) = 0
           OR m.institution_type ILIKE p_institution_type)
  )
  SELECT id, GREATEST(COALESCE(ent_score, 0), COALESCE(kw_rank, 0))::real AS score
  FROM filtered
  ORDER BY
    CASE WHEN p_sort = 'ranking'    THEN global_rank END ASC NULLS LAST,
    CASE WHEN p_sort = 'tuition'    THEN cost_of_attendance END ASC NULLS LAST,
    CASE WHEN p_sort = 'salary'     THEN median_start_salary END DESC NULLS LAST,
    CASE WHEN p_sort = 'acceptance' THEN acceptance_rate END ASC NULLS LAST,
    CASE WHEN p_sort = 'popularity' AND global_rank IS NOT NULL THEN 0 ELSE 1 END ASC,
    CASE WHEN p_sort = 'popularity' THEN global_rank END ASC NULLS LAST,
    CASE WHEN p_sort = 'popularity' THEN acceptance_rate END ASC NULLS LAST,
    CASE WHEN p_sort = 'relevance' THEN COALESCE(ent_score, 0) END DESC NULLS LAST,
    CASE WHEN p_sort = 'relevance' AND global_rank IS NOT NULL THEN 0 ELSE 1 END ASC,
    CASE WHEN p_sort = 'relevance' THEN global_rank END ASC NULLS LAST,
    CASE WHEN p_sort = 'relevance' THEN acceptance_rate END ASC NULLS LAST,
    CASE WHEN p_sort = 'relevance' THEN kw_rank END DESC NULLS LAST,
    popularity_score DESC NULLS LAST,
    global_rank ASC NULLS LAST,
    id ASC
  LIMIT GREATEST(COALESCE(p_limit, 20), 0)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$function$;

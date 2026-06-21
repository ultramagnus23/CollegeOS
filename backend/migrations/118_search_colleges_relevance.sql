-- 118_search_colleges_relevance.sql
-- Fix major/keyword search relevance in canonical.search_colleges.
--
-- BUG (verified on live DB 2026-06-21): for a keyword/major query (e.g. "engineering",
-- "computer science") the relevance ordering collapsed to `popularity_score DESC` —
-- but popularity_score is 0 for 8,243 of 8,244 institutions, so results came back in
-- arbitrary physical scan order (Itawamba Community College / Oxnard College ranked
-- above MIT, Stanford, Caltech). The keyword CTE also discarded the full-text match
-- rank entirely.
--
-- FIX: keep the entity/acronym path exactly as-is (it works: "MIT" -> Massachusetts
-- Institute of Technology), but rank keyword/major matches by real quality signals
-- that actually have data — global_rank (ranked schools first, better rank first),
-- then selectivity (acceptance_rate ASC as a prestige proxy for the ~7,900 unranked),
-- then the full-text match strength (ts_rank). popularity_score is demoted to a final
-- tiebreaker until it is actually populated (see backfillPopularityScore.js).
--
-- Verified after applying: "engineering"/"computer science" -> MIT #1, Stanford #3,
-- Harvard #5, Caltech #6; "MIT"/"UCLA"/"NYU" still resolve to the right institution.

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
  p_offset integer DEFAULT 0
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
    -- single GIN-indexed full-text scan for the major/keyword term, KEEPING the rank
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
  )
  SELECT id, GREATEST(COALESCE(ent_score, 0), COALESCE(kw_rank, 0))::real AS score
  FROM filtered
  ORDER BY
    CASE WHEN p_sort = 'ranking'    THEN global_rank END ASC NULLS LAST,
    CASE WHEN p_sort = 'tuition'    THEN cost_of_attendance END ASC NULLS LAST,
    CASE WHEN p_sort = 'salary'     THEN median_start_salary END DESC NULLS LAST,
    CASE WHEN p_sort = 'acceptance' THEN acceptance_rate END ASC NULLS LAST,
    -- relevance (default): entity/acronym match first, then institutional quality
    -- (ranked schools first, better global_rank, then more selective), then keyword
    -- full-text strength. popularity_score is only a last-resort tiebreaker.
    CASE WHEN p_sort = 'relevance' THEN COALESCE(ent_score, 0) END DESC NULLS LAST,
    CASE WHEN p_sort = 'relevance' AND global_rank IS NOT NULL THEN 0 ELSE 1 END ASC,
    CASE WHEN p_sort = 'relevance' THEN global_rank END ASC NULLS LAST,
    CASE WHEN p_sort = 'relevance' THEN acceptance_rate END ASC NULLS LAST,
    CASE WHEN p_sort = 'relevance' THEN kw_rank END DESC NULLS LAST,
    popularity_score DESC NULLS LAST,
    global_rank ASC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 20), 0)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$function$;

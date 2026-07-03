-- Migration 136: fix search_colleges pagination stability + add real program filter
--
-- BUG (reported live, verified on live DB 2026-07-03): browsing /colleges with
-- "Most Popular", "Ranking", or any other sort showed the same handful of
-- institutions repeating across pages, or missing institutions entirely.
--
-- Root cause #1: this RPC's final ORDER BY tiebreakers were
-- `popularity_score DESC NULLS LAST, global_rank ASC NULLS LAST` -- but
-- popularity_score is 0 for 8,499/8,500 institutions (99.99%) and global_rank
-- is NULL for 8,395/8,500 (98.8%). With no deterministic final tiebreaker,
-- Postgres has no guaranteed stable order among that many tied rows, so
-- separate LIMIT/OFFSET calls for page 1 vs page 2 can return overlapping or
-- inconsistent slices of the same tied group.
--
-- Root cause #2 (fixed in application code, not here): the frontend was
-- silently remapping "Popular"/"Ranking" sort requests to a name-sort RPC
-- call, then re-sorting only the ~20 already-fetched rows client-side --
-- meaning the sort selector never actually changed which institutions were
-- fetched, only their order within an alphabetically-paginated slice.
--
-- Fix: add `id ASC` as an absolute final tiebreaker, and add a real
-- 'popularity' sort case (aliased to the same ranked-then-selective quality
-- ordering already used for 'relevance', since no genuine popularity signal
-- exists in the data -- honest reuse of a real signal, not a fabricated one).
--
-- Also adds p_program: an EXISTS filter against institution_programs so the
-- "Program" dropdown (previously wired to a completely disconnected legacy
-- table and never even passed to a query) can do real filtering.

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
  p_program text DEFAULT NULL::text
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
      AND (p_program IS NULL OR length(btrim(p_program)) = 0 OR EXISTS (
        SELECT 1 FROM canonical.institution_programs ip
        WHERE ip.institution_id = m.id AND ip.program_name = p_program
      ))
  )
  SELECT id, GREATEST(COALESCE(ent_score, 0), COALESCE(kw_rank, 0))::real AS score
  FROM filtered
  ORDER BY
    CASE WHEN p_sort = 'ranking'    THEN global_rank END ASC NULLS LAST,
    CASE WHEN p_sort = 'tuition'    THEN cost_of_attendance END ASC NULLS LAST,
    CASE WHEN p_sort = 'salary'     THEN median_start_salary END DESC NULLS LAST,
    CASE WHEN p_sort = 'acceptance' THEN acceptance_rate END ASC NULLS LAST,
    -- 'popularity': no real popularity signal exists (popularity_score is 0 for
    -- 99.99% of rows) -- reuse the same honest quality proxy as 'relevance'
    -- (ranked schools first, then more selective) rather than sort by a column
    -- that's tied for nearly every row.
    CASE WHEN p_sort = 'popularity' AND global_rank IS NOT NULL THEN 0 ELSE 1 END ASC,
    CASE WHEN p_sort = 'popularity' THEN global_rank END ASC NULLS LAST,
    CASE WHEN p_sort = 'popularity' THEN acceptance_rate END ASC NULLS LAST,
    -- relevance (default): entity/acronym match first, then institutional quality
    -- (ranked schools first, better global_rank, then more selective), then keyword
    -- full-text strength. popularity_score is only a last-resort tiebreaker.
    CASE WHEN p_sort = 'relevance' THEN COALESCE(ent_score, 0) END DESC NULLS LAST,
    CASE WHEN p_sort = 'relevance' AND global_rank IS NOT NULL THEN 0 ELSE 1 END ASC,
    CASE WHEN p_sort = 'relevance' THEN global_rank END ASC NULLS LAST,
    CASE WHEN p_sort = 'relevance' THEN acceptance_rate END ASC NULLS LAST,
    CASE WHEN p_sort = 'relevance' THEN kw_rank END DESC NULLS LAST,
    popularity_score DESC NULLS LAST,
    global_rank ASC NULLS LAST,
    -- Absolute final tiebreaker: guarantees a deterministic, stable order
    -- across separate paginated calls regardless of how many rows are tied
    -- on every sort key above (the actual root cause of the pagination bug).
    id ASC
  LIMIT GREATEST(COALESCE(p_limit, 20), 0)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$function$;

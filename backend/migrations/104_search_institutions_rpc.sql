-- 104_search_institutions_rpc.sql
-- SEARCH P0: ranked entity-resolution function the frontend calls instead of the
-- naive ILIKE-on-empty-index it uses today. Reuses existing trigram GIN indexes
-- (idx_inst_name_trgm on institutions.normalized_name, idx_alias_normalized_trgm
-- on institution_aliases.normalized_alias) + the aliases backfilled in 103.
--
-- Ranking tiers (highest first): exact name -> exact alias -> exact acronym ->
-- name prefix -> fuzzy name -> fuzzy alias, with popularity as the tie-breaker.
-- Returns ranked institution ids; the frontend then hydrates mv_college_cards.

CREATE OR REPLACE FUNCTION canonical.search_institutions(
  p_q text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (institution_id uuid, score real)
LANGUAGE sql
STABLE
SET search_path = canonical, public
AS $$
  WITH params AS (
    SELECT canonical.normalize_search_text(p_q) AS nq,
           replace(canonical.normalize_search_text(p_q), ' ', '') AS aq
  ),
  -- Narrow candidates using the trigram indexes (name OR any alias).
  cand AS (
    SELECT i.id
    FROM canonical.institutions i, params p
    WHERE p.nq IS NOT NULL AND i.normalized_name % p.nq
    UNION
    SELECT a.institution_id
    FROM canonical.institution_aliases a, params p
    WHERE p.nq IS NOT NULL AND (a.normalized_alias % p.nq OR a.normalized_alias % p.aq)
  ),
  scored AS (
    SELECT
      i.id,
      i.popularity_score,
      GREATEST(
        CASE WHEN i.normalized_name = p.nq THEN 1.00 ELSE 0 END,
        CASE WHEN i.normalized_name LIKE p.nq || '%' THEN 0.60 ELSE 0 END,
        GREATEST(similarity(i.normalized_name, p.nq),
                 word_similarity(p.nq, i.normalized_name)) * 0.90,
        COALESCE((
          SELECT GREATEST(
                   MAX(CASE WHEN a.normalized_alias = p.nq THEN 0.97
                            WHEN a.normalized_alias = p.aq THEN 0.95 ELSE 0 END),
                   MAX(GREATEST(similarity(a.normalized_alias, p.nq),
                               similarity(a.normalized_alias, p.aq))) * 0.90
                 )
          FROM canonical.institution_aliases a
          WHERE a.institution_id = i.id
        ), 0)
      )::real AS score
    FROM canonical.institutions i, params p
    WHERE i.id IN (SELECT id FROM cand)
  )
  SELECT id, score
  FROM scored
  WHERE score >= 0.20
  ORDER BY score DESC, popularity_score DESC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 20), 0)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- Expose to the API roles used by the frontend (PostgREST RPC).
GRANT EXECUTE ON FUNCTION canonical.search_institutions(text, integer, integer)
  TO anon, authenticated, service_role;

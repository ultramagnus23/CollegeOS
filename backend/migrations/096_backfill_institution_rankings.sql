-- 096_backfill_institution_rankings.sql
-- H2 backfill: canonical.institution_rankings is empty -> mv_college_cards.global_rank
-- is always NULL. public.college_rankings holds 748 rows (QS 628, NIRF 120).
-- QS = global ranking; NIRF = India national ranking. Unique key already exists:
-- (institution_id, ranking_body, ranking_year). Never overwrites.

INSERT INTO canonical.institution_rankings (
  institution_id,
  ranking_year,
  ranking_body,
  global_rank,
  national_rank,
  source_attribution
)
SELECT
  idm.institution_id,
  cr.ranking_year,
  CASE WHEN cr.ranking_source ILIKE 'QS%' THEN 'QS' ELSE cr.ranking_source END,
  CASE WHEN cr.ranking_source ILIKE 'QS%' THEN cr.ranking_value::int END,
  CASE WHEN cr.ranking_source = 'NIRF'      THEN cr.ranking_value::int END,
  jsonb_build_object(
    'source', cr.ranking_source,
    'source_table', 'public.college_rankings',
    'confidence', 0.85,
    'last_verified_at', now()
  )
FROM public.college_rankings cr
JOIN canonical.institution_identity_map idm
  ON idm.source_table = 'public.colleges_comprehensive'
 AND idm.source_pk = cr.college_id::text
 AND idm.is_canonical_match = true
WHERE cr.ranking_value ~ '^[0-9]+$'
ON CONFLICT (institution_id, ranking_body, ranking_year) DO NOTHING;

-- Recompute popularity from the freshly-loaded ranks (function from migration 082).
SELECT canonical.refresh_popularity_score_from_rankings();

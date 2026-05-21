-- Rebuild canonical/public college cards projection with stable contracts

DROP VIEW IF EXISTS public.mv_college_cards;
DROP MATERIALIZED VIEW IF EXISTS public.mv_college_cards;

DROP VIEW IF EXISTS canonical.mv_college_cards;
DROP MATERIALIZED VIEW IF EXISTS canonical.mv_college_cards;

CREATE MATERIALIZED VIEW canonical.mv_college_cards AS
SELECT
  i.id,
  i.canonical_name,
  i.country_code,
  i.state_region,
  i.city,
  i.website,
  i.logo_url,
  i.metadata->>'description' AS description,
  i.institution_type,
  COALESCE(pi.popularity_score, i.popularity_score, 0)::numeric AS popularity_score,
  lr.global_rank,
  la.acceptance_rate,
  la.test_optional,
  la.sat_50,
  la.act_50,
  lf.tuition_international,
  lf.cost_of_attendance,
  lf.avg_financial_aid,
  lf.merit_scholarship_flag,
  lf.need_blind_flag,
  lo.graduation_rate_4yr,
  lo.employment_rate,
  lo.median_start_salary,
  COALESCE(i.metadata, '{}'::jsonb) AS metadata,
  GREATEST(
    COALESCE(i.updated_at, NOW()),
    COALESCE(pi.updated_at, to_timestamp(0)),
    COALESCE(la.updated_at, to_timestamp(0)),
    COALESCE(lf.updated_at, to_timestamp(0)),
    COALESCE(lo.updated_at, to_timestamp(0))
  ) AS updated_at
FROM canonical.institutions i
LEFT JOIN canonical.popularity_index pi
  ON pi.institution_id = i.id
LEFT JOIN LATERAL (
  SELECT r.global_rank
  FROM canonical.institution_rankings r
  WHERE r.institution_id = i.id
  ORDER BY r.ranking_year DESC NULLS LAST, r.created_at DESC NULLS LAST
  LIMIT 1
) lr ON true
LEFT JOIN LATERAL (
  SELECT
    a.acceptance_rate,
    a.test_optional,
    a.sat_50,
    a.act_50,
    a.updated_at
  FROM canonical.institution_admissions a
  WHERE a.institution_id = i.id
  ORDER BY a.data_year DESC NULLS LAST, a.updated_at DESC NULLS LAST
  LIMIT 1
) la ON true
LEFT JOIN LATERAL (
  SELECT
    f.tuition_international,
    f.cost_of_attendance,
    f.avg_financial_aid,
    f.merit_scholarship_flag,
    f.need_blind_flag,
    f.updated_at
  FROM canonical.institution_financials f
  WHERE f.institution_id = i.id
  ORDER BY f.data_year DESC NULLS LAST, f.updated_at DESC NULLS LAST
  LIMIT 1
) lf ON true
LEFT JOIN LATERAL (
  SELECT
    o.graduation_rate_4yr,
    o.employment_rate,
    o.median_start_salary,
    o.updated_at
  FROM canonical.institution_outcomes o
  WHERE o.institution_id = i.id
  ORDER BY o.data_year DESC NULLS LAST, o.updated_at DESC NULLS LAST
  LIMIT 1
) lo ON true
WHERE i.canonical_name IS NOT NULL;

CREATE VIEW public.mv_college_cards AS
SELECT
  id,
  canonical_name,
  country_code,
  state_region,
  city,
  website,
  logo_url,
  description,
  institution_type,
  popularity_score,
  global_rank,
  acceptance_rate,
  test_optional,
  sat_50,
  act_50,
  tuition_international,
  cost_of_attendance,
  avg_financial_aid,
  merit_scholarship_flag,
  need_blind_flag,
  graduation_rate_4yr,
  employment_rate,
  median_start_salary,
  metadata
FROM canonical.mv_college_cards;

CREATE UNIQUE INDEX IF NOT EXISTS mv_college_cards_idx_id
  ON canonical.mv_college_cards (id);

CREATE INDEX IF NOT EXISTS mv_college_cards_idx_popularity
  ON canonical.mv_college_cards (popularity_score DESC NULLS LAST, global_rank ASC NULLS LAST);

CREATE INDEX IF NOT EXISTS mv_college_cards_idx_country_rank
  ON canonical.mv_college_cards (country_code, global_rank ASC NULLS LAST, popularity_score DESC NULLS LAST);

REFRESH MATERIALIZED VIEW canonical.mv_college_cards;

GRANT SELECT ON canonical.mv_college_cards TO anon;
GRANT SELECT ON canonical.mv_college_cards TO authenticated;
GRANT SELECT ON public.mv_college_cards TO anon;
GRANT SELECT ON public.mv_college_cards TO authenticated;

DO $$
DECLARE
  required_cols TEXT[] := ARRAY[
    'id',
    'canonical_name',
    'country_code',
    'state_region',
    'city',
    'website',
    'logo_url',
    'description',
    'institution_type',
    'popularity_score',
    'global_rank',
    'acceptance_rate',
    'test_optional',
    'sat_50',
    'act_50',
    'tuition_international',
    'cost_of_attendance',
    'avg_financial_aid',
    'merit_scholarship_flag',
    'need_blind_flag',
    'graduation_rate_4yr',
    'employment_rate',
    'median_start_salary',
    'metadata'
  ];
  col TEXT;
BEGIN
  FOREACH col IN ARRAY required_cols LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'canonical'
        AND table_name = 'mv_college_cards'
        AND column_name = col
    ) THEN
      RAISE EXCEPTION 'canonical.mv_college_cards missing required column: %', col;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'mv_college_cards'
        AND column_name = col
    ) THEN
      RAISE EXCEPTION 'public.mv_college_cards missing required column: %', col;
    END IF;
  END LOOP;
END $$;

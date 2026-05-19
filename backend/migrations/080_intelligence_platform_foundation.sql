-- 080_intelligence_platform_foundation.sql
-- Foundation objects for the recommendation + discovery intelligence layer.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS canonical;

CREATE TABLE IF NOT EXISTS canonical.institution_embeddings (
  institution_id UUID PRIMARY KEY REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  embedding VECTOR(768) NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_version TEXT NOT NULL DEFAULT 'v1',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS institution_embeddings_updated_idx
  ON canonical.institution_embeddings (updated_at DESC);

CREATE INDEX IF NOT EXISTS institution_embeddings_ivfflat_cosine_idx
  ON canonical.institution_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE TABLE IF NOT EXISTS canonical.major_taxonomy (
  id BIGSERIAL PRIMARY KEY,
  canonical_major TEXT NOT NULL,
  major_alias TEXT NOT NULL,
  field_category TEXT NOT NULL,
  related_majors TEXT[] NOT NULL DEFAULT '{}',
  subject_rank_mapping TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (canonical_major, major_alias)
);

CREATE INDEX IF NOT EXISTS major_taxonomy_alias_idx
  ON canonical.major_taxonomy (LOWER(major_alias));

CREATE TABLE IF NOT EXISTS canonical.popularity_index (
  institution_id UUID PRIMARY KEY REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  popularity_score NUMERIC(8,4) NOT NULL DEFAULT 0,
  ranking_prestige_score NUMERIC(8,4) NOT NULL DEFAULT 0,
  application_volume_score NUMERIC(8,4) NOT NULL DEFAULT 0,
  search_volume_score NUMERIC(8,4) NOT NULL DEFAULT 0,
  engagement_score NUMERIC(8,4) NOT NULL DEFAULT 0,
  recommendation_frequency_score NUMERIC(8,4) NOT NULL DEFAULT 0,
  global_recognition_score NUMERIC(8,4) NOT NULL DEFAULT 0,
  alumni_outcomes_score NUMERIC(8,4) NOT NULL DEFAULT 0,
  trending_delta_30d NUMERIC(8,4) NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS popularity_index_score_idx
  ON canonical.popularity_index (popularity_score DESC, trending_delta_30d DESC, updated_at DESC);

ALTER TABLE IF EXISTS canonical.institution_deadlines
  ADD COLUMN IF NOT EXISTS parser_version TEXT,
  ADD COLUMN IF NOT EXISTS extraction_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS last_verified TIMESTAMPTZ;

ALTER TABLE IF EXISTS canonical.institution_requirements
  ADD COLUMN IF NOT EXISTS parser_version TEXT,
  ADD COLUMN IF NOT EXISTS extraction_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS last_verified TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION canonical.refresh_popularity_index()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO canonical.popularity_index (
    institution_id,
    popularity_score,
    ranking_prestige_score,
    application_volume_score,
    search_volume_score,
    engagement_score,
    recommendation_frequency_score,
    global_recognition_score,
    alumni_outcomes_score,
    trending_delta_30d,
    featured,
    updated_at
  )
  SELECT
    i.id AS institution_id,
    ROUND((
      COALESCE(ranks.rank_score, 0) * 0.35 +
      COALESCE(apps.app_score, 0) * 0.15 +
      COALESCE(searches.search_score, 0) * 0.10 +
      COALESCE(signals.engagement_score, 0) * 0.15 +
      COALESCE(signals.rec_frequency_score, 0) * 0.10 +
      COALESCE(outcomes.outcome_score, 0) * 0.15
    )::numeric, 4) AS popularity_score,
    COALESCE(ranks.rank_score, 0) AS ranking_prestige_score,
    COALESCE(apps.app_score, 0) AS application_volume_score,
    COALESCE(searches.search_score, 0) AS search_volume_score,
    COALESCE(signals.engagement_score, 0) AS engagement_score,
    COALESCE(signals.rec_frequency_score, 0) AS recommendation_frequency_score,
    COALESCE(ranks.rank_score, 0) AS global_recognition_score,
    COALESCE(outcomes.outcome_score, 0) AS alumni_outcomes_score,
    COALESCE(signals.trending_delta_30d, 0) AS trending_delta_30d,
    (COALESCE(ranks.rank_score, 0) >= 0.75 OR COALESCE(signals.rec_frequency_score, 0) >= 0.8) AS featured,
    NOW() AS updated_at
  FROM canonical.institutions i
  LEFT JOIN (
    SELECT
      ir.institution_id,
      LEAST(
        1.0,
        GREATEST(
          0.0,
          AVG(
            CASE
              WHEN ir.global_rank IS NOT NULL THEN (1000 - LEAST(ir.global_rank, 1000)) / 1000.0
              WHEN ir.national_rank IS NOT NULL THEN (500 - LEAST(ir.national_rank, 500)) / 500.0
              ELSE 0
            END
          )
        )
      ) AS rank_score
    FROM canonical.institution_rankings ir
    GROUP BY ir.institution_id
  ) ranks ON ranks.institution_id = i.id
  LEFT JOIN (
    SELECT ia.institution_id, LEAST(1.0, COALESCE(SUM(ia.application_count), 0)::numeric / 50000.0) AS app_score
    FROM canonical.institution_admissions ia
    GROUP BY ia.institution_id
  ) apps ON apps.institution_id = i.id
  LEFT JOIN (
    SELECT isi.institution_id, LEAST(1.0, COALESCE(MAX(isi.search_frequency), 0)::numeric / 10000.0) AS search_score
    FROM canonical.institution_search_index isi
    GROUP BY isi.institution_id
  ) searches ON searches.institution_id = i.id
  LEFT JOIN (
    SELECT
      us.college_id::uuid AS institution_id,
      LEAST(1.0, COUNT(*) FILTER (WHERE us.signal_type IN ('viewed', 'added', 'saved'))::numeric / 3000.0) AS engagement_score,
      LEAST(1.0, COUNT(*) FILTER (WHERE us.signal_type IN ('added', 'saved'))::numeric / 1200.0) AS rec_frequency_score,
      (
        COUNT(*) FILTER (WHERE us.created_at >= NOW() - INTERVAL '30 days') -
        COUNT(*) FILTER (WHERE us.created_at >= NOW() - INTERVAL '60 days' AND us.created_at < NOW() - INTERVAL '30 days')
      )::numeric / 1000.0 AS trending_delta_30d
    FROM user_signals us
    WHERE us.college_id IS NOT NULL
    GROUP BY us.college_id
  ) signals ON signals.institution_id = i.id
  LEFT JOIN (
    SELECT io.institution_id, LEAST(1.0, COALESCE(MAX(io.median_earnings_6yr), 0)::numeric / 180000.0) AS outcome_score
    FROM canonical.institution_outcomes io
    GROUP BY io.institution_id
  ) outcomes ON outcomes.institution_id = i.id
  ON CONFLICT (institution_id) DO UPDATE SET
    popularity_score = EXCLUDED.popularity_score,
    ranking_prestige_score = EXCLUDED.ranking_prestige_score,
    application_volume_score = EXCLUDED.application_volume_score,
    search_volume_score = EXCLUDED.search_volume_score,
    engagement_score = EXCLUDED.engagement_score,
    recommendation_frequency_score = EXCLUDED.recommendation_frequency_score,
    global_recognition_score = EXCLUDED.global_recognition_score,
    alumni_outcomes_score = EXCLUDED.alumni_outcomes_score,
    trending_delta_30d = EXCLUDED.trending_delta_30d,
    featured = EXCLUDED.featured,
    updated_at = NOW();
END;
$$;

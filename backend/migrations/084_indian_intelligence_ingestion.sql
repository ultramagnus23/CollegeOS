-- 084_indian_intelligence_ingestion.sql
-- Canonical Indian college intelligence ingestion tables

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS canonical;

CREATE TABLE IF NOT EXISTS canonical.indian_admissions (
  id BIGSERIAL PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_confidence NUMERIC(8,4) NOT NULL DEFAULT 0,
  parser_version TEXT NOT NULL,
  extraction_timestamp TIMESTAMPTZ NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_id, source_name, source_url)
);

CREATE TABLE IF NOT EXISTS canonical.indian_fees (
  id BIGSERIAL PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_confidence NUMERIC(8,4) NOT NULL DEFAULT 0,
  parser_version TEXT NOT NULL,
  extraction_timestamp TIMESTAMPTZ NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_id, source_name, source_url)
);

CREATE TABLE IF NOT EXISTS canonical.indian_placements (
  id BIGSERIAL PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_confidence NUMERIC(8,4) NOT NULL DEFAULT 0,
  parser_version TEXT NOT NULL,
  extraction_timestamp TIMESTAMPTZ NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_id, source_name, source_url)
);

CREATE TABLE IF NOT EXISTS canonical.indian_rankings (
  id BIGSERIAL PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_confidence NUMERIC(8,4) NOT NULL DEFAULT 0,
  parser_version TEXT NOT NULL,
  extraction_timestamp TIMESTAMPTZ NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_id, source_name, source_url)
);

CREATE TABLE IF NOT EXISTS canonical.indian_exam_requirements (
  id BIGSERIAL PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_confidence NUMERIC(8,4) NOT NULL DEFAULT 0,
  parser_version TEXT NOT NULL,
  extraction_timestamp TIMESTAMPTZ NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_id, source_name, source_url)
);

CREATE TABLE IF NOT EXISTS canonical.indian_cutoffs (
  id BIGSERIAL PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_confidence NUMERIC(8,4) NOT NULL DEFAULT 0,
  parser_version TEXT NOT NULL,
  extraction_timestamp TIMESTAMPTZ NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_id, source_name, source_url)
);

CREATE TABLE IF NOT EXISTS canonical.indian_scholarships (
  id BIGSERIAL PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_confidence NUMERIC(8,4) NOT NULL DEFAULT 0,
  parser_version TEXT NOT NULL,
  extraction_timestamp TIMESTAMPTZ NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_id, source_name, source_url)
);

CREATE TABLE IF NOT EXISTS canonical.indian_programs (
  id BIGSERIAL PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_confidence NUMERIC(8,4) NOT NULL DEFAULT 0,
  parser_version TEXT NOT NULL,
  extraction_timestamp TIMESTAMPTZ NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_id, source_name, source_url)
);

CREATE INDEX IF NOT EXISTS indian_admissions_institution_idx ON canonical.indian_admissions (institution_id, extraction_timestamp DESC);
CREATE INDEX IF NOT EXISTS indian_fees_institution_idx ON canonical.indian_fees (institution_id, extraction_timestamp DESC);
CREATE INDEX IF NOT EXISTS indian_placements_institution_idx ON canonical.indian_placements (institution_id, extraction_timestamp DESC);
CREATE INDEX IF NOT EXISTS indian_rankings_institution_idx ON canonical.indian_rankings (institution_id, extraction_timestamp DESC);
CREATE INDEX IF NOT EXISTS indian_exam_requirements_institution_idx ON canonical.indian_exam_requirements (institution_id, extraction_timestamp DESC);
CREATE INDEX IF NOT EXISTS indian_cutoffs_institution_idx ON canonical.indian_cutoffs (institution_id, extraction_timestamp DESC);
CREATE INDEX IF NOT EXISTS indian_scholarships_institution_idx ON canonical.indian_scholarships (institution_id, extraction_timestamp DESC);
CREATE INDEX IF NOT EXISTS indian_programs_institution_idx ON canonical.indian_programs (institution_id, extraction_timestamp DESC);

CREATE INDEX IF NOT EXISTS institutions_name_trgm_idx
  ON canonical.institutions USING gin (canonical_name gin_trgm_ops);

CREATE OR REPLACE FUNCTION canonical.resolve_indian_institution(
  in_name TEXT,
  in_city TEXT DEFAULT NULL,
  in_state TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE sql
AS $$
  WITH candidates AS (
    SELECT
      i.id,
      i.canonical_name,
      similarity(LOWER(i.canonical_name), LOWER(COALESCE(in_name, ''))) AS name_score,
      CASE
        WHEN in_city IS NULL OR in_city = '' THEN 0
        WHEN LOWER(COALESCE(i.city, '')) = LOWER(in_city) THEN 0.15
        ELSE 0
      END AS city_bonus,
      CASE
        WHEN in_state IS NULL OR in_state = '' THEN 0
        WHEN LOWER(COALESCE(i.state_province, '')) = LOWER(in_state) THEN 0.1
        ELSE 0
      END AS state_bonus,
      CASE
        WHEN regexp_replace(LOWER(COALESCE(in_name, '')), '[^a-z0-9]', '', 'g') = regexp_replace(LOWER(COALESCE(i.canonical_name, '')), '[^a-z0-9]', '', 'g') THEN 0.2
        ELSE 0
      END AS alias_bonus
    FROM canonical.institutions i
    WHERE COALESCE(i.country_code, 'IN') = 'IN'
      AND i.canonical_name IS NOT NULL
  )
  SELECT id
  FROM candidates
  ORDER BY (name_score + city_bonus + state_bonus + alias_bonus) DESC
  LIMIT 1;
$$;

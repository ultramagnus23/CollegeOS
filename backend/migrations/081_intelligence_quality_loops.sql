-- 081_intelligence_quality_loops.sql
-- Next-phase intelligence migration: ontology, telemetry, learning loops, and evaluation history.

CREATE SCHEMA IF NOT EXISTS canonical;

CREATE TABLE IF NOT EXISTS canonical.major_ontology (
  id BIGSERIAL PRIMARY KEY,
  canonical_major TEXT NOT NULL,
  alias TEXT NOT NULL,
  synonym_group TEXT,
  parent_major TEXT,
  related_majors TEXT[] NOT NULL DEFAULT '{}',
  interdisciplinary_fields TEXT[] NOT NULL DEFAULT '{}',
  career_mappings TEXT[] NOT NULL DEFAULT '{}',
  subject_rank_mappings TEXT[] NOT NULL DEFAULT '{}',
  confidence NUMERIC(8,4) NOT NULL DEFAULT 0.8,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (canonical_major, alias)
);

CREATE INDEX IF NOT EXISTS major_ontology_alias_idx
  ON canonical.major_ontology (LOWER(alias));

CREATE INDEX IF NOT EXISTS major_ontology_canonical_idx
  ON canonical.major_ontology (LOWER(canonical_major));

CREATE TABLE IF NOT EXISTS canonical.recommendation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_ended_at TIMESTAMPTZ,
  request_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  profile_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommendation_model_version TEXT,
  retrieval_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recommendation_sessions_user_idx
  ON canonical.recommendation_sessions (user_id, session_started_at DESC);

CREATE TABLE IF NOT EXISTS canonical.user_recommendation_events (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID REFERENCES canonical.recommendation_sessions(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id UUID REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_value NUMERIC(10,4),
  dwell_ms INTEGER,
  position INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_recommendation_events_user_idx
  ON canonical.user_recommendation_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_recommendation_events_institution_idx
  ON canonical.user_recommendation_events (institution_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_recommendation_events_type_idx
  ON canonical.user_recommendation_events (event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS canonical.recommendation_feedback (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID REFERENCES canonical.recommendation_sessions(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id UUID REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  explicit_rating NUMERIC(5,2),
  fit_rating NUMERIC(5,2),
  affordability_rating NUMERIC(5,2),
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  confidence NUMERIC(8,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, institution_id)
);

CREATE INDEX IF NOT EXISTS recommendation_feedback_user_idx
  ON canonical.recommendation_feedback (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS canonical.retrieval_eval_history (
  id BIGSERIAL PRIMARY KEY,
  benchmark_name TEXT NOT NULL,
  retrieval_version TEXT NOT NULL,
  metrics JSONB NOT NULL,
  sample_size INTEGER,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canonical.ranking_eval_history (
  id BIGSERIAL PRIMARY KEY,
  benchmark_name TEXT NOT NULL,
  ranker_version TEXT NOT NULL,
  metrics JSONB NOT NULL,
  sample_size INTEGER,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canonical.experiment_assignments (
  id BIGSERIAL PRIMARY KEY,
  experiment_key TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  variant TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (experiment_key, user_id)
);

CREATE TABLE IF NOT EXISTS canonical.source_reliability (
  source_key TEXT PRIMARY KEY,
  trust_score NUMERIC(8,4) NOT NULL DEFAULT 0.6,
  extraction_accuracy NUMERIC(8,4) NOT NULL DEFAULT 0.6,
  freshness_score NUMERIC(8,4) NOT NULL DEFAULT 0.5,
  conflict_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

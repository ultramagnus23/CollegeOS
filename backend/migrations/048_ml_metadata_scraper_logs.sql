-- Migration 048: ml_metadata, scraper_logs, and ML training indexes
-- PostgreSQL-compatible. All statements are idempotent.

-- ── ml_metadata ───────────────────────────────────────────────────────────────
-- Stores the latest accuracy/metric snapshot for the global XGBoost model
-- written by scraper/training_pipeline.py.
CREATE TABLE IF NOT EXISTS ml_metadata (
  id            BIGSERIAL PRIMARY KEY,
  model_version TEXT            NOT NULL,
  accuracy      DOUBLE PRECISION NOT NULL,
  f1_score      DOUBLE PRECISION NOT NULL,
  precision_val DOUBLE PRECISION,
  recall_val    DOUBLE PRECISION,
  training_samples INTEGER       NOT NULL DEFAULT 0,
  last_trained  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  model_path    TEXT,
  encoder_path  TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ml_metadata_trained ON ml_metadata(last_trained DESC);

-- ── scraper_logs ──────────────────────────────────────────────────────────────
-- One row per scheduled scraper invocation (written by scraperScheduler.js).
CREATE TABLE IF NOT EXISTS scraper_logs (
  id           BIGSERIAL PRIMARY KEY,
  scraper_name TEXT        NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status       TEXT        NOT NULL DEFAULT 'running'
                           CHECK(status IN ('running','success','error')),
  exit_code    INTEGER,
  stdout       TEXT,
  stderr       TEXT,
  error_msg    TEXT
);

CREATE INDEX IF NOT EXISTS idx_scraper_logs_name    ON scraper_logs(scraper_name);
CREATE INDEX IF NOT EXISTS idx_scraper_logs_started ON scraper_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraper_logs_status  ON scraper_logs(status);

-- ── Indexes on scraped_applicants for ML training queries ─────────────────────
-- scraped_applicants is created by scraper/db.js at runtime (ensurePostgresSchema).
-- Add indexes here so they are applied after the table exists.
-- The DO block allows conditional DDL without failing if the table doesn't exist yet.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'scraped_applicants'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_scraped_applicants_gpa
             ON scraped_applicants(gpa)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_scraped_applicants_sat
             ON scraped_applicants(sat_score)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_scraped_applicants_act
             ON scraped_applicants(act_score)';
  END IF;
END;
$$;

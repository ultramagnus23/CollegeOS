CREATE SCHEMA IF NOT EXISTS canonical;

CREATE TABLE IF NOT EXISTS canonical.scraper_execution_history (
  id BIGSERIAL PRIMARY KEY,
  scraper_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  rows_inserted INTEGER NOT NULL DEFAULT 0,
  rows_updated INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  duplicates_detected INTEGER NOT NULL DEFAULT 0,
  runtime_ms BIGINT,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  failure_reason TEXT,
  failure_category TEXT,
  schema_mismatches INTEGER NOT NULL DEFAULT 0,
  ingestion_coverage NUMERIC(5,2),
  stale_records_detected INTEGER NOT NULL DEFAULT 0,
  diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scraper_execution_history_scraper_started
  ON canonical.scraper_execution_history (scraper_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_scraper_execution_history_success_started
  ON canonical.scraper_execution_history (success, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_scraper_execution_history_failure_category
  ON canonical.scraper_execution_history (failure_category);

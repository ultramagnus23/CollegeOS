-- Migration 068: Deadline Intelligence System
-- Enhances college_deadlines with confidence/source tracking and adds history + scrape log tables.
-- All statements are idempotent (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS).

-- ─── Unique constraint for college_deadlines (college_id, deadline_type) ──────
-- Required to support ON CONFLICT upserts in collegeDeadlineIntelligenceService.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'college_deadlines'
      AND indexname  = 'uq_college_deadlines_college_type'
  ) THEN
    CREATE UNIQUE INDEX uq_college_deadlines_college_type
      ON college_deadlines (college_id, deadline_type);
  END IF;
END
$$;

-- ─── Enhance college_deadlines ───────────────────────────────────────────────

ALTER TABLE college_deadlines
  ADD COLUMN IF NOT EXISTS source_url       TEXT,
  ADD COLUMN IF NOT EXISTS confidence_score FLOAT    DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS last_verified    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_estimated     BOOLEAN  DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS estimation_basis TEXT,
  ADD COLUMN IF NOT EXISTS source_count     INT      DEFAULT 1;

-- source hierarchy values: 'official' | 'government' | 'aggregator' | 'inferred'
ALTER TABLE college_deadlines
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'aggregator';

COMMENT ON COLUMN college_deadlines.confidence_score IS '0.0–0.4 unverified, 0.4–0.7 partial, 0.7–1.0 confirmed';
COMMENT ON COLUMN college_deadlines.is_estimated      IS 'TRUE when date was inferred from history, not scraped';
COMMENT ON COLUMN college_deadlines.estimation_basis  IS 'historical_pattern | country_average | confirmed';
COMMENT ON COLUMN college_deadlines.source_count      IS 'Number of independent sources agreeing on this date';

-- ─── deadline_history ─────────────────────────────────────────────────────────
-- Stores year-over-year snapshots; one row per (college, type, year).

CREATE TABLE IF NOT EXISTS deadline_history (
  id               BIGSERIAL PRIMARY KEY,
  college_id       INTEGER      NOT NULL REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  deadline_type    VARCHAR(100) NOT NULL,
  deadline_date    DATE,
  notification_date DATE,
  data_year        INT          NOT NULL,
  source_url       TEXT,
  confidence_score FLOAT        DEFAULT 0.5,
  is_estimated     BOOLEAN      DEFAULT FALSE,
  estimation_basis TEXT,
  recorded_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_deadline_history_college_type_year
  ON deadline_history (college_id, deadline_type, data_year);

CREATE INDEX IF NOT EXISTS idx_deadline_history_college
  ON deadline_history (college_id);

CREATE INDEX IF NOT EXISTS idx_deadline_history_year
  ON deadline_history (data_year);

-- ─── deadline_scrape_log ──────────────────────────────────────────────────────
-- Per-URL scraping attempt log (Postgres counterpart of SQLite migration 034's scraping_logs).

CREATE TABLE IF NOT EXISTS deadline_scrape_log (
  id                BIGSERIAL PRIMARY KEY,
  college_id        INTEGER     REFERENCES colleges_comprehensive(id) ON DELETE SET NULL,
  url               TEXT        NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('success', 'partial', 'failed', 'pending')),
  deadlines_found   INT         DEFAULT 0,
  confidence_score  FLOAT       DEFAULT 0.0,
  extraction_method TEXT,
  error             TEXT,
  scraped_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deadline_scrape_log_college
  ON deadline_scrape_log (college_id, scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_deadline_scrape_log_status
  ON deadline_scrape_log (status, scraped_at DESC);

SELECT 'Migration 068 complete: Deadline Intelligence System schema added';

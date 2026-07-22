-- scripts/migrations/add_ml_data_columns.sql
-- ---------------------------------------------------------------------------
-- Adds columns required by the ML data pipeline to colleges_comprehensive.
-- Safe to run multiple times (all statements use IF NOT EXISTS).
--
-- Run against your Supabase DB before the first pipeline execution:
--   psql "$SUPABASE_DB_URL" -f scripts/migrations/add_ml_data_columns.sql
-- ---------------------------------------------------------------------------

ALTER TABLE colleges_comprehensive
  -- acceptance_rate was missing entirely (colleges_comprehensive only ever had
  -- intl_acceptance_rate) even though load-to-postgres.py writes to it and the
  -- index below indexes it — this migration failed on the CREATE INDEX below
  -- for that reason until this column was added (verified live 2026-07-22).
  ADD COLUMN IF NOT EXISTS acceptance_rate           NUMERIC,
  ADD COLUMN IF NOT EXISTS median_sat_25             INT,
  ADD COLUMN IF NOT EXISTS median_sat_75             INT,
  ADD COLUMN IF NOT EXISTS median_act_25             INT,
  ADD COLUMN IF NOT EXISTS median_act_75             INT,
  ADD COLUMN IF NOT EXISTS applications_received     BIGINT,
  ADD COLUMN IF NOT EXISTS completion_rate           NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS median_earnings_post_grad INT,
  ADD COLUMN IF NOT EXISTS data_source               VARCHAR(50),
  ADD COLUMN IF NOT EXISTS last_data_refresh         TIMESTAMPTZ DEFAULT NOW();

-- Indexes for the ML chancing query layer ─────────────────────────────────────

-- Acceptance rate: used in every chancing query
CREATE INDEX IF NOT EXISTS idx_cc_acceptance_rate
  ON colleges_comprehensive(acceptance_rate);

-- Total enrollment: used for college-size filtering
CREATE INDEX IF NOT EXISTS idx_cc_total_enrollment
  ON colleges_comprehensive(total_enrollment);

-- Last refresh: used by monitoring / health-check queries
CREATE INDEX IF NOT EXISTS idx_cc_last_data_refresh
  ON colleges_comprehensive(last_data_refresh DESC NULLS LAST);

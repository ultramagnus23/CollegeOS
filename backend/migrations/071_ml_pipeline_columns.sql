-- Migration: 071_ml_pipeline_columns.sql
-- ---------------------------------------------------------------------------
-- Adds columns required by the ML data pipeline (fetch-ipeds.py,
-- fetch-cds-web.py, load-to-postgres.py) to colleges_comprehensive.
--
-- Columns sat_25/75 and act_25/75 already exist from migration 066;
-- this migration adds only the truly new pipeline-support columns.
-- ---------------------------------------------------------------------------

ALTER TABLE colleges_comprehensive
  ADD COLUMN IF NOT EXISTS applications_received  BIGINT,
  ADD COLUMN IF NOT EXISTS data_source            VARCHAR(50),
  ADD COLUMN IF NOT EXISTS last_data_refresh      TIMESTAMPTZ DEFAULT NOW();

-- Acceptance rate index (for chancing model range queries)
CREATE INDEX IF NOT EXISTS idx_colleges_comp_acceptance_rate
  ON colleges_comprehensive(acceptance_rate);

-- Enrollment index (for size-based filtering)
CREATE INDEX IF NOT EXISTS idx_colleges_comp_enrollment
  ON colleges_comprehensive(total_enrollment);

-- Data freshness index (for pipeline monitoring queries)
CREATE INDEX IF NOT EXISTS idx_colleges_comp_last_refresh
  ON colleges_comprehensive(last_data_refresh DESC);

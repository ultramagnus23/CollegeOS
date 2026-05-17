-- Adds enrichment/provenance columns used by scripts/enrichColleges.js
-- Idempotent and safe to re-run.

ALTER TABLE colleges ADD COLUMN IF NOT EXISTS needs_enrichment BOOLEAN DEFAULT TRUE;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS data_quality_score NUMERIC;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS data_source TEXT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS data_source_url TEXT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMPTZ;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS annual_cost_usd INTEGER;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS annual_cost_inr BIGINT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS avg_net_price_usd INTEGER;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS avg_sat INTEGER;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS avg_act INTEGER;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS graduation_rate NUMERIC;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS retention_rate NUMERIC;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS international_student_pct NUMERIC;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS first_gen_pct NUMERIC;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS pct_receiving_aid NUMERIC;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS enrollment INTEGER;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS college_type TEXT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS overall_ranking INTEGER;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS ranking_source TEXT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS avg_gpa NUMERIC;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS majors_offered TEXT[];

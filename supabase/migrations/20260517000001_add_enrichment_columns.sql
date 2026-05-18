-- Adds enrichment/provenance columns used by scripts/enrichColleges.js
-- Idempotent and safe to re-run.

DO $$
DECLARE
  target_table text;
BEGIN
  target_table := CASE
    WHEN to_regclass('public.colleges') IS NOT NULL THEN 'public.colleges'
    WHEN to_regclass('public.colleges_comprehensive') IS NOT NULL THEN 'public.colleges_comprehensive'
    ELSE NULL
  END;

  IF target_table IS NULL THEN
    RAISE EXCEPTION 'Neither public.colleges nor public.colleges_comprehensive exists; cannot apply enrichment columns';
  END IF;

  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS needs_enrichment BOOLEAN DEFAULT TRUE', target_table);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS data_quality_score NUMERIC', target_table);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS data_source TEXT', target_table);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS data_source_url TEXT', target_table);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMPTZ', target_table);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS annual_cost_usd INTEGER', target_table);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS annual_cost_inr BIGINT', target_table);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS avg_net_price_usd INTEGER', target_table);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS avg_sat INTEGER', target_table);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS avg_act INTEGER', target_table);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS graduation_rate NUMERIC', target_table);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS retention_rate NUMERIC', target_table);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS international_student_pct NUMERIC', target_table);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS first_gen_pct NUMERIC', target_table);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS pct_receiving_aid NUMERIC', target_table);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS enrollment INTEGER', target_table);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS college_type TEXT', target_table);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS overall_ranking INTEGER', target_table);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS ranking_source TEXT', target_table);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS avg_gpa NUMERIC', target_table);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS majors_offered TEXT[]', target_table);
END $$;

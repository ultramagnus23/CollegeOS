-- colleges: data provenance columns (critical — every scraped row must populate these)
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS data_source text;
-- values: 'college_scorecard' | 'ipeds' | 'nirf' | 'ucas' | 'qs_rankings' | 'wikidata' | 'manual'
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS data_source_url text;
-- direct URL to the source page/API endpoint used
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS last_updated_at timestamptz;
-- when this row was last enriched by any pipeline
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS data_quality_score integer DEFAULT 0;
-- 0-100: count of non-null important fields / total important fields * 100
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS needs_enrichment boolean DEFAULT true;
-- true until quality_score >= 70

-- colleges: academic data
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS avg_gpa numeric;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS avg_sat integer;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS avg_act integer;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS acceptance_rate numeric;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS enrollment integer;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS graduation_rate numeric;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS retention_rate numeric;

-- colleges: cost data
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS annual_cost_usd integer;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS annual_cost_inr bigint;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS tuition_in_state_usd integer;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS tuition_out_state_usd integer;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS avg_net_price_usd integer;
-- net price after aid — more useful than sticker price
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS pct_receiving_aid numeric;

-- colleges: profile data
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS slug text UNIQUE;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS website_url text;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS campus_setting text;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS college_type text;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS majors_offered text[] DEFAULT '{}';
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS international_student_pct numeric;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS first_gen_pct numeric;

-- colleges: scoring signals (used by recommendation engine)
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS research_output_score integer DEFAULT 50;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS startup_ecosystem_score integer DEFAULT 40;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS cs_ranking integer;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS overall_ranking integer;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS ranking_source text;
-- e.g. 'QS 2024', 'US News 2024', 'NIRF 2023'
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS has_arts_program boolean DEFAULT false;

-- colleges: application system (used in financial/deadline section)
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS application_system text;
-- 'common_app' | 'coalition' | 'ucas' | 'direct' | 'jee' | 'cat' | 'neet' | 'other'
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS application_fee_usd integer;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS application_deadline_rd date;
-- regular decision deadline
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS application_deadline_ed date;
-- early decision deadline
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS application_deadline_ea date;
-- early action deadline
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS common_app_id text;
-- Common App school ID if applicable

-- user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS preferred_majors text[] DEFAULT '{}';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS streams text[] DEFAULT '{}';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS target_countries text[] DEFAULT '{}';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS budget_inr numeric;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS budget_usd numeric;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS budget_currency text DEFAULT 'INR';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS traits text[] DEFAULT '{}';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS activities jsonb DEFAULT '[]';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS profile_completion_score integer DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS gpa numeric;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS sat_score integer;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS act_score integer;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- chancing_inputs
CREATE TABLE IF NOT EXISTS chancing_inputs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  gpa numeric, sat_score integer, act_score integer,
  ap_ib_courses integer DEFAULT 0,
  extracurricular_strength text DEFAULT 'moderate',
  essay_quality text DEFAULT 'average',
  award_tier text DEFAULT 'none',
  first_gen boolean DEFAULT false,
  legacy boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE chancing_inputs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chancing_own" ON chancing_inputs;
CREATE POLICY "chancing_own" ON chancing_inputs FOR ALL USING (auth.uid() = user_id);

-- saved_colleges
CREATE TABLE IF NOT EXISTS saved_colleges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  college_id uuid REFERENCES colleges(id),
  saved_at timestamptz DEFAULT now(),
  UNIQUE(user_id, college_id)
);
ALTER TABLE saved_colleges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saved_own" ON saved_colleges;
CREATE POLICY "saved_own" ON saved_colleges FOR ALL USING (auth.uid() = user_id);

-- Migration 016: Expand Student Demographics
-- Adds detailed racial/ethnic breakdown and diversity metrics

-- ==========================================
-- ADD DETAILED DEMOGRAPHIC COLUMNS TO STUDENT_DEMOGRAPHICS
-- ==========================================

-- Detailed Racial/Ethnic Breakdown
ALTER TABLE student_demographics ADD COLUMN percent_black REAL;
ALTER TABLE student_demographics ADD COLUMN percent_hispanic REAL;
ALTER TABLE student_demographics ADD COLUMN percent_asian REAL;
ALTER TABLE student_demographics ADD COLUMN percent_white REAL;
ALTER TABLE student_demographics ADD COLUMN percent_native_american REAL;
ALTER TABLE student_demographics ADD COLUMN percent_pacific_islander REAL;
ALTER TABLE student_demographics ADD COLUMN percent_multiracial REAL;
ALTER TABLE student_demographics ADD COLUMN percent_unknown_race REAL;

-- Gender Details
ALTER TABLE student_demographics ADD COLUMN percent_male REAL;
ALTER TABLE student_demographics ADD COLUMN percent_female REAL;
ALTER TABLE student_demographics ADD COLUMN percent_nonbinary REAL;

-- Diversity Ratings
ALTER TABLE student_demographics ADD COLUMN lgbtq_friendly_rating INTEGER; -- 1-10
ALTER TABLE student_demographics ADD COLUMN lgbtq_resources TEXT; -- JSON array of resources
ALTER TABLE student_demographics ADD COLUMN religious_diversity_score INTEGER; -- 1-10
ALTER TABLE student_demographics ADD COLUMN socioeconomic_diversity_score INTEGER; -- 1-10
ALTER TABLE student_demographics ADD COLUMN political_diversity_score INTEGER; -- 1-10

-- Pell Grant and Low-Income
ALTER TABLE student_demographics ADD COLUMN percent_pell_recipients REAL;
ALTER TABLE student_demographics ADD COLUMN percent_low_income REAL;
ALTER TABLE student_demographics ADD COLUMN percent_middle_income REAL;
ALTER TABLE student_demographics ADD COLUMN percent_high_income REAL;

-- Age Demographics
ALTER TABLE student_demographics ADD COLUMN average_age REAL;
ALTER TABLE student_demographics ADD COLUMN percent_over_25 REAL;

-- Residency
ALTER TABLE student_demographics ADD COLUMN percent_in_state REAL;
ALTER TABLE student_demographics ADD COLUMN percent_out_of_state REAL;
ALTER TABLE student_demographics ADD COLUMN top_feeder_states TEXT; -- JSON array

-- ==========================================
-- DIVERSITY_PROGRAMS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS diversity_programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  
  -- Support Programs
  multicultural_center INTEGER DEFAULT 0,
  lgbtq_center INTEGER DEFAULT 0,
  womens_center INTEGER DEFAULT 0,
  veterans_center INTEGER DEFAULT 0,
  disability_services_rating INTEGER, -- 1-10
  first_gen_support_program INTEGER DEFAULT 0,
  low_income_support_program INTEGER DEFAULT 0,
  
  -- Affinity Groups and Organizations
  affinity_housing_available INTEGER DEFAULT 0,
  cultural_organizations_count INTEGER,
  religious_organizations_count INTEGER,
  
  -- Inclusive Policies
  gender_inclusive_housing INTEGER DEFAULT 0,
  preferred_name_policy INTEGER DEFAULT 0,
  pronoun_policy INTEGER DEFAULT 0,
  
  -- DEI Initiatives
  dei_office INTEGER DEFAULT 0,
  mandatory_dei_training INTEGER DEFAULT 0,
  bias_incident_reporting INTEGER DEFAULT 0,
  
  -- Data Quality
  source TEXT,
  last_verified DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  UNIQUE(college_id)
);

-- ==========================================
-- INDEXES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_diversity_programs_college ON diversity_programs(college_id);

-- Migration 011: Comprehensive College Database Schema
-- This migration implements the complete schema as specified in the requirements
-- Includes: Colleges, Admissions, Student Stats, Outcomes, Financial Data,
--           Programs, Demographics, Campus Life, Rankings, and Predictive Metrics

-- ==========================================
-- 1. COLLEGES TABLE (Core table - Enhanced)
-- ==========================================
CREATE TABLE IF NOT EXISTS colleges_comprehensive (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Basic Information
  name TEXT NOT NULL,
  alternate_names TEXT, -- JSON array of alternate names
  country TEXT NOT NULL,
  state_region TEXT,
  city TEXT,
  urban_classification TEXT, -- Urban, Suburban, Rural, Small Town
  institution_type TEXT, -- Public, Private Non-Profit, Private For-Profit
  classification TEXT, -- Research University, Liberal Arts, Technical, etc.
  religious_affiliation TEXT,
  founding_year INTEGER,
  campus_size_acres REAL,
  
  -- Enrollment
  undergraduate_enrollment INTEGER,
  graduate_enrollment INTEGER,
  total_enrollment INTEGER,
  student_faculty_ratio TEXT,
  
  -- URLs and Contact
  website_url TEXT,
  
  -- Metadata
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(name, country)
);

-- ==========================================
-- 2. COLLEGE_ADMISSIONS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS college_admissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  
  -- Acceptance Rates
  acceptance_rate REAL,
  early_decision_rate REAL,
  early_action_rate REAL,
  regular_decision_rate REAL,
  waitlist_rate REAL,
  transfer_acceptance_rate REAL,
  yield_rate REAL,
  
  -- Volume Metrics
  application_volume INTEGER,
  admit_volume INTEGER,
  enrollment_volume INTEGER,
  
  -- Demographic Rates
  international_accept_rate REAL,
  in_state_accept_rate REAL,
  out_state_accept_rate REAL,
  
  -- Policy
  test_optional_flag INTEGER DEFAULT 0,
  
  -- Data Quality
  source TEXT,
  confidence_score REAL DEFAULT 0.5,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  UNIQUE(college_id, year)
);

-- ==========================================
-- 3. ADMITTED_STUDENT_STATS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS admitted_student_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  
  -- GPA Percentiles
  gpa_25 REAL,
  gpa_50 REAL,
  gpa_75 REAL,
  
  -- SAT Percentiles (Total Score)
  sat_25 INTEGER,
  sat_50 INTEGER,
  sat_75 INTEGER,
  
  -- ACT Percentiles
  act_25 INTEGER,
  act_50 INTEGER,
  act_75 INTEGER,
  
  -- Class Standing
  class_rank_top10_percent REAL,
  
  -- Academic Rigor
  avg_course_rigor_index REAL,
  
  -- Data Quality
  source TEXT,
  confidence_score REAL DEFAULT 0.5,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  UNIQUE(college_id, year)
);

-- ==========================================
-- 4. ACADEMIC_OUTCOMES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS academic_outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  
  -- Graduation Rates
  graduation_rate_4yr REAL,
  graduation_rate_6yr REAL,
  retention_rate REAL,
  dropout_rate REAL,
  avg_time_to_degree REAL,
  
  -- Career Outcomes
  employment_rate REAL,
  grad_school_rate REAL,
  median_start_salary INTEGER,
  internship_rate REAL,
  
  -- Data Quality
  source TEXT,
  confidence_score REAL DEFAULT 0.5,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  UNIQUE(college_id, year)
);

-- ==========================================
-- 5. FINANCIAL_DATA TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS college_financial_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  
  -- Tuition
  tuition_in_state INTEGER,
  tuition_out_state INTEGER,
  tuition_international INTEGER,
  cost_of_attendance INTEGER,
  
  -- Financial Aid
  avg_financial_aid INTEGER,
  percent_receiving_aid REAL,
  avg_debt INTEGER,
  
  -- Net Price by Income
  net_price_low_income INTEGER,
  net_price_mid_income INTEGER,
  net_price_high_income INTEGER,
  
  -- Policies
  merit_scholarship_flag INTEGER DEFAULT 0,
  need_blind_flag INTEGER DEFAULT 0,
  loan_default_rate REAL,
  
  -- Data Quality
  source TEXT,
  confidence_score REAL DEFAULT 0.5,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  UNIQUE(college_id, year)
);

-- ==========================================
-- 6. PROGRAMS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS college_programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  
  -- Program Info
  program_name TEXT NOT NULL,
  degree_type TEXT, -- Bachelor's, Master's, PhD, Certificate
  enrollment INTEGER,
  acceptance_rate REAL,
  accreditation_status TEXT,
  ranking_score REAL,
  research_funding INTEGER,
  coop_available INTEGER DEFAULT 0,
  licensing_pass_rate REAL,
  
  -- Data Quality
  source TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  UNIQUE(college_id, program_name, degree_type)
);

-- ==========================================
-- 7. STUDENT_DEMOGRAPHICS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS student_demographics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  
  -- International
  percent_international REAL,
  
  -- Gender
  gender_ratio TEXT, -- e.g., "48:52" (M:F)
  
  -- Ethnicity (JSON)
  ethnic_distribution TEXT,
  
  -- Backgrounds
  percent_first_gen REAL,
  socioeconomic_index REAL,
  geographic_diversity_index REAL,
  legacy_percent REAL,
  athlete_percent REAL,
  transfer_percent REAL,
  
  -- Data Quality
  source TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  UNIQUE(college_id, year)
);

-- ==========================================
-- 8. CAMPUS_LIFE TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS campus_life (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  
  -- Housing
  housing_guarantee TEXT, -- All Years, Freshman Only, None
  
  -- Safety and Living
  campus_safety_score REAL,
  cost_of_living_index REAL,
  climate_zone TEXT,
  
  -- Student Life
  student_satisfaction_score REAL,
  athletics_division TEXT, -- NCAA Division I, II, III, NAIA, etc.
  club_count INTEGER,
  mental_health_rating REAL,
  
  -- Data Quality
  source TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  UNIQUE(college_id)
);

-- ==========================================
-- 9. RANKINGS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS college_rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  ranking_body TEXT NOT NULL, -- US News, QS, THE, Forbes, WSJ, etc.
  
  -- Ranking Positions
  national_rank INTEGER,
  global_rank INTEGER,
  subject_rank INTEGER,
  
  -- Reputation Scores
  employer_reputation_score REAL,
  peer_assessment_score REAL,
  prestige_index REAL,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  UNIQUE(college_id, year, ranking_body)
);

-- ==========================================
-- 10. PREDICTIVE_METRICS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS predictive_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  
  -- Trend Analysis
  application_growth_rate REAL,
  admit_rate_trend REAL,
  yield_trend REAL,
  major_demand_pressure REAL,
  enrollment_volatility REAL,
  
  -- Policy Changes
  policy_change_flag INTEGER DEFAULT 0,
  
  -- Regional Data
  regional_applicant_density REAL,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  UNIQUE(college_id, year)
);

-- ==========================================
-- INDEXES FOR PERFORMANCE
-- ==========================================

-- Colleges indexes
CREATE INDEX IF NOT EXISTS idx_colleges_comp_name ON colleges_comprehensive(name);
CREATE INDEX IF NOT EXISTS idx_colleges_comp_country ON colleges_comprehensive(country);
CREATE INDEX IF NOT EXISTS idx_colleges_comp_state ON colleges_comprehensive(state_region);
CREATE INDEX IF NOT EXISTS idx_colleges_comp_type ON colleges_comprehensive(institution_type);

-- Admissions indexes
CREATE INDEX IF NOT EXISTS idx_admissions_college ON college_admissions(college_id);
CREATE INDEX IF NOT EXISTS idx_admissions_year ON college_admissions(year);
CREATE INDEX IF NOT EXISTS idx_admissions_rate ON college_admissions(acceptance_rate);

-- Student stats indexes
CREATE INDEX IF NOT EXISTS idx_student_stats_college ON admitted_student_stats(college_id);
CREATE INDEX IF NOT EXISTS idx_student_stats_year ON admitted_student_stats(year);

-- Outcomes indexes
CREATE INDEX IF NOT EXISTS idx_outcomes_college ON academic_outcomes(college_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_year ON academic_outcomes(year);

-- Financial indexes
CREATE INDEX IF NOT EXISTS idx_financial_college ON college_financial_data(college_id);
CREATE INDEX IF NOT EXISTS idx_financial_year ON college_financial_data(year);

-- Programs indexes
CREATE INDEX IF NOT EXISTS idx_programs_college ON college_programs(college_id);
CREATE INDEX IF NOT EXISTS idx_programs_name ON college_programs(program_name);

-- Demographics indexes
CREATE INDEX IF NOT EXISTS idx_demographics_college ON student_demographics(college_id);
CREATE INDEX IF NOT EXISTS idx_demographics_year ON student_demographics(year);

-- Campus life indexes
CREATE INDEX IF NOT EXISTS idx_campus_life_college ON campus_life(college_id);

-- Rankings indexes
CREATE INDEX IF NOT EXISTS idx_rankings_college ON college_rankings(college_id);
CREATE INDEX IF NOT EXISTS idx_rankings_year ON college_rankings(year);
CREATE INDEX IF NOT EXISTS idx_rankings_body ON college_rankings(ranking_body);

-- Predictive metrics indexes
CREATE INDEX IF NOT EXISTS idx_predictive_college ON predictive_metrics(college_id);
CREATE INDEX IF NOT EXISTS idx_predictive_year ON predictive_metrics(year);

-- ==========================================
-- FULL-TEXT SEARCH FOR COLLEGES
-- ==========================================
CREATE VIRTUAL TABLE IF NOT EXISTS colleges_comprehensive_fts USING fts5(
  name,
  alternate_names,
  country,
  state_region,
  city,
  classification,
  content=colleges_comprehensive,
  content_rowid=id
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS colleges_comp_fts_ai AFTER INSERT ON colleges_comprehensive BEGIN
  INSERT INTO colleges_comprehensive_fts(rowid, name, alternate_names, country, state_region, city, classification)
  VALUES (new.id, new.name, new.alternate_names, new.country, new.state_region, new.city, new.classification);
END;

CREATE TRIGGER IF NOT EXISTS colleges_comp_fts_au AFTER UPDATE ON colleges_comprehensive BEGIN
  UPDATE colleges_comprehensive_fts 
  SET name = new.name,
      alternate_names = new.alternate_names,
      country = new.country,
      state_region = new.state_region,
      city = new.city,
      classification = new.classification
  WHERE rowid = new.id;
END;

CREATE TRIGGER IF NOT EXISTS colleges_comp_fts_ad AFTER DELETE ON colleges_comprehensive BEGIN
  DELETE FROM colleges_comprehensive_fts WHERE rowid = old.id;
END;

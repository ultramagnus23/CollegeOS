-- Migration 007: Comprehensive Colleges Schema
-- This creates a normalized database schema for college data from all countries

-- ==========================================
-- CORE COLLEGES TABLE (Enhanced)
-- ==========================================
-- Drop and recreate if needed for clean state
DROP TABLE IF EXISTS test_scores;
DROP TABLE IF EXISTS financial_data;
DROP TABLE IF EXISTS college_deadlines;
DROP TABLE IF EXISTS college_majors;
DROP TABLE IF EXISTS essay_prompts;
DROP TABLE IF EXISTS application_requirements;
DROP TABLE IF EXISTS indian_entrance_exams;
DROP TABLE IF EXISTS uk_requirements;
DROP TABLE IF EXISTS german_requirements;
DROP TABLE IF EXISTS placement_data;

-- Create comprehensive colleges table
CREATE TABLE IF NOT EXISTS colleges_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Basic Info
  name TEXT NOT NULL,
  website_url TEXT,
  location_city TEXT,
  location_state TEXT,
  location_country TEXT NOT NULL,
  institution_type TEXT, -- Private/Public
  
  -- Rankings
  us_news_ranking INTEGER,
  nirf_ranking INTEGER,
  qs_ranking INTEGER,
  times_ranking INTEGER,
  guardian_ranking INTEGER,
  
  -- Academic Stats
  total_enrollment INTEGER,
  acceptance_rate REAL,
  average_gpa REAL,
  student_faculty_ratio TEXT,
  four_year_grad_rate REAL,
  six_year_grad_rate REAL,
  
  -- Entrance Exam Type (for filtering)
  entrance_exam_type TEXT, -- JEE_ADVANCED, JEE_MAIN, SAT, A_LEVELS, ABITUR, etc.
  
  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- TEST SCORES TABLE (US/UK focused)
-- ==========================================
CREATE TABLE IF NOT EXISTS test_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  
  -- SAT Scores
  sat_ebrw_25th INTEGER,
  sat_ebrw_75th INTEGER,
  sat_math_25th INTEGER,
  sat_math_75th INTEGER,
  sat_total_25th INTEGER,
  sat_total_75th INTEGER,
  
  -- ACT Scores
  act_composite_25th INTEGER,
  act_composite_75th INTEGER,
  
  -- UK-specific
  a_level_requirements TEXT,
  ib_requirements TEXT,
  gcse_requirements TEXT,
  ucas_points_required INTEGER,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges_v2(id) ON DELETE CASCADE
);

-- ==========================================
-- FINANCIAL DATA TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS financial_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  
  -- Currency for this record
  currency TEXT DEFAULT 'USD', -- USD, GBP, EUR, INR
  
  -- Tuition & Costs
  tuition_annual INTEGER,
  room_and_board INTEGER,
  total_cost INTEGER,
  
  -- For UK: separate domestic/international
  tuition_domestic INTEGER,
  tuition_international INTEGER,
  living_costs_annual INTEGER,
  
  -- For Germany: semester fees
  semester_fee INTEGER,
  monthly_living_costs INTEGER,
  
  -- Financial Aid (US focused)
  average_aid_package INTEGER,
  percent_receiving_aid REAL,
  net_price_0_30k INTEGER,
  net_price_30_48k INTEGER,
  net_price_48_75k INTEGER,
  net_price_75_110k INTEGER,
  net_price_110k_plus INTEGER,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges_v2(id) ON DELETE CASCADE
);

-- ==========================================
-- DEADLINES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS college_deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  deadline_type TEXT NOT NULL, -- early_action, early_decision, regular, rolling, financial_aid
  deadline_date DATE,
  decision_notification_date DATE,
  notes TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges_v2(id) ON DELETE CASCADE
);

-- ==========================================
-- MAJORS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS college_majors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  major_name TEXT NOT NULL,
  is_top_major INTEGER DEFAULT 0,
  is_flagship INTEGER DEFAULT 0,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges_v2(id) ON DELETE CASCADE
);

-- ==========================================
-- ESSAY PROMPTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS essay_prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  prompt_text TEXT NOT NULL,
  word_limit INTEGER,
  is_required INTEGER DEFAULT 1,
  prompt_order INTEGER DEFAULT 1,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges_v2(id) ON DELETE CASCADE
);

-- ==========================================
-- APPLICATION REQUIREMENTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS application_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  requirement_text TEXT NOT NULL,
  requirement_category TEXT, -- documents, tests, essays, recommendations
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges_v2(id) ON DELETE CASCADE
);

-- ==========================================
-- INDIAN-SPECIFIC: ENTRANCE EXAMS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS indian_entrance_exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  exam_type TEXT NOT NULL, -- JEE_ADVANCED, JEE_MAIN, BITSAT, VITEEE, CAT, NEET
  
  -- JEE Advanced Cutoffs by category
  cutoff_general_opening INTEGER,
  cutoff_general_closing INTEGER,
  cutoff_obc_opening INTEGER,
  cutoff_obc_closing INTEGER,
  cutoff_sc_opening INTEGER,
  cutoff_sc_closing INTEGER,
  cutoff_st_opening INTEGER,
  cutoff_st_closing INTEGER,
  
  -- BITSAT/VITEEE specific (score-based)
  cutoff_cs INTEGER,
  cutoff_ece INTEGER,
  cutoff_eee INTEGER,
  cutoff_mechanical INTEGER,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges_v2(id) ON DELETE CASCADE
);

-- ==========================================
-- INDIAN-SPECIFIC: PLACEMENT DATA TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS placement_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  
  average_package_inr INTEGER,
  highest_package_inr INTEGER,
  placement_percentage REAL,
  top_recruiters TEXT, -- Semicolon-separated list
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges_v2(id) ON DELETE CASCADE
);

-- ==========================================
-- UK-SPECIFIC: REQUIREMENTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS uk_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  
  interview_required TEXT, -- Yes, No, Course-dependent
  admissions_test_required TEXT,
  oxbridge_deadline DATE,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges_v2(id) ON DELETE CASCADE
);

-- ==========================================
-- GERMAN-SPECIFIC: REQUIREMENTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS german_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  
  german_language_requirement TEXT,
  english_language_requirement TEXT,
  abitur_grade_requirement TEXT,
  numerus_clausus_programs TEXT, -- Yes/No or list
  programs_in_english TEXT, -- Semicolon-separated list
  winter_semester_deadline DATE,
  summer_semester_deadline DATE,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges_v2(id) ON DELETE CASCADE
);

-- ==========================================
-- CREATE INDEXES FOR PERFORMANCE
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_colleges_v2_name ON colleges_v2(name);
CREATE INDEX IF NOT EXISTS idx_colleges_v2_country ON colleges_v2(location_country);
CREATE INDEX IF NOT EXISTS idx_colleges_v2_acceptance ON colleges_v2(acceptance_rate);
CREATE INDEX IF NOT EXISTS idx_colleges_v2_type ON colleges_v2(institution_type);

CREATE INDEX IF NOT EXISTS idx_test_scores_college ON test_scores(college_id);
CREATE INDEX IF NOT EXISTS idx_financial_data_college ON financial_data(college_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_college ON college_deadlines(college_id);
CREATE INDEX IF NOT EXISTS idx_majors_college ON college_majors(college_id);
CREATE INDEX IF NOT EXISTS idx_majors_top ON college_majors(is_top_major);
CREATE INDEX IF NOT EXISTS idx_essay_prompts_college ON essay_prompts(college_id);
CREATE INDEX IF NOT EXISTS idx_app_requirements_college ON application_requirements(college_id);
CREATE INDEX IF NOT EXISTS idx_indian_exams_college ON indian_entrance_exams(college_id);
CREATE INDEX IF NOT EXISTS idx_placement_college ON placement_data(college_id);
CREATE INDEX IF NOT EXISTS idx_uk_requirements_college ON uk_requirements(college_id);
CREATE INDEX IF NOT EXISTS idx_german_requirements_college ON german_requirements(college_id);

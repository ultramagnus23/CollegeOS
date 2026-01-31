-- Migration 019: Expand Career Outcomes
-- Adds detailed career and graduate school outcome data

-- ==========================================
-- ADD CAREER OUTCOME COLUMNS TO ACADEMIC_OUTCOMES
-- ==========================================

-- Graduate School Acceptance Rates
ALTER TABLE academic_outcomes ADD COLUMN grad_school_acceptance_rate REAL;
ALTER TABLE academic_outcomes ADD COLUMN med_school_acceptance_rate REAL;
ALTER TABLE academic_outcomes ADD COLUMN law_school_acceptance_rate REAL;
ALTER TABLE academic_outcomes ADD COLUMN business_school_acceptance_rate REAL;
ALTER TABLE academic_outcomes ADD COLUMN phd_program_acceptance_rate REAL;

-- Destination Schools
ALTER TABLE academic_outcomes ADD COLUMN top_grad_schools_attended TEXT; -- JSON array
ALTER TABLE academic_outcomes ADD COLUMN top_med_schools_attended TEXT; -- JSON array
ALTER TABLE academic_outcomes ADD COLUMN top_law_schools_attended TEXT; -- JSON array

-- Employment Timelines
ALTER TABLE academic_outcomes ADD COLUMN employed_at_graduation_rate REAL;
ALTER TABLE academic_outcomes ADD COLUMN employed_6_months_rate REAL;
ALTER TABLE academic_outcomes ADD COLUMN employed_in_field_rate REAL;

-- Salary Data
ALTER TABLE academic_outcomes ADD COLUMN median_mid_career_salary INTEGER;
ALTER TABLE academic_outcomes ADD COLUMN salary_growth_rate REAL;

-- ==========================================
-- CAREER_OUTCOMES_DETAIL TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS career_outcomes_detail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  
  -- Top Employers
  top_employers_list TEXT, -- JSON array of company names
  top_employers_count INTEGER, -- How many different employers hired grads
  
  -- Industry Distribution
  industry_distribution TEXT, -- JSON object {industry: percentage}
  top_industries TEXT, -- JSON array of top 5 industries
  
  -- Salary by Major (JSON object)
  average_starting_salary_by_major TEXT, -- {major: salary}
  
  -- Geographic Distribution
  employment_by_region TEXT, -- JSON {region: percentage}
  percent_stay_in_state REAL,
  percent_major_city REAL,
  
  -- Company Types
  percent_fortune_500 REAL,
  percent_startup REAL,
  percent_nonprofit REAL,
  percent_government REAL,
  percent_self_employed REAL,
  
  -- Career Services
  career_fairs_per_year INTEGER,
  on_campus_recruiting_companies INTEGER,
  job_posting_platform TEXT,
  mock_interview_availability INTEGER DEFAULT 1,
  resume_review_availability INTEGER DEFAULT 1,
  
  -- Alumni Network
  alumni_network_strength_rating INTEGER, -- 1-10
  alumni_mentorship_program INTEGER DEFAULT 0,
  alumni_job_board INTEGER DEFAULT 0,
  alumni_database_access INTEGER DEFAULT 0,
  regional_alumni_chapters_count INTEGER,
  
  -- Internships
  internship_completion_rate REAL,
  paid_internship_percentage REAL,
  average_internships_per_student REAL,
  summer_internship_funding INTEGER DEFAULT 0,
  
  -- Data Quality
  source TEXT,
  outcomes_response_rate REAL, -- What % of grads responded to survey
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  UNIQUE(college_id, year)
);

-- ==========================================
-- PRE_PROFESSIONAL_PROGRAMS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS pre_professional_programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  
  -- Pre-Med
  pre_med_program INTEGER DEFAULT 0,
  pre_med_advising_rating INTEGER, -- 1-10
  pre_med_committee_letter INTEGER DEFAULT 0,
  mcat_prep_available INTEGER DEFAULT 0,
  med_school_acceptance_rate_5yr REAL,
  hospital_affiliations TEXT, -- JSON array
  
  -- Pre-Law
  pre_law_program INTEGER DEFAULT 0,
  pre_law_advising_rating INTEGER, -- 1-10
  law_school_acceptance_rate_5yr REAL,
  mock_trial_program INTEGER DEFAULT 0,
  lsat_prep_available INTEGER DEFAULT 0,
  
  -- Pre-Business
  pre_business_program INTEGER DEFAULT 0,
  business_school_placement_rate REAL,
  investment_club INTEGER DEFAULT 0,
  consulting_club INTEGER DEFAULT 0,
  
  -- Pre-Health (non-MD)
  pre_dental_program INTEGER DEFAULT 0,
  pre_vet_program INTEGER DEFAULT 0,
  pre_nursing_pathway INTEGER DEFAULT 0,
  pre_pharmacy_pathway INTEGER DEFAULT 0,
  pre_pt_pathway INTEGER DEFAULT 0,
  
  -- Pre-Engineering (for liberal arts colleges)
  dual_degree_engineering INTEGER DEFAULT 0,
  engineering_partner_schools TEXT, -- JSON array
  
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
CREATE INDEX IF NOT EXISTS idx_career_outcomes_college ON career_outcomes_detail(college_id);
CREATE INDEX IF NOT EXISTS idx_career_outcomes_year ON career_outcomes_detail(year);
CREATE INDEX IF NOT EXISTS idx_pre_prof_college ON pre_professional_programs(college_id);
CREATE INDEX IF NOT EXISTS idx_pre_prof_premed ON pre_professional_programs(pre_med_program);

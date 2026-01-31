-- Migration 021: Special Programs Table
-- Tracks dual degrees, accelerated programs, and special opportunities

-- ==========================================
-- SPECIAL_PROGRAMS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS special_programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  
  -- Dual Degree Programs
  dual_degree_programs_available INTEGER DEFAULT 0,
  dual_degree_programs TEXT, -- JSON array of programs
  
  -- 3+2 Programs (e.g., 3 years liberal arts + 2 years engineering)
  three_two_programs_available INTEGER DEFAULT 0,
  three_two_programs TEXT, -- JSON array
  three_two_partner_schools TEXT, -- JSON array of partner engineering schools
  
  -- 4+1 / 5-Year Master's Programs
  five_year_masters_available INTEGER DEFAULT 0,
  five_year_masters_programs TEXT, -- JSON array
  ba_ma_combined_programs TEXT, -- JSON array
  
  -- Accelerated Programs
  three_year_degree_option INTEGER DEFAULT 0,
  accelerated_md_program INTEGER DEFAULT 0,
  accelerated_law_program INTEGER DEFAULT 0,
  early_assurance_med INTEGER DEFAULT 0,
  early_assurance_law INTEGER DEFAULT 0,
  early_assurance_dental INTEGER DEFAULT 0,
  
  -- Study Abroad
  study_abroad_participation_rate REAL,
  study_abroad_programs_count INTEGER,
  semester_exchange_partners TEXT, -- JSON array
  faculty_led_programs INTEGER DEFAULT 1,
  summer_abroad_programs INTEGER DEFAULT 1,
  study_abroad_scholarships INTEGER DEFAULT 0,
  study_abroad_gpa_requirement REAL,
  
  -- Co-op and Internships
  co_op_program_available INTEGER DEFAULT 0,
  co_op_mandatory INTEGER DEFAULT 0,
  co_op_extends_graduation INTEGER DEFAULT 0,
  guaranteed_internship_program INTEGER DEFAULT 0,
  internship_for_credit INTEGER DEFAULT 1,
  internship_placement_rate REAL,
  
  -- Research
  undergraduate_research_grants INTEGER DEFAULT 0,
  summer_research_program INTEGER DEFAULT 0,
  research_symposium INTEGER DEFAULT 0,
  honors_thesis_funding INTEGER DEFAULT 0,
  
  -- Entrepreneurship
  entrepreneurship_support INTEGER DEFAULT 0,
  startup_incubator INTEGER DEFAULT 0,
  business_plan_competition INTEGER DEFAULT 0,
  venture_fund INTEGER DEFAULT 0,
  entrepreneurship_minor INTEGER DEFAULT 0,
  
  -- Innovation Spaces
  makerspace_available INTEGER DEFAULT 0,
  fab_lab INTEGER DEFAULT 0,
  innovation_hub INTEGER DEFAULT 0,
  design_studio INTEGER DEFAULT 0,
  
  -- Community Engagement
  service_learning_required INTEGER DEFAULT 0,
  service_learning_courses INTEGER,
  community_partner_organizations INTEGER,
  americorps_partnership INTEGER DEFAULT 0,
  
  -- Military Programs
  rotc_army INTEGER DEFAULT 0,
  rotc_navy INTEGER DEFAULT 0,
  rotc_air_force INTEGER DEFAULT 0,
  rotc_scholarships INTEGER DEFAULT 0,
  
  -- Data Quality
  source TEXT,
  last_verified DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  UNIQUE(college_id)
);

-- ==========================================
-- EXCHANGE_PARTNERS TABLE (For detailed exchange info)
-- ==========================================
CREATE TABLE IF NOT EXISTS exchange_partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  partner_institution TEXT NOT NULL,
  partner_country TEXT NOT NULL,
  partner_city TEXT,
  exchange_type TEXT, -- 'semester', 'year', 'summer'
  programs_available TEXT, -- JSON array of eligible majors
  language_requirement TEXT,
  gpa_requirement REAL,
  application_competitive INTEGER DEFAULT 0,
  housing_provided INTEGER DEFAULT 1,
  
  source TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE
);

-- ==========================================
-- INDEXES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_special_programs_college ON special_programs(college_id);
CREATE INDEX IF NOT EXISTS idx_special_programs_coop ON special_programs(co_op_program_available);
CREATE INDEX IF NOT EXISTS idx_special_programs_research ON special_programs(undergraduate_research_grants);
CREATE INDEX IF NOT EXISTS idx_exchange_partners_college ON exchange_partners(college_id);
CREATE INDEX IF NOT EXISTS idx_exchange_partners_country ON exchange_partners(partner_country);

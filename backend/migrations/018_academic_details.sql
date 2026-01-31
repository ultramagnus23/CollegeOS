-- Migration 018: Academic Details Table
-- Comprehensive academic environment and policy tracking

-- ==========================================
-- ACADEMIC_DETAILS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS academic_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  
  -- Class Size Distribution
  class_size_under_20_percent REAL,
  class_size_20_to_49_percent REAL,
  class_size_50_plus_percent REAL,
  average_class_size INTEGER,
  average_intro_class_size INTEGER,
  average_upper_level_class_size INTEGER,
  
  -- Teaching Style
  lecture_vs_discussion_ratio TEXT, -- e.g., "60:40"
  ta_teaching_percentage REAL, -- Percentage of classes taught by TAs
  professor_accessibility_rating INTEGER, -- 1-10
  office_hours_availability TEXT, -- 'ample', 'adequate', 'limited'
  
  -- Curriculum Requirements
  core_curriculum INTEGER DEFAULT 0,
  distribution_requirements INTEGER DEFAULT 1,
  writing_intensive_required INTEGER DEFAULT 0,
  quantitative_reasoning_required INTEGER DEFAULT 0,
  foreign_language_required INTEGER DEFAULT 0,
  lab_science_required INTEGER DEFAULT 0,
  thesis_required INTEGER DEFAULT 0,
  senior_capstone_required INTEGER DEFAULT 0,
  
  -- Special Academic Programs
  first_year_experience_program INTEGER DEFAULT 0,
  first_year_seminar INTEGER DEFAULT 0,
  honors_program_available INTEGER DEFAULT 0,
  honors_college INTEGER DEFAULT 0,
  honors_housing_available INTEGER DEFAULT 0,
  
  -- Academic Flexibility
  independent_study_available INTEGER DEFAULT 1,
  double_major_allowed INTEGER DEFAULT 1,
  double_major_common INTEGER DEFAULT 0,
  triple_major_allowed INTEGER DEFAULT 0,
  design_your_own_major INTEGER DEFAULT 0,
  interdisciplinary_majors INTEGER DEFAULT 1,
  minor_required INTEGER DEFAULT 0,
  
  -- Grading Policies
  pass_fail_option INTEGER DEFAULT 1,
  pass_fail_limit INTEGER,
  grade_replacement_policy INTEGER DEFAULT 0,
  grade_forgiveness INTEGER DEFAULT 0,
  plus_minus_grading INTEGER DEFAULT 1,
  gpa_scale TEXT DEFAULT '4.0',
  
  -- Academic Calendar
  academic_calendar TEXT, -- 'semester', 'quarter', 'trimester', '4-1-4', 'other'
  winter_session_available INTEGER DEFAULT 0,
  winter_session_on_campus INTEGER DEFAULT 0,
  summer_session_available INTEGER DEFAULT 1,
  summer_research_programs INTEGER DEFAULT 0,
  may_term_available INTEGER DEFAULT 0,
  
  -- Registration
  course_registration_system TEXT,
  registration_difficulty_rating INTEGER, -- 1-10 (10 = very difficult to get classes)
  waitlist_system INTEGER DEFAULT 1,
  course_shopping_period INTEGER DEFAULT 0,
  add_drop_deadline_weeks INTEGER,
  
  -- Academic Support
  tutoring_available INTEGER DEFAULT 1,
  tutoring_free INTEGER DEFAULT 1,
  writing_center INTEGER DEFAULT 1,
  academic_advising_rating INTEGER, -- 1-10
  peer_advising INTEGER DEFAULT 0,
  
  -- Research
  undergraduate_research_opportunities INTEGER DEFAULT 1,
  research_funding_available INTEGER DEFAULT 0,
  research_with_faculty_percentage REAL,
  summer_research_stipend INTEGER,
  
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
CREATE INDEX IF NOT EXISTS idx_academic_details_college ON academic_details(college_id);
CREATE INDEX IF NOT EXISTS idx_academic_details_calendar ON academic_details(academic_calendar);
CREATE INDEX IF NOT EXISTS idx_academic_details_honors ON academic_details(honors_program_available);

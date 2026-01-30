-- Migration 009: Comprehensive Student Profiles, Activities, and Coursework
-- This creates the complete student profile tracking system

-- ==========================================
-- STUDENT PROFILES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS student_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  
  -- Basic Info
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  graduation_year INTEGER,
  
  -- Academic Info
  gpa_weighted REAL,
  gpa_unweighted REAL,
  gpa_scale TEXT, -- '4.0', '5.0', '100', etc.
  class_rank INTEGER,
  class_size INTEGER,
  class_rank_percentile REAL,
  
  -- Test Scores - SAT
  sat_ebrw INTEGER,
  sat_math INTEGER,
  sat_total INTEGER,
  
  -- Test Scores - ACT
  act_composite INTEGER,
  act_english INTEGER,
  act_math INTEGER,
  act_reading INTEGER,
  act_science INTEGER,
  
  -- For Indian Students
  jee_main_percentile REAL,
  jee_advanced_rank INTEGER,
  neet_score INTEGER,
  board_exam_percentage REAL,
  board_type TEXT, -- 'CBSE', 'ICSE', 'State', 'IB'
  
  -- For UK Students
  predicted_a_levels TEXT, -- 'A*A*A*'
  ib_predicted_score INTEGER,
  gcse_results TEXT,
  
  -- For German Students
  abitur_grade REAL,
  german_proficiency TEXT, -- 'A1', 'B2', 'C1', etc.
  
  -- Language Test Scores
  toefl_score INTEGER,
  ielts_score REAL,
  duolingo_score INTEGER,
  
  -- Location & Background
  country TEXT,
  state_province TEXT,
  city TEXT,
  high_school_name TEXT,
  high_school_type TEXT, -- 'Public', 'Private', 'Charter', 'International'
  curriculum_type TEXT, -- 'AP', 'IB', 'Honors', 'Regular', 'CBSE', etc.
  
  -- Demographics
  is_first_generation INTEGER DEFAULT 0,
  is_legacy INTEGER DEFAULT 0,
  legacy_schools TEXT, -- JSON array
  ethnicity TEXT,
  citizenship_status TEXT,
  
  -- Preferences
  intended_majors TEXT, -- JSON array
  preferred_states TEXT, -- JSON array
  preferred_countries TEXT, -- JSON array
  preferred_college_size TEXT, -- 'Small', 'Medium', 'Large'
  preferred_setting TEXT, -- 'Urban', 'Suburban', 'Rural'
  budget_max INTEGER,
  min_acceptance_rate REAL,
  max_acceptance_rate REAL,
  
  -- Additional
  special_circumstances TEXT,
  hooks TEXT, -- JSON array of special hooks (athlete, legacy, etc.)
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- STUDENT ACTIVITIES TABLE (Common App style)
-- ==========================================
CREATE TABLE IF NOT EXISTS student_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER REFERENCES student_profiles(id) ON DELETE CASCADE,
  
  activity_name TEXT NOT NULL,
  activity_type TEXT, -- 'Sports', 'Arts', 'Academic', 'Community Service', 'Work', 'Family Responsibilities', etc.
  position_title TEXT,
  organization_name TEXT,
  description TEXT, -- Max 150 chars for Common App
  
  -- Grade levels participation
  grade_9 INTEGER DEFAULT 0,
  grade_10 INTEGER DEFAULT 0,
  grade_11 INTEGER DEFAULT 0,
  grade_12 INTEGER DEFAULT 0,
  
  -- Time commitment
  hours_per_week REAL,
  weeks_per_year INTEGER,
  total_hours INTEGER, -- Calculated: hours_per_week * weeks_per_year * years
  
  -- Recognition
  awards_recognition TEXT,
  
  -- Tier rating (1-4)
  -- 1 = National/International level achievement
  -- 2 = State/Regional level achievement
  -- 3 = School leadership/significant contribution
  -- 4 = Participation/Club membership
  tier_rating INTEGER DEFAULT 4,
  
  -- Flags
  participation_during_school INTEGER DEFAULT 1,
  participation_during_break INTEGER DEFAULT 0,
  participation_all_year INTEGER DEFAULT 0,
  participation_post_graduation INTEGER DEFAULT 0,
  
  display_order INTEGER DEFAULT 1,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- STUDENT COURSEWORK TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS student_coursework (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER REFERENCES student_profiles(id) ON DELETE CASCADE,
  
  course_name TEXT NOT NULL,
  course_level TEXT, -- 'AP', 'IB', 'Honors', 'Regular', 'Dual Enrollment'
  subject_area TEXT, -- 'Math', 'Science', 'English', 'History', 'Foreign Language', 'Arts', etc.
  grade_level INTEGER, -- 9, 10, 11, 12
  
  -- Grades
  final_grade TEXT, -- 'A+', 'A', '95', etc.
  grade_points REAL, -- 4.0, 3.7, etc.
  weighted INTEGER DEFAULT 0,
  
  -- AP/IB specific
  exam_score INTEGER, -- 1-5 for AP, 1-7 for IB
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- STUDENT AWARDS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS student_awards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER REFERENCES student_profiles(id) ON DELETE CASCADE,
  
  award_name TEXT NOT NULL,
  award_level TEXT, -- 'International', 'National', 'State', 'Regional', 'School'
  organization TEXT,
  grade_received INTEGER, -- 9, 10, 11, 12
  year_received INTEGER,
  description TEXT,
  
  display_order INTEGER DEFAULT 1,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- CONTENT TABLES FOR SEARCH
-- ==========================================

-- Essay Examples
CREATE TABLE IF NOT EXISTS essay_examples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  college_name TEXT,
  essay_type TEXT, -- 'Common App', 'Supplemental', 'Why Major', 'Why College'
  prompt TEXT,
  content TEXT,
  word_count INTEGER,
  tags TEXT, -- JSON array of tags
  acceptance_result TEXT, -- 'Accepted', 'Waitlisted', 'Rejected'
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Activity Ideas
CREATE TABLE IF NOT EXISTS activity_ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_name TEXT NOT NULL,
  category TEXT, -- 'STEM', 'Arts', 'Humanities', 'Sports', 'Community Service', 'Entrepreneurship'
  tier_potential INTEGER, -- 1-4, what tier this could reach
  description TEXT,
  how_to_start TEXT,
  time_commitment TEXT,
  cost_level TEXT, -- 'Free', 'Low', 'Medium', 'High'
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- LOR (Letter of Recommendation) Guides
CREATE TABLE IF NOT EXISTS lor_guides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  guide_type TEXT, -- 'How To Ask', 'Sample Letter', 'Template', 'Tips'
  content TEXT,
  target_audience TEXT, -- 'Student', 'Teacher', 'Counselor'
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Financial Aid Guides
CREATE TABLE IF NOT EXISTS financial_guides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  guide_type TEXT, -- 'FAFSA', 'CSS Profile', 'Scholarships', 'Negotiation'
  content TEXT,
  applicable_countries TEXT, -- JSON array
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- INDEXES FOR PERFORMANCE
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_student_profiles_user ON student_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_student_activities_student ON student_activities(student_id);
CREATE INDEX IF NOT EXISTS idx_student_activities_tier ON student_activities(tier_rating);
CREATE INDEX IF NOT EXISTS idx_student_coursework_student ON student_coursework(student_id);
CREATE INDEX IF NOT EXISTS idx_student_coursework_level ON student_coursework(course_level);
CREATE INDEX IF NOT EXISTS idx_student_awards_student ON student_awards(student_id);
CREATE INDEX IF NOT EXISTS idx_essay_examples_college ON essay_examples(college_name);
CREATE INDEX IF NOT EXISTS idx_essay_examples_type ON essay_examples(essay_type);
CREATE INDEX IF NOT EXISTS idx_activity_ideas_category ON activity_ideas(category);
CREATE INDEX IF NOT EXISTS idx_activity_ideas_tier ON activity_ideas(tier_potential);

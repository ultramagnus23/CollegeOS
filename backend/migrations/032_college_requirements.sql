-- Migration 032: College Requirements System
-- Creates dynamic, institution-specific requirements with conditional logic

-- ============================================================================
-- Table 1: college_requirements - Institution-specific requirements
-- ============================================================================
CREATE TABLE IF NOT EXISTS college_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  
  -- Testing Requirements
  test_policy TEXT CHECK(test_policy IN ('required', 'optional', 'test-blind', 'flexible')),
  sat_required BOOLEAN DEFAULT 0,
  act_required BOOLEAN DEFAULT 0,
  sat_subject_tests_required BOOLEAN DEFAULT 0,
  sat_subject_tests_recommended INTEGER DEFAULT 0,  -- Number recommended
  
  -- Essay Requirements
  common_app_essay_required BOOLEAN DEFAULT 1,
  supplemental_essays_count INTEGER DEFAULT 0,
  supplemental_essays_max_words INTEGER,
  
  -- Recommendation Requirements
  teacher_recommendations_required INTEGER DEFAULT 2,
  counselor_recommendation_required BOOLEAN DEFAULT 1,
  peer_recommendation_required BOOLEAN DEFAULT 0,  -- Dartmouth special requirement
  additional_recommendations_allowed INTEGER DEFAULT 1,
  
  -- Interview Requirements
  interview_offered BOOLEAN DEFAULT 0,
  interview_required BOOLEAN DEFAULT 0,
  interview_type TEXT,  -- 'evaluative', 'informational', 'alumni', 'admissions_officer'
  
  -- Portfolio/Audition (Arts programs)
  portfolio_required BOOLEAN DEFAULT 0,
  audition_required BOOLEAN DEFAULT 0,
  
  -- Application Requirements
  demonstrated_interest_considered BOOLEAN DEFAULT 0,
  early_decision_binding BOOLEAN DEFAULT 1,
  
  -- International Student Requirements
  toefl_required_international BOOLEAN DEFAULT 1,
  toefl_minimum_score INTEGER,
  ielts_required_international BOOLEAN DEFAULT 0,
  ielts_minimum_score REAL,
  
  -- Additional Requirements
  additional_requirements TEXT,  -- JSON array of special requirements
  
  -- Data quality
  source_url TEXT,
  last_verified DATE,
  confidence_score REAL DEFAULT 0.5,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE,
  UNIQUE(college_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_college_req_college ON college_requirements(college_id);
CREATE INDEX IF NOT EXISTS idx_college_req_test_policy ON college_requirements(test_policy);
CREATE INDEX IF NOT EXISTS idx_college_req_verified ON college_requirements(last_verified);

-- ============================================================================
-- Table 2: course_requirements - Subject/course requirements per college
-- ============================================================================
CREATE TABLE IF NOT EXISTS course_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  
  -- Core Academic Subjects (in years)
  english_years_required INTEGER DEFAULT 4,
  math_years_required INTEGER DEFAULT 4,
  science_years_required INTEGER DEFAULT 3,
  lab_science_years_required INTEGER DEFAULT 2,
  social_studies_years_required INTEGER DEFAULT 3,
  foreign_language_years_required INTEGER DEFAULT 2,
  
  -- Recommended vs Required
  math_years_recommended INTEGER,
  science_years_recommended INTEGER,
  foreign_language_years_recommended INTEGER,
  
  -- Specific Course Requirements
  calculus_required BOOLEAN DEFAULT 0,
  physics_required BOOLEAN DEFAULT 0,
  chemistry_required BOOLEAN DEFAULT 0,
  biology_required BOOLEAN DEFAULT 0,
  
  -- Special Requirements
  fine_arts_required BOOLEAN DEFAULT 0,
  fine_arts_years INTEGER,
  
  -- Notes
  special_course_requirements TEXT,  -- Free text for unique requirements
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE,
  UNIQUE(college_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_course_req_college ON course_requirements(college_id);

-- ============================================================================
-- Sample data for top colleges
-- ============================================================================

-- Duke University (ID: 2378)
INSERT OR IGNORE INTO college_requirements (
  college_id,
  test_policy,
  sat_required,
  act_required,
  supplemental_essays_count,
  teacher_recommendations_required,
  counselor_recommendation_required,
  peer_recommendation_required,
  interview_offered,
  interview_required,
  interview_type,
  demonstrated_interest_considered,
  toefl_minimum_score,
  ielts_minimum_score,
  source_url,
  last_verified,
  confidence_score
) VALUES (
  2378,
  'optional',  -- Test optional
  0,
  0,
  3,  -- Duke has 3 supplemental essays
  2,
  1,
  0,  -- No peer recommendation
  1,  -- Offers interviews
  0,  -- Not required
  'alumni',
  1,  -- Considers demonstrated interest
  100,  -- TOEFL minimum
  7.0,  -- IELTS minimum
  'https://admissions.duke.edu/apply/requirements',
  DATE('now'),
  0.95
);

INSERT OR IGNORE INTO course_requirements (
  college_id,
  english_years_required,
  math_years_required,
  science_years_required,
  lab_science_years_required,
  social_studies_years_required,
  foreign_language_years_required,
  math_years_recommended,
  foreign_language_years_recommended,
  calculus_required
) VALUES (
  2378,
  4,  -- 4 years English
  4,  -- 4 years Math
  3,  -- 3 years Science
  2,  -- 2 years Lab Science
  3,  -- 3 years Social Studies
  2,  -- 2 years Foreign Language
  4,  -- 4 years Math recommended
  4,  -- 4 years FL recommended
  0   -- Calculus not required but recommended
);

-- Dartmouth College (ID: xxxx) - Example with peer recommendation
INSERT OR IGNORE INTO college_requirements (
  college_id,
  test_policy,
  supplemental_essays_count,
  teacher_recommendations_required,
  counselor_recommendation_required,
  peer_recommendation_required,  -- SPECIAL: Dartmouth unique requirement
  interview_offered,
  source_url,
  last_verified,
  confidence_score
) SELECT 
  id,
  'optional',
  2,
  2,
  1,
  1,  -- Dartmouth requires peer recommendation!
  1,
  'https://admissions.dartmouth.edu/apply',
  DATE('now'),
  0.95
FROM colleges WHERE name LIKE '%Dartmouth%' LIMIT 1;

-- MIT (ID: xxxx) - Example with required testing
INSERT OR IGNORE INTO college_requirements (
  college_id,
  test_policy,
  sat_required,
  act_required,
  supplemental_essays_count,
  teacher_recommendations_required,
  counselor_recommendation_required,
  source_url,
  last_verified,
  confidence_score
) SELECT
  id,
  'required',  -- MIT requires tests
  1,
  1,
  5,  -- MIT has many essays
  2,
  1,
  'https://mitadmissions.org/apply/firstyear/requirements',
  DATE('now'),
  0.95
FROM colleges WHERE name LIKE '%MIT%' OR name LIKE '%Massachusetts Institute%' LIMIT 1;

-- Migration complete
SELECT 'Migration 032 complete: Created college_requirements and course_requirements tables';

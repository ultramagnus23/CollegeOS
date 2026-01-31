-- Migration 013: Application Requirements Table
-- Tracks unique application requirements for each college (peer rec, portfolio, audition, etc.)

-- ==========================================
-- APPLICATION_REQUIREMENTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS application_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  
  -- Application Platforms
  common_app_accepted INTEGER DEFAULT 0,
  coalition_app_accepted INTEGER DEFAULT 0,
  questbridge_accepted INTEGER DEFAULT 0,
  direct_app_available INTEGER DEFAULT 0,
  
  -- Supplemental Essays
  supplemental_essays_required INTEGER DEFAULT 0,
  supplemental_essay_count INTEGER DEFAULT 0,
  supplemental_essay_topics TEXT, -- JSON array of essay prompts/topics
  
  -- Interviews
  interview_policy TEXT, -- 'required', 'recommended', 'optional', 'not_offered'
  interview_type TEXT, -- 'alumni', 'on_campus', 'virtual', 'third_party'
  
  -- Special Requirements (Flagged for prominence)
  peer_recommendation_required INTEGER DEFAULT 0, -- Dartmouth, Davidson
  peer_recommendation_details TEXT,
  
  portfolio_required INTEGER DEFAULT 0, -- Art/Architecture programs
  portfolio_programs TEXT, -- JSON array of programs requiring portfolio
  portfolio_submission_platform TEXT, -- SlideRoom, etc.
  
  audition_required INTEGER DEFAULT 0, -- Music/Theater programs
  audition_programs TEXT, -- JSON array of programs requiring audition
  audition_format TEXT, -- 'in_person', 'virtual', 'recorded'
  
  graded_paper_required INTEGER DEFAULT 0, -- Bates, Bowdoin
  graded_paper_details TEXT,
  
  -- Test Requirements
  toefl_minimum INTEGER,
  ielts_minimum REAL,
  duolingo_minimum INTEGER,
  english_proficiency_waiver_conditions TEXT,
  
  -- Admissions Policies
  demonstrated_interest_tracked INTEGER DEFAULT 0, -- 'considered', 'important', 'very_important', 'not_considered'
  demonstrated_interest_level TEXT, -- Detailed description
  legacy_preference INTEGER DEFAULT 0,
  legacy_preference_details TEXT,
  religious_affiliation_preference INTEGER DEFAULT 0,
  religious_affiliation_details TEXT,
  
  -- Fees
  application_fee INTEGER DEFAULT 0,
  fee_waiver_available INTEGER DEFAULT 1,
  fee_waiver_criteria TEXT, -- Income-based, SAT fee waiver, etc.
  
  -- Unique Requirements
  additional_requirements TEXT, -- JSON array of any other unique requirements
  requirement_notes TEXT, -- Free-form notes about special requirements
  
  -- Data Quality
  source TEXT,
  last_verified DATE,
  confidence_score REAL DEFAULT 0.5,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  UNIQUE(college_id)
);

-- ==========================================
-- INDEXES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_app_req_college ON application_requirements(college_id);
CREATE INDEX IF NOT EXISTS idx_app_req_peer_rec ON application_requirements(peer_recommendation_required);
CREATE INDEX IF NOT EXISTS idx_app_req_portfolio ON application_requirements(portfolio_required);
CREATE INDEX IF NOT EXISTS idx_app_req_audition ON application_requirements(audition_required);
CREATE INDEX IF NOT EXISTS idx_app_req_graded_paper ON application_requirements(graded_paper_required);
CREATE INDEX IF NOT EXISTS idx_app_req_demo_interest ON application_requirements(demonstrated_interest_tracked);

-- Migration 015: Expand Testing Policies
-- Adds detailed testing policy fields to college_admissions table

-- ==========================================
-- ADD TESTING POLICY COLUMNS TO COLLEGE_ADMISSIONS
-- ==========================================

-- Test-Optional/Blind Policies
ALTER TABLE college_admissions ADD COLUMN test_optional_permanent INTEGER DEFAULT 0;
ALTER TABLE college_admissions ADD COLUMN test_blind INTEGER DEFAULT 0;
ALTER TABLE college_admissions ADD COLUMN test_policy_details TEXT;

-- Superscoring Policies
ALTER TABLE college_admissions ADD COLUMN superscore_sat INTEGER DEFAULT 0;
ALTER TABLE college_admissions ADD COLUMN superscore_act INTEGER DEFAULT 0;

-- Essay Requirements (SAT/ACT Writing)
ALTER TABLE college_admissions ADD COLUMN sat_essay_required INTEGER DEFAULT 0;
ALTER TABLE college_admissions ADD COLUMN act_writing_required INTEGER DEFAULT 0;

-- Subject Test Policies (legacy but some still consider)
ALTER TABLE college_admissions ADD COLUMN subject_tests_recommended INTEGER DEFAULT 0;
ALTER TABLE college_admissions ADD COLUMN subject_tests_considered INTEGER DEFAULT 0;

-- Score Submission
ALTER TABLE college_admissions ADD COLUMN score_choice_allowed INTEGER DEFAULT 1;
ALTER TABLE college_admissions ADD COLUMN all_scores_required INTEGER DEFAULT 0;
ALTER TABLE college_admissions ADD COLUMN self_reported_scores_accepted INTEGER DEFAULT 0;

-- ==========================================
-- CREDIT POLICIES TABLE (AP, IB, Dual Enrollment)
-- ==========================================
CREATE TABLE IF NOT EXISTS credit_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  
  -- AP Credit Policy
  ap_credit_awarded INTEGER DEFAULT 1,
  ap_minimum_score INTEGER DEFAULT 4, -- Minimum AP score for credit
  ap_credit_limit INTEGER, -- Max AP credits accepted
  ap_credit_policy_details TEXT, -- JSON or detailed text
  ap_placement_only INTEGER DEFAULT 0, -- Some schools give placement but not credit
  
  -- IB Credit Policy
  ib_credit_awarded INTEGER DEFAULT 1,
  ib_minimum_score INTEGER DEFAULT 5, -- Minimum IB score for credit
  ib_credit_limit INTEGER,
  ib_credit_policy_details TEXT,
  ib_diploma_bonus_credit INTEGER DEFAULT 0, -- Extra credit for full IB diploma
  
  -- A-Level Credit Policy (for UK qualifications)
  a_level_credit_awarded INTEGER DEFAULT 0,
  a_level_minimum_grade TEXT,
  a_level_credit_policy_details TEXT,
  
  -- Dual Enrollment Credit
  dual_enrollment_accepted INTEGER DEFAULT 1,
  dual_enrollment_credit_limit INTEGER,
  dual_enrollment_min_grade TEXT,
  
  -- CLEP Credit
  clep_credit_accepted INTEGER DEFAULT 0,
  clep_credit_policy_details TEXT,
  
  -- General Credit Policies
  max_transfer_credits INTEGER,
  max_test_credits INTEGER, -- AP + IB + CLEP combined max
  credit_by_exam_policy TEXT,
  
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
CREATE INDEX IF NOT EXISTS idx_credit_policies_college ON credit_policies(college_id);
CREATE INDEX IF NOT EXISTS idx_credit_policies_ap_score ON credit_policies(ap_minimum_score);

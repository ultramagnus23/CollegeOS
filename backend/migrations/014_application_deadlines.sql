-- Migration 014: Application Deadlines Table
-- Comprehensive deadline tracking for all application cycles

-- ==========================================
-- APPLICATION_DEADLINES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS application_deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  academic_year TEXT NOT NULL, -- e.g., '2024-2025'
  
  -- Early Decision Deadlines
  early_decision_1_deadline DATE,
  early_decision_1_notification DATE,
  early_decision_2_deadline DATE,
  early_decision_2_notification DATE,
  
  -- Early Action Deadlines
  early_action_deadline DATE,
  early_action_notification DATE,
  restrictive_early_action_deadline DATE,
  restrictive_early_action_notification DATE,
  
  -- Regular Decision
  regular_decision_deadline DATE,
  regular_decision_notification DATE,
  
  -- Priority Deadline
  priority_deadline DATE,
  priority_notification DATE,
  
  -- Rolling Admission
  rolling_admission INTEGER DEFAULT 0,
  rolling_admission_start DATE,
  rolling_admission_end DATE,
  rolling_response_time_weeks INTEGER, -- Typical response time
  
  -- Transfer Deadlines
  transfer_fall_deadline DATE,
  transfer_spring_deadline DATE,
  transfer_notification_date DATE,
  
  -- Financial Aid Deadlines
  fafsa_priority_deadline DATE,
  css_profile_deadline DATE,
  institutional_aid_deadline DATE,
  
  -- Scholarship Deadlines
  merit_scholarship_deadline DATE,
  scholarship_application_required INTEGER DEFAULT 0,
  separate_scholarship_app_deadline DATE,
  
  -- Deposit and Housing Deadlines
  enrollment_deposit_deadline DATE,
  enrollment_deposit_amount INTEGER,
  housing_application_deadline DATE,
  housing_deposit_deadline DATE,
  housing_deposit_amount INTEGER,
  
  -- Other Important Dates
  course_registration_start DATE,
  orientation_date DATE,
  classes_start_date DATE,
  
  -- Notes
  deadline_notes TEXT, -- Any special notes about deadlines
  
  -- Data Quality
  source TEXT,
  last_verified DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  UNIQUE(college_id, academic_year)
);

-- ==========================================
-- INDEXES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_deadlines_college ON application_deadlines(college_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_year ON application_deadlines(academic_year);
CREATE INDEX IF NOT EXISTS idx_deadlines_ed1 ON application_deadlines(early_decision_1_deadline);
CREATE INDEX IF NOT EXISTS idx_deadlines_ea ON application_deadlines(early_action_deadline);
CREATE INDEX IF NOT EXISTS idx_deadlines_rd ON application_deadlines(regular_decision_deadline);

-- Migration 035: Add refresh_tokens table for JWT authentication
-- This migration creates the refresh_tokens table needed by authService.js
-- to store refresh tokens for secure authentication sessions

-- ==========================================
-- REFRESH TOKENS TABLE
-- Stores refresh tokens for JWT authentication
-- ==========================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- ==========================================
-- APPLICATIONS TABLE
-- Tracks user applications to colleges
-- Referenced by tasks and deadlines in migration 023
-- ==========================================
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  college_id INTEGER NOT NULL,
  
  -- Application details
  application_type TEXT DEFAULT 'regular_decision', -- 'early_decision', 'early_action', 'regular_decision', 'rolling'
  status TEXT DEFAULT 'planning', -- 'planning', 'in_progress', 'submitted', 'accepted', 'rejected', 'deferred', 'waitlisted', 'withdrawn'
  
  -- Important dates
  application_deadline DATETIME,
  submitted_at DATETIME,
  decision_date DATETIME,
  decision_received_at DATETIME,
  
  -- Financial
  application_fee REAL,
  fee_waiver_requested INTEGER DEFAULT 0,
  fee_waiver_approved INTEGER DEFAULT 0,
  
  -- Metadata
  notes TEXT,
  priority INTEGER DEFAULT 3, -- 1=must apply, 2=high priority, 3=normal, 4=backup
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE,
  UNIQUE(user_id, college_id, application_type)
);

-- Create indexes for applications table
CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_college ON applications(college_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_deadline ON applications(application_deadline);

-- ==========================================
-- ESSAYS TABLE
-- Tracks essay requirements and drafts
-- ==========================================
CREATE TABLE IF NOT EXISTS essays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  college_id INTEGER,
  application_id INTEGER,
  
  -- Essay details
  title TEXT NOT NULL,
  prompt TEXT,
  word_limit INTEGER,
  word_count INTEGER DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'not_started', -- 'not_started', 'drafting', 'editing', 'complete'
  
  -- Content
  content TEXT,
  
  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE SET NULL,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

-- Create indexes for essays table
CREATE INDEX IF NOT EXISTS idx_essays_user ON essays(user_id);
CREATE INDEX IF NOT EXISTS idx_essays_college ON essays(college_id);
CREATE INDEX IF NOT EXISTS idx_essays_application ON essays(application_id);
CREATE INDEX IF NOT EXISTS idx_essays_status ON essays(status);

-- ==========================================
-- DEADLINES TABLE
-- User-specific deadline tracking
-- ==========================================
CREATE TABLE IF NOT EXISTS deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  college_id INTEGER,
  application_id INTEGER,
  
  -- Deadline details
  title TEXT NOT NULL,
  deadline_type TEXT NOT NULL, -- 'application', 'financial_aid', 'housing', 'scholarship', 'custom'
  deadline_date DATETIME NOT NULL,
  
  -- Status
  is_completed INTEGER DEFAULT 0,
  completed_at DATETIME,
  
  -- Reminders
  reminder_sent INTEGER DEFAULT 0,
  
  -- Metadata
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE SET NULL,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

-- Create indexes for deadlines table
CREATE INDEX IF NOT EXISTS idx_deadlines_user ON deadlines(user_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_college ON deadlines(college_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_application ON deadlines(application_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_date ON deadlines(deadline_date);
CREATE INDEX IF NOT EXISTS idx_deadlines_completed ON deadlines(is_completed);

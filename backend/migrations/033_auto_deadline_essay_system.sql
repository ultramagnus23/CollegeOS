-- Migration 033: Add fields to support automatic deadline and essay system
-- Add missing fields for TASK implementation

-- Add application_year to application_deadlines if not exists
-- Note: Table should already have this from migration 031, but adding for completeness
-- ALTER TABLE application_deadlines ADD COLUMN IF NOT EXISTS application_year INTEGER DEFAULT 2026;

-- Add platform field to essays table to track Common App, Coalition, UC, etc.
ALTER TABLE essays ADD COLUMN platform TEXT;
ALTER TABLE essays ADD COLUMN shared_across_colleges INTEGER DEFAULT 0;
ALTER TABLE essays ADD COLUMN historical_data INTEGER DEFAULT 0;
ALTER TABLE essays ADD COLUMN essay_number INTEGER;

-- Add user consent tracking table
CREATE TABLE IF NOT EXISTS user_consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  consent_type TEXT NOT NULL, -- 'terms_and_data_collection', 'privacy_policy', etc.
  granted INTEGER DEFAULT 1,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user ON user_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_consents_type ON user_consents(consent_type);

-- Add terms acceptance to users table
ALTER TABLE users ADD COLUMN terms_accepted INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN terms_accepted_date DATETIME;

-- Add notification_date fields to application_deadlines if not present
-- These support TASK 10 (decision notification tracking)
-- Note: These should already exist from migration 031, but ensuring they're present
-- ALTER TABLE application_deadlines ADD COLUMN IF NOT EXISTS early_decision_1_notification DATE;
-- ALTER TABLE application_deadlines ADD COLUMN IF NOT EXISTS regular_decision_notification DATE;

-- Add confidence_score to application_deadlines for data reliability (TASK 3)
ALTER TABLE application_deadlines ADD COLUMN confidence_score REAL DEFAULT 0.8;
ALTER TABLE application_deadlines ADD COLUMN last_updated DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE application_deadlines ADD COLUMN source_url TEXT;
ALTER TABLE application_deadlines ADD COLUMN verification_status TEXT DEFAULT 'unverified';

-- Add application_platforms field to colleges if not exists
-- This helps identify if college uses Common App, Coalition, UC, etc.
ALTER TABLE colleges ADD COLUMN application_platforms TEXT;

-- Add notifications table for deadline changes and updates (TASK 9)
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL, -- 'deadline_change', 'essay_prompt_change', 'decision_date', etc.
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- Add recently_changed flag to deadlines for "Recently Updated" badge (TASK 9)
ALTER TABLE deadlines ADD COLUMN recently_changed INTEGER DEFAULT 0;
ALTER TABLE deadlines ADD COLUMN change_date DATETIME;

-- Add email notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  deadline_changes_email INTEGER DEFAULT 1,
  essay_changes_email INTEGER DEFAULT 1,
  decision_dates_email INTEGER DEFAULT 1,
  weekly_digest_email INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Add essay drafts table for versioning (mentioned in TASK requirements)
CREATE TABLE IF NOT EXISTS essay_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  essay_id INTEGER NOT NULL,
  draft_text TEXT,
  word_count INTEGER,
  version_number INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (essay_id) REFERENCES essays(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_essay_drafts_essay ON essay_drafts(essay_id);
CREATE INDEX IF NOT EXISTS idx_essay_drafts_version ON essay_drafts(version_number);

-- Migration 003: Create Deadlines Table
-- Deadlines are automatically generated when a user selects a college
-- Users cannot manually create deadlines - they are system-generated only

CREATE TABLE IF NOT EXISTS deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  application_id INTEGER NOT NULL, -- Links to specific application
  college_id INTEGER NOT NULL, -- Denormalized for fast queries
  
  -- Deadline information
  title TEXT NOT NULL, -- "Early Action Deadline", "Financial Aid Deadline"
  description TEXT, -- Additional context about this deadline
  deadline_date DATE NOT NULL,
  deadline_type TEXT NOT NULL, -- application, financial_aid, housing, enrollment, transcript
  
  -- Status tracking
  completed BOOLEAN DEFAULT 0,
  completed_date DATETIME,
  
  -- Priority and visibility
  priority TEXT DEFAULT 'medium', -- low, medium, high, critical
  is_optional BOOLEAN DEFAULT 0, -- Some deadlines are optional (like early action)
  
  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign key constraints
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
);

-- Indexes for fast filtering and sorting
CREATE INDEX IF NOT EXISTS idx_deadlines_user ON deadlines(user_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_application ON deadlines(application_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_date ON deadlines(deadline_date);
CREATE INDEX IF NOT EXISTS idx_deadlines_completed ON deadlines(completed);

-- Composite index for dashboard queries (show upcoming deadlines for user)
CREATE INDEX IF NOT EXISTS idx_deadlines_user_date_completed 
ON deadlines(user_id, deadline_date, completed);
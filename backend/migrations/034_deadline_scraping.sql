-- Migration 034: Deadline Scraping Enhancements
-- Adds fields and tables to support automated deadline scraping

-- ============================================================================
-- Add scraping-related fields to colleges table
-- ============================================================================
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS deadlines_page_url TEXT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS last_scraped_deadlines DATETIME;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS priority_tier INTEGER DEFAULT 2;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS deadline_frequently_changes BOOLEAN DEFAULT 0;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS scraping_difficult BOOLEAN DEFAULT 0;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS deadlines_not_available BOOLEAN DEFAULT 0;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS scraping_failures_count INTEGER DEFAULT 0;

-- Index for priority-based scraping queries
CREATE INDEX IF NOT EXISTS idx_colleges_priority ON colleges(priority_tier, last_scraped_deadlines);

-- ============================================================================
-- Table: scraping_logs - Track all deadline scraping attempts
-- ============================================================================
CREATE TABLE IF NOT EXISTS scraping_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  scrape_type TEXT DEFAULT 'deadlines',
  url_visited TEXT,
  started_at DATETIME,
  completed_at DATETIME,
  status TEXT CHECK(status IN ('success', 'failure', 'partial')),
  deadlines_found INTEGER DEFAULT 0,
  changes_detected INTEGER DEFAULT 0,
  error_message TEXT,
  confidence_score REAL,
  extraction_method TEXT, -- 'table', 'list', 'paragraph', 'none'
  duration_ms INTEGER,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scraping_logs_college ON scraping_logs(college_id, started_at);
CREATE INDEX IF NOT EXISTS idx_scraping_logs_status ON scraping_logs(status, started_at);

-- ============================================================================
-- Enhance application_deadlines table with change tracking
-- ============================================================================
-- Add change history tracking field if not exists
-- Note: SQLite doesn't support ADD COLUMN IF NOT EXISTS directly, so we check
SELECT CASE 
  WHEN EXISTS(
    SELECT 1 FROM pragma_table_info('application_deadlines') WHERE name='change_history'
  ) 
  THEN 'change_history column already exists'
  ELSE 'Adding change_history column'
END;

-- Add change history column (stores JSON array of changes)
-- Run this manually if needed: ALTER TABLE application_deadlines ADD COLUMN change_history TEXT;

-- Add version counter for tracking updates
-- Run this manually if needed: ALTER TABLE application_deadlines ADD COLUMN version INTEGER DEFAULT 1;

-- Add verification status
-- Run this manually if needed: ALTER TABLE application_deadlines ADD COLUMN verification_status TEXT DEFAULT 'auto';

-- ============================================================================
-- Table: manual_review_queue - Colleges needing manual review
-- ============================================================================
CREATE TABLE IF NOT EXISTS manual_review_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  confidence_score REAL,
  error_details TEXT,
  flagged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME,
  reviewed_by TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_review', 'resolved', 'dismissed')),
  notes TEXT,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_review_queue_status ON manual_review_queue(status, flagged_at);
CREATE INDEX IF NOT EXISTS idx_review_queue_college ON manual_review_queue(college_id);

-- ============================================================================
-- Table: scraping_summary - Daily scraping summary statistics
-- ============================================================================
CREATE TABLE IF NOT EXISTS scraping_summary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  summary_date DATE NOT NULL UNIQUE,
  tier1_colleges_scraped INTEGER DEFAULT 0,
  tier2_colleges_scraped INTEGER DEFAULT 0,
  total_successful INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  deadlines_added INTEGER DEFAULT 0,
  deadlines_updated INTEGER DEFAULT 0,
  changes_detected INTEGER DEFAULT 0,
  notifications_sent INTEGER DEFAULT 0,
  avg_confidence_score REAL,
  avg_duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scraping_summary_date ON scraping_summary(summary_date);

-- ============================================================================
-- Initialize priority tiers for existing colleges
-- ============================================================================
-- Set Tier 1 for top 100 colleges
UPDATE colleges 
SET priority_tier = 1 
WHERE ranking <= 100 AND ranking IS NOT NULL;

-- Set Tier 1 for colleges with high user engagement (if applications table exists)
-- Note: This will only work after applications are tracked
-- UPDATE colleges SET priority_tier = 1 WHERE id IN (
--   SELECT college_id FROM applications GROUP BY college_id HAVING COUNT(*) > 10
-- );

SELECT 'Migration 034 complete: Deadline scraping infrastructure added';

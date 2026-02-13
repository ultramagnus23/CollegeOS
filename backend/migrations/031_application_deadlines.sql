-- Migration 031: Application Deadlines
-- Creates per-college deadline system with only relevant deadline types

-- ============================================================================
-- Drop old application_deadlines table from migration 014 (has different schema)
-- ============================================================================
DROP TABLE IF EXISTS application_deadlines;

-- ============================================================================
-- Table: application_deadlines - College-specific deadlines
-- ============================================================================
CREATE TABLE application_deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  
  -- Early Decision deadlines
  early_decision_1_date DATE,
  early_decision_1_notification DATE,
  early_decision_2_date DATE,
  early_decision_2_notification DATE,
  
  -- Early Action deadlines
  early_action_date DATE,
  early_action_notification DATE,
  restrictive_early_action_date DATE,  -- REA (Stanford, Harvard, etc.)
  restrictive_early_action_notification DATE,
  
  -- Regular Decision
  regular_decision_date DATE,
  regular_decision_notification DATE,
  
  -- Transfer deadlines
  transfer_fall_date DATE,
  transfer_spring_date DATE,
  
  -- International deadlines (if different)
  international_deadline_date DATE,
  
  -- Metadata
  offers_early_decision BOOLEAN DEFAULT 0,
  offers_early_action BOOLEAN DEFAULT 0,
  offers_restrictive_ea BOOLEAN DEFAULT 0,
  offers_rolling_admission BOOLEAN DEFAULT 0,
  
  application_fee INTEGER,  -- Application fee in USD
  application_fee_waiver_available BOOLEAN DEFAULT 1,
  
  -- Data quality
  source_url TEXT,  -- Where this data was scraped from
  last_verified DATE,  -- Last time we verified this data
  confidence_score REAL DEFAULT 0.5,  -- 0.0 to 1.0
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE,
  UNIQUE(college_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_app_deadlines_college ON application_deadlines(college_id);
CREATE INDEX IF NOT EXISTS idx_app_deadlines_ed ON application_deadlines(offers_early_decision);
CREATE INDEX IF NOT EXISTS idx_app_deadlines_ea ON application_deadlines(offers_early_action);
CREATE INDEX IF NOT EXISTS idx_app_deadlines_verified ON application_deadlines(last_verified);

-- ============================================================================
-- NOTE: Sample data is NOT inserted here to avoid foreign key errors
-- Data is inserted by backend/scripts/populateDeadlines.js AFTER seeding
-- Run: npm run populate:deadlines
-- ============================================================================

-- Migration complete
SELECT 'Migration 031 complete: Created application_deadlines table';

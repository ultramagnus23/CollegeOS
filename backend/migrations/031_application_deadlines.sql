-- Migration 031: Application Deadlines
-- Creates per-college deadline system with only relevant deadline types

-- ============================================================================
-- Table: application_deadlines - College-specific deadlines
-- ============================================================================
CREATE TABLE IF NOT EXISTS application_deadlines (
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
-- Sample data for top colleges (will be updated by scraper)
-- ============================================================================

-- Duke University (ID: 2378)
INSERT OR IGNORE INTO application_deadlines (
  college_id,
  early_decision_1_date,
  early_decision_1_notification,
  regular_decision_date,
  regular_decision_notification,
  offers_early_decision,
  offers_early_action,
  offers_restrictive_ea,
  application_fee,
  application_fee_waiver_available,
  source_url,
  last_verified,
  confidence_score
) VALUES (
  2378,
  '2024-11-01',
  '2024-12-15',
  '2025-01-02',
  '2025-04-01',
  1,  -- Offers ED
  0,  -- No EA
  0,  -- No REA
  85,
  1,
  'https://admissions.duke.edu/apply/deadlines',
  DATE('now'),
  0.95
);

-- Harvard University (ID: 2145) - Example with REA
INSERT OR IGNORE INTO application_deadlines (
  college_id,
  restrictive_early_action_date,
  restrictive_early_action_notification,
  regular_decision_date,
  regular_decision_notification,
  offers_early_decision,
  offers_early_action,
  offers_restrictive_ea,
  application_fee,
  application_fee_waiver_available,
  source_url,
  last_verified,
  confidence_score
) VALUES (
  2145,
  '2024-11-01',
  '2024-12-15',
  '2025-01-01',
  '2025-04-01',
  0,  -- No ED
  0,  -- No regular EA
  1,  -- Has REA
  85,
  1,
  'https://college.harvard.edu/admissions/apply',
  DATE('now'),
  0.95
);

-- Stanford University (ID: 2xxx) - Example with REA
-- MIT (ID: 2xxx) - Example with EA
-- Add more examples as needed

-- Migration complete
SELECT 'Migration 031 complete: Created application_deadlines table';

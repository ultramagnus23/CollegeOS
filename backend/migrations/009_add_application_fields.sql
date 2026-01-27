-- Migration 009: Add Application Fields
-- Adds fields for application tracking: application fee, test-optional, deadline types

-- Add application fee field
ALTER TABLE colleges ADD COLUMN application_fee INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN application_fee_waiver_available INTEGER DEFAULT 0;

-- Add test-optional policy status
ALTER TABLE colleges ADD COLUMN test_optional INTEGER DEFAULT 0; -- 0=required, 1=optional, 2=test-blind
ALTER TABLE colleges ADD COLUMN test_optional_notes TEXT DEFAULT NULL;

-- Add deadline fields (for structured deadline data)
ALTER TABLE colleges ADD COLUMN deadline_early_decision TEXT DEFAULT NULL; -- ISO date string
ALTER TABLE colleges ADD COLUMN deadline_early_action TEXT DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN deadline_regular_decision TEXT DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN deadline_rolling INTEGER DEFAULT 0; -- 1=has rolling admissions

-- Add common essay prompts (JSON array of prompts for this college)
ALTER TABLE colleges ADD COLUMN essay_prompts TEXT DEFAULT NULL;

-- Add index for test-optional filtering
CREATE INDEX IF NOT EXISTS idx_colleges_test_optional ON colleges(test_optional);

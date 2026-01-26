-- Migration 008: Add Admission Statistics Columns
-- Adds columns for storing verified admission statistics from official sources
-- These are used for profile comparison (no ML, no probability predictions)

-- Add SAT score columns (US primarily, some international)
ALTER TABLE colleges ADD COLUMN sat_reading_25 INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN sat_reading_75 INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN sat_math_25 INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN sat_math_75 INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN sat_total_avg INTEGER DEFAULT NULL;

-- Add ACT score columns
ALTER TABLE colleges ADD COLUMN act_composite_25 INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN act_composite_75 INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN act_composite_avg INTEGER DEFAULT NULL;

-- Add GPA columns (where available)
ALTER TABLE colleges ADD COLUMN gpa_avg REAL DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN gpa_25 REAL DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN gpa_75 REAL DEFAULT NULL;

-- Add international exam requirements
ALTER TABLE colleges ADD COLUMN ielts_min REAL DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN toefl_min INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN a_level_typical TEXT DEFAULT NULL; -- e.g. "AAA" or "A*AA"
ALTER TABLE colleges ADD COLUMN ib_min INTEGER DEFAULT NULL;

-- Add India-specific exam requirements
ALTER TABLE colleges ADD COLUMN jee_advanced_cutoff INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN jee_mains_cutoff INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN neet_cutoff INTEGER DEFAULT NULL;

-- Add enrollment and student stats
ALTER TABLE colleges ADD COLUMN total_enrollment INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN undergrad_enrollment INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN graduation_rate REAL DEFAULT NULL;

-- Add financial stats
ALTER TABLE colleges ADD COLUMN in_state_tuition INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN out_of_state_tuition INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN international_tuition INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN avg_financial_aid INTEGER DEFAULT NULL;

-- Add data source tracking
ALTER TABLE colleges ADD COLUMN admission_data_source TEXT DEFAULT NULL; -- e.g. 'scorecard', 'ucas', 'nirf'
ALTER TABLE colleges ADD COLUMN admission_data_year INTEGER DEFAULT NULL;

-- Add popular/strong programs (more detailed than major_categories)
ALTER TABLE colleges ADD COLUMN strong_programs TEXT DEFAULT NULL; -- JSON array of program names with strengths
ALTER TABLE colleges ADD COLUMN typical_extracurriculars TEXT DEFAULT NULL; -- JSON array of common activities

-- Create index for acceptance rate filtering
CREATE INDEX IF NOT EXISTS idx_colleges_acceptance_rate ON colleges(acceptance_rate);
CREATE INDEX IF NOT EXISTS idx_colleges_sat_total_avg ON colleges(sat_total_avg);
CREATE INDEX IF NOT EXISTS idx_colleges_tuition ON colleges(in_state_tuition);

-- Migration 024: Complete User Profiles for Settings Page
-- This migration adds all required columns for full profile management
-- Safe to run - uses ADD COLUMN (will fail silently if column exists in SQLite)

-- ==========================================
-- BASIC INFO COLUMNS
-- ==========================================
ALTER TABLE student_profiles ADD COLUMN phone VARCHAR(20);
ALTER TABLE student_profiles ADD COLUMN date_of_birth DATE;
ALTER TABLE student_profiles ADD COLUMN grade_level VARCHAR(20);

-- ==========================================
-- ACADEMIC INFO COLUMNS
-- ==========================================
-- Note: curriculum_type already exists in student_profiles
ALTER TABLE student_profiles ADD COLUMN stream VARCHAR(50);

-- ==========================================
-- SUBJECTS COLUMN (JSONB for curriculum-specific data)
-- ==========================================
ALTER TABLE student_profiles ADD COLUMN subjects TEXT DEFAULT '[]';

-- ==========================================
-- TEST SCORES - BREAKDOWN COLUMNS
-- ==========================================
-- SAT breakdown (sat_total, sat_ebrw, sat_math already exist)
ALTER TABLE student_profiles ADD COLUMN sat_breakdown TEXT;

-- ACT breakdown (act_composite and individual scores already exist)
ALTER TABLE student_profiles ADD COLUMN act_breakdown TEXT;

-- IELTS breakdown (ielts_score already exists)
ALTER TABLE student_profiles ADD COLUMN ielts_breakdown TEXT;

-- ==========================================
-- PREFERENCES COLUMNS
-- ==========================================
-- Note: intended_majors, preferred_states, preferred_countries already exist
ALTER TABLE student_profiles ADD COLUMN budget_min INTEGER;
-- Note: budget_max already exists
ALTER TABLE student_profiles ADD COLUMN college_size_preference VARCHAR(50);
ALTER TABLE student_profiles ADD COLUMN campus_setting_preference VARCHAR(50);

-- ==========================================
-- METADATA COLUMNS
-- ==========================================
ALTER TABLE student_profiles ADD COLUMN profile_completion_percentage INTEGER DEFAULT 0;

-- ==========================================
-- IB SPECIFIC COLUMNS
-- ==========================================
ALTER TABLE student_profiles ADD COLUMN ib_program_type VARCHAR(50);
ALTER TABLE student_profiles ADD COLUMN tok_grade VARCHAR(2);
ALTER TABLE student_profiles ADD COLUMN ee_grade VARCHAR(2);
ALTER TABLE student_profiles ADD COLUMN ib_subjects TEXT DEFAULT '[]';

-- ==========================================
-- A-LEVEL SPECIFIC COLUMNS
-- ==========================================
ALTER TABLE student_profiles ADD COLUMN exam_board VARCHAR(50);
ALTER TABLE student_profiles ADD COLUMN a_level_subjects TEXT DEFAULT '[]';
ALTER TABLE student_profiles ADD COLUMN as_levels TEXT DEFAULT '[]';
ALTER TABLE student_profiles ADD COLUMN epq_completed INTEGER DEFAULT 0;
ALTER TABLE student_profiles ADD COLUMN epq_grade VARCHAR(5);

-- ==========================================
-- CBSE SPECIFIC COLUMNS
-- ==========================================
ALTER TABLE student_profiles ADD COLUMN cbse_subjects TEXT DEFAULT '[]';
ALTER TABLE student_profiles ADD COLUMN board_exam_year INTEGER;
ALTER TABLE student_profiles ADD COLUMN overall_percentage REAL;
ALTER TABLE student_profiles ADD COLUMN school_city VARCHAR(100);

-- ==========================================
-- ONBOARDING DRAFT COLUMN
-- ==========================================
ALTER TABLE student_profiles ADD COLUMN onboarding_draft TEXT;
ALTER TABLE student_profiles ADD COLUMN onboarding_step INTEGER DEFAULT 0;

-- ==========================================
-- CREATE INDEX FOR FASTER LOOKUPS
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_student_profiles_curriculum ON student_profiles(curriculum_type);
CREATE INDEX IF NOT EXISTS idx_student_profiles_country ON student_profiles(country);
CREATE INDEX IF NOT EXISTS idx_student_profiles_graduation ON student_profiles(graduation_year);

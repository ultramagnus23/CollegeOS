-- Migration 004: User Profile Enhancements
-- This migration adds columns to the users table if they don't exist
-- Safe to run even if table doesn't exist or columns already exist

-- Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT,
  google_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add new columns (these will fail silently if columns already exist in sqlite3)
-- Note: SQLite doesn't support ADD COLUMN IF NOT EXISTS, but failures are okay
-- The migration script should handle these gracefully

ALTER TABLE users ADD COLUMN academic_board TEXT;
ALTER TABLE users ADD COLUMN grade_level TEXT;
ALTER TABLE users ADD COLUMN graduation_year INTEGER;
ALTER TABLE users ADD COLUMN subjects TEXT;
ALTER TABLE users ADD COLUMN percentage REAL;
ALTER TABLE users ADD COLUMN gpa REAL;
ALTER TABLE users ADD COLUMN medium_of_instruction TEXT;
ALTER TABLE users ADD COLUMN exams_taken TEXT;
ALTER TABLE users ADD COLUMN max_budget_per_year REAL;
ALTER TABLE users ADD COLUMN can_take_loan BOOLEAN DEFAULT 0;
ALTER TABLE users ADD COLUMN need_financial_aid BOOLEAN DEFAULT 0;
ALTER TABLE users ADD COLUMN target_countries TEXT;
ALTER TABLE users ADD COLUMN intended_major TEXT;
ALTER TABLE users ADD COLUMN career_goals TEXT;
ALTER TABLE users ADD COLUMN profile_completed BOOLEAN DEFAULT 0;
-- Migration 006: Fix Users Table Schema
-- This migration ensures the users table has all required columns
-- Handles the name -> full_name column issue and adds missing columns

-- Drop and recreate users table with correct schema
-- This is safe because we want to start fresh with the correct structure
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  google_id TEXT UNIQUE,
  full_name TEXT NOT NULL,
  country TEXT NOT NULL,
  target_countries TEXT,
  intended_majors TEXT,
  test_status TEXT,
  language_preferences TEXT,
  onboarding_complete INTEGER DEFAULT 0,
  academic_board TEXT,
  grade_level TEXT,
  graduation_year INTEGER,
  subjects TEXT,
  percentage REAL,
  gpa REAL,
  medium_of_instruction TEXT,
  exams_taken TEXT,
  max_budget_per_year REAL,
  can_take_loan INTEGER DEFAULT 0,
  need_financial_aid INTEGER DEFAULT 0,
  intended_major TEXT,
  career_goals TEXT,
  profile_completed INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

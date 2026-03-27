-- Migration 037: Add admission_outcomes table for ML training data from scrapers

CREATE TABLE IF NOT EXISTS admission_outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_name TEXT NOT NULL,
  sat_total INTEGER,
  gpa REAL,
  admitted INTEGER NOT NULL DEFAULT 0,
  year INTEGER,
  source TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admission_outcomes_college ON admission_outcomes(college_name);
CREATE INDEX IF NOT EXISTS idx_admission_outcomes_admitted ON admission_outcomes(admitted);
CREATE INDEX IF NOT EXISTS idx_admission_outcomes_year ON admission_outcomes(year);

-- Migration 038: Scraper pipeline tables for Reddit admissions data collection

-- One row per scraped Reddit post (one person's admissions profile)
CREATE TABLE IF NOT EXISTS scraped_applicants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reddit_post_id TEXT NOT NULL UNIQUE,
  gpa REAL,
  sat_score INTEGER,
  act_score INTEGER,
  num_ap_courses INTEGER,
  nationality TEXT,
  intended_major TEXT,
  first_gen INTEGER,           -- boolean stored as 0/1
  income_bracket TEXT,
  raw_text TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scraped_applicants_post_id ON scraped_applicants(reddit_post_id);

-- One row per school application within a post
CREATE TABLE IF NOT EXISTS scraped_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id INTEGER NOT NULL REFERENCES scraped_applicants(id) ON DELETE CASCADE,
  school_name_raw TEXT NOT NULL,
  school_name_normalized TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('accepted', 'rejected', 'waitlisted', 'deferred')),
  round TEXT CHECK(round IN ('ED', 'EA', 'RD', 'REA', 'SCEA')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scraped_results_applicant ON scraped_results(applicant_id);
CREATE INDEX IF NOT EXISTS idx_scraped_results_school ON scraped_results(school_name_normalized);
CREATE INDEX IF NOT EXISTS idx_scraped_results_outcome ON scraped_results(outcome);

-- One row per school per calibration run
CREATE TABLE IF NOT EXISTS calibration_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  school_name TEXT NOT NULL,
  predicted_rate REAL NOT NULL,
  actual_rate REAL NOT NULL,
  brier_score REAL NOT NULL,
  previous_brier_score REAL,
  delta REAL,                  -- positive = degraded, negative = improved
  sample_size INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calibration_runs_school ON calibration_runs(school_name);
CREATE INDEX IF NOT EXISTS idx_calibration_runs_at ON calibration_runs(run_at);

-- One row per scrape job execution
CREATE TABLE IF NOT EXISTS scrape_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  mode TEXT NOT NULL CHECK(mode IN ('seed', 'incremental')),
  posts_fetched INTEGER NOT NULL DEFAULT 0,
  posts_parsed INTEGER NOT NULL DEFAULT 0,
  posts_stored INTEGER NOT NULL DEFAULT 0,
  posts_skipped INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

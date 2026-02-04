-- backend/migrations/010_lda_chancing_tables.sql
-- Extended ML tables for LDA-based admission chancing system
-- NOTE: SQLite does not support "IF NOT EXISTS" for ALTER TABLE ADD COLUMN
-- The migration runner handles duplicate column errors gracefully

-- Extend ml_training_data with additional fields for LDA training
-- Add data quality and source tracking columns
ALTER TABLE ml_training_data ADD COLUMN source TEXT DEFAULT 'user_submitted';
ALTER TABLE ml_training_data ADD COLUMN source_url TEXT;
ALTER TABLE ml_training_data ADD COLUMN source_year INTEGER;
ALTER TABLE ml_training_data ADD COLUMN confidence_score REAL DEFAULT 0.7;
ALTER TABLE ml_training_data ADD COLUMN is_verified INTEGER DEFAULT 0;
ALTER TABLE ml_training_data ADD COLUMN verification_date DATETIME;
ALTER TABLE ml_training_data ADD COLUMN major_applied TEXT;
ALTER TABLE ml_training_data ADD COLUMN is_athlete INTEGER DEFAULT 0;
ALTER TABLE ml_training_data ADD COLUMN num_ib_courses INTEGER DEFAULT 0;
ALTER TABLE ml_training_data ADD COLUMN activity_tier_3_count INTEGER DEFAULT 0;
ALTER TABLE ml_training_data ADD COLUMN coursework_rigor_score REAL;
ALTER TABLE ml_training_data ADD COLUMN essay_quality_estimate INTEGER;

-- Regional education equivalents for international students
ALTER TABLE ml_training_data ADD COLUMN education_system TEXT DEFAULT 'US';
ALTER TABLE ml_training_data ADD COLUMN board_percentage REAL;
ALTER TABLE ml_training_data ADD COLUMN jee_rank INTEGER;
ALTER TABLE ml_training_data ADD COLUMN a_level_grades TEXT;
ALTER TABLE ml_training_data ADD COLUMN ib_points INTEGER;
ALTER TABLE ml_training_data ADD COLUMN abitur_grade REAL;

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ml_training_confidence ON ml_training_data(confidence_score);
CREATE INDEX IF NOT EXISTS idx_ml_training_source ON ml_training_data(source);
CREATE INDEX IF NOT EXISTS idx_ml_training_verified ON ml_training_data(is_verified);

-- LDA Model Registry - Enhanced version
CREATE TABLE IF NOT EXISTS lda_model_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  model_version TEXT NOT NULL,
  model_path TEXT NOT NULL,
  scaler_path TEXT,
  sample_count INTEGER,
  accepted_count INTEGER,
  rejected_count INTEGER,
  class_balance REAL,
  accuracy_score REAL,
  precision_score REAL,
  recall_score REAL,
  f1_score REAL,
  cv_mean REAL,
  cv_std REAL,
  feature_columns TEXT,
  feature_importance TEXT,
  is_deployed INTEGER DEFAULT 1,
  trained_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deployed_at DATETIME,
  retired_at DATETIME,
  training_config TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lda_registry_college ON lda_model_registry(college_id);
CREATE INDEX IF NOT EXISTS idx_lda_registry_deployed ON lda_model_registry(is_deployed);
CREATE INDEX IF NOT EXISTS idx_lda_registry_version ON lda_model_registry(model_version);

-- Model training history for tracking improvements
CREATE TABLE IF NOT EXISTS model_training_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  model_version TEXT,
  trigger_type TEXT CHECK(trigger_type IN ('scheduled', 'manual', 'data_threshold', 'initial')),
  samples_used INTEGER,
  training_duration_ms INTEGER,
  accuracy_before REAL,
  accuracy_after REAL,
  improvement_delta REAL,
  success INTEGER DEFAULT 1,
  failure_reason TEXT,
  trained_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_training_history_college ON model_training_history(college_id);
CREATE INDEX IF NOT EXISTS idx_training_history_date ON model_training_history(trained_at);

-- User contribution tracking for feedback loop
CREATE TABLE IF NOT EXISTS user_outcome_contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  training_data_id INTEGER NOT NULL,
  college_id INTEGER NOT NULL,
  decision TEXT NOT NULL,
  contribution_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  points_awarded INTEGER DEFAULT 10,
  used_in_training INTEGER DEFAULT 0,
  model_version_used TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (training_data_id) REFERENCES ml_training_data(id) ON DELETE CASCADE,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contributions_user ON user_outcome_contributions(user_id);
CREATE INDEX IF NOT EXISTS idx_contributions_college ON user_outcome_contributions(college_id);

-- User contribution stats (gamification)
CREATE TABLE IF NOT EXISTS user_ml_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  total_contributions INTEGER DEFAULT 0,
  verified_contributions INTEGER DEFAULT 0,
  total_points INTEGER DEFAULT 0,
  contribution_rank TEXT DEFAULT 'contributor',
  models_improved INTEGER DEFAULT 0,
  last_contribution_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ml_stats_user ON user_ml_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_ml_stats_points ON user_ml_stats(total_points);

-- Data scraping sources registry
CREATE TABLE IF NOT EXISTS ml_data_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name TEXT NOT NULL,
  source_type TEXT CHECK(source_type IN ('reddit', 'forum', 'official', 'user', 'partner')),
  source_url TEXT,
  trust_level REAL DEFAULT 0.5,
  records_contributed INTEGER DEFAULT 0,
  last_scraped_at DATETIME,
  scrape_frequency TEXT DEFAULT 'daily',
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_data_sources_type ON ml_data_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_data_sources_active ON ml_data_sources(is_active);

-- Prediction audit log
CREATE TABLE IF NOT EXISTS prediction_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  college_id INTEGER NOT NULL,
  prediction_type TEXT CHECK(prediction_type IN ('ml_lda', 'rule_based', 'hybrid')),
  probability REAL,
  category TEXT,
  confidence REAL,
  model_version TEXT,
  feature_snapshot TEXT,
  factors_json TEXT,
  predicted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prediction_audit_user ON prediction_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_prediction_audit_college ON prediction_audit_log(college_id);
CREATE INDEX IF NOT EXISTS idx_prediction_audit_date ON prediction_audit_log(predicted_at);

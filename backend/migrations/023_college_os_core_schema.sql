-- Migration 023: CollegeOS Core Schema
-- Implements the core CollegeOS database schema for intelligent college application management
-- Features: College aliases, intake cycles, fit classification, task decomposition, deadline risk

-- ==========================================
-- COLLEGE ALIASES TABLE
-- Maps common names, abbreviations to official college IDs
-- ==========================================
CREATE TABLE IF NOT EXISTS college_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  alias TEXT NOT NULL,
  alias_type TEXT DEFAULT 'abbreviation', -- 'abbreviation', 'former_name', 'common_name', 'typo'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE,
  UNIQUE(college_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_college_aliases_alias ON college_aliases(LOWER(alias));
CREATE INDEX IF NOT EXISTS idx_college_aliases_college ON college_aliases(college_id);

-- ==========================================
-- APPLICATION SYSTEMS TABLE
-- Tracks what application platform each college uses
-- ==========================================
CREATE TABLE IF NOT EXISTS application_systems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  system_type TEXT NOT NULL, -- 'CommonApp', 'UCAS', 'UniAssist', 'Coalition', 'Direct', 'JEE', 'NEET', 'CUET'
  system_url TEXT,
  system_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_app_systems_college ON application_systems(college_id);
CREATE INDEX IF NOT EXISTS idx_app_systems_type ON application_systems(system_type);

-- ==========================================
-- INTAKE CYCLES TABLE
-- Tracks available intake periods for each college
-- ==========================================
CREATE TABLE IF NOT EXISTS intake_cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  cycle_name TEXT NOT NULL, -- 'Fall', 'Spring', 'Winter', 'Summer', 'Rolling'
  start_month INTEGER, -- 1-12
  end_month INTEGER,
  is_primary INTEGER DEFAULT 0, -- Main intake period
  accepts_international INTEGER DEFAULT 1,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_intake_cycles_college ON intake_cycles(college_id);
CREATE INDEX IF NOT EXISTS idx_intake_cycles_name ON intake_cycles(cycle_name);

-- ==========================================
-- REQUIRED EXAMS TABLE
-- Lists all exams required/accepted by a college
-- ==========================================
CREATE TABLE IF NOT EXISTS required_exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  exam_name TEXT NOT NULL, -- 'SAT', 'ACT', 'IELTS', 'TOEFL', 'GRE', 'GMAT', 'JEE', 'NEET'
  exam_category TEXT, -- 'standardized', 'language', 'subject', 'entrance'
  is_required INTEGER DEFAULT 0,
  is_optional INTEGER DEFAULT 0,
  is_test_blind INTEGER DEFAULT 0,
  minimum_score TEXT, -- Flexible to handle different score types
  recommended_score TEXT,
  valid_months INTEGER DEFAULT 24, -- How long scores are valid
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_required_exams_college ON required_exams(college_id);
CREATE INDEX IF NOT EXISTS idx_required_exams_name ON required_exams(exam_name);

-- ==========================================
-- PROFILE SNAPSHOTS TABLE
-- Stores historical versions of user profiles for timeline tracking
-- ==========================================
CREATE TABLE IF NOT EXISTS profile_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  snapshot_data TEXT NOT NULL, -- JSON of the full profile at that moment
  gpa_at_snapshot REAL,
  test_scores_at_snapshot TEXT, -- JSON of test scores
  activities_count INTEGER,
  awards_count INTEGER,
  trigger_event TEXT, -- What caused this snapshot: 'manual', 'gpa_update', 'test_score', 'scheduled'
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_profile_snapshots_user ON profile_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_snapshots_date ON profile_snapshots(created_at);

-- ==========================================
-- COLLEGE FITS TABLE (Cached Fit Classification Results)
-- Stores computed fit classification for quick retrieval
-- ==========================================
CREATE TABLE IF NOT EXISTS college_fits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  college_id INTEGER NOT NULL,
  
  -- Overall classification
  fit_category TEXT NOT NULL, -- 'safety', 'target', 'reach', 'unrealistic'
  overall_score REAL NOT NULL, -- 0-100
  confidence REAL DEFAULT 0.8, -- 0-1, how confident we are in this classification
  
  -- Individual fit scores (0-100)
  academic_fit_score REAL,
  profile_fit_score REAL,
  financial_fit_score REAL,
  timeline_fit_score REAL,
  
  -- Used for re-calculation triggers
  profile_snapshot_id INTEGER, -- Link to the profile version used for calculation
  college_data_version TEXT, -- Version/timestamp of college data used
  
  -- Metadata
  calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME, -- When this fit needs recalculation
  is_manual_override INTEGER DEFAULT 0, -- User overrode the calculation
  override_reason TEXT,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE,
  FOREIGN KEY (profile_snapshot_id) REFERENCES profile_snapshots(id),
  UNIQUE(user_id, college_id)
);

CREATE INDEX IF NOT EXISTS idx_college_fits_user ON college_fits(user_id);
CREATE INDEX IF NOT EXISTS idx_college_fits_college ON college_fits(college_id);
CREATE INDEX IF NOT EXISTS idx_college_fits_category ON college_fits(fit_category);

-- ==========================================
-- FIT EXPLANATIONS TABLE
-- Human-readable explanations for fit classifications
-- ==========================================
CREATE TABLE IF NOT EXISTS fit_explanations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_fit_id INTEGER NOT NULL,
  
  summary TEXT NOT NULL, -- Main explanation text
  factors TEXT NOT NULL, -- JSON array of contributing factors with weights
  calculation_steps TEXT, -- JSON array of calculation steps for transparency
  recommendations TEXT, -- JSON array of suggested actions to improve fit
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_fit_id) REFERENCES college_fits(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fit_explanations_fit ON fit_explanations(college_fit_id);

-- ==========================================
-- TASKS TABLE
-- Atomic tasks for each application
-- ==========================================
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  college_id INTEGER, -- NULL for general tasks
  application_id INTEGER, -- Link to application if applicable
  
  -- Task details
  task_type TEXT NOT NULL, -- 'essay', 'test', 'transcript', 'recommendation', 'portfolio', 'form', 'interview', 'other'
  title TEXT NOT NULL,
  description TEXT,
  
  -- Status tracking
  status TEXT DEFAULT 'not_started', -- 'not_started', 'in_progress', 'blocked', 'complete', 'skipped'
  blocking_reason TEXT, -- If status is 'blocked', why
  blocked_by_task_id INTEGER, -- Which task is blocking this one
  
  -- Time tracking
  deadline DATETIME,
  estimated_hours REAL DEFAULT 1.0,
  actual_hours REAL,
  priority INTEGER DEFAULT 3, -- 1=critical, 2=high, 3=normal, 4=low
  
  -- Progress
  progress_percent INTEGER DEFAULT 0, -- 0-100
  
  -- Reusability tracking (for essays that can be reused)
  is_reusable INTEGER DEFAULT 0,
  reuse_template_id INTEGER, -- Points to another task that this is based on
  
  -- Metadata
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_college ON tasks(college_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(task_type);

-- ==========================================
-- TASK DEPENDENCIES TABLE
-- Tracks which tasks depend on which other tasks
-- ==========================================
CREATE TABLE IF NOT EXISTS task_dependencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  depends_on_task_id INTEGER NOT NULL,
  dependency_type TEXT DEFAULT 'blocks', -- 'blocks', 'soft_depends', 'should_complete_first'
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE(task_id, depends_on_task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_deps_task ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_depends ON task_dependencies(depends_on_task_id);

-- ==========================================
-- TASK STATUS HISTORY TABLE
-- Audit log for task status changes
-- ==========================================
CREATE TABLE IF NOT EXISTS task_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT DEFAULT 'user', -- 'user', 'system', 'auto'
  change_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_status_history_task ON task_status_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_status_history_date ON task_status_history(created_at);

-- ==========================================
-- USER DEADLINES TABLE
-- User-specific deadline tracking with risk calculation
-- ==========================================
CREATE TABLE IF NOT EXISTS user_deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  college_id INTEGER,
  application_id INTEGER,
  
  -- Deadline details
  title TEXT NOT NULL,
  deadline_type TEXT NOT NULL, -- 'official', 'internal', 'buffer', 'personal'
  deadline_date DATETIME NOT NULL,
  
  -- Risk tracking
  risk_level TEXT DEFAULT 'safe', -- 'safe', 'tight', 'critical', 'impossible'
  buffer_hours REAL, -- Hours of buffer time remaining
  tasks_remaining INTEGER DEFAULT 0,
  hours_needed REAL DEFAULT 0,
  
  -- Status
  is_completed INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  
  -- Alerts
  alert_sent INTEGER DEFAULT 0,
  last_alert_at DATETIME,
  
  -- Metadata
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_deadlines_user ON user_deadlines(user_id);
CREATE INDEX IF NOT EXISTS idx_user_deadlines_date ON user_deadlines(deadline_date);
CREATE INDEX IF NOT EXISTS idx_user_deadlines_risk ON user_deadlines(risk_level);

-- ==========================================
-- DEADLINE ALERTS TABLE
-- Notifications for deadline warnings
-- ==========================================
CREATE TABLE IF NOT EXISTS deadline_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  deadline_id INTEGER NOT NULL,
  
  alert_type TEXT NOT NULL, -- 'warning', 'critical', 'impossible', 'reminder'
  alert_message TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  is_dismissed INTEGER DEFAULT 0,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (deadline_id) REFERENCES user_deadlines(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_deadline_alerts_user ON deadline_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_deadline_alerts_unread ON deadline_alerts(user_id, is_read);

-- ==========================================
-- RISK ASSESSMENTS TABLE
-- Calculated risk for each college application
-- ==========================================
CREATE TABLE IF NOT EXISTS risk_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  college_id INTEGER NOT NULL,
  
  -- Time risk
  time_risk_level TEXT DEFAULT 'safe', -- 'safe', 'tight', 'critical', 'impossible'
  time_buffer_hours REAL,
  
  -- Completion risk
  completion_percent REAL DEFAULT 0,
  tasks_total INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  tasks_blocked INTEGER DEFAULT 0,
  
  -- Overall risk score
  overall_risk_score REAL, -- 0-100, higher = more risk
  
  -- Recommendations
  risk_factors TEXT, -- JSON array of risk factors
  mitigation_suggestions TEXT, -- JSON array of suggestions
  
  -- Metadata
  calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  next_critical_date DATETIME,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE,
  UNIQUE(user_id, college_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_assessments_user ON risk_assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_college ON risk_assessments(college_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_level ON risk_assessments(time_risk_level);

-- ==========================================
-- USER OVERRIDES TABLE
-- Manual overrides for auto-calculated values
-- ==========================================
CREATE TABLE IF NOT EXISTS user_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL, -- 'college_fit', 'risk_assessment', 'deadline', 'task_priority'
  entity_id INTEGER NOT NULL,
  field_name TEXT NOT NULL,
  
  original_value TEXT,
  override_value TEXT NOT NULL,
  reason TEXT,
  
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_overrides_user ON user_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_user_overrides_entity ON user_overrides(entity_type, entity_id);

-- ==========================================
-- CUSTOM WEIGHTS TABLE
-- User-defined weights for calculations
-- ==========================================
CREATE TABLE IF NOT EXISTS user_custom_weights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  
  -- Fit calculation weights (should sum to 1.0)
  weight_academic REAL DEFAULT 0.4,
  weight_profile REAL DEFAULT 0.3,
  weight_financial REAL DEFAULT 0.15,
  weight_timeline REAL DEFAULT 0.15,
  
  -- Other weight preferences
  preferences TEXT, -- JSON for additional preferences
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_custom_weights_user ON user_custom_weights(user_id);

-- ==========================================
-- CHANGE LOG TABLE
-- Audit log for all entity changes (for explanation layer)
-- ==========================================
CREATE TABLE IF NOT EXISTS change_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  entity_type TEXT NOT NULL, -- 'profile', 'application', 'task', 'college_fit', etc.
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL, -- 'create', 'update', 'delete'
  field_name TEXT, -- Which field changed
  old_value TEXT,
  new_value TEXT,
  change_reason TEXT,
  changed_by TEXT DEFAULT 'user', -- 'user', 'system', 'import'
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_change_log_user ON change_log(user_id);
CREATE INDEX IF NOT EXISTS idx_change_log_entity ON change_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_change_log_date ON change_log(created_at);

-- ==========================================
-- DATA QUALITY TABLE
-- Tracks data source and freshness for each data point
-- ==========================================
CREATE TABLE IF NOT EXISTS data_quality (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL, -- 'college', 'deadline', 'requirement', etc.
  entity_id INTEGER NOT NULL,
  field_name TEXT, -- Specific field, NULL means entire entity
  
  source_type TEXT NOT NULL, -- 'official_api', 'verified_scrape', 'user_submitted', 'community'
  source_url TEXT,
  source_label TEXT,
  
  confidence_score REAL DEFAULT 0.8, -- 0-1
  warning_level TEXT DEFAULT 'none', -- 'none', 'yellow', 'red'
  
  last_verified DATETIME,
  expires_at DATETIME,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(entity_type, entity_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_data_quality_entity ON data_quality(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_data_quality_warning ON data_quality(warning_level);

CREATE TABLE IF NOT EXISTS timeline_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  target_month INTEGER NOT NULL,
  target_year INTEGER NOT NULL,
  priority TEXT DEFAULT 'medium',
  completed BOOLEAN DEFAULT 0,
  completed_date DATETIME,
  related_country TEXT,
  related_college_id INTEGER,
  related_deadline_id INTEGER,
  is_system_generated BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_timeline_user_month ON timeline_actions( target_month, target_year);
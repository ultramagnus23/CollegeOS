-- Migration 007: User Interactions Table
-- Logs user interactions with colleges for future ML training
-- Currently just stores data, doesn't train any models

CREATE TABLE IF NOT EXISTS user_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  college_id INTEGER NOT NULL,
  interaction_type TEXT NOT NULL,
  recommendation_score INTEGER,
  recommendation_category TEXT,
  context TEXT,
  source_page TEXT,
  session_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_interactions_user ON user_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_college ON user_interactions(college_id);
CREATE INDEX IF NOT EXISTS idx_interactions_type ON user_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_interactions_created ON user_interactions(created_at);

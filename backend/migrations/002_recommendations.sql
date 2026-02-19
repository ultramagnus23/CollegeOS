CREATE TABLE IF NOT EXISTS recommendation_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  recommendations TEXT NOT NULL,
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recommendation_cache_user ON recommendation_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_cache_date ON recommendation_cache(generated_at);
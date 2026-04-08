-- Migration 051: prediction_logs table for Brier Score tracking
-- Stores each chancing prediction alongside its eventual actual outcome.

CREATE TABLE IF NOT EXISTS prediction_logs (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  college_id       INTEGER REFERENCES colleges(id) ON DELETE SET NULL,
  predicted_probability DECIMAL(5,4),          -- 0.0000 – 1.0000
  actual_outcome   SMALLINT,                    -- 1 = accepted, 0 = rejected/waitlisted
  engine           VARCHAR(50) DEFAULT 'deterministic-sigmoid',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prediction_logs_user ON prediction_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_prediction_logs_college ON prediction_logs(college_id);

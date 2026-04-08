-- Migration 051: prediction_logs table for Brier Score tracking
-- Stores each chancing prediction alongside its eventual actual outcome.

CREATE TABLE IF NOT EXISTS prediction_logs (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  college_id       INTEGER REFERENCES colleges(id) ON DELETE SET NULL,
  predicted_probability DECIMAL(5,4) CHECK (predicted_probability >= 0 AND predicted_probability <= 1),
  actual_outcome   SMALLINT CHECK (actual_outcome IN (0, 1)),
  engine           VARCHAR(50) DEFAULT 'deterministic-sigmoid',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prediction_logs_user_college
  ON prediction_logs(user_id, college_id)
  WHERE college_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prediction_logs_user ON prediction_logs(user_id);

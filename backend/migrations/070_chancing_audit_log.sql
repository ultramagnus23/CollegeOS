-- Migration 070: Chancing audit log
-- Tracks raw vs displayed chancing probabilities for model retraining.
-- onboarding_step column already exists (migration 024).

CREATE TABLE IF NOT EXISTS chancing_audit_log (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
  college_id     INTEGER,
  raw_probability   DECIMAL(5,4),
  displayed_chance  DECIMAL(5,4),
  ceiling_applied   BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chancing_audit_user
  ON chancing_audit_log(user_id);

CREATE INDEX IF NOT EXISTS idx_chancing_audit_created
  ON chancing_audit_log(created_at DESC);

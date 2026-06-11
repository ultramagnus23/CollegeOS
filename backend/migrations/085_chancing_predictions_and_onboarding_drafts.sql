-- Migration 085: chancing_predictions and onboarding_drafts tables
-- Purpose:
--   1. chancing_predictions — log each chancing prediction for Brier Score calibration tracking
--   2. onboarding_drafts — persist partial onboarding progress so users can resume later

-- ─── chancing_predictions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chancing_predictions (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  college_id    INTEGER NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  features_json JSONB NOT NULL,
  predicted_prob NUMERIC(5,4) NOT NULL CHECK (predicted_prob >= 0 AND predicted_prob <= 1),
  actual_admit  BOOLEAN,
  brier_score   NUMERIC(10,6),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE chancing_predictions IS 'Stores chancing predictions for Brier Score calibration tracking';
COMMENT ON COLUMN chancing_predictions.features_json IS 'JSON with student features: sat_normalized, gpa, acceptance_rate, etc.';
COMMENT ON COLUMN chancing_predictions.brier_score IS '(predicted_prob - actual_admit)^2, precomputed for analytics';

CREATE INDEX IF NOT EXISTS idx_chancing_predictions_user_id ON chancing_predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_chancing_predictions_college_id ON chancing_predictions(college_id);
CREATE INDEX IF NOT EXISTS idx_chancing_predictions_calculated_at ON chancing_predictions(calculated_at DESC);

-- ─── onboarding_drafts ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_drafts (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  step_data     JSONB NOT NULL DEFAULT '{}',
  current_step  INTEGER NOT NULL DEFAULT 1 CHECK (current_step >= 1 AND current_step <= 7),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE onboarding_drafts IS 'Stores partial onboarding progress per user';
COMMENT ON COLUMN onboarding_drafts.step_data IS 'JSON with all form fields for the current step';
COMMENT ON COLUMN onboarding_drafts.current_step IS 'Which step the user is on (1-7)';

CREATE INDEX IF NOT EXISTS idx_onboarding_drafts_user_id ON onboarding_drafts(user_id);

-- ─── Trigger to auto-update updated_at ──────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_onboarding_drafts_updated_at
  BEFORE UPDATE ON onboarding_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

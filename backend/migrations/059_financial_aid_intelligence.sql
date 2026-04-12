-- Migration 059: Financial Aid Intelligence System
-- Extends colleges, college_financial_data, and users with financial aid fields.
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS — safe to re-run.

-- ─── 1. Extend colleges table ────────────────────────────────────────────────
-- Net price by income bracket (from College Scorecard / IPEDS)
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS avg_net_price_0_30k          INT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS avg_net_price_30_48k         INT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS avg_net_price_48_75k         INT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS avg_net_price_75_110k        INT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS avg_net_price_110k_plus      INT;

-- Aid policy flags & averages
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS pct_students_receiving_aid   DECIMAL(5,2);
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS avg_institutional_grant      INT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS avg_merit_aid                INT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS pct_receiving_merit_aid      DECIMAL(5,2);
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS need_blind_domestic          BOOLEAN DEFAULT true;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS need_blind_international     BOOLEAN DEFAULT false;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS meets_full_need              BOOLEAN DEFAULT false;

-- Outcome data
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS median_earnings_6yr         INT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS median_earnings_10yr        INT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS loan_default_rate           DECIMAL(5,2);
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS avg_total_debt_at_graduation INT;

-- Financial policies
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS css_profile_required        BOOLEAN DEFAULT false;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS international_aid_available BOOLEAN DEFAULT false;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS international_aid_avg       INT;

-- ─── 2. Extend college_financial_data ────────────────────────────────────────
-- These may already exist in migration 011/020; IF NOT EXISTS is safe.
ALTER TABLE college_financial_data ADD COLUMN IF NOT EXISTS total_coa             INT;
ALTER TABLE college_financial_data ADD COLUMN IF NOT EXISTS avg_net_price         INT;
ALTER TABLE college_financial_data ADD COLUMN IF NOT EXISTS net_price_0_30k       INT;
ALTER TABLE college_financial_data ADD COLUMN IF NOT EXISTS net_price_30_48k      INT;
ALTER TABLE college_financial_data ADD COLUMN IF NOT EXISTS net_price_48_75k      INT;
ALTER TABLE college_financial_data ADD COLUMN IF NOT EXISTS net_price_75_110k     INT;
ALTER TABLE college_financial_data ADD COLUMN IF NOT EXISTS net_price_110k_plus   INT;
ALTER TABLE college_financial_data ADD COLUMN IF NOT EXISTS pct_receiving_pell    DECIMAL(5,2);
ALTER TABLE college_financial_data ADD COLUMN IF NOT EXISTS median_debt_at_graduation INT;
ALTER TABLE college_financial_data ADD COLUMN IF NOT EXISTS loan_default_rate_3yr DECIMAL(5,2);
ALTER TABLE college_financial_data ADD COLUMN IF NOT EXISTS median_earnings_6yr   INT;
ALTER TABLE college_financial_data ADD COLUMN IF NOT EXISTS median_earnings_10yr  INT;
-- Ensure updated_at exists for upsert tracking
ALTER TABLE college_financial_data ADD COLUMN IF NOT EXISTS updated_at            TIMESTAMPTZ DEFAULT NOW();
-- Unique constraint needed for ON CONFLICT upsert (college_id, year)
-- Already created in migration 011 but guard:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'college_financial_data'
      AND constraint_type = 'UNIQUE'
      AND constraint_name LIKE '%college_id%year%'
  ) THEN
    ALTER TABLE college_financial_data ADD CONSTRAINT uq_cfd_college_year UNIQUE (college_id, year);
  END IF;
END$$;

-- ─── 3. Extend users table with financial profile ─────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS family_income_inr      BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS family_income_usd      INT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS willing_to_take_loan   BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_collateral         BOOLEAN DEFAULT false;

-- ─── 4. Financial prediction store ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_financial_predictions (
  id                        SERIAL PRIMARY KEY,
  user_id                   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  college_id                INT REFERENCES colleges(id) ON DELETE CASCADE,
  predicted_net_price_usd   INT,
  predicted_merit_aid_usd   INT,
  predicted_need_aid_usd    INT,
  roi_score                 DECIMAL(5,2),    -- earnings / cost ratio
  financial_accessibility_score DECIMAL(5,2), -- 0-100
  notes                     TEXT,
  computed_at               TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, college_id)
);

CREATE INDEX IF NOT EXISTS idx_fin_pred_user ON college_financial_predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_fin_pred_college ON college_financial_predictions(college_id);

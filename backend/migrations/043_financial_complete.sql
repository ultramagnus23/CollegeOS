-- Migration 043: Financial Complete
-- Creates the remaining financial tables not covered by migrations 039/040:
--   • cost_of_attendance   — per-college COA with all components
--   • scholarships         — scholarship database (used by Scholarship model)
--   • user_financial_profiles — per-user financial context for aid/loan matching
-- Tables financing_options (039) and currency_rates (040) already exist.

-- ─── cost_of_attendance ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cost_of_attendance (
  id                      SERIAL PRIMARY KEY,

  college_id              INTEGER NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  academic_year           TEXT    NOT NULL,        -- e.g. '2024-25'
  region                  TEXT    NOT NULL DEFAULT 'US',  -- country / region context
  student_type            TEXT    NOT NULL DEFAULT 'international'
    CHECK (student_type IN ('international','domestic_instate','domestic_outstate')),

  -- Tuition & fees (USD)
  tuition_usd             NUMERIC(12,2),
  mandatory_fees_usd      NUMERIC(12,2),

  -- Living expenses (USD)
  room_board_usd          NUMERIC(12,2),
  personal_expenses_usd   NUMERIC(12,2),
  books_supplies_usd      NUMERIC(12,2),
  transportation_usd      NUMERIC(12,2),

  -- International-specific (USD; NULL for domestic students)
  health_insurance_usd    NUMERIC(12,2),
  visa_fee_usd            NUMERIC(12,2),
  sevis_fee_usd           NUMERIC(12,2),

  -- Computed total (maintained by trigger; also computable client-side)
  total_usd               NUMERIC(14,2) GENERATED ALWAYS AS (
    COALESCE(tuition_usd,0) + COALESCE(mandatory_fees_usd,0) +
    COALESCE(room_board_usd,0) + COALESCE(personal_expenses_usd,0) +
    COALESCE(books_supplies_usd,0) + COALESCE(transportation_usd,0) +
    COALESCE(health_insurance_usd,0) + COALESCE(visa_fee_usd,0) +
    COALESCE(sevis_fee_usd,0)
  ) STORED,

  -- Provenance
  data_source             TEXT,                    -- e.g. 'mit.edu/sfs'
  academic_year_confirmed BOOLEAN NOT NULL DEFAULT FALSE,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (college_id, academic_year, region, student_type)
);

CREATE INDEX IF NOT EXISTS idx_coa_college_year
  ON cost_of_attendance (college_id, academic_year DESC);

CREATE INDEX IF NOT EXISTS idx_coa_student_type
  ON cost_of_attendance (student_type);

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION coa_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_coa_updated_at'
  ) THEN
    CREATE TRIGGER trg_coa_updated_at
      BEFORE UPDATE ON cost_of_attendance
      FOR EACH ROW EXECUTE FUNCTION coa_set_updated_at();
  END IF;
END;
$$;

-- ─── scholarships ─────────────────────────────────────────────────────────────
-- This table is used by backend/src/models/Scholarship.js and
-- backend/src/routes/scholarships.js.  It was referenced but never formally
-- migrated; this migration creates it idempotently.
--
-- NOTE: The (name, provider) UNIQUE constraint defined here is also relied upon
-- by scraper/scholarship_scraper.py for its ON CONFLICT upsert logic.
-- Both the migration and the scraper must remain in sync on this key.

CREATE TABLE IF NOT EXISTS scholarships (
  id                        SERIAL PRIMARY KEY,

  name                      TEXT NOT NULL,
  provider                  TEXT NOT NULL,
  country                   TEXT,             -- 'International' for global awards
  currency                  TEXT NOT NULL DEFAULT 'USD',

  amount                    NUMERIC(14,2),    -- typical / median award
  amount_min                NUMERIC(14,2),
  amount_max                NUMERIC(14,2),

  need_based                BOOLEAN NOT NULL DEFAULT FALSE,
  merit_based               BOOLEAN NOT NULL DEFAULT TRUE,

  deadline                  DATE,
  renewable                 BOOLEAN NOT NULL DEFAULT FALSE,
  renewable_years           SMALLINT,

  description               TEXT,
  eligibility_summary       TEXT,
  application_url           TEXT,
  source_url                TEXT,

  -- Structured eligibility (used by Scholarship.getEligibleScholarships)
  nationality_requirements  JSONB NOT NULL DEFAULT '[]',
  academic_requirements     JSONB NOT NULL DEFAULT '[]',
  major_requirements        JSONB NOT NULL DEFAULT '[]',
  demographic_requirements  JSONB NOT NULL DEFAULT '[]',
  documentation_required    JSONB NOT NULL DEFAULT '[]',

  -- Workflow
  status                    TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','expired')),

  scraped_at                TIMESTAMPTZ,
  last_verified_at          TIMESTAMPTZ,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_scholarships_name_provider UNIQUE (name, provider)
);

CREATE INDEX IF NOT EXISTS idx_scholarships_status
  ON scholarships (status);

CREATE INDEX IF NOT EXISTS idx_scholarships_country
  ON scholarships (country);

CREATE INDEX IF NOT EXISTS idx_scholarships_deadline
  ON scholarships (deadline ASC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_scholarships_nationality
  ON scholarships USING GIN (nationality_requirements);

-- user_scholarships: tracks which scholarships a user is interested in / applying to
CREATE TABLE IF NOT EXISTS user_scholarships (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scholarship_id    INTEGER NOT NULL REFERENCES scholarships(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'interested'
    CHECK (status IN ('interested','applied','awarded','rejected','withdrawn')),
  notes             TEXT,
  application_date  DATE,
  decision_date     DATE,
  award_amount      NUMERIC(14,2),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_user_scholarships_user_scholarship UNIQUE (user_id, scholarship_id)
);

CREATE INDEX IF NOT EXISTS idx_user_scholarships_user
  ON user_scholarships (user_id);

-- ─── user_financial_profiles ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_financial_profiles (
  id                          SERIAL PRIMARY KEY,
  user_id                     INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- Annual family income
  annual_family_income_usd    NUMERIC(14,2),
  income_currency             TEXT NOT NULL DEFAULT 'USD',

  -- Savings available for education
  savings_available_usd       NUMERIC(14,2),

  -- Preferences
  preferred_display_currency  TEXT NOT NULL DEFAULT 'USD'
    CHECK (preferred_display_currency IN ('USD','INR','GBP','EUR','CAD','AUD')),
  max_loan_amount_usd         NUMERIC(14,2),
  loan_repayment_years        SMALLINT DEFAULT 10,

  -- Eligibility flags (used for scholarship / aid matching)
  is_first_generation         BOOLEAN DEFAULT FALSE,
  is_international            BOOLEAN DEFAULT TRUE,
  home_country                TEXT,
  citizenship                 TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_financial_profiles_user
  ON user_financial_profiles (user_id);

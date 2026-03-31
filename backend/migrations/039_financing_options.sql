-- Migration 039: Financing Options
-- Required table: real education loans, grants, and funding mechanisms
-- with eligibility criteria and terms scraped from official providers.
-- All amounts in USD. source_url and scraped_at are mandatory fields—
-- records without them must be rejected by the validation layer.

CREATE TABLE IF NOT EXISTS financing_options (
  id                    SERIAL PRIMARY KEY,

  -- Core identity
  name                  TEXT NOT NULL,
  provider              TEXT NOT NULL,          -- e.g. "US Dept of Education", "SBI", "DAAD"
  financing_type        TEXT NOT NULL           -- 'federal_loan','private_loan','grant','scholarship','work_study','fellowship'
    CHECK (financing_type IN ('federal_loan','private_loan','grant','scholarship','work_study','fellowship')),

  -- Geographic scope
  country_of_study      TEXT,                   -- NULL = any country
  home_country          TEXT,                   -- NULL = any home country

  -- Amounts (USD); NULL means "varies / not published"
  amount_min_usd        NUMERIC(12,2),
  amount_max_usd        NUMERIC(12,2),
  amount_notes          TEXT,                   -- e.g. "Up to full tuition + stipend"

  -- Loan-specific fields (NULL for grants/scholarships)
  interest_rate_pct     NUMERIC(6,4),           -- e.g. 6.5400 = 6.54%
  interest_type         TEXT                    -- 'fixed','variable'
    CHECK (interest_type IS NULL OR interest_type IN ('fixed','variable')),
  repayment_grace_months INTEGER,               -- months after graduation before payments start
  repayment_term_months  INTEGER,               -- total loan term in months
  loan_forgiveness_available BOOLEAN DEFAULT FALSE,

  -- Eligibility criteria (stored as structured JSON for queryability)
  eligibility_criteria  JSONB NOT NULL DEFAULT '{}',
  -- Expected keys: citizenship, enrollment_status, gpa_min, income_max_usd,
  --                degree_level (["undergrad","grad","doctoral"]),
  --                field_restrictions ([] = any), university_restrictions ([] = any)

  -- Application details
  application_url       TEXT,
  deadline_description  TEXT,                   -- e.g. "March 1 annually" or "Rolling"
  deadline_month        SMALLINT,               -- 1-12 if fixed annual deadline
  renewable             BOOLEAN DEFAULT FALSE,
  renewal_conditions    TEXT,

  -- Data provenance (non-negotiable: every row must have these)
  source_url            TEXT NOT NULL,
  source_type           TEXT NOT NULL DEFAULT 'official'
    CHECK (source_type IN ('official','government','embassy','university','other')),
  last_verified_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scraped_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Validation state
  is_validated          BOOLEAN NOT NULL DEFAULT FALSE,
  validation_errors     JSONB DEFAULT '[]',     -- array of rejection reasons if invalid

  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common filter patterns
CREATE INDEX IF NOT EXISTS idx_financing_type      ON financing_options (financing_type);
CREATE INDEX IF NOT EXISTS idx_financing_country   ON financing_options (country_of_study, home_country);
CREATE INDEX IF NOT EXISTS idx_financing_validated ON financing_options (is_validated);
CREATE INDEX IF NOT EXISTS idx_financing_scraped   ON financing_options (scraped_at DESC);

-- GIN index for eligibility criteria queries (e.g. ?citizenship='indian')
CREATE INDEX IF NOT EXISTS idx_financing_eligibility
  ON financing_options USING GIN (eligibility_criteria);

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION financing_options_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_financing_options_updated_at'
  ) THEN
    CREATE TRIGGER trg_financing_options_updated_at
      BEFORE UPDATE ON financing_options
      FOR EACH ROW EXECUTE FUNCTION financing_options_set_updated_at();
  END IF;
END;
$$;

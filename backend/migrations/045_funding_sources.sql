-- Migration 045: Funding sources tables + student_profiles value columns
-- Tables: grants, government_loans, private_loans, college_funding
-- Alters: student_profiles (why_college_matters, life_goals_raw, values_vector, values_computed_at)
-- All safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- ─── grants ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grants (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      TEXT NOT NULL,
  provider                  TEXT NOT NULL,
  provider_type             TEXT CHECK (provider_type IN (
                              'central_government','state_government','foreign_government',
                              'university','ngo','foundation')),
  country_of_study          TEXT,                        -- NULL = any country
  country_of_origin         TEXT[],
  eligible_nationalities    TEXT[] DEFAULT ARRAY['Indian'],
  eligible_states           TEXT[],                      -- NULL = all states
  degree_levels             TEXT[],
  eligible_majors           TEXT[] DEFAULT ARRAY['All'],
  eligible_genders          TEXT[] DEFAULT ARRAY['All'],
  minority_required         TEXT[],                      -- e.g. SC/ST/OBC
  first_gen_required        BOOLEAN NOT NULL DEFAULT FALSE,
  income_based              BOOLEAN NOT NULL DEFAULT FALSE,
  max_family_income_inr     NUMERIC(16,2),
  award_inr_per_year        NUMERIC(16,2),
  award_usd_per_year        NUMERIC(14,2),
  award_covers              TEXT[],
  renewable                 BOOLEAN NOT NULL DEFAULT FALSE,
  renewal_conditions        TEXT,
  application_deadline      DATE,
  deadline_is_rolling       BOOLEAN NOT NULL DEFAULT FALSE,
  portal_url                TEXT,
  official_source_url       TEXT,
  status                    TEXT NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','discontinued','paused','unverified')),
  last_verified_at          TIMESTAMPTZ,
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_grants_name_provider UNIQUE (name, provider)
);

CREATE INDEX IF NOT EXISTS idx_grants_eligible_nationalities
  ON grants USING GIN (eligible_nationalities);

-- ─── government_loans ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS government_loans (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                          TEXT NOT NULL,
  provider                      TEXT NOT NULL,
  provider_type                 TEXT CHECK (provider_type IN (
                                  'public_sector_bank','private_bank','nbfc',
                                  'government_scheme','foreign_government')),
  scheme_name                   TEXT,                    -- e.g. Vidya Lakshmi Portal
  country_of_study              TEXT[],
  eligible_nationalities        TEXT[] DEFAULT ARRAY['Indian'],
  degree_levels                 TEXT[],
  max_loan_amount_inr           NUMERIC(16,2),
  interest_rate_pct             NUMERIC(5,2),
  interest_rate_type            TEXT,                    -- fixed/floating/subsidised
  subsidy_available             BOOLEAN NOT NULL DEFAULT FALSE,
  subsidy_scheme                TEXT,                    -- e.g. CSIS
  moratorium_months             INTEGER,
  repayment_years               INTEGER,
  collateral_required_above_inr NUMERIC(16,2),
  processing_fee_pct            NUMERIC(5,2),
  requires_co_applicant         BOOLEAN NOT NULL DEFAULT TRUE,
  eligible_colleges_type        TEXT,                    -- any/approved_list/top_ranked
  portal_url                    TEXT,
  official_source_url           TEXT,
  status                        TEXT NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active','discontinued','paused','unverified')),
  last_verified_at              TIMESTAMPTZ,
  notes                         TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_government_loans_name_provider UNIQUE (name, provider)
);

CREATE INDEX IF NOT EXISTS idx_government_loans_country_of_study
  ON government_loans USING GIN (country_of_study);

-- ─── private_loans ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS private_loans (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                          TEXT NOT NULL,
  provider                      TEXT NOT NULL,
  provider_type                 TEXT CHECK (provider_type IN (
                                  'indian_nbfc','international_lender','edtech_lender')),
  country_of_study              TEXT[],
  eligible_nationalities        TEXT[] DEFAULT ARRAY['Indian'],
  degree_levels                 TEXT[],
  requires_co_signer            BOOLEAN NOT NULL DEFAULT FALSE,
  requires_collateral           BOOLEAN NOT NULL DEFAULT FALSE,
  collateral_required_above_inr NUMERIC(16,2),
  max_loan_amount_usd           NUMERIC(14,2),
  max_loan_amount_inr           NUMERIC(16,2),
  interest_rate_min_pct         NUMERIC(5,2),
  interest_rate_max_pct         NUMERIC(5,2),
  rate_type                     TEXT,                    -- fixed/variable/both
  disbursement_currency         TEXT NOT NULL DEFAULT 'USD',
  repayment_years_min           INTEGER,
  repayment_years_max           INTEGER,
  moratorium_months             INTEGER,
  processing_fee_pct            NUMERIC(5,2),
  covers_living_costs           BOOLEAN NOT NULL DEFAULT FALSE,
  eligible_colleges_type        TEXT,                    -- any/approved_list/top_ranked
  min_gpa_4_scale               NUMERIC(3,2),
  portal_url                    TEXT,
  status                        TEXT NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active','discontinued','paused','unverified')),
  last_verified_at              TIMESTAMPTZ,
  notes                         TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_private_loans_name_provider UNIQUE (name, provider)
);

CREATE INDEX IF NOT EXISTS idx_private_loans_eligible_nationalities
  ON private_loans USING GIN (eligible_nationalities);

-- ─── college_funding ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_funding (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id                      UUID REFERENCES colleges(id) ON DELETE CASCADE,
  college_name                    TEXT,
  funding_name                    TEXT NOT NULL,
  funding_type                    TEXT CHECK (funding_type IN (
                                    'need_based_grant','merit_grant','merit_need_grant',
                                    'departmental_fellowship','work_study','tuition_waiver',
                                    'college_loan','emergency_fund')),
  eligible_nationalities          TEXT[] DEFAULT ARRAY['All'],
  degree_levels                   TEXT[],
  eligible_majors                 TEXT[] DEFAULT ARRAY['All'],
  award_usd_per_year              NUMERIC(14,2),
  award_covers                    TEXT[],
  meets_full_demonstrated_need    BOOLEAN NOT NULL DEFAULT FALSE,
  percentage_students_receiving   NUMERIC(5,1),
  average_award_usd               NUMERIC(14,2),
  renewable                       BOOLEAN NOT NULL DEFAULT FALSE,
  application_required            BOOLEAN NOT NULL DEFAULT TRUE,
  application_form                TEXT,
  deadline_type                   TEXT,                  -- with_admission/separate/rolling
  application_deadline            DATE,
  international_students_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  portal_url                      TEXT,
  official_source_url             TEXT,
  last_verified_at                TIMESTAMPTZ,
  notes                           TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_college_funding_college_name UNIQUE (college_id, funding_name)
);

CREATE INDEX IF NOT EXISTS idx_college_funding_college_id
  ON college_funding (college_id);

CREATE INDEX IF NOT EXISTS idx_college_funding_type
  ON college_funding (funding_type);

-- ─── student_profiles — add values columns ───────────────────────────────────
ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS why_college_matters   TEXT,
  ADD COLUMN IF NOT EXISTS life_goals_raw        TEXT,
  ADD COLUMN IF NOT EXISTS values_vector         JSONB,
  ADD COLUMN IF NOT EXISTS values_computed_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_student_profiles_values_vector
  ON student_profiles USING GIN (values_vector);

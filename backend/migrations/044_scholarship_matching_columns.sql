-- Migration 044: Add spec-required columns for the scholarship matching engine
-- These columns power POST /api/scholarships/match and /api/scholarships/explain.
-- All additions use IF NOT EXISTS / safe defaults so re-running is idempotent.

ALTER TABLE scholarships
  -- Eligibility filters (replacing unstructured JSONB arrays with typed fields)
  ADD COLUMN IF NOT EXISTS eligible_nationalities JSONB    NOT NULL DEFAULT '["All"]',
  ADD COLUMN IF NOT EXISTS degree_levels          JSONB    NOT NULL DEFAULT '["undergraduate","postgraduate"]',
  ADD COLUMN IF NOT EXISTS eligible_majors        JSONB    NOT NULL DEFAULT '["All"]',
  ADD COLUMN IF NOT EXISTS eligible_genders       JSONB    NOT NULL DEFAULT '["All"]',

  -- Academic floors
  ADD COLUMN IF NOT EXISTS min_gpa_4_scale        NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS min_percentage         NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS min_sat                INTEGER,
  ADD COLUMN IF NOT EXISTS min_ielts              NUMERIC(3,1),

  -- Financial floor (null = no income cap)
  ADD COLUMN IF NOT EXISTS max_family_income_usd  NUMERIC(14,2),

  -- Award (canonical USD-per-year; separate from currency-agnostic amount/amount_min/amount_max)
  ADD COLUMN IF NOT EXISTS award_usd_per_year     NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS award_covers           JSONB    NOT NULL DEFAULT '["tuition"]',

  -- Scholarship meta
  ADD COLUMN IF NOT EXISTS scholarship_type       TEXT     NOT NULL DEFAULT 'external'
                                                  CHECK (scholarship_type IN ('merit','need-based','merit-need','government','external')),
  ADD COLUMN IF NOT EXISTS renewal_conditions     TEXT,
  ADD COLUMN IF NOT EXISTS portal_url             TEXT,
  ADD COLUMN IF NOT EXISTS university_name        TEXT;

-- Backfill award_usd_per_year from existing amount/amount_max for USD rows
UPDATE scholarships
   SET award_usd_per_year = COALESCE(amount, amount_max)
 WHERE currency = 'USD'
   AND award_usd_per_year IS NULL
   AND COALESCE(amount, amount_max) IS NOT NULL;

-- Backfill scholarship_type from need_based / merit_based flags
UPDATE scholarships
   SET scholarship_type =
         CASE
           WHEN need_based AND merit_based THEN 'merit-need'
           WHEN need_based                 THEN 'need-based'
           WHEN merit_based                THEN 'merit'
           ELSE 'external'
         END
 WHERE scholarship_type = 'external';

-- Seed eligible_nationalities from existing nationality_requirements JSONB where possible.
-- nationality_requirements stores arrays of strings or objects — pull simple string entries.
UPDATE scholarships
   SET eligible_nationalities = nationality_requirements
 WHERE jsonb_typeof(nationality_requirements) = 'array'
   AND jsonb_array_length(nationality_requirements) > 0
   AND eligible_nationalities = '["All"]'::jsonb;

-- Seed portal_url from application_url where not already set
UPDATE scholarships
   SET portal_url = application_url
 WHERE portal_url IS NULL AND application_url IS NOT NULL;

-- GIN indexes for efficient eligibility filtering
CREATE INDEX IF NOT EXISTS idx_scholarships_eligible_nationalities
  ON scholarships USING GIN (eligible_nationalities);

CREATE INDEX IF NOT EXISTS idx_scholarships_eligible_majors
  ON scholarships USING GIN (eligible_majors);

CREATE INDEX IF NOT EXISTS idx_scholarships_degree_levels
  ON scholarships USING GIN (degree_levels);

CREATE INDEX IF NOT EXISTS idx_scholarships_scholarship_type
  ON scholarships (scholarship_type);

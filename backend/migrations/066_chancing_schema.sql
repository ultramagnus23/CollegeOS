-- Migration: 066_chancing_schema.sql
-- Add columns required by the 7-factor chancing algorithm to
-- colleges_comprehensive and student_profiles.

-- ─────────────────────────────────────────────────────────────────────────────
-- colleges_comprehensive — CDS / chancing data fields
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE colleges_comprehensive
  ADD COLUMN IF NOT EXISTS sat_25                          INTEGER,
  ADD COLUMN IF NOT EXISTS sat_75                          INTEGER,
  ADD COLUMN IF NOT EXISTS act_25                          INTEGER,
  ADD COLUMN IF NOT EXISTS act_75                          INTEGER,
  ADD COLUMN IF NOT EXISTS act_avg                         DECIMAL(4,1),
  ADD COLUMN IF NOT EXISTS gpa_25                          DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS gpa_75                          DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS intl_acceptance_rate            DECIMAL(5,4),
  ADD COLUMN IF NOT EXISTS intl_percent                    DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS yield_rate                      DECIMAL(5,4),
  ADD COLUMN IF NOT EXISTS test_optional                   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS need_aware_intl                 BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS meets_full_need                 BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tracks_demonstrated_interest    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS top_majors                      JSON,
  -- school_type already exists as TEXT in some deployments; guard with IF NOT EXISTS
  ADD COLUMN IF NOT EXISTS school_type                     TEXT
    CHECK (school_type IN ('university','liberal_arts','technical','public'));

-- Index: yield rate is used in strategy factor lookups
CREATE INDEX IF NOT EXISTS idx_colleges_comp_yield_rate
  ON colleges_comprehensive(yield_rate);

-- ─────────────────────────────────────────────────────────────────────────────
-- student_profiles — extra chancing input fields
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS act_composite       INTEGER,
  ADD COLUMN IF NOT EXISTS gpa_weighted        DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS school_type         TEXT
    CHECK (school_type IN ('international_school','local_curriculum','homeschool')),
  ADD COLUMN IF NOT EXISTS extracurriculars    JSON,   -- [{name, tier, category}]
  ADD COLUMN IF NOT EXISTS awards              JSON,   -- [{name, tier}]
  ADD COLUMN IF NOT EXISTS research            BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS leadership_roles    JSON,   -- [string]
  ADD COLUMN IF NOT EXISTS need_based_aid      BOOLEAN,
  ADD COLUMN IF NOT EXISTS intended_major      VARCHAR(100);

-- Migration 054: IPEDS Majors + Feature Vectors + User Signals
--
-- 1. Add IPEDS unit ID + feature vector columns to colleges_comprehensive
-- 2. Create IPEDS-sourced majors master table
-- 3. Create college–major junction table (backed by IPEDS completions data)
-- 4. Create user_signals table for online learning / signal adjustments
-- 5. Indexes for all new queries

-- ─── Enable pg_trgm for fuzzy text search on major names ─────────────────────
-- Required for the GIN index on majors.name created below.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── 1. Extend colleges_comprehensive ────────────────────────────────────────

ALTER TABLE colleges_comprehensive
  ADD COLUMN IF NOT EXISTS ipeds_unit_id     INTEGER,
  ADD COLUMN IF NOT EXISTS feature_vector    JSONB,
  ADD COLUMN IF NOT EXISTS vector_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cc_ipeds_unit_id
  ON colleges_comprehensive (ipeds_unit_id)
  WHERE ipeds_unit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cc_feature_vector
  ON colleges_comprehensive USING GIN (feature_vector)
  WHERE feature_vector IS NOT NULL;

-- ─── 2. IPEDS-sourced majors master table ────────────────────────────────────
-- Populated by scraper/ipeds/build_majors.py from C2023_A completions data.

CREATE TABLE IF NOT EXISTS majors (
  id             SERIAL PRIMARY KEY,
  cip_code       VARCHAR(10)  UNIQUE NOT NULL,  -- e.g. "11.0701"
  name           VARCHAR(255) NOT NULL,          -- e.g. "Computer Science"
  broad_category VARCHAR(100),                   -- e.g. "Engineering", "Business"
  is_stem        BOOLEAN      DEFAULT false,
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_majors_broad_category ON majors (broad_category);
CREATE INDEX IF NOT EXISTS idx_majors_name_trgm
  ON majors USING GIN (name gin_trgm_ops);

-- ─── 3. College–Major junction table ─────────────────────────────────────────
-- One row per (college, major) pair where IPEDS completions show CTOTALT > 0.

CREATE TABLE IF NOT EXISTS college_majors (
  college_id       INTEGER REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  major_id         INTEGER REFERENCES majors(id)                 ON DELETE CASCADE,
  offered          BOOLEAN     DEFAULT true,
  awlevel          SMALLINT,   -- 5 = bachelor's, 7 = master's
  completions_count INTEGER,   -- CTOTALT value from IPEDS
  PRIMARY KEY (college_id, major_id, awlevel)
);

CREATE INDEX IF NOT EXISTS idx_college_majors_college ON college_majors (college_id);
CREATE INDEX IF NOT EXISTS idx_college_majors_major   ON college_majors (major_id);

-- ─── 4. User signals for online learning ─────────────────────────────────────
-- Signals fire when a user adds / dismisses / views / removes a college.
-- applySignalAdjustments() in vectorService.js uses the 20 most-recent signals
-- to nudge the user's preference vector before scoring.

CREATE TABLE IF NOT EXISTS user_signals (
  id           SERIAL      PRIMARY KEY,
  user_id      INTEGER     REFERENCES users(id) ON DELETE CASCADE,
  college_id   INTEGER     REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  signal_type  VARCHAR(30) NOT NULL
                CHECK (signal_type IN ('added', 'dismissed', 'viewed', 'removed')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_signals_user_id
  ON user_signals (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_signals_college
  ON user_signals (college_id);

-- Migration: 061_add_scorecard_columns.sql
-- Add missing College Scorecard columns to colleges_comprehensive.

ALTER TABLE colleges_comprehensive
  ADD COLUMN IF NOT EXISTS opeid             TEXT,
  ADD COLUMN IF NOT EXISTS zip               TEXT,
  ADD COLUMN IF NOT EXISTS accreditation     TEXT,
  ADD COLUMN IF NOT EXISTS hbcu              BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hsi               BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS men_only          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS women_only        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS locale_code       SMALLINT,      -- IPEDS LOCALE numeric code
  ADD COLUMN IF NOT EXISTS carnegie_basic    SMALLINT,      -- CCBASIC
  ADD COLUMN IF NOT EXISTS predominant_deg   SMALLINT,      -- PREDDEG (0=not classified,1=cert,2=assoc,3=bach,4=grad)
  ADD COLUMN IF NOT EXISTS highest_deg       SMALLINT,      -- HIGHDEG
  ADD COLUMN IF NOT EXISTS pct_pell          NUMERIC(5,2),  -- % students receiving Pell
  ADD COLUMN IF NOT EXISTS pct_fed_loan      NUMERIC(5,2),  -- % students with federal loans
  ADD COLUMN IF NOT EXISTS search_vector     TSVECTOR,      -- full-text search
  ADD COLUMN IF NOT EXISTS popularity_score  NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT now();

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_colleges_comp_search
  ON colleges_comprehensive USING GIN(search_vector);

-- IPEDS unit-id index (already likely exists; IF NOT EXISTS guards against it)
CREATE INDEX IF NOT EXISTS idx_colleges_comp_ipeds
  ON colleges_comprehensive(ipeds_unit_id);

-- Country index for international filtering
CREATE INDEX IF NOT EXISTS idx_colleges_comp_country
  ON colleges_comprehensive(country);

-- Popularity sort index
CREATE INDEX IF NOT EXISTS idx_colleges_comp_popularity
  ON colleges_comprehensive(popularity_score DESC);

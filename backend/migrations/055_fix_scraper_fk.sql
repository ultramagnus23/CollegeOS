-- Migration 055: Fix scraper pipeline FK references
--
-- college_admissions_stats and college_financial_aid (created in migration 049)
-- used REFERENCES colleges(id) which is a legacy SQLite-only table.
-- In the Supabase deployment the primary college table is colleges_comprehensive,
-- so the FK never resolved correctly in PostgreSQL / Supabase.
--
-- These tables are also empty because the Python scrapers that write to them had
-- the same bug (load_colleges queried the legacy colleges table and got 0 rows).
-- It is therefore safe to drop and recreate them with the correct FK.
--
-- Idempotent: DROP IF EXISTS + plain CREATE (no IF NOT EXISTS so re-runs fail
-- loudly rather than silently masking schema drift).

-- ── college_admissions_stats ──────────────────────────────────────────────────
DROP TABLE IF EXISTS college_admissions_stats CASCADE;

CREATE TABLE college_admissions_stats (
  id                   BIGSERIAL PRIMARY KEY,
  college_id           INT         REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  year                 INT         NOT NULL,
  acceptance_rate      FLOAT,
  median_sat           INT,
  median_act           FLOAT,
  median_gpa_admitted  FLOAT,
  total_applicants     INT,
  total_admitted       INT,
  yield_rate           FLOAT,
  ed_acceptance_rate   FLOAT,
  ea_acceptance_rate   FLOAT,
  data_freshness       TEXT        NOT NULL DEFAULT 'fresh',
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (college_id, year)
);

CREATE INDEX idx_cas_college_year ON college_admissions_stats(college_id, year);
CREATE INDEX idx_cas_freshness    ON college_admissions_stats(data_freshness);

-- ── college_financial_aid ─────────────────────────────────────────────────────
DROP TABLE IF EXISTS college_financial_aid CASCADE;

CREATE TABLE college_financial_aid (
  id                        BIGSERIAL PRIMARY KEY,
  college_id                INT         REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  academic_year             TEXT        NOT NULL,
  avg_financial_aid_package INT,
  avg_net_price_0_30k       INT,
  avg_net_price_30_48k      INT,
  avg_net_price_48_75k      INT,
  avg_net_price_75_110k     INT,
  avg_net_price_110k_plus   INT,
  percent_receiving_aid     FLOAT,
  percent_receiving_grants  FLOAT,
  meets_full_need           BOOLEAN,
  no_loan_policy            BOOLEAN,
  endowment_per_student     INT,
  scholarship_count         INT,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (college_id, academic_year)
);

CREATE INDEX idx_cfa_college_year ON college_financial_aid(college_id, academic_year);

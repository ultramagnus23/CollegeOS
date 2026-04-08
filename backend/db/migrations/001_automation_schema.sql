-- This file is a copy of backend/migrations/049_automation_schema.sql placed at
-- the path specified by the pipeline specification document.
-- chance_me_posts, college_admissions_stats, college_financial_aid, scraper_run_logs
-- All statements are idempotent (CREATE TABLE IF NOT EXISTS).

-- ── chance_me_posts ───────────────────────────────────────────────────────────
-- One row per (reddit_post_id, college_name) pair parsed from Reddit chance-me posts.
CREATE TABLE IF NOT EXISTS chance_me_posts (
  id              BIGSERIAL PRIMARY KEY,
  reddit_post_id  TEXT,
  college_name    TEXT        NOT NULL,
  gpa             FLOAT,
  sat_score       INT,
  act_score       INT,
  num_aps         INT,
  num_ecs         INT,
  state           CHAR(2),
  intended_major  TEXT,
  ethnicity       TEXT,
  first_gen       BOOLEAN,
  outcome         TEXT        CHECK (outcome IN ('accepted','rejected','waitlisted','deferred','pending')),
  source          TEXT        NOT NULL DEFAULT 'reddit',
  post_url        TEXT,
  post_date       TIMESTAMPTZ,
  sample_weight   FLOAT       NOT NULL DEFAULT 1.0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reddit_post_id, college_name)
);

CREATE INDEX IF NOT EXISTS idx_cmp_outcome  ON chance_me_posts(outcome);
CREATE INDEX IF NOT EXISTS idx_cmp_college  ON chance_me_posts(college_name);
CREATE INDEX IF NOT EXISTS idx_cmp_gpa_sat  ON chance_me_posts(gpa, sat_score);
CREATE INDEX IF NOT EXISTS idx_cmp_source   ON chance_me_posts(source);

-- ── college_admissions_stats ──────────────────────────────────────────────────
-- Per-college per-year admissions statistics scraped from CDS / BigFuture.
CREATE TABLE IF NOT EXISTS college_admissions_stats (
  id                   BIGSERIAL PRIMARY KEY,
  college_id           INT         REFERENCES colleges(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_cas_college_year ON college_admissions_stats(college_id, year);
CREATE INDEX IF NOT EXISTS idx_cas_freshness    ON college_admissions_stats(data_freshness);

-- ── college_financial_aid ─────────────────────────────────────────────────────
-- Per-college per-academic-year financial aid data from IPEDS / Scorecard.
CREATE TABLE IF NOT EXISTS college_financial_aid (
  id                        BIGSERIAL PRIMARY KEY,
  college_id                INT         REFERENCES colleges(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_cfa_college_year ON college_financial_aid(college_id, academic_year);

-- ── scraper_run_logs ──────────────────────────────────────────────────────────
-- Written by the Python orchestrator_worker after each scheduled scraper run.
CREATE TABLE IF NOT EXISTS scraper_run_logs (
  id             BIGSERIAL PRIMARY KEY,
  job_name       TEXT        NOT NULL,
  started_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ,
  rows_upserted  INT         NOT NULL DEFAULT 0,
  status         TEXT        CHECK (status IN ('success','failed','partial')),
  error_message  TEXT
);

CREATE INDEX IF NOT EXISTS idx_srl_job_name   ON scraper_run_logs(job_name);
CREATE INDEX IF NOT EXISTS idx_srl_started_at ON scraper_run_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_srl_status     ON scraper_run_logs(status);

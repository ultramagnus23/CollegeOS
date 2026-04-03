-- Migration 046: college_deadlines and college_contact tables
-- These tables store scraped admissions deadlines and contact information
-- for colleges in colleges_comprehensive.
-- Safe to re-run (uses IF NOT EXISTS throughout).

-- ─── college_deadlines ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_deadlines (
  id               SERIAL PRIMARY KEY,
  college_id       INTEGER REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  deadline_type    VARCHAR(100),         -- 'Early Decision' | 'Early Action' | 'Regular Decision'
  deadline_date    DATE,
  notification_date DATE,
  is_binding       BOOLEAN,
  data_year        INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_college_deadlines_college_id
  ON college_deadlines (college_id);

-- ─── college_contact ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_contact (
  id                SERIAL PRIMARY KEY,
  college_id        INTEGER REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  admissions_email  TEXT,
  admissions_phone  TEXT,
  admissions_url    TEXT,
  financial_aid_url TEXT,
  common_app        BOOLEAN,
  coalition_app     BOOLEAN,
  application_fee   INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_college_contact_college_id UNIQUE (college_id)
);

CREATE INDEX IF NOT EXISTS idx_college_contact_college_id
  ON college_contact (college_id);

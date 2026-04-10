-- Migration 056f: Indexes on child tables + RLS / GRANT
--
-- STEP 6 of 7 — run AFTER 056e (or at any point after 056a).
--
-- Part A — college_admissions and college_financial_data indexes
-- ---------------------------------------------------------------
-- The LATERAL sub-selects inside search_colleges_filtered are:
--
--   SELECT ... FROM college_admissions WHERE college_id = c.id ORDER BY id LIMIT 1
--   SELECT ... FROM college_financial_data WHERE college_id = c.id ORDER BY id LIMIT 1
--
-- A btree index on college_id stores rows in id order, so PostgreSQL can
-- satisfy both the WHERE predicate and the ORDER BY in a single index scan
-- instead of a sort + sequential scan.  Each index build is fast because
-- these are narrow, numeric columns.
--
-- Part B — RLS / GRANT
-- ---------------------------------------------------------------
-- Ensures the anon role can read colleges_comprehensive even if Row Level
-- Security is enabled on the table.  The policy is created only if it does
-- not already exist (idempotent).
--
-- Safe to re-run (CREATE INDEX IF NOT EXISTS; idempotent policy check).

-- ── Part A: child-table indexes ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_college_admissions_college_id_desc
  ON college_admissions (college_id DESC);

CREATE INDEX IF NOT EXISTS idx_college_financial_data_college_id_desc
  ON college_financial_data (college_id DESC);

-- ── Part B: public-read access ────────────────────────────────────────────────

GRANT SELECT ON colleges_comprehensive TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'colleges_comprehensive' AND policyname = 'public_read'
  ) THEN
    ALTER TABLE IF EXISTS colleges_comprehensive ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read ON colleges_comprehensive
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

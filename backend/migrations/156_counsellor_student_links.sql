-- Migration 156: counsellor <-> student consent-based linking
-- ============================================================================
-- PURPOSE
--   Foundation for the counsellor dashboard: a school counsellor needs a
--   roster of the students they advise, with visibility into each student's
--   application progress. Consent-based (not automatic) — a counsellor only
--   sees a student after that student accepts an invite (or the counsellor
--   accepts a student-initiated request). This is the standard, low-risk
--   pattern (matches how a student already has a real-world relationship
--   with their own school counsellor) — deliberately NOT the same as a
--   college/admissions-office view, which has different privacy
--   implications and is not built here.
--
-- SAFETY
--   * Additive only: new table, no existing table touched.
--   * `role` on users has no CHECK constraint (migration 052) — 'counsellor'
--     is usable as a value immediately, no schema change needed there.
--   * RLS enabled with zero policies (same pattern as migration 153 / the
--     already-audit-verified-correct chancing_audit_log) — the backend's
--     `postgres` connection role has rolbypassrls=true so this is a
--     zero-behavior-change addition for the app; it only matters as
--     defense-in-depth against a hypothetical future direct-client path.
-- ============================================================================

CREATE TABLE IF NOT EXISTS counsellor_student_links (
  id SERIAL PRIMARY KEY,
  counsellor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'declined', 'revoked')),
  invited_by TEXT NOT NULL CHECK (invited_by IN ('counsellor', 'student')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (counsellor_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_csl_counsellor_active
  ON counsellor_student_links(counsellor_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_csl_student
  ON counsellor_student_links(student_id);

ALTER TABLE counsellor_student_links ENABLE ROW LEVEL SECURITY;

-- ROLLBACK:
--   DROP TABLE IF EXISTS counsellor_student_links;

-- Migration 153: enable RLS on the remaining 30 public tables that had it disabled
-- ============================================================================
-- PURPOSE
--   Closes the RLS gap flagged in AUDIT_REPORT.md finding #8 ("29/74 public
--   tables have RLS disabled"). Verified live 2026-07-25: 30 tables, several
--   holding real user-personal data (documents, recommenders,
--   masters_application_*, user_financial_profiles, application_tasks, etc.)
--   with zero row-level protection.
--
-- WHY NO auth.uid() POLICIES
--   This app does NOT use Supabase Auth. The frontend never calls
--   @supabase/supabase-js or PostgREST directly (verified: zero
--   `supabase.from()` / `createClient` references anywhere in src/) — all
--   access goes through the Express backend, which authenticates its own
--   custom JWT (backend/src/services/authService.js) and enforces
--   user-scoping in application code (`WHERE user_id = $1`, etc.), then
--   queries Postgres over a single shared `pg.Pool` connection as the
--   `postgres` role. There is no per-request Supabase JWT for `auth.uid()`
--   to read, so an auth.uid()-keyed policy would just return zero rows for
--   everyone and break the app.
--
--   The backend's `postgres` role has rolbypassrls = true (verified live)
--   — RLS is invisible to it regardless of policies. This is the SAME
--   pattern already in place and audit-verified correct for
--   `chancing_audit_log` (RLS enabled, 0 policies, deny-by-default to any
--   non-bypassing role) — see AUDIT_REPORT.md fix #7. This migration applies
--   that identical pattern to the other 30 tables.
--
-- EFFECT
--   ENABLE ROW LEVEL SECURITY with no policies = deny-by-default for any
--   role that does NOT have BYPASSRLS (i.e., a hypothetical future anon/
--   authenticated PostgREST client, or an exposed/reused Supabase key).
--   The backend is completely unaffected (bypasses RLS). This is
--   defense-in-depth against a latent risk (no direct-client path exists
--   today, verified), not a fix for an active exploit.
--
-- SAFETY
--   * ENABLE ROW LEVEL SECURITY is idempotent — safe to re-run, no error if
--     already enabled.
--   * Zero behavior change for the backend (verified rolbypassrls = true).
--   * REVERSIBLE: see -- ROLLBACK block at bottom.
-- ============================================================================

ALTER TABLE application_deadlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chancing_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_admissions_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_financial_aid ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_majors ENABLE ROW LEVEL SECURITY;
ALTER TABLE colleges ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_of_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE deadline_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE financing_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE government_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE majors ENABLE ROW LEVEL SECURITY;
ALTER TABLE masters_application_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE masters_application_recommenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE masters_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE masters_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE scholarships ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_financial_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_scholarships ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_suggestions ENABLE ROW LEVEL SECURITY;

-- ROLLBACK:
--   ALTER TABLE application_deadlines DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE application_tasks DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE chancing_predictions DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE college_admissions_stats DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE college_financial_aid DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE college_majors DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE colleges DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE cost_of_attendance DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE deadline_history DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE financing_options DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE government_loans DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE grants DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE majors DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE masters_application_documents DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE masters_application_recommenders DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE masters_applications DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE masters_profile DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE ml_metadata DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE prediction_logs DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE private_loans DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE recommenders DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE scholarships DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE scraper_logs DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE script_migrations DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE user_financial_profiles DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE user_scholarships DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE user_signals DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE user_suggestions DISABLE ROW LEVEL SECURITY;

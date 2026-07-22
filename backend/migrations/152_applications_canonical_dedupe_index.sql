-- Migration 152: dedupe backstop for canonical-only applications
-- ============================================================================
-- PURPOSE
--   Batch 4 of the dual-model cutover (see 151_applications_canonical_fk.sql):
--   Application.create no longer mints a new legacy `colleges` row for a
--   canonical college that has none — applications.college_id can now be NULL
--   for a genuinely new, canonical-only college. The existing
--   UNIQUE(user_id, college_id, application_type) constraint does NOT catch
--   duplicates in that case, because Postgres treats NULL <> NULL in unique
--   comparisons — a user could otherwise add the same canonical-only college
--   twice with two NULL college_id rows.
--
--   App-level dedupe (Application.findByUserAndCollege, checked before every
--   INSERT) already covers this. This index is a DB-level backstop for the
--   same invariant, consistent with the existing college_id-based constraint.
--
-- SAFETY
--   * Additive only. Partial index (WHERE canonical_institution_id IS NOT
--     NULL) — does not touch rows anchored only by legacy college_id.
--   * Idempotent: CREATE UNIQUE INDEX IF NOT EXISTS.
--   * REVERSIBLE: see -- ROLLBACK block at bottom.
--   * Not yet applied to prod — apply via `node scripts/runMigrations.js`
--     from repo root (uses DATABASE_URL/SUPABASE_DB_URL), or through the
--     backend's boot-time migration runner (backend/src/config/database.js),
--     which applies files from this directory automatically.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_user_canonical_type_unique
  ON applications (user_id, canonical_institution_id, application_type)
  WHERE canonical_institution_id IS NOT NULL;

-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_applications_user_canonical_type_unique;

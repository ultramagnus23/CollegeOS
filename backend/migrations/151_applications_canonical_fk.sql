-- Migration 151: Dual-key transition — anchor applications to canonical institutions
-- ============================================================================
-- PURPOSE
--   Break the legacy public.colleges integer-FK coupling that is the last thing
--   keeping the dual data model alive. Adds a nullable canonical UUID column to
--   applications, backfilled from canonical.institution_identity_map, and keeps
--   the legacy integer college_id in place so no reader breaks during the
--   transition. Fully reversible.
--
--   Applied out-of-band to prod 2026-07-20 (backup taken first); this file is
--   idempotent so the boot-time runner re-registers it as a no-op.
--
-- SAFETY (per live-prod posture)
--   * Additive only: no column dropped, no data destroyed.
--   * Idempotent: safe to re-run (IF NOT EXISTS + WHERE ... IS NULL).
--   * REVERSIBLE: see -- ROLLBACK block at bottom.
--   * VERIFIED COVERAGE (live prod, 2026-07-20): 14 of 15 applications map to a
--     canonical UUID via source_pk/source_table. 1 orphan (college_id 5342) stays
--     NULL and its reader falls back to the integer college_id. Acceptable.
--
-- IMPORTANT — the correct backfill path was determined by live verification:
--   * resolve_college_uuid() from migration 087 DOES NOT EXIST in prod (087 drift).
--   * legacy_id path maps only 2/15 — do NOT use it.
--   * source_pk / source_table -> institution_id maps 14/15 — this is the path used.
-- ============================================================================

-- 1. Add the canonical bridge column (nullable during transition).
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS canonical_institution_id UUID;

-- 2. Index for the new join key.
CREATE INDEX IF NOT EXISTS idx_applications_canonical_institution_id
  ON applications(canonical_institution_id);

-- 3. Backfill from the legacy integer college_id via the identity map's
--    source_pk/source_table path (the verified high-coverage path: 14/15).
UPDATE applications ap
   SET canonical_institution_id = im.institution_id
  FROM canonical.institution_identity_map im
 WHERE im.source_pk = ap.college_id::text
   AND im.source_table IN ('public.colleges', 'public.colleges_comprehensive')
   AND ap.canonical_institution_id IS NULL;

-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_applications_canonical_institution_id;
--   ALTER TABLE applications DROP COLUMN IF EXISTS canonical_institution_id;

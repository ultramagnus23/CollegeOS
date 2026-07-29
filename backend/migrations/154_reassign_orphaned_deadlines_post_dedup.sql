-- Migration 154: reassign deadline rows orphaned by a prior institution dedup run
-- ============================================================================
-- PURPOSE
--   AUDIT_REPORT.md flagged ~397 duplicate canonical.institutions groups
--   needing manual triage before merging. Verified live 2026-07-25: this was
--   ALREADY done (415 canonical.institution_merge_history rows, 406
--   institutions marked deprecated_at, 0 remaining duplicate groups by the
--   same (country_code, canonical_name) grouping backend/scripts/
--   dedupeInstitutions.js itself uses) — no further institution merging is
--   needed.
--
--   Follow-up integrity check found one real gap left by that run: 54 rows
--   in canonical.institution_deadlines still pointed at a deprecated
--   (loser) institution_id. institution_deadlines is in dedupeInstitutions.js's
--   COMPOSITE_NOARCHIVE list with a real reassignment rule — but per that
--   script's own documented behavior, rows whose identity key
--   (cycle_year_key, applicant_type, degree_level, intake_term,
--   deadline_type) ALREADY exists on the survivor are deliberately left
--   in place as unresolved conflicts (institution_deadlines has no
--   *_merge_archive table to safely archive them into).
--
--   Classified all 54 (read-only, verified live): 37 are true conflicts —
--   the survivor already has an equivalent row, so nothing is lost by
--   leaving them orphaned (they're functionally dead weight, not missing
--   data) — LEFT ALONE, matching the dedup script's intended conservative
--   behavior. The other 17 are genuinely reassignable: real 2026-cycle
--   deadline data (regular_decision / early_action / early_decision_1)
--   for institutions that got merged, with NO equivalent row on the
--   survivor — meaning it is currently invisible to every read path
--   (institution_id points at a dead institution) even though the data
--   itself is real and correct. This migration reassigns exactly those 17.
--
-- SAFETY
--   * Only touches rows where institution_id points to a deprecated
--     institution AND no equivalent row already exists on the survivor —
--     the exact same identity-key conflict check dedupeInstitutions.js uses.
--   * Idempotent: the NOT EXISTS guard means re-running finds nothing left
--     to do once applied.
--   * No data deleted, only institution_id repointed on a small number of
--     rows (17 verified live 2026-07-25).
--   * REVERSIBLE in spirit (the original loser institution_id values are
--     recoverable via canonical.institution_merge_history, which records
--     merged_institution_id for every deprecated row) but not via a simple
--     rollback statement, since the exact prior institution_id per deadline
--     row isn't separately logged. Treat as forward-only.
-- ============================================================================

UPDATE canonical.institution_deadlines d
SET institution_id = i.deprecated_duplicate_of
FROM canonical.institutions i
WHERE d.institution_id = i.id
  AND i.deprecated_at IS NOT NULL
  AND i.deprecated_duplicate_of IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM canonical.institution_deadlines s
    WHERE s.institution_id = i.deprecated_duplicate_of
      AND s.cycle_year_key IS NOT DISTINCT FROM d.cycle_year_key
      AND s.applicant_type IS NOT DISTINCT FROM d.applicant_type
      AND s.degree_level IS NOT DISTINCT FROM d.degree_level
      AND s.intake_term IS NOT DISTINCT FROM d.intake_term
      AND s.deadline_type IS NOT DISTINCT FROM d.deadline_type
  );

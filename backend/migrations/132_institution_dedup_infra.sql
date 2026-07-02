-- 132_institution_dedup_infra.sql
-- ----------------------------------------------------------------------------
-- Infrastructure for the duplicate-institution cleanup (docs/institution_merge_plan.md,
-- docs/final_duplicate_merge_plan.md). Schema-only, additive.
--
-- deprecated_duplicate_of / deprecated_at: soft-mark mechanism so a duplicate
-- institution row can be identified as superseded WITHOUT hard-deleting it,
-- once the financials/admissions/completeness/rankings conflicts for that pair
-- are resolved (not done by this migration - see the 6,016-row conflict
-- resolution flagged for human review, blocked from automatic execution this
-- session by design).
-- ----------------------------------------------------------------------------

ALTER TABLE canonical.institutions ADD COLUMN IF NOT EXISTS deprecated_duplicate_of UUID REFERENCES canonical.institutions(id);
ALTER TABLE canonical.institutions ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_institutions_deprecated_duplicate_of ON canonical.institutions(deprecated_duplicate_of);

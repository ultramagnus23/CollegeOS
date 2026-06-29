-- 123_masters_programs_denorm_dedup.sql
-- The existing UNIQUE constraint on canonical.masters_programs is
-- (canonical_institution_id, program_name, degree_type, intake_term, intake_year).
-- canonical_institution_id is NULL for almost every bulk-imported row (Excel
-- ingestion ships denormalized institution_name/country with no canonical FK
-- resolved — by design, per the schema's own ON DELETE SET NULL). Postgres
-- treats NULL <> NULL in uniqueness checks, so ON CONFLICT on that constraint
-- silently never fires for these rows, allowing duplicate inserts on rerun.
--
-- This adds a second, partial unique index covering exactly the NULL-FK case,
-- keyed on the denormalized fields that are actually populated for these rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_masters_programs_denorm_dedup
  ON canonical.masters_programs (institution_name, program_name, degree_type)
  WHERE canonical_institution_id IS NULL;

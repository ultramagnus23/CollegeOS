-- Migration 056d: B-tree indexes on filter columns
--
-- STEP 4 of 7 — run AFTER 056a (columns must exist first).
--
-- B-tree indexes are fast to build (sequential scan once, then sorted).
-- At ~6,200 rows each should complete in well under 5 seconds.
--
-- Also enables pg_trgm, which is required by the GIN index in step 056e.
--
-- Safe to re-run (CREATE INDEX IF NOT EXISTS).

-- pg_trgm must exist before the GIN index in 056e can be created.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Equality-filter columns used inside search_colleges_filtered.
CREATE INDEX IF NOT EXISTS idx_colleges_comp_country  ON colleges_comprehensive (country);
CREATE INDEX IF NOT EXISTS idx_colleges_comp_state    ON colleges_comprehensive (state);
CREATE INDEX IF NOT EXISTS idx_colleges_comp_type     ON colleges_comprehensive (type);
CREATE INDEX IF NOT EXISTS idx_colleges_comp_setting  ON colleges_comprehensive (setting);

-- Migration 056e: GIN trigram index on colleges_comprehensive.name
--
-- STEP 5 of 7 — run AFTER 056d (pg_trgm extension must exist first).
--
-- This is the most expensive index to build because GIN must tokenise every
-- trigram in every college name.  It is isolated in its own chunk so that if
-- it times out you can simply re-run this file alone without repeating the
-- other steps.
--
-- On a free-tier Supabase project with ~6,200 rows this typically takes
-- 3–8 seconds.  If it still times out on your plan, connect to your database
-- directly (psql / pgAdmin) and run the CREATE INDEX statement there.
--
-- Safe to re-run (CREATE INDEX IF NOT EXISTS).

-- Required by gin_trgm_ops — run 056d first if not yet applied.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_colleges_name_trgm
  ON colleges_comprehensive
  USING GIN (name gin_trgm_ops);

-- Migration 053: Performance indexes for college search & LATERAL joins
--
-- 1. pg_trgm extension — enables GIN trigram index for fast ILIKE searches
--    on college names without requiring a full sequential scan.
--
-- 2. GIN trigram index on colleges_comprehensive.name — speeds up the
--    `c.name ILIKE '%' || p_query || '%'` filter inside search_colleges_filtered.
--
-- 3. B-tree index on colleges_comprehensive.country — speeds up the
--    `c.country = p_country` equality filter inside search_colleges_filtered.
--
-- 4. Descending college_id index on college_admissions and
--    college_financial_data — the LATERAL sub-selects in search_colleges_filtered
--    use `ORDER BY id` with LIMIT 1; a btree index on college_id (DESC) lets
--    the planner satisfy both the WHERE college_id = c.id predicate and the
--    ORDER BY id in a single index scan instead of a sort + seq-scan.
--
-- Safe to re-run (CREATE INDEX IF NOT EXISTS).

-- ─── 1. pg_trgm extension ─────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── 2. GIN trigram index on colleges_comprehensive.name ─────────────────────

CREATE INDEX IF NOT EXISTS idx_colleges_name_trgm
  ON colleges_comprehensive
  USING GIN (name gin_trgm_ops);

-- ─── 3. B-tree index on colleges_comprehensive.country ───────────────────────

CREATE INDEX IF NOT EXISTS idx_colleges_country
  ON colleges_comprehensive (country);

-- ─── 4. college_admissions.college_id (DESC) for LATERAL joins ───────────────

CREATE INDEX IF NOT EXISTS idx_college_admissions_college_id_desc
  ON college_admissions (college_id DESC);

-- ─── 5. college_financial_data.college_id (DESC) for LATERAL joins ───────────

CREATE INDEX IF NOT EXISTS idx_college_financial_data_college_id_desc
  ON college_financial_data (college_id DESC);

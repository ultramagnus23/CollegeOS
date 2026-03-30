-- Migration 039: PostgreSQL full-text search indexes
--
-- Replaces the SQLite FTS5 virtual tables (dropped in migration 027) with
-- native PostgreSQL GIN expression indexes built on tsvector columns.
--
-- These are pure expression indexes — no extra columns or triggers needed.
-- The query planner will automatically use them when the WHERE clause contains
-- the corresponding to_tsvector(...) @@ ... expression.
--
-- colleges search index
--   Combines: name, location, country, description, major_categories, academic_strengths
CREATE INDEX IF NOT EXISTS idx_colleges_fts
  ON colleges
  USING GIN (
    to_tsvector(
      'english',
      coalesce(name, '') || ' ' ||
      coalesce(location, '') || ' ' ||
      coalesce(country, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(major_categories, '') || ' ' ||
      coalesce(academic_strengths, '')
    )
  );

-- colleges name-only trigram index for fast prefix / autocomplete queries
CREATE INDEX IF NOT EXISTS idx_colleges_name_gin
  ON colleges
  USING GIN (to_tsvector('english', coalesce(name, '')));

-- majors search index (normalized majors table added in migration 012)
CREATE INDEX IF NOT EXISTS idx_majors_fts
  ON majors
  USING GIN (
    to_tsvector(
      'english',
      coalesce(name, '') || ' ' ||
      coalesce(display_name, '') || ' ' ||
      coalesce(description, '')
    )
  );

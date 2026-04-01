-- Migration 042: PostgreSQL Weighted Full-Text Search
-- Implements tsvector-based FTS across colleges, programs, and locations
-- with field-level weights (A=name > B=location > C=programs > D=description).
-- Only validated data is indexed (is_verified=TRUE).

-- ── 1. Add search vector column to colleges ───────────────────────────────────

ALTER TABLE colleges
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR;

-- Populate existing rows
UPDATE colleges
SET search_vector =
  setweight(to_tsvector('english', coalesce(name, '')),          'A') ||
  setweight(to_tsvector('english', coalesce(location, '')),      'B') ||
  setweight(to_tsvector('english', coalesce(country, '')),       'B') ||
  setweight(to_tsvector('english', coalesce(
    -- programs / major_categories may be stored as JSON arrays
    CASE
      WHEN programs IS NOT NULL AND programs != '' AND programs != 'null'
        THEN regexp_replace(programs, '["\\[\\]]', ' ', 'g')
      ELSE ''
    END, ''
  )),                                                             'C') ||
  setweight(to_tsvector('english', coalesce(description, '')),   'D')
WHERE is_verified = TRUE OR is_verified IS NULL;

-- GIN index for fast FTS queries
CREATE INDEX IF NOT EXISTS idx_colleges_search_vector
  ON colleges USING GIN (search_vector);

-- ── 2. Trigger: keep search_vector up-to-date on write ───────────────────────

CREATE OR REPLACE FUNCTION colleges_search_vector_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')),          'A') ||
    setweight(to_tsvector('english', coalesce(NEW.location, '')),      'B') ||
    setweight(to_tsvector('english', coalesce(NEW.country, '')),       'B') ||
    setweight(to_tsvector('english', coalesce(
      CASE
        WHEN NEW.programs IS NOT NULL AND NEW.programs != '' AND NEW.programs != 'null'
          THEN regexp_replace(NEW.programs, '["\\[\\]]', ' ', 'g')
        ELSE ''
      END, ''
    )),                                                                 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')),   'D');
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_colleges_fts_update'
  ) THEN
    CREATE TRIGGER trg_colleges_fts_update
      BEFORE INSERT OR UPDATE ON colleges
      FOR EACH ROW EXECUTE FUNCTION colleges_search_vector_update();
  END IF;
END;
$$;

-- ── 3. Convenience search function ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION search_colleges(
  p_query  TEXT,
  p_limit  INT  DEFAULT 20,
  p_offset INT  DEFAULT 0
)
RETURNS TABLE (
  id             INTEGER,
  name           TEXT,
  location       TEXT,
  country        TEXT,
  ranking        INTEGER,
  acceptance_rate NUMERIC,
  tuition_international NUMERIC,
  is_verified    BOOLEAN,
  rank           REAL
)
LANGUAGE SQL STABLE AS $$
  SELECT
    c.id,
    c.name,
    c.location,
    c.country,
    c.ranking,
    c.acceptance_rate,
    c.tuition_international,
    c.is_verified,
    ts_rank_cd(c.search_vector, websearch_to_tsquery('english', p_query)) AS rank
  FROM   colleges c
  WHERE  c.search_vector @@ websearch_to_tsquery('english', p_query)
  ORDER  BY rank DESC, c.ranking ASC NULLS LAST
  LIMIT  p_limit
  OFFSET p_offset;
$$;

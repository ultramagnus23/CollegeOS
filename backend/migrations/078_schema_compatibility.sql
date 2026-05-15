-- Migration 078: Schema compatibility layer
-- ---------------------------------------------------------------------------
-- Ensures `public.colleges` has both the canonical column names used by code
-- (type, official_website) and the legacy names (institution_type, website_url).
--
-- Root cause: some deployment environments have `colleges` with the
-- `colleges_comprehensive` schema (institution_type / website_url) while the
-- application code was written to expect type / official_website.
--
-- Strategy:
--   • ADD COLUMN IF NOT EXISTS for any missing canonical column.
--   • Back-fill from the legacy column when both sides are known.
--   • Never drop old columns (legacy code still uses them).
--   • Idempotent — safe to re-run.
-- ---------------------------------------------------------------------------

-- ── 1. Ensure `type` column exists on `colleges` ─────────────────────────────
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS institution_type TEXT;

-- Back-fill type ← institution_type when type is absent
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'colleges' AND column_name = 'institution_type'
  ) THEN
    EXECUTE '
      UPDATE colleges
      SET    type = institution_type
      WHERE  type IS NULL AND institution_type IS NOT NULL
    ';
  END IF;
END $$;

-- Back-fill institution_type ← type when institution_type is absent
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'colleges' AND column_name = 'type'
  ) THEN
    EXECUTE '
      UPDATE colleges
      SET    institution_type = type
      WHERE  institution_type IS NULL AND type IS NOT NULL
    ';
  END IF;
END $$;

-- ── 2. Ensure `official_website` column exists on `colleges` ─────────────────
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS official_website TEXT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS website TEXT;

-- Back-fill official_website ← website_url / website
DO $$
BEGIN
  EXECUTE '
    UPDATE colleges
    SET    official_website = COALESCE(website_url, website)
    WHERE  official_website IS NULL
      AND  COALESCE(website_url, website) IS NOT NULL
  ';
END $$;

-- Back-fill website_url ← official_website / website
DO $$
BEGIN
  EXECUTE '
    UPDATE colleges
    SET    website_url = COALESCE(official_website, website)
    WHERE  website_url IS NULL
      AND  COALESCE(official_website, website) IS NOT NULL
  ';
END $$;

-- ── 3. Ensure act_avg column exists (queried by recommend.js) ────────────────
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS act_avg DOUBLE PRECISION;

-- ── 4. Ensure feature_vector column exists (queried by recommend.js) ─────────
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS feature_vector JSONB;

-- ── 5. Ensure popularity_score exists (used in ORDER BY) ─────────────────────
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS popularity_score DOUBLE PRECISION;

-- ── 6. Ensure slug column exists ─────────────────────────────────────────────
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS slug TEXT;

-- Back-fill slug from name + id
DO $$
BEGIN
  EXECUTE '
    UPDATE colleges
    SET    slug = LOWER(REGEXP_REPLACE(name, ''\s+'', ''-'', ''g'')) || ''-'' || id::text
    WHERE  slug IS NULL AND name IS NOT NULL
  ';
END $$;

-- ── 7. Grant read access to Supabase roles ────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'GRANT SELECT ON colleges TO anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT SELECT ON colleges TO authenticated';
  END IF;
END $$;

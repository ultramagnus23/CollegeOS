-- Migration: 077_additional_canonical_perf_indexes.sql
-- Purpose: enforce canonical query-performance indexes for production hardening.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Canonical colleges indexes
CREATE INDEX IF NOT EXISTS idx_colleges_slug_btree
  ON public.colleges (slug);

CREATE INDEX IF NOT EXISTS idx_colleges_ranking_qs_btree
  ON public.colleges (ranking_qs);

CREATE INDEX IF NOT EXISTS idx_colleges_country_state_btree
  ON public.colleges (country, state);

CREATE INDEX IF NOT EXISTS idx_colleges_search_vector_gin
  ON public.colleges
  USING gin (to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(city, '') || ' ' || COALESCE(state, '') || ' ' || COALESCE(country, '')));

CREATE INDEX IF NOT EXISTS idx_colleges_name_trgm_gin
  ON public.colleges
  USING gin (LOWER(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_colleges_normalized_website_expr
  ON public.colleges ((LOWER(COALESCE(official_website, website, website_url, ''))));

-- Application tracker joins on canonical institutions
CREATE INDEX IF NOT EXISTS idx_applications_college_id_btree
  ON public.applications (college_id);

CREATE INDEX IF NOT EXISTS idx_applications_user_college_btree
  ON public.applications (user_id, college_id);

-- Some environments materialize canonical_institution_id on applications.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'applications'
      AND column_name = 'canonical_institution_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_applications_canonical_institution_id_btree ON public.applications (canonical_institution_id)';
  END IF;
END
$$;

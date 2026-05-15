-- Migration: 076_canonical_college_perf_indexes.sql
-- Production hardening for canonical college search and application tracker lookups.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_colleges_slug ON public.colleges (slug);
CREATE INDEX IF NOT EXISTS idx_colleges_qs_rank ON public.colleges (ranking_qs);
CREATE INDEX IF NOT EXISTS idx_colleges_country_state ON public.colleges (country, state);

CREATE INDEX IF NOT EXISTS idx_colleges_normalized_website
  ON public.colleges ((LOWER(COALESCE(official_website, website, website_url, ''))));

CREATE INDEX IF NOT EXISTS idx_colleges_name_trgm
  ON public.colleges USING gin (LOWER(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_colleges_search_vector
  ON public.colleges
  USING gin (to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(city, '') || ' ' || COALESCE(state, '') || ' ' || COALESCE(country, '')));

-- Canonical institution linkage for tracker/application joins is persisted via applications.college_id.
CREATE INDEX IF NOT EXISTS idx_applications_college_id ON applications (college_id);
CREATE INDEX IF NOT EXISTS idx_applications_user_college ON applications (user_id, college_id);

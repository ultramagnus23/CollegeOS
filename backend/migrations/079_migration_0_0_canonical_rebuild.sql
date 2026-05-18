-- Migration: migration_0_0_canonical_rebuild
-- Purpose: One-shot canonical institution intelligence rebuild over immutable legacy tables.
-- Notes:
--   * Legacy/raw tables are never altered or dropped.
--   * Canonical production system is created under schema `canonical`.
--   * Canonical identity is always `canonical.institutions.id` (UUID).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE SCHEMA IF NOT EXISTS canonical;

-- ============================================================================
-- ENUMS
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'canonical' AND t.typname = 'verification_status'
  ) THEN
    CREATE TYPE canonical.verification_status AS ENUM (
      'unverified',
      'verified',
      'government_verified',
      'deprecated'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'canonical' AND t.typname = 'source_tier'
  ) THEN
    CREATE TYPE canonical.source_tier AS ENUM (
      'government_dataset',
      'official_institution_data',
      'common_data_set',
      'verified_import',
      'scraped_third_party',
      'inferred_generated'
    );
  END IF;
END
$$;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION canonical.normalize_text(p_input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    regexp_replace(
      lower(unaccent(trim(coalesce(p_input, '')))),
      '[^a-z0-9]+',
      ' ',
      'g'
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION canonical.normalize_institution_name(p_input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          canonical.normalize_text(p_input),
          '\m(university|college|institute|school|campus|the)\M',
          ' ',
          'gi'
        ),
        '\s+',
        ' ',
        'g'
      ),
      '^\s+|\s+$',
      '',
      'g'
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION canonical.normalize_url(p_input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(trim(coalesce(p_input, ''))), '^https?://', ''),
        '^www\.',
        ''
      ),
      '/+$',
      ''
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION canonical.extract_domain(p_url TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT split_part(canonical.normalize_url(p_url), '/', 1);
$$;

CREATE OR REPLACE FUNCTION canonical.make_slug(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        lower(unaccent(trim(coalesce(p_name, '')))),
        '[^a-z0-9]+',
        '-',
        'g'
      ),
      '(^-|-$)',
      '',
      'g'
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION canonical.safe_timestamptz(p_value TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_out TIMESTAMPTZ;
BEGIN
  IF p_value IS NULL OR trim(p_value) = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_out := p_value::timestamptz;
    RETURN v_out;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION canonical.normalize_country_code(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(trim(coalesce(p_value, '')))
    WHEN 'US' THEN 'US'
    WHEN 'USA' THEN 'US'
    WHEN 'UNITED STATES' THEN 'US'
    WHEN 'UNITED STATES OF AMERICA' THEN 'US'
    WHEN 'IN' THEN 'IN'
    WHEN 'INDIA' THEN 'IN'
    WHEN 'GB' THEN 'GB'
    WHEN 'UK' THEN 'GB'
    WHEN 'UNITED KINGDOM' THEN 'GB'
    WHEN 'ENGLAND' THEN 'GB'
    WHEN 'SCOTLAND' THEN 'GB'
    WHEN 'WALES' THEN 'GB'
    WHEN 'NORTHERN IRELAND' THEN 'GB'
    WHEN 'DE' THEN 'DE'
    WHEN 'GERMANY' THEN 'DE'
    WHEN 'FR' THEN 'FR'
    WHEN 'FRANCE' THEN 'FR'
    WHEN 'IT' THEN 'IT'
    WHEN 'ITALY' THEN 'IT'
    WHEN 'ES' THEN 'ES'
    WHEN 'SPAIN' THEN 'ES'
    WHEN 'NL' THEN 'NL'
    WHEN 'NETHERLANDS' THEN 'NL'
    WHEN 'IE' THEN 'IE'
    WHEN 'IRELAND' THEN 'IE'
    ELSE NULLIF(upper(trim(coalesce(p_value, ''))), '')
  END;
$$;

CREATE OR REPLACE FUNCTION canonical.normalize_region_code(p_country_code TEXT, p_region TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_country_code IS NULL THEN NULL
    WHEN p_country_code = 'US' THEN upper(trim(coalesce(p_region, '')))
    WHEN p_country_code = 'IN' THEN upper(trim(coalesce(p_region, '')))
    WHEN p_country_code = 'GB' THEN upper(trim(coalesce(p_region, '')))
    ELSE NULLIF(upper(trim(coalesce(p_region, ''))), '')
  END;
$$;

CREATE OR REPLACE FUNCTION canonical.base_external_ids()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'ipeds', '',
    'college_scorecard', '',
    'ucas', '',
    'nirf', '',
    'jee_code', '',
    'common_app', '',
    'qs_ranking_id', ''
  );
$$;

CREATE OR REPLACE FUNCTION canonical.normalized_external_ids(p_payload JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT canonical.base_external_ids() || jsonb_build_object(
    'ipeds', coalesce(nullif(trim(coalesce(p_payload->>'ipeds', p_payload->>'ipeds_unit_id')), ''), ''),
    'college_scorecard', coalesce(nullif(trim(coalesce(p_payload->>'college_scorecard', p_payload->>'scorecard_id')), ''), ''),
    'ucas', coalesce(nullif(trim(coalesce(p_payload->>'ucas', p_payload->>'ucas_id')), ''), ''),
    'nirf', coalesce(nullif(trim(coalesce(p_payload->>'nirf', p_payload->>'nirf_ranking')), ''), ''),
    'jee_code', coalesce(nullif(trim(coalesce(p_payload->>'jee_code', p_payload->>'jee')), ''), ''),
    'common_app', coalesce(nullif(trim(coalesce(p_payload->>'common_app', p_payload->>'common_app_id')), ''), ''),
    'qs_ranking_id', coalesce(nullif(trim(coalesce(p_payload->>'qs_ranking_id', p_payload->>'qs_ranking')), ''), '')
  );
$$;

CREATE OR REPLACE FUNCTION canonical.merge_external_ids(p_existing JSONB, p_incoming JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'ipeds', coalesce(nullif(p_existing->>'ipeds',''), nullif(p_incoming->>'ipeds',''), ''),
    'college_scorecard', coalesce(nullif(p_existing->>'college_scorecard',''), nullif(p_incoming->>'college_scorecard',''), ''),
    'ucas', coalesce(nullif(p_existing->>'ucas',''), nullif(p_incoming->>'ucas',''), ''),
    'nirf', coalesce(nullif(p_existing->>'nirf',''), nullif(p_incoming->>'nirf',''), ''),
    'jee_code', coalesce(nullif(p_existing->>'jee_code',''), nullif(p_incoming->>'jee_code',''), ''),
    'common_app', coalesce(nullif(p_existing->>'common_app',''), nullif(p_incoming->>'common_app',''), ''),
    'qs_ranking_id', coalesce(nullif(p_existing->>'qs_ranking_id',''), nullif(p_incoming->>'qs_ranking_id',''), '')
  );
$$;

CREATE OR REPLACE FUNCTION canonical.external_ids_overlap(p_left JSONB, p_right JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM (VALUES
      ('ipeds'),
      ('college_scorecard'),
      ('ucas'),
      ('nirf'),
      ('jee_code'),
      ('common_app'),
      ('qs_ranking_id')
    ) AS k(key)
    WHERE nullif(p_left->>k.key, '') IS NOT NULL
      AND nullif(p_right->>k.key, '') IS NOT NULL
      AND p_left->>k.key = p_right->>k.key
  );
$$;

CREATE OR REPLACE FUNCTION canonical.resolve_source_tier(
  p_source_table TEXT,
  p_payload JSONB
)
RETURNS canonical.source_tier
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(coalesce(p_payload->>'source','')) IN (
      'ipeds','data.gov','college_scorecard','ucas','nirf','hesa','eurostat'
    ) THEN 'government_dataset'::canonical.source_tier
    WHEN lower(coalesce(p_payload->>'source','')) IN (
      'official','official_site','university_official','institution'
    ) THEN 'official_institution_data'::canonical.source_tier
    WHEN lower(coalesce(p_payload->>'source','')) LIKE '%common data set%'
      OR lower(coalesce(p_payload->>'source','')) = 'cds'
    THEN 'common_data_set'::canonical.source_tier
    WHEN p_source_table IN (
      'public.colleges_comprehensive',
      'public.college_admissions',
      'public.college_financial_data',
      'public.academic_details',
      'public.academic_outcomes',
      'public.student_demographics',
      'public.campus_life',
      'public.college_programs',
      'public.college_deadlines'
    ) THEN 'verified_import'::canonical.source_tier
    WHEN p_source_table IN (
      'public.colleges',
      'public.colleges_legacy',
      'public.application_deadlines',
      'public.scholarships_new'
    ) THEN 'scraped_third_party'::canonical.source_tier
    ELSE 'inferred_generated'::canonical.source_tier
  END;
$$;

CREATE OR REPLACE FUNCTION canonical.source_priority_from_tier(p_tier canonical.source_tier)
RETURNS SMALLINT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tier
    WHEN 'government_dataset' THEN 1
    WHEN 'official_institution_data' THEN 2
    WHEN 'common_data_set' THEN 3
    WHEN 'verified_import' THEN 4
    WHEN 'scraped_third_party' THEN 5
    ELSE 6
  END;
$$;

-- ============================================================================
-- CORE CANONICAL TABLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS canonical.institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  slug TEXT NOT NULL,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  short_name TEXT,
  country_code TEXT NOT NULL,
  region_code TEXT,
  state_region TEXT,
  city TEXT,
  address TEXT,
  postal_code TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  institution_type TEXT,
  control_type TEXT,
  established_year INTEGER,
  website TEXT,
  logo_url TEXT,
  verification_status canonical.verification_status NOT NULL DEFAULT 'unverified',
  source_priority SMALLINT NOT NULL DEFAULT 6 CHECK (source_priority BETWEEN 1 AND 6),
  completeness_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (completeness_score BETWEEN 0 AND 100),
  canonical_external_ids JSONB NOT NULL DEFAULT canonical.base_external_ids(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (established_year IS NULL OR established_year BETWEEN 1000 AND 2100),
  CONSTRAINT uq_institutions_slug UNIQUE (slug),
  CONSTRAINT uq_institutions_country_normalized UNIQUE (country_code, normalized_name)
);

CREATE TABLE IF NOT EXISTS canonical.institution_identity_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  source_table TEXT NOT NULL,
  source_pk TEXT NOT NULL,
  source_tier canonical.source_tier NOT NULL,
  source_priority SMALLINT NOT NULL CHECK (source_priority BETWEEN 1 AND 6),
  match_method TEXT NOT NULL,
  match_score NUMERIC(6,4) NOT NULL DEFAULT 1,
  is_canonical_match BOOLEAN NOT NULL DEFAULT TRUE,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_identity_map_source UNIQUE (source_table, source_pk)
);

CREATE TABLE IF NOT EXISTS canonical.institution_metadata (
  institution_id UUID PRIMARY KEY REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  languages_offered TEXT[] DEFAULT ARRAY[]::TEXT[],
  accreditation JSONB NOT NULL DEFAULT '{}'::jsonb,
  timezone TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  governance JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canonical.institution_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  source_table TEXT NOT NULL,
  source_pk TEXT,
  source_pk_key TEXT GENERATED ALWAYS AS (coalesce(source_pk, '')) STORED,
  source_name TEXT,
  source_tier canonical.source_tier NOT NULL,
  source_priority SMALLINT NOT NULL CHECK (source_priority BETWEEN 1 AND 6),
  source_url TEXT,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  observed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_institution_sources UNIQUE (institution_id, source_table, source_pk_key)
);

CREATE TABLE IF NOT EXISTS canonical.institution_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  alias_type TEXT NOT NULL DEFAULT 'known_alias',
  source_table TEXT,
  source_pk TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_institution_alias UNIQUE (institution_id, normalized_alias)
);

-- ============================================================================
-- UNIVERSAL DOMAIN TABLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS canonical.institution_admissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  data_year INTEGER,
  admissions_cycle TEXT NOT NULL DEFAULT 'regular',
  acceptance_rate NUMERIC(6,3),
  early_decision_rate NUMERIC(6,3),
  early_action_rate NUMERIC(6,3),
  regular_decision_rate NUMERIC(6,3),
  waitlist_rate NUMERIC(6,3),
  transfer_acceptance_rate NUMERIC(6,3),
  yield_rate NUMERIC(6,3),
  application_volume INTEGER,
  admit_volume INTEGER,
  enrollment_volume INTEGER,
  international_accept_rate NUMERIC(6,3),
  in_state_accept_rate NUMERIC(6,3),
  out_state_accept_rate NUMERIC(6,3),
  test_optional BOOLEAN,
  sat_25 INTEGER,
  sat_50 INTEGER,
  sat_75 INTEGER,
  act_25 INTEGER,
  act_50 INTEGER,
  act_75 INTEGER,
  exam_requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_institution_admissions UNIQUE (institution_id, data_year, admissions_cycle)
);

CREATE TABLE IF NOT EXISTS canonical.institution_financials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  data_year INTEGER,
  data_year_key INTEGER GENERATED ALWAYS AS (coalesce(data_year, -1)) STORED,
  academic_year TEXT,
  academic_year_key TEXT GENERATED ALWAYS AS (coalesce(academic_year, 'n/a')) STORED,
  currency_code TEXT DEFAULT 'USD',
  tuition_in_state NUMERIC(14,2),
  tuition_out_state NUMERIC(14,2),
  tuition_international NUMERIC(14,2),
  cost_of_attendance NUMERIC(14,2),
  avg_financial_aid NUMERIC(14,2),
  percent_receiving_aid NUMERIC(6,3),
  avg_debt NUMERIC(14,2),
  net_price_low_income NUMERIC(14,2),
  net_price_mid_income NUMERIC(14,2),
  net_price_high_income NUMERIC(14,2),
  merit_scholarship_flag BOOLEAN,
  need_blind_flag BOOLEAN,
  no_loan_policy BOOLEAN,
  source_attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_institution_financials UNIQUE (institution_id, data_year_key, academic_year_key)
);

CREATE TABLE IF NOT EXISTS canonical.institution_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  ranking_year INTEGER,
  ranking_year_key INTEGER GENERATED ALWAYS AS (coalesce(ranking_year, -1)) STORED,
  ranking_body TEXT NOT NULL,
  national_rank INTEGER,
  global_rank INTEGER,
  subject_rank INTEGER,
  ranking_score NUMERIC(8,3),
  source_attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_institution_rankings UNIQUE (institution_id, ranking_year_key, ranking_body)
);

CREATE TABLE IF NOT EXISTS canonical.institution_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  data_year INTEGER,
  data_year_key INTEGER GENERATED ALWAYS AS (coalesce(data_year, -1)) STORED,
  graduation_rate_4yr NUMERIC(6,3),
  graduation_rate_6yr NUMERIC(6,3),
  retention_rate NUMERIC(6,3),
  employment_rate NUMERIC(6,3),
  median_start_salary NUMERIC(14,2),
  median_mid_career_salary NUMERIC(14,2),
  grad_school_rate NUMERIC(6,3),
  internship_rate NUMERIC(6,3),
  source_attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_institution_outcomes UNIQUE (institution_id, data_year_key)
);

CREATE TABLE IF NOT EXISTS canonical.institution_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  program_name TEXT NOT NULL,
  normalized_program_name TEXT NOT NULL,
  degree_type TEXT,
  degree_type_key TEXT GENERATED ALWAYS AS (coalesce(degree_type, '')) STORED,
  field_category TEXT,
  enrollment INTEGER,
  acceptance_rate NUMERIC(6,3),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_institution_programs UNIQUE (institution_id, normalized_program_name, degree_type_key)
);

CREATE TABLE IF NOT EXISTS canonical.institution_deadlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  cycle_year TEXT,
  cycle_year_key TEXT GENERATED ALWAYS AS (coalesce(cycle_year, '')) STORED,
  deadline_type TEXT NOT NULL,
  deadline_date DATE,
  -- Sentinel date is used only for deterministic UNIQUE conflict keys when
  -- source rows have NULL deadline_date; it is not treated as a real deadline.
  deadline_date_key DATE GENERATED ALWAYS AS (coalesce(deadline_date, DATE '9999-12-31')) STORED,
  notification_date DATE,
  is_binding BOOLEAN,
  is_rolling BOOLEAN,
  source_attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_institution_deadlines UNIQUE (institution_id, cycle_year_key, deadline_type, deadline_date_key)
);

CREATE TABLE IF NOT EXISTS canonical.institution_demographics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  data_year INTEGER,
  data_year_key INTEGER GENERATED ALWAYS AS (coalesce(data_year, -1)) STORED,
  percent_international NUMERIC(6,3),
  gender_ratio TEXT,
  ethnic_distribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  percent_first_gen NUMERIC(6,3),
  socioeconomic_index NUMERIC(8,3),
  geographic_diversity_index NUMERIC(8,3),
  legacy_percent NUMERIC(6,3),
  athlete_percent NUMERIC(6,3),
  transfer_percent NUMERIC(6,3),
  source_attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_institution_demographics UNIQUE (institution_id, data_year_key)
);

CREATE TABLE IF NOT EXISTS canonical.institution_campus_life (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL UNIQUE REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  housing_guarantee TEXT,
  campus_safety_score NUMERIC(8,3),
  cost_of_living_index NUMERIC(8,3),
  climate_zone TEXT,
  student_satisfaction_score NUMERIC(8,3),
  athletics_division TEXT,
  club_count INTEGER,
  mental_health_rating NUMERIC(8,3),
  source_attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canonical.institution_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  requirement_category TEXT NOT NULL,
  requirement_name TEXT NOT NULL,
  requirement_value TEXT,
  requirement_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_institution_requirements UNIQUE (institution_id, requirement_category, requirement_name)
);

CREATE TABLE IF NOT EXISTS canonical.institution_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  stats_namespace TEXT NOT NULL,
  stats_year INTEGER,
  stats_year_key INTEGER GENERATED ALWAYS AS (coalesce(stats_year, -1)) STORED,
  stats_payload JSONB NOT NULL,
  source_attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_institution_statistics UNIQUE (institution_id, stats_namespace, stats_year_key)
);

-- ============================================================================
-- REGIONAL EXTENSION TABLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS canonical.us_admissions_profile (
  institution_id UUID PRIMARY KEY REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  sat_required BOOLEAN,
  sat_range JSONB,
  act_required BOOLEAN,
  act_range JSONB,
  common_app_supported BOOLEAN,
  fafsa_required BOOLEAN,
  css_profile_required BOOLEAN,
  source_attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canonical.india_admissions_profile (
  institution_id UUID PRIMARY KEY REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  jee_required BOOLEAN,
  cuet_required BOOLEAN,
  nirf_rank INTEGER,
  reservation_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  entrance_exam_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canonical.uk_admissions_profile (
  institution_id UUID PRIMARY KEY REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  ucas_required BOOLEAN,
  ucas_code TEXT,
  a_levels_required BOOLEAN,
  ib_requirements TEXT,
  source_attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canonical.eu_admissions_profile (
  institution_id UUID PRIMARY KEY REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  ects_required BOOLEAN,
  bologna_cycle TEXT,
  language_requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canonical.us_financial_aid (
  institution_id UUID PRIMARY KEY REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  fafsa_priority_deadline DATE,
  css_profile_deadline DATE,
  federal_aid_available BOOLEAN,
  avg_pell_grant NUMERIC(14,2),
  source_attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canonical.india_financial_aid (
  institution_id UUID PRIMARY KEY REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  scholarship_portal TEXT,
  state_scholarships JSONB NOT NULL DEFAULT '[]'::jsonb,
  reservation_aid_available BOOLEAN,
  source_attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canonical.uk_financial_support (
  institution_id UUID PRIMARY KEY REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  student_finance_england BOOLEAN,
  bursary_available BOOLEAN,
  international_scholarships BOOLEAN,
  source_attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- SEARCH / AI TABLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS canonical.institution_search_index (
  institution_id UUID PRIMARY KEY REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  autocomplete_text TEXT NOT NULL,
  search_tokens TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  searchable_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  search_document TSVECTOR GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(autocomplete_text, '') || ' ' || coalesce(searchable_json::text, '')
    )
  ) STORED,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canonical.institution_embeddings (
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,
  embedding JSONB NOT NULL,
  embedding_dim INTEGER NOT NULL CHECK (embedding_dim > 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_institution_embeddings UNIQUE (institution_id, model_name)
);

CREATE TABLE IF NOT EXISTS canonical.institution_completeness (
  institution_id UUID PRIMARY KEY REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  admissions_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  financials_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  outcomes_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  rankings_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  programs_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  demographics_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  requirements_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  deadlines_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  overall_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (admissions_score BETWEEN 0 AND 100),
  CHECK (financials_score BETWEEN 0 AND 100),
  CHECK (outcomes_score BETWEEN 0 AND 100),
  CHECK (rankings_score BETWEEN 0 AND 100),
  CHECK (programs_score BETWEEN 0 AND 100),
  CHECK (demographics_score BETWEEN 0 AND 100),
  CHECK (requirements_score BETWEEN 0 AND 100),
  CHECK (deadlines_score BETWEEN 0 AND 100),
  CHECK (overall_score BETWEEN 0 AND 100)
);

CREATE TABLE IF NOT EXISTS canonical.institution_quality_scores (
  institution_id UUID PRIMARY KEY REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  consistency_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  freshness_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  lineage_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  conflict_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  final_quality_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (consistency_score BETWEEN 0 AND 100),
  CHECK (freshness_score BETWEEN 0 AND 100),
  CHECK (lineage_score BETWEEN 0 AND 100),
  CHECK (conflict_score BETWEEN 0 AND 100),
  CHECK (final_quality_score BETWEEN 0 AND 100)
);

-- ============================================================================
-- APPLICATION TABLES (CANONICAL)
-- ============================================================================
CREATE TABLE IF NOT EXISTS canonical.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES canonical.institutions(id) ON DELETE SET NULL,
  legacy_application_id TEXT,
  user_id TEXT,
  application_type TEXT,
  status TEXT,
  deadline_date DATE,
  submitted_at TIMESTAMPTZ,
  decision_date TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_canonical_applications_legacy UNIQUE (legacy_application_id)
);

CREATE TABLE IF NOT EXISTS canonical.application_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES canonical.applications(id) ON DELETE CASCADE,
  institution_id UUID REFERENCES canonical.institutions(id) ON DELETE SET NULL,
  task_type TEXT,
  title TEXT NOT NULL,
  description TEXT,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  due_date DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canonical.timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES canonical.applications(id) ON DELETE CASCADE,
  institution_id UUID REFERENCES canonical.institutions(id) ON DELETE SET NULL,
  user_id TEXT,
  event_type TEXT,
  title TEXT NOT NULL,
  event_date DATE,
  is_critical BOOLEAN NOT NULL DEFAULT FALSE,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canonical.recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES canonical.institutions(id) ON DELETE SET NULL,
  user_id TEXT,
  recommendation_type TEXT,
  score NUMERIC(8,4),
  explanation TEXT,
  model_version TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- STAGING TABLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS canonical.stg_institution_candidates (
  stg_id BIGSERIAL PRIMARY KEY,
  source_table TEXT NOT NULL,
  source_pk TEXT NOT NULL,
  source_tier canonical.source_tier NOT NULL,
  source_priority SMALLINT NOT NULL CHECK (source_priority BETWEEN 1 AND 6),
  source_timestamp TIMESTAMPTZ,
  payload JSONB NOT NULL,
  canonical_name TEXT,
  normalized_name TEXT,
  short_name TEXT,
  website TEXT,
  website_domain TEXT,
  country_code TEXT,
  region_code TEXT,
  state_region TEXT,
  city TEXT,
  address TEXT,
  postal_code TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  institution_type TEXT,
  control_type TEXT,
  established_year INTEGER,
  external_ids JSONB NOT NULL DEFAULT canonical.base_external_ids(),
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_stg_source UNIQUE (source_table, source_pk)
);

CREATE TABLE IF NOT EXISTS canonical.stg_institution_matches (
  stg_id BIGINT NOT NULL REFERENCES canonical.stg_institution_candidates(stg_id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  match_method TEXT NOT NULL,
  match_score NUMERIC(8,4) NOT NULL,
  priority_rank SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (stg_id, institution_id, match_method)
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_inst_country_region ON canonical.institutions(country_code, region_code);
CREATE INDEX IF NOT EXISTS idx_inst_updated ON canonical.institutions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inst_name_trgm ON canonical.institutions USING gin (normalized_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_inst_slug_btree ON canonical.institutions(slug);
CREATE INDEX IF NOT EXISTS idx_inst_domain_expr ON canonical.institutions((canonical.extract_domain(website)));
CREATE INDEX IF NOT EXISTS idx_inst_metadata_gin ON canonical.institutions USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_inst_external_ids_gin ON canonical.institutions USING gin (canonical_external_ids jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_alias_normalized_trgm ON canonical.institution_aliases USING gin (normalized_alias gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_identity_map_institution ON canonical.institution_identity_map(institution_id);
CREATE INDEX IF NOT EXISTS idx_identity_map_match_method ON canonical.institution_identity_map(match_method);
CREATE INDEX IF NOT EXISTS idx_sources_priority ON canonical.institution_sources(source_priority, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admissions_institution_year ON canonical.institution_admissions(institution_id, data_year DESC);
CREATE INDEX IF NOT EXISTS idx_financials_institution_year ON canonical.institution_financials(institution_id, data_year DESC);
CREATE INDEX IF NOT EXISTS idx_rankings_institution_year ON canonical.institution_rankings(institution_id, ranking_year DESC);
CREATE INDEX IF NOT EXISTS idx_outcomes_institution_year ON canonical.institution_outcomes(institution_id, data_year DESC);
CREATE INDEX IF NOT EXISTS idx_programs_institution ON canonical.institution_programs(institution_id);
CREATE INDEX IF NOT EXISTS idx_programs_name_trgm ON canonical.institution_programs USING gin (normalized_program_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_deadlines_institution_date ON canonical.institution_deadlines(institution_id, deadline_date);
CREATE INDEX IF NOT EXISTS idx_demographics_institution_year ON canonical.institution_demographics(institution_id, data_year DESC);
CREATE INDEX IF NOT EXISTS idx_requirements_institution ON canonical.institution_requirements(institution_id, requirement_category);
CREATE INDEX IF NOT EXISTS idx_statistics_namespace ON canonical.institution_statistics(stats_namespace, stats_year);

CREATE INDEX IF NOT EXISTS idx_search_index_doc ON canonical.institution_search_index USING gin (search_document);
CREATE INDEX IF NOT EXISTS idx_search_index_autocomplete_trgm ON canonical.institution_search_index USING gin (autocomplete_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_search_index_tokens_gin ON canonical.institution_search_index USING gin (search_tokens);

CREATE INDEX IF NOT EXISTS idx_embeddings_model ON canonical.institution_embeddings(model_name);
CREATE INDEX IF NOT EXISTS idx_completeness_overall ON canonical.institution_completeness(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_quality_final ON canonical.institution_quality_scores(final_quality_score DESC);

CREATE INDEX IF NOT EXISTS idx_stg_candidates_name ON canonical.stg_institution_candidates(normalized_name);
CREATE INDEX IF NOT EXISTS idx_stg_candidates_domain ON canonical.stg_institution_candidates(website_domain);
CREATE INDEX IF NOT EXISTS idx_stg_candidates_ext_ids ON canonical.stg_institution_candidates USING gin (external_ids jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_canonical_applications_institution ON canonical.applications(institution_id);
CREATE INDEX IF NOT EXISTS idx_canonical_tasks_app ON canonical.application_tasks(application_id);
CREATE INDEX IF NOT EXISTS idx_canonical_timeline_date ON canonical.timeline_events(event_date);
CREATE INDEX IF NOT EXISTS idx_canonical_recommendations_user ON canonical.recommendations(user_id);

-- ============================================================================
-- ETL / DEDUP ENGINE FUNCTIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION canonical.ingest_source_table(p_table_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_tbl REGCLASS;
  v_sql TEXT;
BEGIN
  v_tbl := to_regclass(p_table_name);
  IF v_tbl IS NULL THEN
    RETURN;
  END IF;

  v_sql := format($q$
    INSERT INTO canonical.stg_institution_candidates (
      source_table,
      source_pk,
      source_tier,
      source_priority,
      source_timestamp,
      payload,
      canonical_name,
      normalized_name,
      short_name,
      website,
      website_domain,
      country_code,
      region_code,
      state_region,
      city,
      address,
      postal_code,
      latitude,
      longitude,
      institution_type,
      control_type,
      established_year,
      external_ids,
      aliases
    )
    SELECT
      %L,
      coalesce(nullif(j.payload->>'id',''), md5(j.payload::text)),
      canonical.resolve_source_tier(%L, j.payload),
      canonical.source_priority_from_tier(canonical.resolve_source_tier(%L, j.payload)),
      canonical.safe_timestamptz(
        coalesce(j.payload->>'updated_at', j.payload->>'last_updated', j.payload->>'created_at')
      ),
      j.payload,
      nullif(trim(coalesce(
        j.payload->>'canonical_name',
        j.payload->>'name',
        j.payload->>'college_name',
        j.payload->>'institution_name',
        j.payload->>'university_name'
      )), ''),
      canonical.normalize_institution_name(coalesce(
        j.payload->>'canonical_name',
        j.payload->>'name',
        j.payload->>'college_name',
        j.payload->>'institution_name',
        j.payload->>'university_name'
      )),
      nullif(trim(coalesce(j.payload->>'short_name', j.payload->>'abbreviation')), ''),
      canonical.normalize_url(coalesce(j.payload->>'website', j.payload->>'website_url', j.payload->>'official_website')),
      canonical.extract_domain(coalesce(j.payload->>'website', j.payload->>'website_url', j.payload->>'official_website')),
      canonical.normalize_country_code(coalesce(j.payload->>'country_code', j.payload->>'country', j.payload->>'location_country')),
      canonical.normalize_region_code(
        canonical.normalize_country_code(coalesce(j.payload->>'country_code', j.payload->>'country', j.payload->>'location_country')),
        coalesce(j.payload->>'region_code', j.payload->>'state_region', j.payload->>'state', j.payload->>'location_state')
      ),
      nullif(trim(coalesce(j.payload->>'state_region', j.payload->>'state', j.payload->>'location_state')), ''),
      nullif(trim(coalesce(j.payload->>'city', j.payload->>'location_city')), ''),
      nullif(trim(coalesce(j.payload->>'address', j.payload->>'street_address')), ''),
      nullif(trim(coalesce(j.payload->>'postal_code', j.payload->>'zip', j.payload->>'zipcode')), ''),
      CASE
        WHEN coalesce(j.payload->>'latitude', '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
          THEN (j.payload->>'latitude')::double precision
        ELSE NULL
      END,
      CASE
        WHEN coalesce(j.payload->>'longitude', '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
          THEN (j.payload->>'longitude')::double precision
        ELSE NULL
      END,
      nullif(trim(coalesce(j.payload->>'institution_type', j.payload->>'type')), ''),
      nullif(trim(coalesce(j.payload->>'control_type', j.payload->>'control')), ''),
      CASE
        WHEN coalesce(j.payload->>'established_year', '') ~ '^[0-9]{4}$'
          THEN (j.payload->>'established_year')::integer
        ELSE NULL
      END,
      canonical.normalized_external_ids(j.payload),
      coalesce(
        CASE
          WHEN jsonb_typeof(j.payload->'aliases') = 'array' THEN j.payload->'aliases'
          WHEN jsonb_typeof(j.payload->'alternate_names') = 'array' THEN j.payload->'alternate_names'
          ELSE '[]'::jsonb
        END,
        '[]'::jsonb
      )
    FROM (
      SELECT to_jsonb(src) AS payload
      FROM %s AS src
    ) AS j
    WHERE nullif(trim(coalesce(
      j.payload->>'canonical_name',
      j.payload->>'name',
      j.payload->>'college_name',
      j.payload->>'institution_name',
      j.payload->>'university_name'
    )), '') IS NOT NULL
    ON CONFLICT (source_table, source_pk)
    DO UPDATE SET
      source_tier = EXCLUDED.source_tier,
      source_priority = EXCLUDED.source_priority,
      source_timestamp = EXCLUDED.source_timestamp,
      payload = EXCLUDED.payload,
      canonical_name = EXCLUDED.canonical_name,
      normalized_name = EXCLUDED.normalized_name,
      short_name = EXCLUDED.short_name,
      website = EXCLUDED.website,
      website_domain = EXCLUDED.website_domain,
      country_code = EXCLUDED.country_code,
      region_code = EXCLUDED.region_code,
      state_region = EXCLUDED.state_region,
      city = EXCLUDED.city,
      address = EXCLUDED.address,
      postal_code = EXCLUDED.postal_code,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      institution_type = EXCLUDED.institution_type,
      control_type = EXCLUDED.control_type,
      established_year = EXCLUDED.established_year,
      external_ids = EXCLUDED.external_ids,
      aliases = EXCLUDED.aliases,
      created_at = NOW();
  $q$, p_table_name, p_table_name, p_table_name, v_tbl::TEXT);

  EXECUTE v_sql;
END;
$$;

CREATE OR REPLACE FUNCTION canonical.rebuild_staging_institution_candidates()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_source TEXT;
BEGIN
  TRUNCATE TABLE canonical.stg_institution_matches;
  TRUNCATE TABLE canonical.stg_institution_candidates RESTART IDENTITY;

  FOREACH v_source IN ARRAY ARRAY[
    'public.colleges',
    'public.colleges_comprehensive',
    'public.colleges_legacy',
    'public.college_admissions',
    'public.academic_details',
    'public.academic_outcomes',
    'public.college_financial_data',
    'public.college_financial_aid',
    'public.college_majors',
    'public.college_programs',
    'public.campus_life',
    'public.application_deadlines',
    'public.college_deadlines',
    'public.deadlines',
    'public.student_demographics',
    'public.career_outcomes_detail',
    'public.scholarships',
    'public.scholarships_new',
    'public.grants',
    'public.college_rankings'
  ]
  LOOP
    PERFORM canonical.ingest_source_table(v_source);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION canonical.find_best_match(
  p_candidate canonical.stg_institution_candidates
)
RETURNS TABLE (
  institution_id UUID,
  match_method TEXT,
  match_score NUMERIC,
  priority_rank SMALLINT
)
LANGUAGE sql
STABLE
AS $$
  WITH ranked AS (
    -- 1) external IDs
    SELECT i.id, 'external_ids'::TEXT AS method,
           1.0000::NUMERIC AS score, 1::SMALLINT AS priority_rank
    FROM canonical.institutions i
    WHERE canonical.external_ids_overlap(i.canonical_external_ids, p_candidate.external_ids)

    UNION ALL

    -- 2) official domain
    SELECT i.id, 'official_domain',
           0.9900,
           2
    FROM canonical.institutions i
    WHERE p_candidate.website_domain IS NOT NULL
      AND canonical.extract_domain(i.website) = p_candidate.website_domain

    UNION ALL

    -- 3) normalized institution name
    SELECT i.id, 'normalized_name',
           0.9700,
           3
    FROM canonical.institutions i
    WHERE p_candidate.normalized_name IS NOT NULL
      AND i.normalized_name = p_candidate.normalized_name
      AND i.country_code = p_candidate.country_code

    UNION ALL

    -- 4) city + state similarity
    SELECT i.id, 'city_state_similarity',
           similarity(
             canonical.normalize_text(coalesce(i.city,'') || ' ' || coalesce(i.state_region,'')),
             canonical.normalize_text(coalesce(p_candidate.city,'') || ' ' || coalesce(p_candidate.state_region,''))
           )::NUMERIC,
           4
    FROM canonical.institutions i
    WHERE p_candidate.city IS NOT NULL
      AND p_candidate.state_region IS NOT NULL
      AND i.country_code = p_candidate.country_code
      AND similarity(
            canonical.normalize_text(coalesce(i.city,'') || ' ' || coalesce(i.state_region,'')),
            canonical.normalize_text(coalesce(p_candidate.city,'') || ' ' || coalesce(p_candidate.state_region,''))
          ) >= 0.82

    UNION ALL

    -- 5) coordinate similarity
    SELECT i.id, 'coordinate_similarity',
           0.9000,
           5
    FROM canonical.institutions i
    WHERE i.latitude IS NOT NULL AND i.longitude IS NOT NULL
      AND p_candidate.latitude IS NOT NULL AND p_candidate.longitude IS NOT NULL
      AND abs(i.latitude - p_candidate.latitude) <= 0.02
      AND abs(i.longitude - p_candidate.longitude) <= 0.02

    UNION ALL

    -- 6) alias match
    SELECT ia.institution_id, 'alias_match',
           0.8800,
           6
    FROM canonical.institution_aliases ia
    WHERE ia.normalized_alias = p_candidate.normalized_name
  )
  SELECT r.id, r.method, r.score, r.priority_rank
  FROM ranked r
  ORDER BY r.priority_rank ASC, r.score DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION canonical.merge_staging_candidates()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  rec canonical.stg_institution_candidates%ROWTYPE;
  m RECORD;
  v_institution_id UUID;
  v_existing canonical.institutions%ROWTYPE;
  v_can_overwrite BOOLEAN;
  v_slug_base TEXT;
BEGIN
  FOR rec IN
    SELECT *
    FROM canonical.stg_institution_candidates
    ORDER BY source_priority ASC, coalesce(source_timestamp, created_at) DESC, stg_id ASC
  LOOP
    SELECT * INTO m
    FROM canonical.find_best_match(rec)
    LIMIT 1;

    IF m.institution_id IS NULL THEN
      v_institution_id := gen_random_uuid();
      v_slug_base := coalesce(canonical.make_slug(rec.canonical_name), 'institution');

      INSERT INTO canonical.institutions (
        id,
        canonical_name,
        normalized_name,
        slug,
        aliases,
        short_name,
        country_code,
        region_code,
        state_region,
        city,
        address,
        postal_code,
        latitude,
        longitude,
        institution_type,
        control_type,
        established_year,
        website,
        verification_status,
        source_priority,
        canonical_external_ids,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        v_institution_id,
        rec.canonical_name,
        coalesce(rec.normalized_name, canonical.normalize_institution_name(rec.canonical_name), canonical.normalize_text(rec.canonical_name)),
        v_slug_base || '-' || replace(v_institution_id::text, '-', ''),
        coalesce(rec.aliases, '[]'::jsonb),
        rec.short_name,
        coalesce(rec.country_code, 'ZZ'),
        rec.region_code,
        rec.state_region,
        rec.city,
        rec.address,
        rec.postal_code,
        rec.latitude,
        rec.longitude,
        rec.institution_type,
        rec.control_type,
        rec.established_year,
        rec.website,
        CASE WHEN rec.source_priority = 1 THEN 'government_verified' ELSE 'unverified' END,
        rec.source_priority,
        rec.external_ids,
        rec.payload,
        NOW(),
        NOW()
      );

      INSERT INTO canonical.institution_metadata (institution_id)
      VALUES (v_institution_id)
      ON CONFLICT (institution_id) DO NOTHING;

      INSERT INTO canonical.stg_institution_matches (stg_id, institution_id, match_method, match_score, priority_rank)
      VALUES (rec.stg_id, v_institution_id, 'new_institution', 1.0, 0)
      ON CONFLICT DO NOTHING;
    ELSE
      v_institution_id := m.institution_id;

      SELECT * INTO v_existing
      FROM canonical.institutions
      WHERE id = v_institution_id;

      v_can_overwrite := (
        rec.source_priority < v_existing.source_priority
        OR (
          rec.source_priority = v_existing.source_priority
          AND coalesce(rec.source_timestamp, now()) >= v_existing.updated_at
        )
      );

      UPDATE canonical.institutions i
      SET
        canonical_name = coalesce(CASE WHEN v_can_overwrite THEN rec.canonical_name END, i.canonical_name, rec.canonical_name),
        normalized_name = coalesce(CASE WHEN v_can_overwrite THEN rec.normalized_name END, i.normalized_name, rec.normalized_name),
        aliases = (
          SELECT coalesce(jsonb_agg(DISTINCT x), '[]'::jsonb)
          FROM (
            SELECT jsonb_array_elements_text(coalesce(i.aliases, '[]'::jsonb))::TEXT AS x
            UNION ALL
            SELECT jsonb_array_elements_text(coalesce(rec.aliases, '[]'::jsonb))::TEXT AS x
          ) q
        ),
        short_name = coalesce(CASE WHEN v_can_overwrite THEN rec.short_name END, i.short_name, rec.short_name),
        country_code = coalesce(i.country_code, rec.country_code),
        region_code = coalesce(CASE WHEN v_can_overwrite THEN rec.region_code END, i.region_code, rec.region_code),
        state_region = coalesce(CASE WHEN v_can_overwrite THEN rec.state_region END, i.state_region, rec.state_region),
        city = coalesce(CASE WHEN v_can_overwrite THEN rec.city END, i.city, rec.city),
        address = coalesce(CASE WHEN v_can_overwrite THEN rec.address END, i.address, rec.address),
        postal_code = coalesce(CASE WHEN v_can_overwrite THEN rec.postal_code END, i.postal_code, rec.postal_code),
        latitude = coalesce(CASE WHEN v_can_overwrite THEN rec.latitude END, i.latitude, rec.latitude),
        longitude = coalesce(CASE WHEN v_can_overwrite THEN rec.longitude END, i.longitude, rec.longitude),
        institution_type = coalesce(CASE WHEN v_can_overwrite THEN rec.institution_type END, i.institution_type, rec.institution_type),
        control_type = coalesce(CASE WHEN v_can_overwrite THEN rec.control_type END, i.control_type, rec.control_type),
        established_year = coalesce(CASE WHEN v_can_overwrite THEN rec.established_year END, i.established_year, rec.established_year),
        website = coalesce(CASE WHEN v_can_overwrite THEN rec.website END, i.website, rec.website),
        verification_status = CASE
          WHEN rec.source_priority = 1 THEN 'government_verified'::canonical.verification_status
          WHEN rec.source_priority <= i.source_priority THEN i.verification_status
          ELSE i.verification_status
        END,
        source_priority = LEAST(i.source_priority, rec.source_priority),
        canonical_external_ids = canonical.merge_external_ids(i.canonical_external_ids, rec.external_ids),
        metadata = i.metadata || rec.payload,
        updated_at = NOW()
      WHERE i.id = v_institution_id;

      INSERT INTO canonical.stg_institution_matches (stg_id, institution_id, match_method, match_score, priority_rank)
      VALUES (rec.stg_id, v_institution_id, coalesce(m.match_method, 'fallback'), coalesce(m.match_score, 0.5), coalesce(m.priority_rank, 7))
      ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO canonical.institution_identity_map (
      institution_id,
      source_table,
      source_pk,
      source_tier,
      source_priority,
      match_method,
      match_score,
      raw_payload,
      updated_at
    ) VALUES (
      v_institution_id,
      rec.source_table,
      rec.source_pk,
      rec.source_tier,
      rec.source_priority,
      coalesce(m.match_method, 'new_institution'),
      coalesce(m.match_score, 1),
      rec.payload,
      NOW()
    )
    ON CONFLICT (source_table, source_pk)
    DO UPDATE SET
      institution_id = EXCLUDED.institution_id,
      source_tier = EXCLUDED.source_tier,
      source_priority = EXCLUDED.source_priority,
      match_method = EXCLUDED.match_method,
      match_score = EXCLUDED.match_score,
      raw_payload = EXCLUDED.raw_payload,
      updated_at = NOW();

    INSERT INTO canonical.institution_sources (
      institution_id,
      source_table,
      source_pk,
      source_name,
      source_tier,
      source_priority,
      source_url,
      source_payload,
      observed_at,
      verified_at
    ) VALUES (
      v_institution_id,
      rec.source_table,
      rec.source_pk,
      nullif(rec.payload->>'source', ''),
      rec.source_tier,
      rec.source_priority,
      coalesce(rec.payload->>'source_url', rec.payload->>'url', rec.website),
      rec.payload,
      rec.source_timestamp,
      CASE WHEN rec.source_priority <= 3 THEN coalesce(rec.source_timestamp, now()) ELSE NULL END
    )
    ON CONFLICT (institution_id, source_table, source_pk_key)
    DO UPDATE SET
      source_tier = EXCLUDED.source_tier,
      source_priority = EXCLUDED.source_priority,
      source_url = EXCLUDED.source_url,
      source_payload = EXCLUDED.source_payload,
      observed_at = EXCLUDED.observed_at,
      verified_at = coalesce(EXCLUDED.verified_at, canonical.institution_sources.verified_at),
      created_at = canonical.institution_sources.created_at;

    INSERT INTO canonical.institution_aliases (
      institution_id,
      alias,
      normalized_alias,
      alias_type,
      source_table,
      source_pk
    )
    SELECT
      v_institution_id,
      alias_txt,
      canonical.normalize_institution_name(alias_txt),
      'known_alias',
      rec.source_table,
      rec.source_pk
    FROM (
      SELECT DISTINCT jsonb_array_elements_text(coalesce(rec.aliases, '[]'::jsonb)) AS alias_txt
      UNION ALL
      SELECT rec.canonical_name
      UNION ALL
      SELECT rec.short_name
    ) AS aliases
    WHERE alias_txt IS NOT NULL
      AND trim(alias_txt) <> ''
    ON CONFLICT (institution_id, normalized_alias) DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION canonical.source_rows_with_institution(p_table_name TEXT)
RETURNS TABLE (
  institution_id UUID,
  source_pk TEXT,
  payload JSONB
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tbl REGCLASS;
  v_sql TEXT;
BEGIN
  v_tbl := to_regclass(p_table_name);
  IF v_tbl IS NULL THEN
    RETURN;
  END IF;

  v_sql := format($q$
    SELECT
      m.institution_id,
      coalesce(nullif(j.payload->>'id',''), md5(j.payload::text)) AS source_pk,
      j.payload
    FROM (
      SELECT to_jsonb(src) AS payload
      FROM %s AS src
    ) j
    JOIN canonical.institution_identity_map m
      ON m.source_table = %L
     AND m.source_pk = coalesce(nullif(j.payload->>'id',''), md5(j.payload::text))
  $q$, v_tbl::TEXT, p_table_name);

  RETURN QUERY EXECUTE v_sql;
END;
$$;

CREATE OR REPLACE FUNCTION canonical.populate_domain_tables()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  TRUNCATE TABLE
    canonical.institution_admissions,
    canonical.institution_financials,
    canonical.institution_rankings,
    canonical.institution_outcomes,
    canonical.institution_programs,
    canonical.institution_deadlines,
    canonical.institution_demographics,
    canonical.institution_campus_life,
    canonical.institution_requirements,
    canonical.institution_statistics,
    canonical.us_admissions_profile,
    canonical.india_admissions_profile,
    canonical.uk_admissions_profile,
    canonical.eu_admissions_profile,
    canonical.us_financial_aid,
    canonical.india_financial_aid,
    canonical.uk_financial_support,
    canonical.applications,
    canonical.application_tasks,
    canonical.timeline_events,
    canonical.recommendations
  RESTART IDENTITY;

  -- Admissions from legacy sources
  INSERT INTO canonical.institution_admissions (
    institution_id,
    data_year,
    admissions_cycle,
    acceptance_rate,
    early_decision_rate,
    early_action_rate,
    regular_decision_rate,
    waitlist_rate,
    transfer_acceptance_rate,
    yield_rate,
    application_volume,
    admit_volume,
    enrollment_volume,
    international_accept_rate,
    in_state_accept_rate,
    out_state_accept_rate,
    test_optional,
    sat_25,
    sat_50,
    sat_75,
    act_25,
    act_50,
    act_75,
    exam_requirements,
    source_attribution,
    raw_payload
  )
  SELECT
    s.institution_id,
    nullif(s.payload->>'year','')::integer,
    coalesce(nullif(s.payload->>'admissions_cycle',''), 'regular'),
    nullif(s.payload->>'acceptance_rate','')::numeric,
    nullif(s.payload->>'early_decision_rate','')::numeric,
    nullif(s.payload->>'early_action_rate','')::numeric,
    nullif(s.payload->>'regular_decision_rate','')::numeric,
    nullif(s.payload->>'waitlist_rate','')::numeric,
    nullif(s.payload->>'transfer_acceptance_rate','')::numeric,
    nullif(s.payload->>'yield_rate','')::numeric,
    nullif(s.payload->>'application_volume','')::integer,
    nullif(s.payload->>'admit_volume','')::integer,
    nullif(s.payload->>'enrollment_volume','')::integer,
    nullif(s.payload->>'international_accept_rate','')::numeric,
    nullif(s.payload->>'in_state_accept_rate','')::numeric,
    nullif(s.payload->>'out_state_accept_rate','')::numeric,
    CASE
      WHEN lower(coalesce(s.payload->>'test_optional_flag', s.payload->>'test_optional')) IN ('1','true','t','yes') THEN TRUE
      WHEN lower(coalesce(s.payload->>'test_optional_flag', s.payload->>'test_optional')) IN ('0','false','f','no') THEN FALSE
      ELSE NULL
    END,
    nullif(s.payload->>'sat_25','')::integer,
    nullif(s.payload->>'sat_50','')::integer,
    nullif(s.payload->>'sat_75','')::integer,
    nullif(s.payload->>'act_25','')::integer,
    nullif(s.payload->>'act_50','')::integer,
    nullif(s.payload->>'act_75','')::integer,
    jsonb_build_object(
      'sat', nullif(s.payload->>'sat_range',''),
      'act', nullif(s.payload->>'act_range',''),
      'policy', nullif(s.payload->>'test_policy','')
    ),
    jsonb_build_object('source_table', 'public.college_admissions', 'source_pk', s.source_pk),
    s.payload
  FROM canonical.source_rows_with_institution('public.college_admissions') s
  ON CONFLICT (institution_id, data_year, admissions_cycle)
  DO UPDATE SET
    acceptance_rate = coalesce(EXCLUDED.acceptance_rate, canonical.institution_admissions.acceptance_rate),
    early_decision_rate = coalesce(EXCLUDED.early_decision_rate, canonical.institution_admissions.early_decision_rate),
    early_action_rate = coalesce(EXCLUDED.early_action_rate, canonical.institution_admissions.early_action_rate),
    regular_decision_rate = coalesce(EXCLUDED.regular_decision_rate, canonical.institution_admissions.regular_decision_rate),
    yield_rate = coalesce(EXCLUDED.yield_rate, canonical.institution_admissions.yield_rate),
    application_volume = coalesce(EXCLUDED.application_volume, canonical.institution_admissions.application_volume),
    raw_payload = canonical.institution_admissions.raw_payload || EXCLUDED.raw_payload,
    updated_at = NOW();

  INSERT INTO canonical.institution_admissions (
    institution_id,
    data_year,
    admissions_cycle,
    acceptance_rate,
    yield_rate,
    sat_50,
    act_50,
    source_attribution,
    raw_payload
  )
  SELECT
    s.institution_id,
    nullif(s.payload->>'year','')::integer,
    'regular',
    nullif(s.payload->>'acceptance_rate','')::numeric,
    nullif(s.payload->>'yield_rate','')::numeric,
    nullif(s.payload->>'median_sat','')::integer,
    nullif(s.payload->>'median_act','')::integer,
    jsonb_build_object('source_table', 'public.college_admissions_stats', 'source_pk', s.source_pk),
    s.payload
  FROM canonical.source_rows_with_institution('public.college_admissions_stats') s
  ON CONFLICT (institution_id, data_year, admissions_cycle)
  DO UPDATE SET
    acceptance_rate = coalesce(EXCLUDED.acceptance_rate, canonical.institution_admissions.acceptance_rate),
    sat_50 = coalesce(EXCLUDED.sat_50, canonical.institution_admissions.sat_50),
    act_50 = coalesce(EXCLUDED.act_50, canonical.institution_admissions.act_50),
    raw_payload = canonical.institution_admissions.raw_payload || EXCLUDED.raw_payload,
    updated_at = NOW();

  -- Financials
  INSERT INTO canonical.institution_financials (
    institution_id,
    data_year,
    tuition_in_state,
    tuition_out_state,
    tuition_international,
    cost_of_attendance,
    avg_financial_aid,
    percent_receiving_aid,
    avg_debt,
    net_price_low_income,
    net_price_mid_income,
    net_price_high_income,
    merit_scholarship_flag,
    need_blind_flag,
    source_attribution,
    raw_payload
  )
  SELECT
    s.institution_id,
    nullif(s.payload->>'year','')::integer,
    nullif(s.payload->>'tuition_in_state','')::numeric,
    nullif(s.payload->>'tuition_out_state','')::numeric,
    nullif(s.payload->>'tuition_international','')::numeric,
    nullif(s.payload->>'cost_of_attendance','')::numeric,
    nullif(s.payload->>'avg_financial_aid','')::numeric,
    nullif(s.payload->>'percent_receiving_aid','')::numeric,
    nullif(s.payload->>'avg_debt','')::numeric,
    nullif(s.payload->>'net_price_low_income','')::numeric,
    nullif(s.payload->>'net_price_mid_income','')::numeric,
    nullif(s.payload->>'net_price_high_income','')::numeric,
    CASE WHEN lower(coalesce(s.payload->>'merit_scholarship_flag','')) IN ('1','true','t','yes') THEN TRUE
         WHEN lower(coalesce(s.payload->>'merit_scholarship_flag','')) IN ('0','false','f','no') THEN FALSE
         ELSE NULL END,
    CASE WHEN lower(coalesce(s.payload->>'need_blind_flag','')) IN ('1','true','t','yes') THEN TRUE
         WHEN lower(coalesce(s.payload->>'need_blind_flag','')) IN ('0','false','f','no') THEN FALSE
         ELSE NULL END,
    jsonb_build_object('source_table', 'public.college_financial_data', 'source_pk', s.source_pk),
    s.payload
  FROM canonical.source_rows_with_institution('public.college_financial_data') s
  ON CONFLICT (institution_id, data_year_key, academic_year_key)
  DO UPDATE SET
    tuition_in_state = coalesce(EXCLUDED.tuition_in_state, canonical.institution_financials.tuition_in_state),
    tuition_out_state = coalesce(EXCLUDED.tuition_out_state, canonical.institution_financials.tuition_out_state),
    tuition_international = coalesce(EXCLUDED.tuition_international, canonical.institution_financials.tuition_international),
    avg_financial_aid = coalesce(EXCLUDED.avg_financial_aid, canonical.institution_financials.avg_financial_aid),
    raw_payload = canonical.institution_financials.raw_payload || EXCLUDED.raw_payload,
    updated_at = NOW();

  INSERT INTO canonical.institution_financials (
    institution_id,
    academic_year,
    avg_financial_aid,
    net_price_low_income,
    net_price_mid_income,
    net_price_high_income,
    percent_receiving_aid,
    no_loan_policy,
    source_attribution,
    raw_payload
  )
  SELECT
    s.institution_id,
    nullif(s.payload->>'academic_year',''),
    nullif(s.payload->>'avg_financial_aid_package','')::numeric,
    nullif(s.payload->>'avg_net_price_0_30k','')::numeric,
    nullif(s.payload->>'avg_net_price_30_48k','')::numeric,
    nullif(s.payload->>'avg_net_price_48_75k','')::numeric,
    nullif(s.payload->>'percent_receiving_aid','')::numeric,
    CASE WHEN lower(coalesce(s.payload->>'no_loan_policy','')) IN ('1','true','t','yes') THEN TRUE
         WHEN lower(coalesce(s.payload->>'no_loan_policy','')) IN ('0','false','f','no') THEN FALSE
         ELSE NULL END,
    jsonb_build_object('source_table', 'public.college_financial_aid', 'source_pk', s.source_pk),
    s.payload
  FROM canonical.source_rows_with_institution('public.college_financial_aid') s
  ON CONFLICT (institution_id, data_year_key, academic_year_key)
  DO UPDATE SET
    avg_financial_aid = coalesce(EXCLUDED.avg_financial_aid, canonical.institution_financials.avg_financial_aid),
    percent_receiving_aid = coalesce(EXCLUDED.percent_receiving_aid, canonical.institution_financials.percent_receiving_aid),
    raw_payload = canonical.institution_financials.raw_payload || EXCLUDED.raw_payload,
    updated_at = NOW();

  -- Rankings
  INSERT INTO canonical.institution_rankings (
    institution_id,
    ranking_year,
    ranking_body,
    national_rank,
    global_rank,
    subject_rank,
    ranking_score,
    source_attribution,
    raw_payload
  )
  SELECT
    s.institution_id,
    nullif(s.payload->>'year','')::integer,
    coalesce(nullif(s.payload->>'ranking_body',''), 'unknown'),
    nullif(s.payload->>'national_rank','')::integer,
    nullif(s.payload->>'global_rank','')::integer,
    nullif(s.payload->>'subject_rank','')::integer,
    nullif(s.payload->>'ranking_score','')::numeric,
    jsonb_build_object('source_table', 'public.college_rankings', 'source_pk', s.source_pk),
    s.payload
  FROM canonical.source_rows_with_institution('public.college_rankings') s
  ON CONFLICT (institution_id, ranking_year_key, ranking_body)
  DO UPDATE SET
    national_rank = coalesce(EXCLUDED.national_rank, canonical.institution_rankings.national_rank),
    global_rank = coalesce(EXCLUDED.global_rank, canonical.institution_rankings.global_rank),
    subject_rank = coalesce(EXCLUDED.subject_rank, canonical.institution_rankings.subject_rank),
    ranking_score = coalesce(EXCLUDED.ranking_score, canonical.institution_rankings.ranking_score),
    raw_payload = canonical.institution_rankings.raw_payload || EXCLUDED.raw_payload;

  -- Outcomes
  INSERT INTO canonical.institution_outcomes (
    institution_id,
    data_year,
    graduation_rate_4yr,
    graduation_rate_6yr,
    retention_rate,
    employment_rate,
    median_start_salary,
    median_mid_career_salary,
    grad_school_rate,
    internship_rate,
    source_attribution,
    raw_payload
  )
  SELECT
    s.institution_id,
    nullif(s.payload->>'year','')::integer,
    nullif(s.payload->>'graduation_rate_4yr','')::numeric,
    nullif(s.payload->>'graduation_rate_6yr','')::numeric,
    nullif(s.payload->>'retention_rate','')::numeric,
    nullif(s.payload->>'employment_rate','')::numeric,
    nullif(s.payload->>'median_start_salary','')::numeric,
    nullif(s.payload->>'median_mid_career_salary','')::numeric,
    nullif(s.payload->>'grad_school_rate','')::numeric,
    nullif(s.payload->>'internship_rate','')::numeric,
    jsonb_build_object('source_table', 'public.academic_outcomes', 'source_pk', s.source_pk),
    s.payload
  FROM canonical.source_rows_with_institution('public.academic_outcomes') s
  ON CONFLICT (institution_id, data_year_key)
  DO UPDATE SET
    graduation_rate_4yr = coalesce(EXCLUDED.graduation_rate_4yr, canonical.institution_outcomes.graduation_rate_4yr),
    graduation_rate_6yr = coalesce(EXCLUDED.graduation_rate_6yr, canonical.institution_outcomes.graduation_rate_6yr),
    retention_rate = coalesce(EXCLUDED.retention_rate, canonical.institution_outcomes.retention_rate),
    employment_rate = coalesce(EXCLUDED.employment_rate, canonical.institution_outcomes.employment_rate),
    raw_payload = canonical.institution_outcomes.raw_payload || EXCLUDED.raw_payload,
    updated_at = NOW();

  INSERT INTO canonical.institution_statistics (
    institution_id,
    stats_namespace,
    stats_year,
    stats_payload,
    source_attribution
  )
  SELECT
    s.institution_id,
    'career_outcomes_detail',
    nullif(s.payload->>'year','')::integer,
    s.payload,
    jsonb_build_object('source_table', 'public.career_outcomes_detail', 'source_pk', s.source_pk)
  FROM canonical.source_rows_with_institution('public.career_outcomes_detail') s
  ON CONFLICT (institution_id, stats_namespace, stats_year_key)
  DO UPDATE SET
    stats_payload = canonical.institution_statistics.stats_payload || EXCLUDED.stats_payload,
    updated_at = NOW();

  -- Programs
  INSERT INTO canonical.institution_programs (
    institution_id,
    program_name,
    normalized_program_name,
    degree_type,
    enrollment,
    acceptance_rate,
    metadata,
    source_attribution,
    raw_payload
  )
  SELECT
    s.institution_id,
    coalesce(nullif(s.payload->>'program_name',''), nullif(s.payload->>'major_name',''), 'Unknown Program'),
    canonical.normalize_text(coalesce(nullif(s.payload->>'program_name',''), nullif(s.payload->>'major_name',''), 'Unknown Program')),
    nullif(s.payload->>'degree_type',''),
    nullif(s.payload->>'enrollment','')::integer,
    nullif(s.payload->>'acceptance_rate','')::numeric,
    jsonb_build_object(
      'ranking_score', s.payload->>'ranking_score',
      'coop_available', s.payload->>'coop_available',
      'accreditation_status', s.payload->>'accreditation_status'
    ),
    jsonb_build_object('source_table', 'public.college_programs', 'source_pk', s.source_pk),
    s.payload
  FROM canonical.source_rows_with_institution('public.college_programs') s
  ON CONFLICT (institution_id, normalized_program_name, degree_type_key)
  DO UPDATE SET
    enrollment = coalesce(EXCLUDED.enrollment, canonical.institution_programs.enrollment),
    acceptance_rate = coalesce(EXCLUDED.acceptance_rate, canonical.institution_programs.acceptance_rate),
    metadata = canonical.institution_programs.metadata || EXCLUDED.metadata,
    raw_payload = canonical.institution_programs.raw_payload || EXCLUDED.raw_payload,
    updated_at = NOW();

  -- Deadlines from dedicated tables
  INSERT INTO canonical.institution_deadlines (
    institution_id,
    cycle_year,
    deadline_type,
    deadline_date,
    notification_date,
    is_binding,
    is_rolling,
    source_attribution,
    raw_payload
  )
  SELECT
    s.institution_id,
    nullif(s.payload->>'academic_year',''),
    coalesce(nullif(s.payload->>'deadline_type',''), 'regular_decision'),
    coalesce(
      nullif(s.payload->>'deadline_date','')::date,
      nullif(s.payload->>'regular_decision_deadline','')::date,
      nullif(s.payload->>'regular_decision_date','')::date
    ),
    coalesce(
      nullif(s.payload->>'notification_date','')::date,
      nullif(s.payload->>'regular_decision_notification','')::date
    ),
    CASE WHEN lower(coalesce(s.payload->>'is_binding','')) IN ('1','true','t','yes') THEN TRUE
         WHEN lower(coalesce(s.payload->>'is_binding','')) IN ('0','false','f','no') THEN FALSE
         ELSE NULL END,
    CASE WHEN lower(coalesce(s.payload->>'rolling_admission', s.payload->>'offers_rolling_admission')) IN ('1','true','t','yes') THEN TRUE
         WHEN lower(coalesce(s.payload->>'rolling_admission', s.payload->>'offers_rolling_admission')) IN ('0','false','f','no') THEN FALSE
         ELSE NULL END,
    jsonb_build_object('source_table', 'public.application_deadlines', 'source_pk', s.source_pk),
    s.payload
  FROM canonical.source_rows_with_institution('public.application_deadlines') s
  ON CONFLICT (institution_id, cycle_year_key, deadline_type, deadline_date_key)
  DO UPDATE SET
    notification_date = coalesce(EXCLUDED.notification_date, canonical.institution_deadlines.notification_date),
    raw_payload = canonical.institution_deadlines.raw_payload || EXCLUDED.raw_payload,
    updated_at = NOW();

  INSERT INTO canonical.institution_deadlines (
    institution_id,
    cycle_year,
    deadline_type,
    deadline_date,
    notification_date,
    is_binding,
    source_attribution,
    raw_payload
  )
  SELECT
    s.institution_id,
    nullif(s.payload->>'data_year',''),
    coalesce(nullif(s.payload->>'deadline_type',''), 'unknown'),
    nullif(s.payload->>'deadline_date','')::date,
    nullif(s.payload->>'notification_date','')::date,
    CASE WHEN lower(coalesce(s.payload->>'is_binding','')) IN ('1','true','t','yes') THEN TRUE
         WHEN lower(coalesce(s.payload->>'is_binding','')) IN ('0','false','f','no') THEN FALSE
         ELSE NULL END,
    jsonb_build_object('source_table', 'public.college_deadlines', 'source_pk', s.source_pk),
    s.payload
  FROM canonical.source_rows_with_institution('public.college_deadlines') s
  ON CONFLICT (institution_id, cycle_year_key, deadline_type, deadline_date_key)
  DO UPDATE SET
    notification_date = coalesce(EXCLUDED.notification_date, canonical.institution_deadlines.notification_date),
    raw_payload = canonical.institution_deadlines.raw_payload || EXCLUDED.raw_payload,
    updated_at = NOW();

  -- Demographics
  INSERT INTO canonical.institution_demographics (
    institution_id,
    data_year,
    percent_international,
    gender_ratio,
    ethnic_distribution,
    percent_first_gen,
    socioeconomic_index,
    geographic_diversity_index,
    legacy_percent,
    athlete_percent,
    transfer_percent,
    source_attribution,
    raw_payload
  )
  SELECT
    s.institution_id,
    nullif(s.payload->>'year','')::integer,
    nullif(s.payload->>'percent_international','')::numeric,
    nullif(s.payload->>'gender_ratio',''),
    coalesce(
      CASE WHEN jsonb_typeof(s.payload->'ethnic_distribution') = 'object' THEN s.payload->'ethnic_distribution' END,
      '{}'::jsonb
    ),
    nullif(s.payload->>'percent_first_gen','')::numeric,
    nullif(s.payload->>'socioeconomic_index','')::numeric,
    nullif(s.payload->>'geographic_diversity_index','')::numeric,
    nullif(s.payload->>'legacy_percent','')::numeric,
    nullif(s.payload->>'athlete_percent','')::numeric,
    nullif(s.payload->>'transfer_percent','')::numeric,
    jsonb_build_object('source_table', 'public.student_demographics', 'source_pk', s.source_pk),
    s.payload
  FROM canonical.source_rows_with_institution('public.student_demographics') s
  ON CONFLICT (institution_id, data_year_key)
  DO UPDATE SET
    percent_international = coalesce(EXCLUDED.percent_international, canonical.institution_demographics.percent_international),
    gender_ratio = coalesce(EXCLUDED.gender_ratio, canonical.institution_demographics.gender_ratio),
    raw_payload = canonical.institution_demographics.raw_payload || EXCLUDED.raw_payload,
    updated_at = NOW();

  -- Campus life
  INSERT INTO canonical.institution_campus_life (
    institution_id,
    housing_guarantee,
    campus_safety_score,
    cost_of_living_index,
    climate_zone,
    student_satisfaction_score,
    athletics_division,
    club_count,
    mental_health_rating,
    source_attribution,
    raw_payload
  )
  SELECT
    s.institution_id,
    nullif(s.payload->>'housing_guarantee',''),
    nullif(s.payload->>'campus_safety_score','')::numeric,
    nullif(s.payload->>'cost_of_living_index','')::numeric,
    nullif(s.payload->>'climate_zone',''),
    nullif(s.payload->>'student_satisfaction_score','')::numeric,
    nullif(s.payload->>'athletics_division',''),
    nullif(s.payload->>'club_count','')::integer,
    nullif(s.payload->>'mental_health_rating','')::numeric,
    jsonb_build_object('source_table', 'public.campus_life', 'source_pk', s.source_pk),
    s.payload
  FROM canonical.source_rows_with_institution('public.campus_life') s
  ON CONFLICT (institution_id)
  DO UPDATE SET
    housing_guarantee = coalesce(EXCLUDED.housing_guarantee, canonical.institution_campus_life.housing_guarantee),
    campus_safety_score = coalesce(EXCLUDED.campus_safety_score, canonical.institution_campus_life.campus_safety_score),
    cost_of_living_index = coalesce(EXCLUDED.cost_of_living_index, canonical.institution_campus_life.cost_of_living_index),
    raw_payload = canonical.institution_campus_life.raw_payload || EXCLUDED.raw_payload,
    updated_at = NOW();

  -- Requirements from multiple legacy systems
  INSERT INTO canonical.institution_requirements (
    institution_id,
    requirement_category,
    requirement_name,
    requirement_value,
    requirement_payload,
    source_attribution
  )
  SELECT
    s.institution_id,
    'application',
    key,
    s.payload->>key,
    s.payload,
    jsonb_build_object('source_table', 'public.application_requirements', 'source_pk', s.source_pk)
  FROM canonical.source_rows_with_institution('public.application_requirements') s,
       LATERAL jsonb_object_keys(s.payload) key
  WHERE key IN (
    'common_app_accepted','coalition_app_accepted','questbridge_accepted','direct_app_available',
    'interview_policy','portfolio_required','audition_required','graded_paper_required',
    'toefl_minimum','ielts_minimum','duolingo_minimum'
  )
  ON CONFLICT (institution_id, requirement_category, requirement_name)
  DO UPDATE SET
    requirement_value = coalesce(EXCLUDED.requirement_value, canonical.institution_requirements.requirement_value),
    requirement_payload = canonical.institution_requirements.requirement_payload || EXCLUDED.requirement_payload,
    source_attribution = EXCLUDED.source_attribution,
    updated_at = NOW();

  -- Statistics snapshots from major source tables
  INSERT INTO canonical.institution_statistics (
    institution_id,
    stats_namespace,
    stats_year,
    stats_payload,
    source_attribution
  )
  SELECT
    s.institution_id,
    'academic_details',
    NULL,
    s.payload,
    jsonb_build_object('source_table', 'public.academic_details', 'source_pk', s.source_pk)
  FROM canonical.source_rows_with_institution('public.academic_details') s
  ON CONFLICT (institution_id, stats_namespace, stats_year_key)
  DO UPDATE SET
    stats_payload = canonical.institution_statistics.stats_payload || EXCLUDED.stats_payload,
    updated_at = NOW();

  INSERT INTO canonical.institution_statistics (
    institution_id,
    stats_namespace,
    stats_year,
    stats_payload,
    source_attribution
  )
  SELECT
    s.institution_id,
    'college_financial_aid',
    NULL,
    s.payload,
    jsonb_build_object('source_table', 'public.college_financial_aid', 'source_pk', s.source_pk)
  FROM canonical.source_rows_with_institution('public.college_financial_aid') s
  ON CONFLICT (institution_id, stats_namespace, stats_year_key)
  DO UPDATE SET
    stats_payload = canonical.institution_statistics.stats_payload || EXCLUDED.stats_payload,
    updated_at = NOW();

  -- Regional table population
  INSERT INTO canonical.us_admissions_profile (
    institution_id,
    sat_required,
    sat_range,
    act_required,
    act_range,
    common_app_supported,
    fafsa_required,
    css_profile_required,
    source_attribution,
    updated_at
  )
  SELECT
    i.id,
    (a.sat_25 IS NOT NULL OR a.sat_50 IS NOT NULL OR a.sat_75 IS NOT NULL),
    jsonb_build_object('sat_25', a.sat_25, 'sat_50', a.sat_50, 'sat_75', a.sat_75),
    (a.act_25 IS NOT NULL OR a.act_50 IS NOT NULL OR a.act_75 IS NOT NULL),
    jsonb_build_object('act_25', a.act_25, 'act_50', a.act_50, 'act_75', a.act_75),
    EXISTS (
      SELECT 1 FROM canonical.institution_requirements r
      WHERE r.institution_id = i.id
        AND r.requirement_name = 'common_app_accepted'
        AND lower(coalesce(r.requirement_value,'')) IN ('1','true','t','yes')
    ),
    EXISTS (
      SELECT 1 FROM canonical.institution_deadlines d
      WHERE d.institution_id = i.id
        AND lower(d.deadline_type) LIKE '%fafsa%'
    ),
    EXISTS (
      SELECT 1 FROM canonical.institution_deadlines d
      WHERE d.institution_id = i.id
        AND lower(d.deadline_type) LIKE '%css%'
    ),
    jsonb_build_object('derived', true),
    NOW()
  FROM canonical.institutions i
  LEFT JOIN LATERAL (
    SELECT *
    FROM canonical.institution_admissions a
    WHERE a.institution_id = i.id
    ORDER BY a.data_year DESC NULLS LAST
    LIMIT 1
  ) a ON true
  WHERE i.country_code = 'US'
  ON CONFLICT (institution_id) DO UPDATE SET
    sat_required = EXCLUDED.sat_required,
    sat_range = EXCLUDED.sat_range,
    act_required = EXCLUDED.act_required,
    act_range = EXCLUDED.act_range,
    common_app_supported = EXCLUDED.common_app_supported,
    fafsa_required = EXCLUDED.fafsa_required,
    css_profile_required = EXCLUDED.css_profile_required,
    source_attribution = EXCLUDED.source_attribution,
    updated_at = NOW();

  INSERT INTO canonical.india_admissions_profile (
    institution_id,
    jee_required,
    cuet_required,
    nirf_rank,
    reservation_categories,
    entrance_exam_details,
    source_attribution,
    updated_at
  )
  SELECT
    i.id,
    EXISTS (
      SELECT 1 FROM canonical.institution_requirements r
      WHERE r.institution_id = i.id
        AND lower(r.requirement_name) LIKE '%jee%'
    ),
    EXISTS (
      SELECT 1 FROM canonical.institution_requirements r
      WHERE r.institution_id = i.id
        AND lower(r.requirement_name) LIKE '%cuet%'
    ),
    nullif(i.canonical_external_ids->>'nirf','')::integer,
    coalesce(
      (
        SELECT jsonb_agg(DISTINCT r.requirement_name)
        FROM canonical.institution_requirements r
        WHERE r.institution_id = i.id
          AND lower(r.requirement_name) LIKE '%reservation%'
      ),
      '[]'::jsonb
    ),
    jsonb_build_object('jee_code', i.canonical_external_ids->>'jee_code'),
    jsonb_build_object('derived', true),
    NOW()
  FROM canonical.institutions i
  WHERE i.country_code = 'IN'
  ON CONFLICT (institution_id) DO UPDATE SET
    jee_required = EXCLUDED.jee_required,
    cuet_required = EXCLUDED.cuet_required,
    nirf_rank = EXCLUDED.nirf_rank,
    reservation_categories = EXCLUDED.reservation_categories,
    entrance_exam_details = EXCLUDED.entrance_exam_details,
    source_attribution = EXCLUDED.source_attribution,
    updated_at = NOW();

  INSERT INTO canonical.uk_admissions_profile (
    institution_id,
    ucas_required,
    ucas_code,
    a_levels_required,
    ib_requirements,
    source_attribution,
    updated_at
  )
  SELECT
    i.id,
    (nullif(i.canonical_external_ids->>'ucas','') IS NOT NULL),
    nullif(i.canonical_external_ids->>'ucas',''),
    EXISTS (
      SELECT 1 FROM canonical.institution_requirements r
      WHERE r.institution_id = i.id
        AND lower(r.requirement_name) LIKE '%a_level%'
    ),
    (
      SELECT max(r.requirement_value)
      FROM canonical.institution_requirements r
      WHERE r.institution_id = i.id
        AND lower(r.requirement_name) LIKE '%ib%'
    ),
    jsonb_build_object('derived', true),
    NOW()
  FROM canonical.institutions i
  WHERE i.country_code = 'GB'
  ON CONFLICT (institution_id) DO UPDATE SET
    ucas_required = EXCLUDED.ucas_required,
    ucas_code = EXCLUDED.ucas_code,
    a_levels_required = EXCLUDED.a_levels_required,
    ib_requirements = EXCLUDED.ib_requirements,
    source_attribution = EXCLUDED.source_attribution,
    updated_at = NOW();

  INSERT INTO canonical.eu_admissions_profile (
    institution_id,
    ects_required,
    bologna_cycle,
    language_requirements,
    source_attribution,
    updated_at
  )
  SELECT
    i.id,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM canonical.institution_requirements r
        WHERE r.institution_id = i.id
          AND (
            lower(r.requirement_name) LIKE '%ects%'
            OR lower(r.requirement_value) LIKE '%ects%'
          )
      ) THEN TRUE
      ELSE NULL
    END,
    (
      SELECT max(r.requirement_value)
      FROM canonical.institution_requirements r
      WHERE r.institution_id = i.id
        AND (
          lower(r.requirement_name) LIKE '%bologna%'
          OR lower(r.requirement_name) LIKE '%cycle%'
        )
    ),
    coalesce(
      (
        SELECT jsonb_object_agg(r.requirement_name, r.requirement_value)
        FROM canonical.institution_requirements r
        WHERE r.institution_id = i.id
          AND lower(r.requirement_name) LIKE '%language%'
      ),
      '{}'::jsonb
    ),
    jsonb_build_object('derived', true),
    NOW()
  FROM canonical.institutions i
  WHERE i.country_code IN ('DE','FR','IT','ES','NL','IE')
  ON CONFLICT (institution_id) DO UPDATE SET
    ects_required = EXCLUDED.ects_required,
    bologna_cycle = EXCLUDED.bologna_cycle,
    language_requirements = EXCLUDED.language_requirements,
    source_attribution = EXCLUDED.source_attribution,
    updated_at = NOW();

  INSERT INTO canonical.us_financial_aid (
    institution_id,
    fafsa_priority_deadline,
    css_profile_deadline,
    federal_aid_available,
    avg_pell_grant,
    source_attribution,
    updated_at
  )
  SELECT
    i.id,
    (
      SELECT min(d.deadline_date)
      FROM canonical.institution_deadlines d
      WHERE d.institution_id = i.id
        AND lower(d.deadline_type) LIKE '%fafsa%'
    ),
    (
      SELECT min(d.deadline_date)
      FROM canonical.institution_deadlines d
      WHERE d.institution_id = i.id
        AND lower(d.deadline_type) LIKE '%css%'
    ),
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM canonical.institution_deadlines d
        WHERE d.institution_id = i.id
          AND (
            lower(d.deadline_type) LIKE '%fafsa%'
            OR lower(d.deadline_type) LIKE '%css%'
          )
      ) THEN TRUE
      WHEN EXISTS (
        SELECT 1
        FROM canonical.institution_requirements r
        WHERE r.institution_id = i.id
          AND (
            lower(r.requirement_name) LIKE '%fafsa%'
            OR lower(r.requirement_name) LIKE '%federal aid%'
          )
      ) THEN TRUE
      ELSE NULL
    END,
    NULL,
    jsonb_build_object('derived', true),
    NOW()
  FROM canonical.institutions i
  WHERE i.country_code = 'US'
  ON CONFLICT (institution_id) DO UPDATE SET
    fafsa_priority_deadline = EXCLUDED.fafsa_priority_deadline,
    css_profile_deadline = EXCLUDED.css_profile_deadline,
    federal_aid_available = EXCLUDED.federal_aid_available,
    avg_pell_grant = EXCLUDED.avg_pell_grant,
    source_attribution = EXCLUDED.source_attribution,
    updated_at = NOW();

  INSERT INTO canonical.india_financial_aid (
    institution_id,
    scholarship_portal,
    state_scholarships,
    reservation_aid_available,
    source_attribution,
    updated_at
  )
  SELECT
    i.id,
    (
      SELECT max(nullif(r.requirement_value,''))
      FROM canonical.institution_requirements r
      WHERE r.institution_id = i.id
        AND lower(r.requirement_name) LIKE '%scholarship%'
    ),
    '[]'::jsonb,
    EXISTS (
      SELECT 1 FROM canonical.india_admissions_profile ap
      WHERE ap.institution_id = i.id
        AND jsonb_array_length(ap.reservation_categories) > 0
    ),
    jsonb_build_object('derived', true),
    NOW()
  FROM canonical.institutions i
  WHERE i.country_code = 'IN'
  ON CONFLICT (institution_id) DO UPDATE SET
    scholarship_portal = EXCLUDED.scholarship_portal,
    state_scholarships = EXCLUDED.state_scholarships,
    reservation_aid_available = EXCLUDED.reservation_aid_available,
    source_attribution = EXCLUDED.source_attribution,
    updated_at = NOW();

  INSERT INTO canonical.uk_financial_support (
    institution_id,
    student_finance_england,
    bursary_available,
    international_scholarships,
    source_attribution,
    updated_at
  )
  SELECT
    i.id,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM canonical.institution_requirements r
        WHERE r.institution_id = i.id
          AND (
            lower(r.requirement_name) LIKE '%student finance%'
            OR lower(r.requirement_value) LIKE '%student finance%'
          )
      ) THEN TRUE
      ELSE NULL
    END,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM canonical.institution_requirements r
        WHERE r.institution_id = i.id
          AND (
            lower(r.requirement_name) LIKE '%bursar%'
            OR lower(r.requirement_name) LIKE '%bursary%'
            OR lower(r.requirement_value) LIKE '%bursary%'
          )
      ) THEN TRUE
      ELSE NULL
    END,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM canonical.institution_requirements r
        WHERE r.institution_id = i.id
          AND (
            lower(r.requirement_name) LIKE '%international scholarship%'
            OR lower(r.requirement_value) LIKE '%international scholarship%'
          )
      ) THEN TRUE
      ELSE NULL
    END,
    jsonb_build_object('derived', true),
    NOW()
  FROM canonical.institutions i
  WHERE i.country_code = 'GB'
  ON CONFLICT (institution_id) DO UPDATE SET
    student_finance_england = EXCLUDED.student_finance_england,
    bursary_available = EXCLUDED.bursary_available,
    international_scholarships = EXCLUDED.international_scholarships,
    source_attribution = EXCLUDED.source_attribution,
    updated_at = NOW();

  -- Canonical application tables (copied from legacy app tables when available)
  INSERT INTO canonical.applications (
    institution_id,
    legacy_application_id,
    user_id,
    application_type,
    status,
    deadline_date,
    submitted_at,
    decision_date,
    notes,
    metadata,
    created_at,
    updated_at
  )
  SELECT
    coalesce(
      (
        SELECT m.institution_id
        FROM canonical.institution_identity_map m
        WHERE m.source_table IN ('public.colleges_comprehensive', 'public.colleges')
          AND m.source_pk = a.college_id::TEXT
        ORDER BY m.source_priority ASC
        LIMIT 1
      ),
      NULL
    ) AS institution_id,
    a.id::TEXT,
    a.user_id::TEXT,
    a.application_type,
    a.status,
    a.application_deadline::date,
    canonical.safe_timestamptz(a.submitted_at::text),
    canonical.safe_timestamptz(a.decision_date::text),
    a.notes,
    to_jsonb(a),
    coalesce(canonical.safe_timestamptz(a.created_at::text), now()),
    coalesce(canonical.safe_timestamptz(a.updated_at::text), now())
  FROM public.applications a
  WHERE to_regclass('public.applications') IS NOT NULL
  ON CONFLICT (legacy_application_id)
  DO UPDATE SET
    institution_id = EXCLUDED.institution_id,
    status = EXCLUDED.status,
    deadline_date = EXCLUDED.deadline_date,
    notes = EXCLUDED.notes,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

  INSERT INTO canonical.application_tasks (
    application_id,
    institution_id,
    task_type,
    title,
    description,
    completed,
    due_date,
    metadata,
    created_at,
    updated_at
  )
  SELECT
    ca.id,
    ca.institution_id,
    t.task_type,
    t.title,
    t.description,
    coalesce(t.completed, FALSE),
    t.due_date,
    to_jsonb(t),
    coalesce(canonical.safe_timestamptz(t.created_at::text), now()),
    now()
  FROM public.application_tasks t
  JOIN canonical.applications ca ON ca.legacy_application_id = t.application_id::TEXT
  WHERE to_regclass('public.application_tasks') IS NOT NULL;

  INSERT INTO canonical.timeline_events (
    application_id,
    institution_id,
    user_id,
    event_type,
    title,
    event_date,
    is_critical,
    completed,
    notes,
    metadata,
    created_at
  )
  SELECT
    ca.id,
    coalesce(ca.institution_id,
      (
        SELECT m.institution_id
        FROM canonical.institution_identity_map m
        WHERE m.source_table IN ('public.colleges_comprehensive', 'public.colleges')
          AND m.source_pk = te.college_id::TEXT
        ORDER BY m.source_priority ASC
        LIMIT 1
      )
    ) AS institution_id,
    te.user_id::TEXT,
    te.event_type,
    te.title,
    te.event_date,
    coalesce(te.is_critical, FALSE),
    coalesce(te.completed, FALSE),
    te.notes,
    to_jsonb(te),
    coalesce(canonical.safe_timestamptz(te.created_at::text), now())
  FROM public.timeline_events te
  LEFT JOIN canonical.applications ca ON ca.legacy_application_id = te.application_id::TEXT
  WHERE to_regclass('public.timeline_events') IS NOT NULL;

  INSERT INTO canonical.recommendations (
    institution_id,
    user_id,
    recommendation_type,
    score,
    explanation,
    model_version,
    metadata,
    created_at
  )
  SELECT
    NULL,
    rc.user_id::TEXT,
    'cached_recommendation',
    NULL,
    NULL,
    'legacy_cache',
    jsonb_build_object(
      'recommendations', rc.recommendations,
      'generated_at', rc.generated_at
    ),
    coalesce(canonical.safe_timestamptz(rc.generated_at::text), now())
  FROM public.recommendation_cache rc
  WHERE to_regclass('public.recommendation_cache') IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION canonical.refresh_search_assets()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  TRUNCATE TABLE canonical.institution_search_index;

  WITH alias_rollup AS (
    SELECT
      ia.institution_id,
      string_agg(ia.alias, ' ' ORDER BY ia.alias) AS aliases_text
    FROM canonical.institution_aliases ia
    GROUP BY ia.institution_id
  )
  INSERT INTO canonical.institution_search_index (
    institution_id,
    autocomplete_text,
    search_tokens,
    searchable_json,
    updated_at
  )
  SELECT
    i.id,
    trim(concat_ws(' ', i.canonical_name, i.short_name, i.city, i.state_region, i.country_code)),
    ARRAY(
      SELECT DISTINCT token
      FROM regexp_split_to_table(
        lower(
          concat_ws(
            ' ',
            i.canonical_name,
            i.short_name,
            i.city,
            i.state_region,
            i.country_code,
            coalesce(ar.aliases_text, '')
          )
        ),
        '\s+'
      ) AS token
      WHERE token IS NOT NULL AND token <> ''
    ),
    jsonb_build_object(
      'canonical_name', i.canonical_name,
      'short_name', i.short_name,
      'aliases', coalesce(i.aliases, '[]'::jsonb),
      'city', i.city,
      'state_region', i.state_region,
      'country_code', i.country_code,
      'institution_type', i.institution_type,
      'website_domain', canonical.extract_domain(i.website),
      'external_ids', i.canonical_external_ids,
      'top_programs', (
        SELECT jsonb_agg(p.program_name ORDER BY p.program_name)
        FROM canonical.institution_programs p
        WHERE p.institution_id = i.id
      )
    ),
    NOW()
  FROM canonical.institutions i
  LEFT JOIN alias_rollup ar ON ar.institution_id = i.id;
END;
$$;

CREATE OR REPLACE FUNCTION canonical.refresh_completeness_and_quality()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO canonical.institution_completeness (
    institution_id,
    admissions_score,
    financials_score,
    outcomes_score,
    rankings_score,
    programs_score,
    demographics_score,
    requirements_score,
    deadlines_score,
    overall_score,
    score_breakdown,
    updated_at
  )
  SELECT
    i.id,
    CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_admissions a WHERE a.institution_id = i.id) THEN 100 ELSE 0 END,
    CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_financials f WHERE f.institution_id = i.id) THEN 100 ELSE 0 END,
    CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_outcomes o WHERE o.institution_id = i.id) THEN 100 ELSE 0 END,
    CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_rankings r WHERE r.institution_id = i.id) THEN 100 ELSE 0 END,
    CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_programs p WHERE p.institution_id = i.id) THEN 100 ELSE 0 END,
    CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_demographics d WHERE d.institution_id = i.id) THEN 100 ELSE 0 END,
    CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_requirements rq WHERE rq.institution_id = i.id) THEN 100 ELSE 0 END,
    CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_deadlines dl WHERE dl.institution_id = i.id) THEN 100 ELSE 0 END,
    (
      (
        CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_admissions a WHERE a.institution_id = i.id) THEN 100 ELSE 0 END +
        CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_financials f WHERE f.institution_id = i.id) THEN 100 ELSE 0 END +
        CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_outcomes o WHERE o.institution_id = i.id) THEN 100 ELSE 0 END +
        CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_rankings r WHERE r.institution_id = i.id) THEN 100 ELSE 0 END +
        CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_programs p WHERE p.institution_id = i.id) THEN 100 ELSE 0 END +
        CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_demographics d WHERE d.institution_id = i.id) THEN 100 ELSE 0 END +
        CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_requirements rq WHERE rq.institution_id = i.id) THEN 100 ELSE 0 END +
        CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_deadlines dl WHERE dl.institution_id = i.id) THEN 100 ELSE 0 END
      ) / 8.0
    )::NUMERIC(5,2),
    jsonb_build_object(
      'admissions', CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_admissions a WHERE a.institution_id = i.id) THEN 'complete' ELSE 'missing' END,
      'financials', CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_financials f WHERE f.institution_id = i.id) THEN 'complete' ELSE 'missing' END,
      'outcomes', CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_outcomes o WHERE o.institution_id = i.id) THEN 'complete' ELSE 'missing' END,
      'rankings', CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_rankings r WHERE r.institution_id = i.id) THEN 'complete' ELSE 'missing' END,
      'programs', CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_programs p WHERE p.institution_id = i.id) THEN 'complete' ELSE 'missing' END,
      'demographics', CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_demographics d WHERE d.institution_id = i.id) THEN 'complete' ELSE 'missing' END,
      'requirements', CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_requirements rq WHERE rq.institution_id = i.id) THEN 'complete' ELSE 'missing' END,
      'deadlines', CASE WHEN EXISTS (SELECT 1 FROM canonical.institution_deadlines dl WHERE dl.institution_id = i.id) THEN 'complete' ELSE 'missing' END
    ),
    NOW()
  FROM canonical.institutions i
  ON CONFLICT (institution_id)
  DO UPDATE SET
    admissions_score = EXCLUDED.admissions_score,
    financials_score = EXCLUDED.financials_score,
    outcomes_score = EXCLUDED.outcomes_score,
    rankings_score = EXCLUDED.rankings_score,
    programs_score = EXCLUDED.programs_score,
    demographics_score = EXCLUDED.demographics_score,
    requirements_score = EXCLUDED.requirements_score,
    deadlines_score = EXCLUDED.deadlines_score,
    overall_score = EXCLUDED.overall_score,
    score_breakdown = EXCLUDED.score_breakdown,
    updated_at = NOW();

  UPDATE canonical.institutions i
  SET completeness_score = c.overall_score,
      updated_at = NOW()
  FROM canonical.institution_completeness c
  WHERE c.institution_id = i.id;

  INSERT INTO canonical.institution_quality_scores (
    institution_id,
    consistency_score,
    freshness_score,
    lineage_score,
    conflict_score,
    final_quality_score,
    diagnostics,
    updated_at
  )
  SELECT
    i.id,
    CASE
      WHEN i.canonical_name IS NOT NULL
       AND i.country_code IS NOT NULL
       AND i.slug IS NOT NULL
       AND i.normalized_name IS NOT NULL THEN 100
      ELSE 70
    END::NUMERIC(5,2) AS consistency_score,
    CASE
      WHEN i.updated_at >= now() - interval '90 days' THEN 100
      WHEN i.updated_at >= now() - interval '365 days' THEN 80
      ELSE 60
    END::NUMERIC(5,2) AS freshness_score,
    LEAST(100, (coalesce(src.cnt, 0) * 20))::NUMERIC(5,2) AS lineage_score,
    GREATEST(0, 100 - (coalesce(conf.conflict_count, 0) * 15))::NUMERIC(5,2) AS conflict_score,
    (
      (
        (CASE
          WHEN i.canonical_name IS NOT NULL
           AND i.country_code IS NOT NULL
           AND i.slug IS NOT NULL
           AND i.normalized_name IS NOT NULL THEN 100
          ELSE 70
        END)
        +
        (CASE
          WHEN i.updated_at >= now() - interval '90 days' THEN 100
          WHEN i.updated_at >= now() - interval '365 days' THEN 80
          ELSE 60
        END)
        +
        LEAST(100, (coalesce(src.cnt, 0) * 20))
        +
        GREATEST(0, 100 - (coalesce(conf.conflict_count, 0) * 15))
      ) / 4.0
    )::NUMERIC(5,2) AS final_quality_score,
    jsonb_build_object(
      'source_count', coalesce(src.cnt, 0),
      'conflict_count', coalesce(conf.conflict_count, 0)
    ),
    NOW()
  FROM canonical.institutions i
  LEFT JOIN (
    SELECT institution_id, count(*) AS cnt
    FROM canonical.institution_sources
    GROUP BY institution_id
  ) src ON src.institution_id = i.id
  LEFT JOIN (
    SELECT institution_id, count(*) AS conflict_count
    FROM canonical.institution_identity_map
    WHERE match_method IN ('city_state_similarity', 'coordinate_similarity', 'alias_match')
    GROUP BY institution_id
  ) conf ON conf.institution_id = i.id
  ON CONFLICT (institution_id)
  DO UPDATE SET
    consistency_score = EXCLUDED.consistency_score,
    freshness_score = EXCLUDED.freshness_score,
    lineage_score = EXCLUDED.lineage_score,
    conflict_score = EXCLUDED.conflict_score,
    final_quality_score = EXCLUDED.final_quality_score,
    diagnostics = EXCLUDED.diagnostics,
    updated_at = NOW();
END;
$$;

-- ============================================================================
-- MATERIALIZED VIEWS + VALIDATION / DQ / ORPHAN QUERIES
-- ============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS canonical.mv_institution_search AS
SELECT
  i.id AS institution_id,
  i.canonical_name,
  i.slug,
  i.country_code,
  i.state_region,
  i.city,
  i.website,
  coalesce(c.overall_score, 0) AS completeness_score,
  coalesce(q.final_quality_score, 0) AS quality_score,
  si.autocomplete_text,
  si.search_tokens,
  si.searchable_json,
  si.search_document
FROM canonical.institutions i
LEFT JOIN canonical.institution_completeness c ON c.institution_id = i.id
LEFT JOIN canonical.institution_quality_scores q ON q.institution_id = i.id
LEFT JOIN canonical.institution_search_index si ON si.institution_id = i.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_institution_search_institution_id
  ON canonical.mv_institution_search (institution_id);

CREATE INDEX IF NOT EXISTS idx_mv_institution_search_doc
  ON canonical.mv_institution_search USING gin (search_document);

CREATE INDEX IF NOT EXISTS idx_mv_institution_search_autocomplete
  ON canonical.mv_institution_search USING gin (autocomplete_text gin_trgm_ops);

CREATE MATERIALIZED VIEW IF NOT EXISTS canonical.mv_institution_lineage AS
SELECT
  i.id AS institution_id,
  i.canonical_name,
  count(DISTINCT s.id) AS source_count,
  min(s.source_priority) AS best_source_priority,
  max(s.verified_at) AS latest_verified_at,
  jsonb_agg(
    jsonb_build_object(
      'source_table', s.source_table,
      'source_pk', s.source_pk,
      'source_tier', s.source_tier,
      'source_priority', s.source_priority,
      'verified_at', s.verified_at
    ) ORDER BY s.source_priority, s.verified_at DESC
  ) FILTER (WHERE s.id IS NOT NULL) AS lineage
FROM canonical.institutions i
LEFT JOIN canonical.institution_sources s ON s.institution_id = i.id
GROUP BY i.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_institution_lineage_institution_id
  ON canonical.mv_institution_lineage (institution_id);

CREATE OR REPLACE VIEW canonical.v_orphan_detection AS
SELECT 'institution_admissions' AS table_name, count(*) AS orphan_count
FROM canonical.institution_admissions a
LEFT JOIN canonical.institutions i ON i.id = a.institution_id
WHERE i.id IS NULL
UNION ALL
SELECT 'institution_financials', count(*)
FROM canonical.institution_financials f
LEFT JOIN canonical.institutions i ON i.id = f.institution_id
WHERE i.id IS NULL
UNION ALL
SELECT 'institution_rankings', count(*)
FROM canonical.institution_rankings r
LEFT JOIN canonical.institutions i ON i.id = r.institution_id
WHERE i.id IS NULL
UNION ALL
SELECT 'institution_outcomes', count(*)
FROM canonical.institution_outcomes o
LEFT JOIN canonical.institutions i ON i.id = o.institution_id
WHERE i.id IS NULL
UNION ALL
SELECT 'institution_programs', count(*)
FROM canonical.institution_programs p
LEFT JOIN canonical.institutions i ON i.id = p.institution_id
WHERE i.id IS NULL
UNION ALL
SELECT 'institution_deadlines', count(*)
FROM canonical.institution_deadlines d
LEFT JOIN canonical.institutions i ON i.id = d.institution_id
WHERE i.id IS NULL
UNION ALL
SELECT 'institution_demographics', count(*)
FROM canonical.institution_demographics d
LEFT JOIN canonical.institutions i ON i.id = d.institution_id
WHERE i.id IS NULL
UNION ALL
SELECT 'institution_campus_life', count(*)
FROM canonical.institution_campus_life c
LEFT JOIN canonical.institutions i ON i.id = c.institution_id
WHERE i.id IS NULL
UNION ALL
SELECT 'institution_requirements', count(*)
FROM canonical.institution_requirements rq
LEFT JOIN canonical.institutions i ON i.id = rq.institution_id
WHERE i.id IS NULL
UNION ALL
SELECT 'institution_statistics', count(*)
FROM canonical.institution_statistics st
LEFT JOIN canonical.institutions i ON i.id = st.institution_id
WHERE i.id IS NULL
UNION ALL
SELECT 'applications', count(*)
FROM canonical.applications ap
LEFT JOIN canonical.institutions i ON i.id = ap.institution_id
WHERE ap.institution_id IS NOT NULL AND i.id IS NULL;

CREATE OR REPLACE VIEW canonical.v_data_quality_checks AS
SELECT
  'duplicate_country_normalized_name'::TEXT AS check_name,
  count(*)::BIGINT AS issue_count
FROM (
  SELECT country_code, normalized_name
  FROM canonical.institutions
  GROUP BY country_code, normalized_name
  HAVING count(*) > 1
) dup
UNION ALL
SELECT
  'invalid_slug_format',
  count(*)
FROM canonical.institutions
WHERE slug !~ '^[a-z0-9-]+$'
UNION ALL
SELECT
  'missing_external_ids_all_empty',
  count(*)
FROM canonical.institutions
WHERE (
  coalesce(nullif(canonical_external_ids->>'ipeds',''),'') = ''
  AND coalesce(nullif(canonical_external_ids->>'college_scorecard',''),'') = ''
  AND coalesce(nullif(canonical_external_ids->>'ucas',''),'') = ''
  AND coalesce(nullif(canonical_external_ids->>'nirf',''),'') = ''
  AND coalesce(nullif(canonical_external_ids->>'jee_code',''),'') = ''
  AND coalesce(nullif(canonical_external_ids->>'common_app',''),'') = ''
  AND coalesce(nullif(canonical_external_ids->>'qs_ranking_id',''),'') = ''
)
UNION ALL
SELECT
  'low_quality_score',
  count(*)
FROM canonical.institution_quality_scores
WHERE final_quality_score < 50
UNION ALL
SELECT
  'low_completeness_score',
  count(*)
FROM canonical.institution_completeness
WHERE overall_score < 50;

CREATE OR REPLACE VIEW canonical.v_validation_report AS
SELECT
  (SELECT count(*) FROM canonical.institutions) AS institutions_count,
  (SELECT count(*) FROM canonical.institution_identity_map) AS identity_map_count,
  (SELECT count(*) FROM canonical.institution_sources) AS source_rows_count,
  (SELECT count(*) FROM canonical.v_orphan_detection WHERE orphan_count > 0) AS orphan_tables_with_issues,
  (SELECT coalesce(sum(issue_count), 0) FROM canonical.v_data_quality_checks) AS total_quality_issues,
  (SELECT count(*) FROM canonical.institution_search_index) AS search_index_rows,
  (SELECT count(*) FROM canonical.institution_completeness) AS completeness_rows,
  (SELECT count(*) FROM canonical.institution_quality_scores) AS quality_score_rows,
  now() AS report_generated_at;

-- ============================================================================
-- MIGRATION ORCHESTRATION
-- ============================================================================
CREATE TABLE IF NOT EXISTS canonical.migration_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_migration_runs_name UNIQUE (migration_name)
);

CREATE OR REPLACE FUNCTION canonical.migration_0_0_canonical_rebuild()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_started_at TIMESTAMPTZ := now();
  v_summary JSONB;
BEGIN
  INSERT INTO canonical.migration_runs (migration_name, started_at, status)
  VALUES ('migration_0_0_canonical_rebuild', v_started_at, 'running')
  ON CONFLICT (migration_name)
  DO UPDATE SET
    started_at = EXCLUDED.started_at,
    finished_at = NULL,
    status = 'running',
    summary = '{}'::jsonb,
    created_at = NOW();

  PERFORM canonical.rebuild_staging_institution_candidates();
  PERFORM canonical.merge_staging_candidates();
  PERFORM canonical.populate_domain_tables();
  PERFORM canonical.refresh_search_assets();
  PERFORM canonical.refresh_completeness_and_quality();

  REFRESH MATERIALIZED VIEW canonical.mv_institution_search;
  REFRESH MATERIALIZED VIEW canonical.mv_institution_lineage;

  SELECT jsonb_build_object(
    'institutions', (SELECT count(*) FROM canonical.institutions),
    'identity_map_rows', (SELECT count(*) FROM canonical.institution_identity_map),
    'sources', (SELECT count(*) FROM canonical.institution_sources),
    'admissions_rows', (SELECT count(*) FROM canonical.institution_admissions),
    'financial_rows', (SELECT count(*) FROM canonical.institution_financials),
    'ranking_rows', (SELECT count(*) FROM canonical.institution_rankings),
    'outcomes_rows', (SELECT count(*) FROM canonical.institution_outcomes),
    'program_rows', (SELECT count(*) FROM canonical.institution_programs),
    'deadline_rows', (SELECT count(*) FROM canonical.institution_deadlines),
    'orphan_issue_tables', (SELECT count(*) FROM canonical.v_orphan_detection WHERE orphan_count > 0),
    'quality_issue_total', (SELECT coalesce(sum(issue_count), 0) FROM canonical.v_data_quality_checks),
    'finished_at', now()
  ) INTO v_summary;

  UPDATE canonical.migration_runs
  SET finished_at = now(),
      status = 'success',
      summary = v_summary
  WHERE migration_name = 'migration_0_0_canonical_rebuild';

  RETURN v_summary;
EXCEPTION WHEN others THEN
  UPDATE canonical.migration_runs
  SET finished_at = now(),
      status = 'failed',
      summary = jsonb_build_object('error', SQLERRM)
  WHERE migration_name = 'migration_0_0_canonical_rebuild';
  RAISE;
END;
$$;

SELECT canonical.migration_0_0_canonical_rebuild();

COMMIT;

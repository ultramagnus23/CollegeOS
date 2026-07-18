--
-- PostgreSQL database dump
--

\restrict fKFMcgMbiZavouT1lwLfXvd6ICP5nR0rU4gIc0miN5xJ21W3cz4kexaqugBIKKU

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: canonical; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA canonical;


ALTER SCHEMA canonical OWNER TO postgres;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: source_tier; Type: TYPE; Schema: canonical; Owner: postgres
--

CREATE TYPE canonical.source_tier AS ENUM (
    'government_dataset',
    'official_institution_data',
    'common_data_set',
    'verified_import',
    'scraped_third_party',
    'inferred_generated'
);


ALTER TYPE canonical.source_tier OWNER TO postgres;

--
-- Name: verification_status; Type: TYPE; Schema: canonical; Owner: postgres
--

CREATE TYPE canonical.verification_status AS ENUM (
    'unverified',
    'verified',
    'government_verified',
    'deprecated',
    'scraped',
    'imported',
    'inferred',
    'estimated',
    'user_supplied',
    'unknown'
);


ALTER TYPE canonical.verification_status OWNER TO postgres;

--
-- Name: base_external_ids(); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.base_external_ids() RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT jsonb_build_object(
    'ipeds', '', 'college_scorecard', '', 'ucas', '', 'nirf', '',
    'jee_code', '', 'common_app', '', 'qs_ranking_id', ''
  );
$$;


ALTER FUNCTION canonical.base_external_ids() OWNER TO postgres;

--
-- Name: derive_acronym(text); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.derive_acronym(p_text text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE WHEN length(ac) >= 2 THEN ac END
  FROM (
    SELECT string_agg(left(w, 1), '' ORDER BY ord) AS ac
    FROM (
      SELECT w, ord
      FROM unnest(string_to_array(canonical.normalize_search_text(p_text), ' '))
        WITH ORDINALITY AS t(w, ord)
      WHERE w <> ''
        AND w NOT IN ('of','the','and','at','for','in','de','la','le','du','des',
                      'von','di','el','y','e','da','do','dos','das','a','an')
    ) words
  ) agg;
$$;


ALTER FUNCTION canonical.derive_acronym(p_text text) OWNER TO postgres;

--
-- Name: external_ids_overlap(jsonb, jsonb); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.external_ids_overlap(p_left jsonb, p_right jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM (VALUES ('ipeds'),('college_scorecard'),('ucas'),('nirf'),('jee_code'),('common_app'),('qs_ranking_id')) AS k(key)
    WHERE nullif(p_left->>k.key, '') IS NOT NULL
      AND nullif(p_right->>k.key, '') IS NOT NULL
      AND p_left->>k.key = p_right->>k.key
  );
$$;


ALTER FUNCTION canonical.external_ids_overlap(p_left jsonb, p_right jsonb) OWNER TO postgres;

--
-- Name: extract_domain(text); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.extract_domain(p_url text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT split_part(canonical.normalize_url(p_url), '/', 1);
$$;


ALTER FUNCTION canonical.extract_domain(p_url text) OWNER TO postgres;

--
-- Name: fn_data_quality_issues(); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.fn_data_quality_issues() RETURNS TABLE(institution_id uuid, canonical_name text, severity text, category text, field text, detail text)
    LANGUAGE sql STABLE
    AS $$
  -- ---- IMPOSSIBLE VALUES (always HIGH) ----
  SELECT a.institution_id, i.canonical_name, 'HIGH', 'impossible_value', 'acceptance_rate',
         'acceptance_rate out of [0,1]: ' || a.acceptance_rate
  FROM canonical.institution_admissions a JOIN canonical.institutions i ON i.id = a.institution_id
  WHERE a.acceptance_rate IS NOT NULL AND (a.acceptance_rate < 0 OR a.acceptance_rate > 1)
  UNION ALL
  SELECT o.institution_id, i.canonical_name, 'HIGH', 'impossible_value', 'graduation_rate_4yr',
         'graduation_rate_4yr out of [0,100]: ' || o.graduation_rate_4yr
  FROM canonical.institution_outcomes o JOIN canonical.institutions i ON i.id = o.institution_id
  WHERE o.graduation_rate_4yr IS NOT NULL AND (o.graduation_rate_4yr < 0 OR o.graduation_rate_4yr > 100)
  UNION ALL
  SELECT o.institution_id, i.canonical_name, 'HIGH', 'impossible_value', 'median_start_salary',
         'median_start_salary negative: ' || o.median_start_salary
  FROM canonical.institution_outcomes o JOIN canonical.institutions i ON i.id = o.institution_id
  WHERE o.median_start_salary IS NOT NULL AND o.median_start_salary < 0
  UNION ALL
  SELECT f.institution_id, i.canonical_name, 'HIGH', 'impossible_value', 'cost_of_attendance',
         'cost_of_attendance negative: ' || f.cost_of_attendance
  FROM canonical.institution_financials f JOIN canonical.institutions i ON i.id = f.institution_id
  WHERE f.cost_of_attendance IS NOT NULL AND f.cost_of_attendance < 0
  UNION ALL
  SELECT r.institution_id, i.canonical_name, 'HIGH', 'impossible_value', 'global_rank',
         'rank < 1: ' || COALESCE(r.global_rank, r.national_rank)
  FROM canonical.institution_rankings r JOIN canonical.institutions i ON i.id = r.institution_id
  WHERE COALESCE(r.global_rank, r.national_rank) IS NOT NULL
    AND COALESCE(r.global_rank, r.national_rank) < 1

  -- ---- MISSING CRITICAL DATA (HIGH: card looks broken) ----
  UNION ALL
  SELECT i.id, i.canonical_name, 'HIGH', 'missing_majors', 'institution_programs',
         'no programs/majors rows'
  FROM canonical.institutions i
  WHERE NOT EXISTS (SELECT 1 FROM canonical.institution_programs p WHERE p.institution_id = i.id)
  UNION ALL
  SELECT i.id, i.canonical_name, 'MEDIUM', 'missing_deadlines', 'institution_deadlines',
         'no deadlines rows'
  FROM canonical.institutions i
  WHERE NOT EXISTS (SELECT 1 FROM canonical.institution_deadlines d WHERE d.institution_id = i.id)
  UNION ALL
  SELECT i.id, i.canonical_name, 'MEDIUM', 'missing_acceptance_rate', 'acceptance_rate',
         'no non-null acceptance_rate'
  FROM canonical.institutions i
  WHERE NOT EXISTS (
    SELECT 1 FROM canonical.institution_admissions a
    WHERE a.institution_id = i.id AND a.acceptance_rate IS NOT NULL)

  -- ---- MISSING ENRICHMENT (LOW) ----
  UNION ALL
  SELECT i.id, i.canonical_name, 'LOW', 'missing_rankings', 'institution_rankings',
         'no rankings rows'
  FROM canonical.institutions i
  WHERE NOT EXISTS (SELECT 1 FROM canonical.institution_rankings r WHERE r.institution_id = i.id)
  UNION ALL
  SELECT i.id, i.canonical_name, 'LOW', 'missing_outcomes', 'institution_outcomes',
         'no graduation/salary outcomes'
  FROM canonical.institutions i
  WHERE NOT EXISTS (
    SELECT 1 FROM canonical.institution_outcomes o
    WHERE o.institution_id = i.id
      AND (o.graduation_rate_4yr IS NOT NULL OR o.graduation_rate_6yr IS NOT NULL
           OR o.median_start_salary IS NOT NULL));
$$;


ALTER FUNCTION canonical.fn_data_quality_issues() OWNER TO postgres;

--
-- Name: fn_snapshot_data_quality(); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.fn_snapshot_data_quality() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE total integer;
BEGIN
  INSERT INTO canonical.data_quality_snapshots (severity, category, issue_count)
  SELECT severity, category, issue_count FROM canonical.v_data_quality_summary;
  GET DIAGNOSTICS total = ROW_COUNT;
  RETURN total;
END;
$$;


ALTER FUNCTION canonical.fn_snapshot_data_quality() OWNER TO postgres;

--
-- Name: get_distinct_country_codes(); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.get_distinct_country_codes() RETURNS TABLE(country_code text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'canonical', 'public'
    AS $$
  SELECT DISTINCT country_code
  FROM canonical.mv_college_cards
  WHERE country_code IS NOT NULL
  ORDER BY country_code;
$$;


ALTER FUNCTION canonical.get_distinct_country_codes() OWNER TO postgres;

--
-- Name: get_distinct_state_regions(); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.get_distinct_state_regions() RETURNS TABLE(state_region text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'canonical', 'public'
    AS $$
  SELECT DISTINCT state_region
  FROM canonical.institutions
  WHERE state_region IS NOT NULL
  ORDER BY state_region;
$$;


ALTER FUNCTION canonical.get_distinct_state_regions() OWNER TO postgres;

--
-- Name: make_slug(text); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.make_slug(p_name text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $_$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        lower(unaccent(trim(coalesce(p_name, '')))),
        '[^a-z0-9]+', '-', 'g'
      ),
      '(^-|-$)', '', 'g'
    ), ''
  );
$_$;


ALTER FUNCTION canonical.make_slug(p_name text) OWNER TO postgres;

--
-- Name: merge_external_ids(jsonb, jsonb); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.merge_external_ids(p_existing jsonb, p_incoming jsonb) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
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


ALTER FUNCTION canonical.merge_external_ids(p_existing jsonb, p_incoming jsonb) OWNER TO postgres;

--
-- Name: normalize_country_code(text); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.normalize_country_code(p_value text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE upper(trim(coalesce(p_value, '')))
    WHEN 'US' THEN 'US' WHEN 'USA' THEN 'US' WHEN 'UNITED STATES' THEN 'US'
    WHEN 'UNITED STATES OF AMERICA' THEN 'US' WHEN 'IN' THEN 'IN' WHEN 'INDIA' THEN 'IN'
    WHEN 'GB' THEN 'GB' WHEN 'UK' THEN 'GB' WHEN 'UNITED KINGDOM' THEN 'GB'
    WHEN 'ENGLAND' THEN 'GB' WHEN 'SCOTLAND' THEN 'GB' WHEN 'WALES' THEN 'GB'
    WHEN 'NORTHERN IRELAND' THEN 'GB' WHEN 'DE' THEN 'DE' WHEN 'GERMANY' THEN 'DE'
    WHEN 'FR' THEN 'FR' WHEN 'FRANCE' THEN 'FR' WHEN 'IT' THEN 'IT' WHEN 'ITALY' THEN 'IT'
    WHEN 'ES' THEN 'ES' WHEN 'SPAIN' THEN 'ES' WHEN 'NL' THEN 'NL' WHEN 'NETHERLANDS' THEN 'NL'
    WHEN 'IE' THEN 'IE' WHEN 'IRELAND' THEN 'IE'
    ELSE NULLIF(upper(trim(coalesce(p_value, ''))), '')
  END;
$$;


ALTER FUNCTION canonical.normalize_country_code(p_value text) OWNER TO postgres;

--
-- Name: normalize_institution_name(text); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.normalize_institution_name(p_input text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $_$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          canonical.normalize_text(p_input),
          '\m(university|college|institute|school|campus|the)\M',
          ' ', 'gi'
        ),
        '\s+', ' ', 'g'
      ),
      '^\s+|\s+$', '', 'g'
    ), ''
  );
$_$;


ALTER FUNCTION canonical.normalize_institution_name(p_input text) OWNER TO postgres;

--
-- Name: normalize_region_code(text, text); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.normalize_region_code(p_country_code text, p_region text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE
    WHEN p_country_code IS NULL THEN NULL
    WHEN p_country_code = 'US' THEN upper(trim(coalesce(p_region, '')))
    WHEN p_country_code = 'IN' THEN upper(trim(coalesce(p_region, '')))
    WHEN p_country_code = 'GB' THEN upper(trim(coalesce(p_region, '')))
    ELSE NULLIF(upper(trim(coalesce(p_region, ''))), '')
  END;
$$;


ALTER FUNCTION canonical.normalize_region_code(p_country_code text, p_region text) OWNER TO postgres;

--
-- Name: normalize_search_text(text); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.normalize_search_text(p_text text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT NULLIF(
    btrim(regexp_replace(lower(public.unaccent(coalesce(p_text, ''))), '[^a-z0-9]+', ' ', 'g')),
    ''
  );
$$;


ALTER FUNCTION canonical.normalize_search_text(p_text text) OWNER TO postgres;

--
-- Name: normalize_text(text); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.normalize_text(p_input text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT NULLIF(
    regexp_replace(
      lower(unaccent(trim(coalesce(p_input, '')))),
      '[^a-z0-9]+', ' ', 'g'
    ), ''
  );
$$;


ALTER FUNCTION canonical.normalize_text(p_input text) OWNER TO postgres;

--
-- Name: normalize_url(text); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.normalize_url(p_input text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $_$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(trim(coalesce(p_input, ''))), '^https?://', ''),
        '^www\.',
        ''
      ),
      '/+$', ''
    ), ''
  );
$_$;


ALTER FUNCTION canonical.normalize_url(p_input text) OWNER TO postgres;

--
-- Name: normalized_external_ids(jsonb); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.normalized_external_ids(p_payload jsonb) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
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


ALTER FUNCTION canonical.normalized_external_ids(p_payload jsonb) OWNER TO postgres;

--
-- Name: rebuild_institution_search_index(); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.rebuild_institution_search_index() RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'canonical', 'public'
    AS $$
DECLARE n integer;
BEGIN
  TRUNCATE canonical.institution_search_index;

  INSERT INTO canonical.institution_search_index
    (institution_id, autocomplete_text, search_tokens, searchable_json)
  SELECT
    i.id,
    -- Human-readable autocomplete text: name + location + aliases.
    btrim(concat_ws(' ',
      i.canonical_name, i.city, i.state_region, i.country_code,
      al.alias_text
    )),
    -- Distinct normalized tokens across name, aliases, majors, programs.
    COALESCE((
      SELECT array_agg(DISTINCT tok)
      FROM unnest(string_to_array(
        canonical.normalize_search_text(concat_ws(' ',
          i.canonical_name, i.city, i.state_region, i.country_code,
          al.norm_text, pr.cats_text, pr.progs_text)),
        ' ')) AS tok
      WHERE tok <> ''
    ), ARRAY[]::text[]),
    -- Structured payload; its ::text also feeds the generated tsvector, so the
    -- major/program names below become full-text searchable.
    jsonb_strip_nulls(jsonb_build_object(
      'country_code', i.country_code,
      'city', i.city,
      'state_region', i.state_region,
      'institution_type', i.institution_type,
      'control_type', i.control_type,
      'majors', pr.cats,
      'programs', pr.progs
    ))
  FROM canonical.institutions i
  LEFT JOIN LATERAL (
    SELECT string_agg(DISTINCT a.alias, ' ')            AS alias_text,
           string_agg(DISTINCT a.normalized_alias, ' ') AS norm_text
    FROM canonical.institution_aliases a
    WHERE a.institution_id = i.id
  ) al ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(DISTINCT p.field_category) FILTER (WHERE p.field_category IS NOT NULL) AS cats,
           jsonb_agg(DISTINCT p.program_name)   FILTER (WHERE p.program_name   IS NOT NULL) AS progs,
           string_agg(DISTINCT p.field_category, ' ') AS cats_text,
           string_agg(DISTINCT p.program_name, ' ')   AS progs_text
    FROM canonical.institution_programs p
    WHERE p.institution_id = i.id
  ) pr ON true;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;


ALTER FUNCTION canonical.rebuild_institution_search_index() OWNER TO postgres;

--
-- Name: rebuild_staging_institution_candidates(); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.rebuild_staging_institution_candidates() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_source TEXT;
BEGIN
  -- THE FIX: Use CASCADE to handle FK constraint
  TRUNCATE TABLE canonical.stg_institution_matches CASCADE;
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


ALTER FUNCTION canonical.rebuild_staging_institution_candidates() OWNER TO postgres;

--
-- Name: recompute_institution_completeness(); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.recompute_institution_completeness() RETURNS void
    LANGUAGE sql
    AS $$
  INSERT INTO canonical.institution_completeness AS ic (
    institution_id, admissions_score, financials_score, outcomes_score,
    rankings_score, programs_score, demographics_score, requirements_score,
    deadlines_score, overall_score, score_breakdown, updated_at
  )
  SELECT
    i.id,
    COALESCE(adm.score, 0),
    COALESCE(fin.score, 0),
    COALESCE(out.score, 0),
    rnk.score,
    prg.score,
    dem.score,
    req.score,
    ddl.score,
    -- weighted overall (admissions/financials/outcomes carry the card).
    -- adm/fin/out come from LIMIT-1 laterals that yield NULL when absent.
    round((COALESCE(adm.score,0)*0.20 + COALESCE(fin.score,0)*0.20
         + COALESCE(out.score,0)*0.15 + rnk.score*0.10 + prg.score*0.15
         + dem.score*0.08 + req.score*0.07 + ddl.score*0.05)::numeric, 2),
    jsonb_build_object(
      'admissions', COALESCE(adm.score,0), 'financials', COALESCE(fin.score,0),
      'outcomes', COALESCE(out.score,0), 'rankings', rnk.score,
      'programs', prg.score, 'demographics', dem.score,
      'requirements', req.score, 'deadlines', ddl.score),
    now()
  FROM canonical.institutions i
  -- admissions: weight key card fields
  LEFT JOIN LATERAL (
    SELECT round(100 * (
      (a.acceptance_rate IS NOT NULL)::int*0.4 +
      (a.sat_50 IS NOT NULL OR a.act_50 IS NOT NULL)::int*0.3 +
      (a.test_optional IS NOT NULL)::int*0.3)::numeric, 2) AS score
    FROM canonical.institution_admissions a
    WHERE a.institution_id = i.id
    ORDER BY a.data_year DESC NULLS LAST LIMIT 1) adm ON true
  LEFT JOIN LATERAL (
    SELECT round(100 * (
      (f.tuition_international IS NOT NULL OR f.tuition_out_state IS NOT NULL)::int*0.4 +
      (f.cost_of_attendance IS NOT NULL)::int*0.3 +
      (f.avg_financial_aid IS NOT NULL OR f.avg_debt IS NOT NULL)::int*0.3)::numeric, 2) AS score
    FROM canonical.institution_financials f
    WHERE f.institution_id = i.id
    ORDER BY f.data_year DESC NULLS LAST LIMIT 1) fin ON true
  LEFT JOIN LATERAL (
    SELECT round(100 * (
      (o.graduation_rate_4yr IS NOT NULL OR o.graduation_rate_6yr IS NOT NULL)::int*0.4 +
      (o.median_start_salary IS NOT NULL)::int*0.4 +
      (o.employment_rate IS NOT NULL OR o.retention_rate IS NOT NULL)::int*0.2)::numeric, 2) AS score
    FROM canonical.institution_outcomes o
    WHERE o.institution_id = i.id
    ORDER BY o.data_year DESC NULLS LAST LIMIT 1) out ON true
  LEFT JOIN LATERAL (
    SELECT (count(*) > 0)::int * 100 AS score
    FROM canonical.institution_rankings r WHERE r.institution_id = i.id) rnk ON true
  LEFT JOIN LATERAL (
    SELECT LEAST(count(*), 30) * 100.0 / 30 AS score   -- 30+ majors = full (Phase 4 target)
    FROM canonical.institution_programs p WHERE p.institution_id = i.id) prg ON true
  LEFT JOIN LATERAL (
    SELECT (count(*) > 0)::int * 100 AS score
    FROM canonical.institution_demographics d WHERE d.institution_id = i.id) dem ON true
  LEFT JOIN LATERAL (
    SELECT (count(*) > 0)::int * 100 AS score
    FROM canonical.institution_requirements rq WHERE rq.institution_id = i.id) req ON true
  LEFT JOIN LATERAL (
    SELECT (count(*) > 0)::int * 100 AS score
    FROM canonical.institution_deadlines dl WHERE dl.institution_id = i.id) ddl ON true
  ON CONFLICT (institution_id) DO UPDATE SET
    admissions_score   = EXCLUDED.admissions_score,
    financials_score   = EXCLUDED.financials_score,
    outcomes_score     = EXCLUDED.outcomes_score,
    rankings_score     = EXCLUDED.rankings_score,
    programs_score     = EXCLUDED.programs_score,
    demographics_score = EXCLUDED.demographics_score,
    requirements_score = EXCLUDED.requirements_score,
    deadlines_score    = EXCLUDED.deadlines_score,
    overall_score      = EXCLUDED.overall_score,
    score_breakdown    = EXCLUDED.score_breakdown,
    updated_at         = now();
$$;


ALTER FUNCTION canonical.recompute_institution_completeness() OWNER TO postgres;

--
-- Name: recompute_quality_scores(); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.recompute_quality_scores() RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'canonical', 'public'
    AS $$
DECLARE n integer;
BEGIN
  WITH comp AS (
    SELECT i.id,
           i.updated_at,
           COALESCE(c.overall_score, 0)::numeric AS coverage,
           ( (COALESCE(c.admissions_score,0)   > 0)::int
           + (COALESCE(c.financials_score,0)   > 0)::int
           + (COALESCE(c.outcomes_score,0)     > 0)::int
           + (COALESCE(c.rankings_score,0)     > 0)::int
           + (COALESCE(c.programs_score,0)     > 0)::int
           + (COALESCE(c.demographics_score,0) > 0)::int
           + (COALESCE(c.deadlines_score,0)    > 0)::int
           + (COALESCE(c.requirements_score,0) > 0)::int ) AS sections_present
    FROM canonical.institutions i
    LEFT JOIN canonical.institution_completeness c ON c.institution_id = i.id
  ),
  checks AS (
    SELECT
      cm.id,
      cm.coverage,
      cm.sections_present,
      LEAST(100, GREATEST(40,
        CASE
          WHEN extract(epoch FROM (now() - cm.updated_at)) / 86400 <= 90  THEN 100
          WHEN extract(epoch FROM (now() - cm.updated_at)) / 86400 >= 365 THEN 50
          ELSE 100 - (extract(epoch FROM (now() - cm.updated_at)) / 86400 - 90) * (50.0 / 275)
        END
      ))::numeric(5,2) AS freshness,
      (cm.sections_present * 100.0 / 8)::numeric(5,2) AS lineage,
      GREATEST(0, 100
        - CASE WHEN EXISTS (
            SELECT 1 FROM canonical.institution_admissions a
            WHERE a.institution_id = cm.id AND a.acceptance_rate IS NOT NULL
              AND (a.acceptance_rate < 0 OR a.acceptance_rate > 100)
          ) THEN 30 ELSE 0 END
        - CASE WHEN EXISTS (
            SELECT 1 FROM canonical.institution_outcomes o
            WHERE o.institution_id = cm.id AND (
                 (o.graduation_rate_6yr IS NOT NULL AND (o.graduation_rate_6yr < 0 OR o.graduation_rate_6yr > 100))
              OR (o.median_start_salary IS NOT NULL AND (o.median_start_salary <= 0 OR o.median_start_salary > 1000000))
            )
          ) THEN 20 ELSE 0 END
      )::numeric(5,2) AS consistency,
      100.0::numeric(5,2) AS conflict
    FROM comp cm
  )
  INSERT INTO canonical.institution_quality_scores AS qs
    (institution_id, consistency_score, freshness_score, lineage_score,
     conflict_score, final_quality_score, diagnostics, updated_at)
  SELECT
    id, consistency, freshness, lineage, conflict,
    round(0.45 * coverage + 0.20 * lineage + 0.20 * freshness + 0.15 * consistency, 2),
    jsonb_build_object(
      'coverage', round(coverage, 2),
      'lineage', lineage,
      'freshness', freshness,
      'consistency', consistency,
      'conflict', conflict,
      'sections_present', sections_present,
      'weights', jsonb_build_object('coverage', 0.45, 'lineage', 0.20, 'freshness', 0.20, 'consistency', 0.15),
      'computed_at', now()
    ),
    now()
  FROM checks
  ON CONFLICT (institution_id) DO UPDATE SET
    consistency_score   = EXCLUDED.consistency_score,
    freshness_score     = EXCLUDED.freshness_score,
    lineage_score       = EXCLUDED.lineage_score,
    conflict_score      = EXCLUDED.conflict_score,
    final_quality_score = EXCLUDED.final_quality_score,
    diagnostics         = EXCLUDED.diagnostics,
    updated_at          = now();

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;


ALTER FUNCTION canonical.recompute_quality_scores() OWNER TO postgres;

--
-- Name: refresh_popularity_score_from_rankings(); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.refresh_popularity_score_from_rankings() RETURNS void
    LANGUAGE sql
    AS $$
  WITH ranking AS (
    SELECT institution_id, MIN(global_rank) AS best_global_rank
    FROM canonical.institution_rankings
    GROUP BY institution_id
  ),
  admissions AS (
    SELECT institution_id,
           MAX(application_volume) AS application_volume,
           MAX(acceptance_rate) AS acceptance_rate
    FROM canonical.institution_admissions
    GROUP BY institution_id
  ),
  outcomes AS (
    SELECT institution_id, MAX(median_start_salary) AS salary
    FROM canonical.institution_outcomes
    GROUP BY institution_id
  ),
  scored AS (
    SELECT
      i.id,
      (
        (CASE
          WHEN r.best_global_rank IS NULL THEN 0.25
          WHEN r.best_global_rank <= 10 THEN 1.0
          WHEN r.best_global_rank <= 25 THEN 0.95
          WHEN r.best_global_rank <= 50 THEN 0.90
          WHEN r.best_global_rank <= 100 THEN 0.85
          WHEN r.best_global_rank <= 200 THEN 0.78
          WHEN r.best_global_rank <= 300 THEN 0.70
          WHEN r.best_global_rank <= 500 THEN 0.62
          ELSE 0.50
        END) * 0.45
        + LEAST(COALESCE(a.application_volume, 0) / 100000.0, 1.0) * 0.20
        + (1 - LEAST(COALESCE(a.acceptance_rate, 0.8), 1.0)) * 0.20
        + LEAST(COALESCE(o.salary, 0) / 200000.0, 1.0) * 0.15
      ) * 100 AS popularity_score
    FROM canonical.institutions i
    LEFT JOIN ranking r ON r.institution_id = i.id
    LEFT JOIN admissions a ON a.institution_id = i.id
    LEFT JOIN outcomes o ON o.institution_id = i.id
  )
  UPDATE canonical.institutions i
     SET popularity_score = ROUND(s.popularity_score::numeric, 2)
    FROM scored s
   WHERE s.id = i.id;
$$;


ALTER FUNCTION canonical.refresh_popularity_score_from_rankings() OWNER TO postgres;

--
-- Name: resolve_source_tier(text, jsonb); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.resolve_source_tier(p_source_table text, p_payload jsonb) RETURNS canonical.source_tier
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE
    WHEN lower(coalesce(p_payload->>'source','')) IN ('ipeds','data.gov','college_scorecard','ucas','nirf','hesa','eurostat') THEN 'government_dataset'::canonical.source_tier
    WHEN lower(coalesce(p_payload->>'source','')) IN ('official','official_site','university_official','institution') THEN 'official_institution_data'::canonical.source_tier
    WHEN lower(coalesce(p_payload->>'source','')) LIKE '%common data set%' OR lower(coalesce(p_payload->>'source','')) = 'cds' THEN 'common_data_set'::canonical.source_tier
    WHEN p_source_table IN ('public.colleges_comprehensive','public.college_admissions','public.college_financial_data','public.academic_details','public.academic_outcomes','public.student_demographics','public.campus_life','public.college_programs','public.college_deadlines') THEN 'verified_import'::canonical.source_tier
    WHEN p_source_table IN ('public.colleges','public.colleges_legacy','public.application_deadlines','public.scholarships_new') THEN 'scraped_third_party'::canonical.source_tier
    ELSE 'inferred_generated'::canonical.source_tier
  END;
$$;


ALTER FUNCTION canonical.resolve_source_tier(p_source_table text, p_payload jsonb) OWNER TO postgres;

--
-- Name: safe_timestamptz(text); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.safe_timestamptz(p_value text) RETURNS timestamp with time zone
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE v_out TIMESTAMPTZ;
BEGIN
  IF p_value IS NULL OR trim(p_value) = '' THEN RETURN NULL; END IF;
  BEGIN
    v_out := p_value::timestamptz;
    RETURN v_out;
  EXCEPTION WHEN others THEN RETURN NULL; END;
END;
$$;


ALTER FUNCTION canonical.safe_timestamptz(p_value text) OWNER TO postgres;

--
-- Name: search_colleges(text, text, text, numeric, numeric, numeric, boolean, text, integer, integer, text, text); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.search_colleges(p_q text DEFAULT NULL::text, p_keywords text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_max_tuition numeric DEFAULT NULL::numeric, p_min_acceptance numeric DEFAULT NULL::numeric, p_max_acceptance numeric DEFAULT NULL::numeric, p_test_optional boolean DEFAULT NULL::boolean, p_sort text DEFAULT 'relevance'::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_program text DEFAULT NULL::text, p_institution_type text DEFAULT NULL::text) RETURNS TABLE(institution_id uuid, score real)
    LANGUAGE sql STABLE
    SET search_path TO 'canonical', 'public'
    AS $$
  WITH ent AS (
    SELECT s.institution_id, s.score
    FROM canonical.search_institutions(p_q, 1000, 0) s
    WHERE p_q IS NOT NULL AND length(btrim(p_q)) > 0
  ),
  kw AS (
    SELECT si.institution_id,
           ts_rank(si.search_document, websearch_to_tsquery('english', p_keywords)) AS kwrank
    FROM canonical.institution_search_index si
    WHERE p_keywords IS NOT NULL AND length(btrim(p_keywords)) > 0
      AND si.search_document @@ websearch_to_tsquery('english', p_keywords)
  ),
  filtered AS (
    SELECT m.id,
           m.global_rank, m.acceptance_rate, m.cost_of_attendance,
           m.median_start_salary, m.popularity_score,
           e.score AS ent_score,
           COALESCE(k.kwrank, 0) AS kw_rank
    FROM canonical.mv_college_cards m
    LEFT JOIN ent e ON e.institution_id = m.id
    LEFT JOIN kw  k ON k.institution_id = m.id
    WHERE (p_q IS NULL OR length(btrim(p_q)) = 0 OR e.institution_id IS NOT NULL)
      AND (p_keywords IS NULL OR length(btrim(p_keywords)) = 0 OR k.institution_id IS NOT NULL)
      AND (p_country IS NULL OR m.country_code = upper(p_country))
      AND (p_max_tuition IS NULL OR m.cost_of_attendance <= p_max_tuition)
      AND (p_min_acceptance IS NULL OR m.acceptance_rate >= p_min_acceptance)
      AND (p_max_acceptance IS NULL OR m.acceptance_rate <= p_max_acceptance)
      AND (p_test_optional IS NULL OR m.test_optional = p_test_optional)
      AND (p_program IS NULL OR length(btrim(p_program)) = 0 OR EXISTS (
        SELECT 1 FROM canonical.institution_programs ip
        WHERE ip.institution_id = m.id AND ip.program_name = p_program
      ))
      AND (p_institution_type IS NULL OR length(btrim(p_institution_type)) = 0
           OR m.institution_type ILIKE p_institution_type)
  )
  SELECT id, GREATEST(COALESCE(ent_score, 0), COALESCE(kw_rank, 0))::real AS score
  FROM filtered
  ORDER BY
    CASE WHEN p_sort = 'ranking'    THEN global_rank END ASC NULLS LAST,
    CASE WHEN p_sort = 'tuition'    THEN cost_of_attendance END ASC NULLS LAST,
    CASE WHEN p_sort = 'salary'     THEN median_start_salary END DESC NULLS LAST,
    CASE WHEN p_sort = 'acceptance' THEN acceptance_rate END ASC NULLS LAST,
    CASE WHEN p_sort = 'popularity' AND global_rank IS NOT NULL THEN 0 ELSE 1 END ASC,
    CASE WHEN p_sort = 'popularity' THEN global_rank END ASC NULLS LAST,
    CASE WHEN p_sort = 'popularity' THEN acceptance_rate END ASC NULLS LAST,
    CASE WHEN p_sort = 'relevance' THEN COALESCE(ent_score, 0) END DESC NULLS LAST,
    CASE WHEN p_sort = 'relevance' AND global_rank IS NOT NULL THEN 0 ELSE 1 END ASC,
    CASE WHEN p_sort = 'relevance' THEN global_rank END ASC NULLS LAST,
    CASE WHEN p_sort = 'relevance' THEN acceptance_rate END ASC NULLS LAST,
    CASE WHEN p_sort = 'relevance' THEN kw_rank END DESC NULLS LAST,
    popularity_score DESC NULLS LAST,
    global_rank ASC NULLS LAST,
    id ASC
  LIMIT GREATEST(COALESCE(p_limit, 20), 0)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;


ALTER FUNCTION canonical.search_colleges(p_q text, p_keywords text, p_country text, p_max_tuition numeric, p_min_acceptance numeric, p_max_acceptance numeric, p_test_optional boolean, p_sort text, p_limit integer, p_offset integer, p_program text, p_institution_type text) OWNER TO postgres;

--
-- Name: search_institutions(text, integer, integer); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.search_institutions(p_q text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0) RETURNS TABLE(institution_id uuid, score real)
    LANGUAGE sql STABLE
    SET search_path TO 'canonical', 'public'
    AS $$
  WITH params AS (
    SELECT canonical.normalize_search_text(p_q) AS nq,
           replace(canonical.normalize_search_text(p_q), ' ', '') AS aq
  ),
  -- Narrow candidates using the trigram indexes (name OR any alias).
  cand AS (
    SELECT i.id
    FROM canonical.institutions i, params p
    WHERE p.nq IS NOT NULL AND i.normalized_name % p.nq
    UNION
    SELECT a.institution_id
    FROM canonical.institution_aliases a, params p
    WHERE p.nq IS NOT NULL AND (a.normalized_alias % p.nq OR a.normalized_alias % p.aq)
  ),
  scored AS (
    SELECT
      i.id,
      i.popularity_score,
      GREATEST(
        CASE WHEN i.normalized_name = p.nq THEN 1.00 ELSE 0 END,
        CASE WHEN i.normalized_name LIKE p.nq || '%' THEN 0.60 ELSE 0 END,
        GREATEST(similarity(i.normalized_name, p.nq),
                 word_similarity(p.nq, i.normalized_name)) * 0.90,
        COALESCE((
          SELECT GREATEST(
                   MAX(CASE WHEN a.normalized_alias = p.nq THEN 0.97
                            WHEN a.normalized_alias = p.aq THEN 0.95 ELSE 0 END),
                   MAX(GREATEST(similarity(a.normalized_alias, p.nq),
                               similarity(a.normalized_alias, p.aq))) * 0.90
                 )
          FROM canonical.institution_aliases a
          WHERE a.institution_id = i.id
        ), 0)
      )::real AS score
    FROM canonical.institutions i, params p
    WHERE i.id IN (SELECT id FROM cand)
  )
  SELECT id, score
  FROM scored
  WHERE score >= 0.20
  ORDER BY score DESC, popularity_score DESC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 20), 0)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;


ALTER FUNCTION canonical.search_institutions(p_q text, p_limit integer, p_offset integer) OWNER TO postgres;

--
-- Name: source_priority_from_tier(canonical.source_tier); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.source_priority_from_tier(p_tier canonical.source_tier) RETURNS smallint
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE p_tier
    WHEN 'government_dataset' THEN 1 WHEN 'official_institution_data' THEN 2
    WHEN 'common_data_set' THEN 3 WHEN 'verified_import' THEN 4
    WHEN 'scraped_third_party' THEN 5 ELSE 6
  END;
$$;


ALTER FUNCTION canonical.source_priority_from_tier(p_tier canonical.source_tier) OWNER TO postgres;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: canonical; Owner: postgres
--

CREATE FUNCTION canonical.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION canonical.update_updated_at_column() OWNER TO postgres;

--
-- Name: coa_set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.coa_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.coa_set_updated_at() OWNER TO postgres;

--
-- Name: colleges_search_vector_update(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.colleges_search_vector_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.city, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.state_region, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.country, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'D');
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.colleges_search_vector_update() OWNER TO postgres;

--
-- Name: compute_popularity_score(integer, integer, bigint, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.compute_popularity_score(p_enrollment integer, p_ranking_us_news integer, p_applications bigint, p_acceptance_rate numeric) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
  score NUMERIC := 0;
BEGIN
  -- Enrollment weight (0-40 pts, capped at 50 000)
  score := score + LEAST(COALESCE(p_enrollment, 0), 50000)::NUMERIC / 50000 * 40;

  -- Ranking weight (0-30 pts, only top 500)
  IF p_ranking_us_news IS NOT NULL AND p_ranking_us_news <= 500 THEN
    score := score + (500 - p_ranking_us_news)::NUMERIC / 500 * 30;
  END IF;

  -- Application volume weight (0-20 pts, capped at 100 000)
  score := score + LEAST(COALESCE(p_applications, 0), 100000)::NUMERIC / 100000 * 20;

  -- Selectivity bonus (0-10 pts; lower acceptance rate = higher prestige)
  IF p_acceptance_rate IS NOT NULL THEN
    score := score + GREATEST(0, (1 - p_acceptance_rate)) * 10;
  END IF;

  RETURN ROUND(score, 2);
END;
$$;


ALTER FUNCTION public.compute_popularity_score(p_enrollment integer, p_ranking_us_news integer, p_applications bigint, p_acceptance_rate numeric) OWNER TO postgres;

--
-- Name: financing_options_set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.financing_options_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.financing_options_set_updated_at() OWNER TO postgres;

--
-- Name: get_distinct_countries(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_distinct_countries() RETURNS TABLE(country text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT DISTINCT country
  FROM   colleges_comprehensive
  WHERE  country IS NOT NULL
  ORDER  BY country;
$$;


ALTER FUNCTION public.get_distinct_countries() OWNER TO postgres;

--
-- Name: get_distinct_states(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_distinct_states() RETURNS TABLE(state text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT DISTINCT state
  FROM   colleges_comprehensive
  WHERE  state IS NOT NULL
  ORDER  BY state;
$$;


ALTER FUNCTION public.get_distinct_states() OWNER TO postgres;

--
-- Name: get_latest_rate(text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_latest_rate(p_base text, p_quote text) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
  SELECT rate
  FROM   currency_rates
  WHERE  base_currency  = p_base
    AND  quote_currency = p_quote
  ORDER  BY rate_date DESC, fetched_at DESC
  LIMIT  1;
$$;


ALTER FUNCTION public.get_latest_rate(p_base text, p_quote text) OWNER TO postgres;

--
-- Name: search_colleges_filtered(text, text, text, text, text, double precision, double precision, double precision, text, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.search_colleges_filtered(p_query text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_setting text DEFAULT NULL::text, p_min_acceptance double precision DEFAULT NULL::double precision, p_max_acceptance double precision DEFAULT NULL::double precision, p_max_tuition double precision DEFAULT NULL::double precision, p_sort_by text DEFAULT 'name'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20) RETURNS TABLE(total integer, ids json)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_sort_by          text;
  v_needs_admissions bool;
  v_needs_financials bool;
BEGIN
  -- Validate sort field
  v_sort_by := CASE WHEN p_sort_by IN ('name','acceptance_rate','tuition') THEN p_sort_by ELSE 'name' END;

  -- Determine whether child-table joins are required
  v_needs_admissions := (p_min_acceptance IS NOT NULL
                         OR p_max_acceptance IS NOT NULL
                         OR v_sort_by = 'acceptance_rate');
  v_needs_financials := (p_max_tuition IS NOT NULL
                         OR v_sort_by = 'tuition');

  -- ── FAST PATH: no child-table joins needed ──────────────────────────────────
  -- When neither acceptance_rate nor tuition filtering/sorting is requested,
  -- skip both LATERAL JOINs entirely.  All 6,200+ rows are scanned using
  -- btree/GIN indexes on the main table alone.
  IF NOT v_needs_admissions AND NOT v_needs_financials THEN
    RETURN QUERY
    WITH filtered AS (
      SELECT c.id, c.name
      FROM   colleges_comprehensive c
      WHERE
            (p_query   IS NULL OR c.name    ILIKE '%' || p_query   || '%')
        AND (p_country IS NULL OR c.country =     p_country)
        AND (p_state   IS NULL OR c.state   =     p_state)
        AND (p_type    IS NULL OR c.type    =     p_type)
        AND (p_setting IS NULL OR c.setting =     p_setting)
    ),
    counted AS (SELECT COUNT(*)::int AS total FROM filtered),
    paginated AS (
      SELECT id FROM filtered
      ORDER BY name ASC
      LIMIT  p_page_size
      OFFSET (p_page - 1) * p_page_size
    )
    SELECT
      c.total,
      COALESCE((SELECT json_agg(id) FROM paginated), '[]'::json)
    FROM counted c;
    RETURN;
  END IF;

  -- ── FULL PATH: LATERAL JOINs for acceptance_rate / tuition ─────────────────
  RETURN QUERY
  WITH filtered AS (
    SELECT
      c.id,
      c.name,
      ca.acceptance_rate,
      COALESCE(cf.tuition_out_state, cf.tuition_international) AS tuition
    FROM   colleges_comprehensive c
    LEFT JOIN LATERAL (
      SELECT acceptance_rate
      FROM   college_admissions
      WHERE  college_id = c.id
      ORDER  BY id
      LIMIT  1
    ) ca ON TRUE
    LEFT JOIN LATERAL (
      SELECT tuition_out_state, tuition_international
      FROM   college_financial_data
      WHERE  college_id = c.id
      ORDER  BY id
      LIMIT  1
    ) cf ON TRUE
    WHERE
          (p_query          IS NULL OR c.name     ILIKE '%' || p_query || '%')
      AND (p_country        IS NULL OR c.country  =     p_country)
      AND (p_state          IS NULL OR c.state    =     p_state)
      AND (p_type           IS NULL OR c.type     =     p_type)
      AND (p_setting        IS NULL OR c.setting  =     p_setting)
      AND (p_min_acceptance IS NULL OR ca.acceptance_rate >= p_min_acceptance)
      AND (p_max_acceptance IS NULL OR ca.acceptance_rate <= p_max_acceptance)
      AND (
        p_max_tuition IS NULL
        OR COALESCE(cf.tuition_out_state, cf.tuition_international) <= p_max_tuition
      )
  ),
  counted AS (SELECT COUNT(*)::int AS total FROM filtered),
  paginated AS (
    SELECT id
    FROM   filtered
    ORDER BY
      CASE WHEN v_sort_by = 'acceptance_rate' THEN acceptance_rate END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'tuition'         THEN tuition         END ASC NULLS LAST,
      name ASC
    LIMIT  p_page_size
    OFFSET (p_page - 1) * p_page_size
  )
  SELECT
    c.total,
    COALESCE((SELECT json_agg(id) FROM paginated), '[]'::json)
  FROM counted c;
END;
$$;


ALTER FUNCTION public.search_colleges_filtered(p_query text, p_country text, p_state text, p_type text, p_setting text, p_min_acceptance double precision, p_max_acceptance double precision, p_max_tuition double precision, p_sort_by text, p_page integer, p_page_size integer) OWNER TO postgres;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

--
-- Name: update_user_profiles_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_user_profiles_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_user_profiles_updated_at() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: data_quality_snapshots; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.data_quality_snapshots (
    id bigint NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    severity text NOT NULL,
    category text NOT NULL,
    issue_count integer NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL
);


ALTER TABLE canonical.data_quality_snapshots OWNER TO postgres;

--
-- Name: data_quality_snapshots_id_seq; Type: SEQUENCE; Schema: canonical; Owner: postgres
--

ALTER TABLE canonical.data_quality_snapshots ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME canonical.data_quality_snapshots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: deadline_history; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.deadline_history (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    institution_deadline_id uuid,
    previous_deadline date,
    new_deadline date,
    changed_at timestamp with time zone DEFAULT now(),
    source_url text,
    change_reason text
);


ALTER TABLE canonical.deadline_history OWNER TO postgres;

--
-- Name: eu_admissions_profile; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.eu_admissions_profile (
    institution_id uuid NOT NULL,
    ects_required boolean,
    bologna_cycle text,
    language_requirements jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_attribution jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    verification_status canonical.verification_status DEFAULT 'unknown'::canonical.verification_status NOT NULL,
    last_verified_at timestamp with time zone
);


ALTER TABLE canonical.eu_admissions_profile OWNER TO postgres;

--
-- Name: experiment_assignments; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.experiment_assignments (
    id bigint NOT NULL,
    experiment_key text NOT NULL,
    user_id integer NOT NULL,
    variant text NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE canonical.experiment_assignments OWNER TO postgres;

--
-- Name: experiment_assignments_id_seq; Type: SEQUENCE; Schema: canonical; Owner: postgres
--

CREATE SEQUENCE canonical.experiment_assignments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE canonical.experiment_assignments_id_seq OWNER TO postgres;

--
-- Name: experiment_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: canonical; Owner: postgres
--

ALTER SEQUENCE canonical.experiment_assignments_id_seq OWNED BY canonical.experiment_assignments.id;


--
-- Name: india_admissions_profile; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.india_admissions_profile (
    institution_id uuid NOT NULL,
    jee_required boolean,
    cuet_required boolean,
    nirf_rank integer,
    reservation_categories jsonb DEFAULT '[]'::jsonb NOT NULL,
    entrance_exam_details jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_attribution jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    verification_status canonical.verification_status DEFAULT 'unknown'::canonical.verification_status NOT NULL,
    last_verified_at timestamp with time zone
);


ALTER TABLE canonical.india_admissions_profile OWNER TO postgres;

--
-- Name: india_financial_aid; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.india_financial_aid (
    institution_id uuid NOT NULL,
    scholarship_portal text,
    state_scholarships jsonb DEFAULT '[]'::jsonb NOT NULL,
    reservation_aid_available boolean,
    source_attribution jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    verification_status canonical.verification_status DEFAULT 'unknown'::canonical.verification_status NOT NULL,
    last_verified_at timestamp with time zone
);


ALTER TABLE canonical.india_financial_aid OWNER TO postgres;

--
-- Name: institution_admissions; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_admissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    data_year integer,
    admissions_cycle text DEFAULT 'regular'::text NOT NULL,
    acceptance_rate numeric(6,3),
    early_decision_rate numeric(6,3),
    early_action_rate numeric(6,3),
    regular_decision_rate numeric(6,3),
    waitlist_rate numeric(6,3),
    transfer_acceptance_rate numeric(6,3),
    yield_rate numeric(6,3),
    application_volume integer,
    admit_volume integer,
    enrollment_volume integer,
    international_accept_rate numeric(6,3),
    in_state_accept_rate numeric(6,3),
    out_state_accept_rate numeric(6,3),
    test_optional boolean,
    sat_25 integer,
    sat_50 integer,
    sat_75 integer,
    act_25 integer,
    act_50 integer,
    act_75 integer,
    exam_requirements jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_attribution jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ed_acceptance_rate numeric(5,4),
    ea_acceptance_rate numeric(5,4),
    international_acceptance_rate numeric(5,4),
    applied_count integer,
    admitted_count integer,
    enrolled_count integer,
    sat_total_25 integer,
    sat_total_75 integer,
    sat_ebrw_25 integer,
    sat_ebrw_75 integer,
    sat_math_25 integer,
    sat_math_75 integer,
    gpa_avg numeric(4,2),
    gpa_25 numeric(4,2),
    gpa_75 numeric(4,2),
    gpa_scale numeric(4,1) DEFAULT 4.0,
    test_blind boolean,
    demonstrated_interest boolean,
    interview_required boolean,
    portfolio_required boolean,
    ap_accepted boolean,
    ib_accepted boolean,
    alevel_accepted boolean,
    essays_required boolean,
    essay_count integer,
    lor_count integer,
    min_toefl integer,
    min_ielts numeric(3,1),
    min_duolingo integer,
    admission_difficulty numeric(5,1),
    verification_status canonical.verification_status DEFAULT 'unknown'::canonical.verification_status NOT NULL,
    last_verified_at timestamp with time zone,
    CONSTRAINT chk_admissions_acceptance_rate_0_1 CHECK (((acceptance_rate IS NULL) OR ((acceptance_rate >= (0)::numeric) AND (acceptance_rate <= (1)::numeric)))),
    CONSTRAINT chk_admissions_early_action_rate_0_100 CHECK (((early_action_rate IS NULL) OR ((early_action_rate >= (0)::numeric) AND (early_action_rate <= (100)::numeric)))),
    CONSTRAINT chk_admissions_early_decision_rate_0_100 CHECK (((early_decision_rate IS NULL) OR ((early_decision_rate >= (0)::numeric) AND (early_decision_rate <= (100)::numeric)))),
    CONSTRAINT chk_admissions_yield_rate_0_1 CHECK (((yield_rate IS NULL) OR ((yield_rate >= (0)::numeric) AND (yield_rate <= (1)::numeric))))
);


ALTER TABLE canonical.institution_admissions OWNER TO postgres;

--
-- Name: institution_admissions_merge_archive; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_admissions_merge_archive (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    data_year integer,
    admissions_cycle text DEFAULT 'regular'::text NOT NULL,
    acceptance_rate numeric(6,3),
    early_decision_rate numeric(6,3),
    early_action_rate numeric(6,3),
    regular_decision_rate numeric(6,3),
    waitlist_rate numeric(6,3),
    transfer_acceptance_rate numeric(6,3),
    yield_rate numeric(6,3),
    application_volume integer,
    admit_volume integer,
    enrollment_volume integer,
    international_accept_rate numeric(6,3),
    in_state_accept_rate numeric(6,3),
    out_state_accept_rate numeric(6,3),
    test_optional boolean,
    sat_25 integer,
    sat_50 integer,
    sat_75 integer,
    act_25 integer,
    act_50 integer,
    act_75 integer,
    exam_requirements jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_attribution jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ed_acceptance_rate numeric(5,4),
    ea_acceptance_rate numeric(5,4),
    international_acceptance_rate numeric(5,4),
    applied_count integer,
    admitted_count integer,
    enrolled_count integer,
    sat_total_25 integer,
    sat_total_75 integer,
    sat_ebrw_25 integer,
    sat_ebrw_75 integer,
    sat_math_25 integer,
    sat_math_75 integer,
    gpa_avg numeric(4,2),
    gpa_25 numeric(4,2),
    gpa_75 numeric(4,2),
    gpa_scale numeric(4,1) DEFAULT 4.0,
    test_blind boolean,
    demonstrated_interest boolean,
    interview_required boolean,
    portfolio_required boolean,
    ap_accepted boolean,
    ib_accepted boolean,
    alevel_accepted boolean,
    essays_required boolean,
    essay_count integer,
    lor_count integer,
    min_toefl integer,
    min_ielts numeric(3,1),
    min_duolingo integer,
    admission_difficulty numeric(5,1),
    verification_status canonical.verification_status DEFAULT 'unknown'::canonical.verification_status NOT NULL,
    last_verified_at timestamp with time zone,
    archived_at timestamp with time zone DEFAULT now(),
    archive_reason text,
    winning_row_id uuid
);


ALTER TABLE canonical.institution_admissions_merge_archive OWNER TO postgres;

--
-- Name: institution_aliases; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_aliases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    alias text NOT NULL,
    normalized_alias text NOT NULL,
    alias_type text DEFAULT 'known_alias'::text NOT NULL,
    source_table text,
    source_pk text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE canonical.institution_aliases OWNER TO postgres;

--
-- Name: institution_campus_life; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_campus_life (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    housing_guarantee text,
    campus_safety_score numeric(8,3),
    cost_of_living_index numeric(8,3),
    climate_zone text,
    student_satisfaction_score numeric(8,3),
    athletics_division text,
    club_count integer,
    mental_health_rating numeric(8,3),
    source_attribution jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pct_living_on_campus numeric(5,2),
    dorm_quality_score numeric(3,1),
    dining_quality_score numeric(3,1),
    clubs_count integer,
    varsity_sports_count integer,
    greek_life boolean,
    greek_life_pct numeric(5,2),
    workload_score numeric(3,1),
    mental_health_services boolean,
    party_score numeric(3,1),
    international_friendly boolean,
    avg_class_size integer,
    honors_program boolean,
    study_abroad boolean,
    co_op_programs boolean,
    research_opportunities boolean,
    internship_support boolean,
    verification_status canonical.verification_status DEFAULT 'unknown'::canonical.verification_status NOT NULL,
    last_verified_at timestamp with time zone
);


ALTER TABLE canonical.institution_campus_life OWNER TO postgres;

--
-- Name: institution_completeness; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_completeness (
    institution_id uuid NOT NULL,
    admissions_score numeric(5,2) DEFAULT 0 NOT NULL,
    financials_score numeric(5,2) DEFAULT 0 NOT NULL,
    outcomes_score numeric(5,2) DEFAULT 0 NOT NULL,
    rankings_score numeric(5,2) DEFAULT 0 NOT NULL,
    programs_score numeric(5,2) DEFAULT 0 NOT NULL,
    demographics_score numeric(5,2) DEFAULT 0 NOT NULL,
    requirements_score numeric(5,2) DEFAULT 0 NOT NULL,
    deadlines_score numeric(5,2) DEFAULT 0 NOT NULL,
    overall_score numeric(5,2) DEFAULT 0 NOT NULL,
    score_breakdown jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT institution_completeness_admissions_score_check CHECK (((admissions_score >= (0)::numeric) AND (admissions_score <= (100)::numeric))),
    CONSTRAINT institution_completeness_deadlines_score_check CHECK (((deadlines_score >= (0)::numeric) AND (deadlines_score <= (100)::numeric))),
    CONSTRAINT institution_completeness_demographics_score_check CHECK (((demographics_score >= (0)::numeric) AND (demographics_score <= (100)::numeric))),
    CONSTRAINT institution_completeness_financials_score_check CHECK (((financials_score >= (0)::numeric) AND (financials_score <= (100)::numeric))),
    CONSTRAINT institution_completeness_outcomes_score_check CHECK (((outcomes_score >= (0)::numeric) AND (outcomes_score <= (100)::numeric))),
    CONSTRAINT institution_completeness_overall_score_check CHECK (((overall_score >= (0)::numeric) AND (overall_score <= (100)::numeric))),
    CONSTRAINT institution_completeness_programs_score_check CHECK (((programs_score >= (0)::numeric) AND (programs_score <= (100)::numeric))),
    CONSTRAINT institution_completeness_rankings_score_check CHECK (((rankings_score >= (0)::numeric) AND (rankings_score <= (100)::numeric))),
    CONSTRAINT institution_completeness_requirements_score_check CHECK (((requirements_score >= (0)::numeric) AND (requirements_score <= (100)::numeric)))
);


ALTER TABLE canonical.institution_completeness OWNER TO postgres;

--
-- Name: institution_completeness_merge_archive; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_completeness_merge_archive (
    institution_id uuid NOT NULL,
    admissions_score numeric(5,2) DEFAULT 0 NOT NULL,
    financials_score numeric(5,2) DEFAULT 0 NOT NULL,
    outcomes_score numeric(5,2) DEFAULT 0 NOT NULL,
    rankings_score numeric(5,2) DEFAULT 0 NOT NULL,
    programs_score numeric(5,2) DEFAULT 0 NOT NULL,
    demographics_score numeric(5,2) DEFAULT 0 NOT NULL,
    requirements_score numeric(5,2) DEFAULT 0 NOT NULL,
    deadlines_score numeric(5,2) DEFAULT 0 NOT NULL,
    overall_score numeric(5,2) DEFAULT 0 NOT NULL,
    score_breakdown jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone DEFAULT now(),
    archive_reason text,
    winning_row_id uuid
);


ALTER TABLE canonical.institution_completeness_merge_archive OWNER TO postgres;

--
-- Name: institution_deadlines; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_deadlines (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    institution_id uuid NOT NULL,
    cycle_year text,
    cycle_year_key integer,
    degree_level text,
    applicant_type text,
    intake_term text,
    deadline_type text,
    deadline_date date,
    deadline_date_key date,
    notification_date date,
    is_binding boolean DEFAULT false,
    is_rolling boolean DEFAULT false,
    is_estimated boolean DEFAULT false,
    source_url text,
    source_domain text,
    source_type text,
    parser_name text,
    parser_version text,
    extraction_timestamp timestamp with time zone,
    last_verified timestamp with time zone,
    confidence_score numeric(5,2),
    source_priority integer DEFAULT 0,
    conflict_status text DEFAULT 'clean'::text,
    raw_payload jsonb DEFAULT '{}'::jsonb,
    parser_trace jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT institution_deadlines_applicant_type_check CHECK ((applicant_type = ANY (ARRAY['domestic'::text, 'international'::text, 'transfer'::text]))),
    CONSTRAINT institution_deadlines_conflict_status_check CHECK ((conflict_status = ANY (ARRAY['clean'::text, 'conflict'::text, 'manual_review'::text]))),
    CONSTRAINT institution_deadlines_deadline_type_check CHECK ((deadline_type = ANY (ARRAY['early_action'::text, 'early_decision_1'::text, 'early_decision_2'::text, 'regular_decision'::text, 'rolling'::text, 'priority'::text, 'scholarship'::text, 'transfer'::text, 'ucas_equal_consideration'::text]))),
    CONSTRAINT institution_deadlines_degree_level_check CHECK ((degree_level = ANY (ARRAY['undergraduate'::text, 'masters'::text, 'phd'::text, 'mba'::text, 'law'::text, 'medicine'::text]))),
    CONSTRAINT institution_deadlines_intake_term_check CHECK ((intake_term = ANY (ARRAY['fall'::text, 'spring'::text, 'summer'::text, 'winter'::text]))),
    CONSTRAINT institution_deadlines_source_type_check CHECK ((source_type = ANY (ARRAY['official'::text, 'common_app'::text, 'ucas'::text, 'government'::text, 'aggregator'::text])))
);


ALTER TABLE canonical.institution_deadlines OWNER TO postgres;

--
-- Name: institution_demographics; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_demographics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    data_year integer,
    data_year_key integer GENERATED ALWAYS AS (COALESCE(data_year, '-1'::integer)) STORED,
    percent_international numeric(6,3),
    gender_ratio text,
    ethnic_distribution jsonb DEFAULT '{}'::jsonb NOT NULL,
    percent_first_gen numeric(6,3),
    socioeconomic_index numeric(8,3),
    geographic_diversity_index numeric(8,3),
    legacy_percent numeric(6,3),
    athlete_percent numeric(6,3),
    transfer_percent numeric(6,3),
    source_attribution jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    verification_status canonical.verification_status DEFAULT 'unknown'::canonical.verification_status NOT NULL,
    last_verified_at timestamp with time zone
);


ALTER TABLE canonical.institution_demographics OWNER TO postgres;

--
-- Name: institution_embeddings; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_embeddings (
    institution_id uuid NOT NULL,
    model_name text NOT NULL,
    embedding public.vector(768) NOT NULL,
    embedding_dim integer NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    embedding_model text,
    embedding_version text,
    CONSTRAINT institution_embeddings_embedding_dim_check CHECK ((embedding_dim > 0))
);


ALTER TABLE canonical.institution_embeddings OWNER TO postgres;

--
-- Name: institution_financials; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_financials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    data_year integer,
    data_year_key integer GENERATED ALWAYS AS (COALESCE(data_year, '-1'::integer)) STORED,
    academic_year text,
    academic_year_key text GENERATED ALWAYS AS (COALESCE(academic_year, 'n/a'::text)) STORED,
    currency_code text DEFAULT 'USD'::text,
    tuition_in_state numeric(14,2),
    tuition_out_state numeric(14,2),
    tuition_international numeric(14,2),
    cost_of_attendance numeric(14,2),
    avg_financial_aid numeric(14,2),
    percent_receiving_aid numeric(6,3),
    avg_debt numeric(14,2),
    net_price_low_income numeric(14,2),
    net_price_mid_income numeric(14,2),
    net_price_high_income numeric(14,2),
    merit_scholarship_flag boolean,
    need_blind_flag boolean,
    no_loan_policy boolean,
    source_attribution jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tuition_domestic numeric(12,2),
    fees numeric(10,2),
    housing_cost numeric(10,2),
    meal_cost numeric(10,2),
    insurance_cost numeric(10,2),
    books_cost numeric(10,2),
    personal_expenses numeric(10,2),
    net_price numeric(12,2),
    need_based_aid_avg numeric(12,2),
    merit_aid_avg numeric(12,2),
    avg_scholarship numeric(12,2),
    pct_need_met numeric(5,2),
    avg_debt_at_graduation numeric(12,2),
    monthly_loan_payment numeric(10,2),
    need_blind_intl boolean,
    financial_difficulty numeric(5,1),
    verification_status canonical.verification_status DEFAULT 'unknown'::canonical.verification_status NOT NULL,
    last_verified_at timestamp with time zone,
    pell_grant_rate numeric(6,3),
    CONSTRAINT chk_financials_cost_of_attendance_nonneg CHECK (((cost_of_attendance IS NULL) OR (cost_of_attendance >= (0)::numeric))),
    CONSTRAINT chk_financials_tuition_international_nonneg CHECK (((tuition_international IS NULL) OR (tuition_international >= (0)::numeric)))
);


ALTER TABLE canonical.institution_financials OWNER TO postgres;

--
-- Name: COLUMN institution_financials.pell_grant_rate; Type: COMMENT; Schema: canonical; Owner: postgres
--

COMMENT ON COLUMN canonical.institution_financials.pell_grant_rate IS 'Pct of undergrads receiving a Pell Grant (0-100). Source: College Scorecard latest.aid.pell_grant_rate.';


--
-- Name: institution_financials_merge_archive; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_financials_merge_archive (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    data_year integer,
    data_year_key integer,
    academic_year text,
    academic_year_key text,
    currency_code text DEFAULT 'USD'::text,
    tuition_in_state numeric(14,2),
    tuition_out_state numeric(14,2),
    tuition_international numeric(14,2),
    cost_of_attendance numeric(14,2),
    avg_financial_aid numeric(14,2),
    percent_receiving_aid numeric(6,3),
    avg_debt numeric(14,2),
    net_price_low_income numeric(14,2),
    net_price_mid_income numeric(14,2),
    net_price_high_income numeric(14,2),
    merit_scholarship_flag boolean,
    need_blind_flag boolean,
    no_loan_policy boolean,
    source_attribution jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tuition_domestic numeric(12,2),
    fees numeric(10,2),
    housing_cost numeric(10,2),
    meal_cost numeric(10,2),
    insurance_cost numeric(10,2),
    books_cost numeric(10,2),
    personal_expenses numeric(10,2),
    net_price numeric(12,2),
    need_based_aid_avg numeric(12,2),
    merit_aid_avg numeric(12,2),
    avg_scholarship numeric(12,2),
    pct_need_met numeric(5,2),
    avg_debt_at_graduation numeric(12,2),
    monthly_loan_payment numeric(10,2),
    need_blind_intl boolean,
    financial_difficulty numeric(5,1),
    verification_status canonical.verification_status DEFAULT 'unknown'::canonical.verification_status NOT NULL,
    last_verified_at timestamp with time zone,
    archived_at timestamp with time zone DEFAULT now(),
    archive_reason text,
    winning_row_id uuid
);


ALTER TABLE canonical.institution_financials_merge_archive OWNER TO postgres;

--
-- Name: institution_identity_map; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_identity_map (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    source_table text DEFAULT 'app_user_added'::text NOT NULL,
    source_pk text NOT NULL,
    source_tier canonical.source_tier DEFAULT 'inferred_generated'::canonical.source_tier NOT NULL,
    source_priority smallint DEFAULT 6 NOT NULL,
    match_method text DEFAULT 'auto'::text NOT NULL,
    match_score numeric(6,4) DEFAULT 1 NOT NULL,
    is_canonical_match boolean DEFAULT true NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    canonical_institution_id uuid,
    legacy_id integer,
    source character varying(50) DEFAULT 'manual'::character varying,
    CONSTRAINT institution_identity_map_source_priority_check CHECK (((source_priority >= 1) AND (source_priority <= 6)))
);


ALTER TABLE canonical.institution_identity_map OWNER TO postgres;

--
-- Name: institution_merge_history; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_merge_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canonical_institution_id uuid NOT NULL,
    merged_institution_id uuid NOT NULL,
    merged_institution_name text,
    merged_institution_country text,
    tables_touched text[] NOT NULL,
    merged_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text
);


ALTER TABLE canonical.institution_merge_history OWNER TO postgres;

--
-- Name: institution_outcomes; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_outcomes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    data_year integer,
    data_year_key integer GENERATED ALWAYS AS (COALESCE(data_year, '-1'::integer)) STORED,
    graduation_rate_4yr numeric(6,3),
    graduation_rate_6yr numeric(6,3),
    retention_rate numeric(6,3),
    employment_rate numeric(6,3),
    median_start_salary numeric(14,2),
    median_mid_career_salary numeric(14,2),
    grad_school_rate numeric(6,3),
    internship_rate numeric(6,3),
    source_attribution jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    employment_rate_6mo numeric(5,2),
    employment_rate_1yr numeric(5,2),
    median_salary_1yr numeric(12,2),
    median_salary_5yr numeric(12,2),
    salary_25th_1yr numeric(12,2),
    salary_75th_1yr numeric(12,2),
    faang_placement_pct numeric(5,2),
    startup_placement_pct numeric(5,2),
    top_employers jsonb DEFAULT '[]'::jsonb,
    career_services_rank integer,
    internship_pct numeric(5,2),
    career_roi_score numeric(5,1),
    academic_difficulty numeric(5,1),
    verification_status canonical.verification_status DEFAULT 'unknown'::canonical.verification_status NOT NULL,
    last_verified_at timestamp with time zone,
    loan_default_rate_3yr numeric(6,3),
    CONSTRAINT chk_employment_rate_0_100 CHECK (((employment_rate IS NULL) OR ((employment_rate >= (0)::numeric) AND (employment_rate <= (100)::numeric)))),
    CONSTRAINT chk_graduation_rate_4yr_0_100 CHECK (((graduation_rate_4yr IS NULL) OR ((graduation_rate_4yr >= (0)::numeric) AND (graduation_rate_4yr <= (100)::numeric)))),
    CONSTRAINT chk_graduation_rate_6yr_0_100 CHECK (((graduation_rate_6yr IS NULL) OR ((graduation_rate_6yr >= (0)::numeric) AND (graduation_rate_6yr <= (100)::numeric)))),
    CONSTRAINT chk_outcomes_employment_rate_0_100 CHECK (((employment_rate IS NULL) OR ((employment_rate >= (0)::numeric) AND (employment_rate <= (100)::numeric)))),
    CONSTRAINT chk_outcomes_employment_rate_1yr_0_100 CHECK (((employment_rate_1yr IS NULL) OR ((employment_rate_1yr >= (0)::numeric) AND (employment_rate_1yr <= (100)::numeric)))),
    CONSTRAINT chk_outcomes_graduation_rate_4yr_0_100 CHECK (((graduation_rate_4yr IS NULL) OR ((graduation_rate_4yr >= (0)::numeric) AND (graduation_rate_4yr <= (100)::numeric)))),
    CONSTRAINT chk_outcomes_graduation_rate_6yr_0_100 CHECK (((graduation_rate_6yr IS NULL) OR ((graduation_rate_6yr >= (0)::numeric) AND (graduation_rate_6yr <= (100)::numeric)))),
    CONSTRAINT chk_outcomes_loan_default_rate_3yr_0_100 CHECK (((loan_default_rate_3yr IS NULL) OR ((loan_default_rate_3yr >= (0)::numeric) AND (loan_default_rate_3yr <= (100)::numeric)))),
    CONSTRAINT chk_outcomes_retention_rate_0_100 CHECK (((retention_rate IS NULL) OR ((retention_rate >= (0)::numeric) AND (retention_rate <= (100)::numeric)))),
    CONSTRAINT chk_retention_rate_0_100 CHECK (((retention_rate IS NULL) OR ((retention_rate >= (0)::numeric) AND (retention_rate <= (100)::numeric))))
);


ALTER TABLE canonical.institution_outcomes OWNER TO postgres;

--
-- Name: COLUMN institution_outcomes.loan_default_rate_3yr; Type: COMMENT; Schema: canonical; Owner: postgres
--

COMMENT ON COLUMN canonical.institution_outcomes.loan_default_rate_3yr IS '3-year federal student loan cohort default rate (0-100). Source: College Scorecard latest.repayment.3_yr_default_rate.';


--
-- Name: institution_placements; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_placements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    cycle_year text NOT NULL,
    highest_package_inr numeric,
    average_package_inr numeric,
    median_package_inr numeric,
    placement_rate_pct numeric,
    percentiles jsonb DEFAULT '{}'::jsonb,
    currency text DEFAULT 'INR'::text,
    source_url text,
    source_type text,
    confidence_score numeric,
    raw_payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE canonical.institution_placements OWNER TO postgres;

--
-- Name: institution_programs; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_programs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    program_name text NOT NULL,
    normalized_program_name text NOT NULL,
    degree_type text,
    degree_type_key text GENERATED ALWAYS AS (COALESCE(degree_type, ''::text)) STORED,
    field_category text,
    enrollment integer,
    acceptance_rate numeric(6,3),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_attribution jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    verification_status canonical.verification_status DEFAULT 'unknown'::canonical.verification_status NOT NULL,
    last_verified_at timestamp with time zone
);


ALTER TABLE canonical.institution_programs OWNER TO postgres;

--
-- Name: institution_quality_scores; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_quality_scores (
    institution_id uuid NOT NULL,
    consistency_score numeric(5,2) DEFAULT 0 NOT NULL,
    freshness_score numeric(5,2) DEFAULT 0 NOT NULL,
    lineage_score numeric(5,2) DEFAULT 0 NOT NULL,
    conflict_score numeric(5,2) DEFAULT 0 NOT NULL,
    final_quality_score numeric(5,2) DEFAULT 0 NOT NULL,
    diagnostics jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT institution_quality_scores_conflict_score_check CHECK (((conflict_score >= (0)::numeric) AND (conflict_score <= (100)::numeric))),
    CONSTRAINT institution_quality_scores_consistency_score_check CHECK (((consistency_score >= (0)::numeric) AND (consistency_score <= (100)::numeric))),
    CONSTRAINT institution_quality_scores_final_quality_score_check CHECK (((final_quality_score >= (0)::numeric) AND (final_quality_score <= (100)::numeric))),
    CONSTRAINT institution_quality_scores_freshness_score_check CHECK (((freshness_score >= (0)::numeric) AND (freshness_score <= (100)::numeric))),
    CONSTRAINT institution_quality_scores_lineage_score_check CHECK (((lineage_score >= (0)::numeric) AND (lineage_score <= (100)::numeric)))
);


ALTER TABLE canonical.institution_quality_scores OWNER TO postgres;

--
-- Name: institution_rankings; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_rankings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    ranking_year integer,
    ranking_year_key integer GENERATED ALWAYS AS (COALESCE(ranking_year, '-1'::integer)) STORED,
    ranking_body text NOT NULL,
    national_rank integer,
    global_rank integer,
    subject_rank integer,
    ranking_score numeric(8,3),
    source_attribution jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    niche_rank integer,
    wsj_rank integer,
    forbes_rank integer,
    guardian_rank integer,
    complete_uk_rank integer,
    shanghai_rank integer,
    nirf_rank integer,
    employer_reputation_rank integer,
    academic_reputation_rank integer,
    faculty_student_rank integer,
    citations_rank integer,
    intl_student_rank integer,
    qs_rank integer,
    the_rank integer,
    us_news_rank integer,
    qs_overall_score numeric(5,1),
    verification_status canonical.verification_status DEFAULT 'unknown'::canonical.verification_status NOT NULL,
    last_verified_at timestamp with time zone
);


ALTER TABLE canonical.institution_rankings OWNER TO postgres;

--
-- Name: institution_rankings_merge_archive; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_rankings_merge_archive (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    ranking_year integer,
    ranking_year_key integer,
    ranking_body text NOT NULL,
    national_rank integer,
    global_rank integer,
    subject_rank integer,
    ranking_score numeric(8,3),
    source_attribution jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    niche_rank integer,
    wsj_rank integer,
    forbes_rank integer,
    guardian_rank integer,
    complete_uk_rank integer,
    shanghai_rank integer,
    nirf_rank integer,
    employer_reputation_rank integer,
    academic_reputation_rank integer,
    faculty_student_rank integer,
    citations_rank integer,
    intl_student_rank integer,
    qs_rank integer,
    the_rank integer,
    us_news_rank integer,
    qs_overall_score numeric(5,1),
    verification_status canonical.verification_status DEFAULT 'unknown'::canonical.verification_status NOT NULL,
    last_verified_at timestamp with time zone,
    archived_at timestamp with time zone DEFAULT now(),
    archive_reason text,
    winning_row_id uuid
);


ALTER TABLE canonical.institution_rankings_merge_archive OWNER TO postgres;

--
-- Name: institution_requirements; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_requirements (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    institution_id uuid NOT NULL,
    cycle_year text,
    degree_level text,
    applicant_type text,
    sat_policy text,
    act_policy text,
    accepts_clt boolean DEFAULT false,
    sat_required boolean DEFAULT false,
    act_required boolean DEFAULT false,
    sat_optional boolean DEFAULT false,
    test_blind boolean DEFAULT false,
    sat_superscore boolean DEFAULT false,
    act_superscore boolean DEFAULT false,
    toefl_required boolean DEFAULT false,
    ielts_required boolean DEFAULT false,
    duolingo_required boolean DEFAULT false,
    cambridge_required boolean DEFAULT false,
    toefl_min_score numeric,
    ielts_min_score numeric(3,1),
    duolingo_min_score numeric,
    transcript_required boolean DEFAULT true,
    predicted_grades_required boolean DEFAULT false,
    cv_required boolean DEFAULT false,
    resume_required boolean DEFAULT false,
    essays_required boolean DEFAULT false,
    supplemental_essays_required boolean DEFAULT false,
    supplemental_essay_count integer DEFAULT 0,
    portfolio_required boolean DEFAULT false,
    audition_required boolean DEFAULT false,
    teacher_recommendations_required integer DEFAULT 0,
    counselor_recommendation_required boolean DEFAULT false,
    peer_recommendation_allowed boolean DEFAULT false,
    interview_required boolean DEFAULT false,
    interview_optional boolean DEFAULT false,
    interview_type text,
    common_app_supported boolean DEFAULT false,
    coalition_app_supported boolean DEFAULT false,
    ucas_supported boolean DEFAULT false,
    direct_apply_supported boolean DEFAULT false,
    application_platform text,
    financial_documents_required boolean DEFAULT false,
    passport_required boolean DEFAULT false,
    visa_documents_required boolean DEFAULT false,
    aps_required boolean DEFAULT false,
    uni_assist_required boolean DEFAULT false,
    source_url text,
    source_domain text,
    source_type text,
    parser_name text,
    parser_version text,
    extraction_timestamp timestamp with time zone,
    last_verified timestamp with time zone,
    confidence_score numeric(5,2),
    raw_requirements_text text,
    raw_payload jsonb DEFAULT '{}'::jsonb,
    parser_trace jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT institution_requirements_act_policy_check CHECK ((act_policy = ANY (ARRAY['required'::text, 'optional'::text, 'blind'::text, 'considered'::text, 'not_used'::text]))),
    CONSTRAINT institution_requirements_interview_type_check CHECK ((interview_type = ANY (ARRAY['online'::text, 'in_person'::text, 'alumni'::text, 'faculty'::text]))),
    CONSTRAINT institution_requirements_sat_policy_check CHECK ((sat_policy = ANY (ARRAY['required'::text, 'optional'::text, 'blind'::text, 'considered'::text, 'not_used'::text])))
);


ALTER TABLE canonical.institution_requirements OWNER TO postgres;

--
-- Name: institution_search_index; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_search_index (
    institution_id uuid NOT NULL,
    autocomplete_text text NOT NULL,
    search_tokens text[] DEFAULT ARRAY[]::text[] NOT NULL,
    searchable_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    search_document tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, ((COALESCE(autocomplete_text, ''::text) || ' '::text) || COALESCE((searchable_json)::text, ''::text)))) STORED,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE canonical.institution_search_index OWNER TO postgres;

--
-- Name: institution_source_registry; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institution_source_registry (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    institution_id uuid NOT NULL,
    source_category text,
    source_url text NOT NULL,
    source_domain text,
    source_type text,
    country_code text,
    parser_strategy text,
    crawl_frequency_days integer DEFAULT 30,
    is_active boolean DEFAULT true,
    last_crawled_at timestamp with time zone,
    robots_txt_allowed boolean DEFAULT true,
    source_priority integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT institution_source_registry_parser_strategy_check CHECK ((parser_strategy = ANY (ARRAY['html'::text, 'structured_json'::text, 'pdf'::text, 'api'::text]))),
    CONSTRAINT institution_source_registry_source_category_check CHECK ((source_category = ANY (ARRAY['admissions'::text, 'deadlines'::text, 'requirements'::text, 'financial_aid'::text]))),
    CONSTRAINT institution_source_registry_source_type_check CHECK ((source_type = ANY (ARRAY['official'::text, 'common_app'::text, 'ucas'::text, 'government'::text])))
);


ALTER TABLE canonical.institution_source_registry OWNER TO postgres;

--
-- Name: institutions; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.institutions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canonical_name text NOT NULL,
    normalized_name text NOT NULL,
    slug text NOT NULL,
    aliases jsonb DEFAULT '[]'::jsonb NOT NULL,
    short_name text,
    country_code text,
    region_code text,
    state_region text,
    city text,
    address text,
    postal_code text,
    latitude double precision,
    longitude double precision,
    institution_type text,
    control_type text,
    established_year integer,
    website text,
    logo_url text,
    verification_status canonical.verification_status DEFAULT 'unverified'::canonical.verification_status NOT NULL,
    source_priority smallint DEFAULT 6 NOT NULL,
    completeness_score numeric(5,2) DEFAULT 0 NOT NULL,
    canonical_external_ids jsonb DEFAULT canonical.base_external_ids() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    description text,
    popularity_score numeric DEFAULT 0,
    founded_year integer,
    campus_type text,
    campus_size_acres numeric(10,1),
    total_enrollment integer,
    undergraduate_enrollment integer,
    international_enrollment integer,
    international_pct numeric(5,2),
    faculty_count integer,
    student_faculty_ratio numeric(5,1),
    endowment_usd numeric(16,0),
    research_expenditure_usd numeric(16,0),
    prestige_score numeric(5,1),
    academic_reputation_score numeric(5,1),
    employer_reputation_score numeric(5,1),
    safety_score numeric(5,1),
    diversity_score numeric(5,1),
    walkability_score numeric(5,1),
    public_transport_score numeric(5,1),
    weather_score numeric(5,1),
    campus_fit_score numeric(5,1),
    student_happiness_score numeric(5,1),
    risk_score numeric(5,1),
    deprecated_duplicate_of uuid,
    deprecated_at timestamp with time zone,
    CONSTRAINT institutions_completeness_score_check CHECK (((completeness_score >= (0)::numeric) AND (completeness_score <= (100)::numeric))),
    CONSTRAINT institutions_established_year_check CHECK (((established_year IS NULL) OR ((established_year >= 1000) AND (established_year <= ((EXTRACT(year FROM CURRENT_DATE))::integer + 10))))),
    CONSTRAINT institutions_source_priority_check CHECK (((source_priority >= 1) AND (source_priority <= 6)))
);


ALTER TABLE canonical.institutions OWNER TO postgres;

--
-- Name: major_ontology; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.major_ontology (
    id bigint NOT NULL,
    canonical_major text NOT NULL,
    alias text NOT NULL,
    synonym_group text,
    parent_major text,
    related_majors text[] DEFAULT '{}'::text[] NOT NULL,
    interdisciplinary_fields text[] DEFAULT '{}'::text[] NOT NULL,
    career_mappings text[] DEFAULT '{}'::text[] NOT NULL,
    subject_rank_mappings text[] DEFAULT '{}'::text[] NOT NULL,
    confidence numeric(8,4) DEFAULT 0.8 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE canonical.major_ontology OWNER TO postgres;

--
-- Name: major_ontology_id_seq; Type: SEQUENCE; Schema: canonical; Owner: postgres
--

CREATE SEQUENCE canonical.major_ontology_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE canonical.major_ontology_id_seq OWNER TO postgres;

--
-- Name: major_ontology_id_seq; Type: SEQUENCE OWNED BY; Schema: canonical; Owner: postgres
--

ALTER SEQUENCE canonical.major_ontology_id_seq OWNED BY canonical.major_ontology.id;


--
-- Name: masters_admission_datapoints; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.masters_admission_datapoints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    masters_program_id uuid,
    source text NOT NULL,
    gre_verbal integer,
    gre_quant integer,
    gre_awa numeric(2,1),
    gmat_total integer,
    gpa numeric(5,2),
    gpa_scale numeric(5,2),
    decision text,
    decision_date date,
    intake_term text,
    intake_year integer,
    raw_program_name text,
    match_confidence numeric(3,2),
    scraped_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT masters_admission_datapoints_decision_check CHECK (((decision IS NULL) OR (decision = ANY (ARRAY['admit'::text, 'reject'::text, 'waitlist'::text, 'interview'::text, 'unknown'::text])))),
    CONSTRAINT masters_admission_datapoints_source_check CHECK ((source = ANY (ARRAY['gradcafe'::text, 'self_reported'::text, 'our_user'::text])))
);


ALTER TABLE canonical.masters_admission_datapoints OWNER TO postgres;

--
-- Name: masters_pathways; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.masters_pathways (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    program_id uuid NOT NULL,
    pathway_type text NOT NULL,
    description text NOT NULL,
    confidence text DEFAULT 'likely'::text,
    evidence_count integer DEFAULT 1,
    source text,
    source_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT masters_pathways_confidence_check CHECK ((confidence = ANY (ARRAY['confirmed'::text, 'likely'::text, 'speculative'::text]))),
    CONSTRAINT masters_pathways_pathway_type_check CHECK ((pathway_type = ANY (ARRAY['gre_waived'::text, 'research'::text, 'work_experience'::text, 'publication'::text, 'faculty_sponsorship'::text, 'diversity'::text, 'interview'::text, 'holistic'::text, 'fast_track'::text, 'other'::text])))
);


ALTER TABLE canonical.masters_pathways OWNER TO postgres;

--
-- Name: masters_program_deadlines; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.masters_program_deadlines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    masters_program_id uuid NOT NULL,
    deadline_type text NOT NULL,
    deadline_date date,
    is_rolling boolean DEFAULT false,
    intake_term text,
    intake_year integer,
    notes text,
    source_url text,
    scraped_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT masters_program_deadlines_deadline_type_check CHECK ((deadline_type = ANY (ARRAY['priority'::text, 'final'::text, 'funding_consideration'::text, 'round_1'::text, 'round_2'::text, 'round_3'::text, 'rolling'::text])))
);


ALTER TABLE canonical.masters_program_deadlines OWNER TO postgres;

--
-- Name: masters_program_pathways; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.masters_program_pathways (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    masters_program_id uuid NOT NULL,
    pathway_type text NOT NULL,
    description text NOT NULL,
    weighted_fields jsonb DEFAULT '[]'::jsonb,
    min_requirements jsonb DEFAULT '{}'::jsonb,
    confidence numeric(3,2),
    source_url text,
    scraped_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT masters_program_pathways_pathway_type_check CHECK ((pathway_type = ANY (ARRAY['standard_test_based'::text, 'test_waived_holistic'::text, 'work_experience_substitution'::text, 'portfolio_based'::text, 'bridge_certificate'::text, 'conditional_admission'::text, 'executive_part_time'::text, 'direct_entry_no_test'::text])))
);


ALTER TABLE canonical.masters_program_pathways OWNER TO postgres;

--
-- Name: masters_programs; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.masters_programs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canonical_institution_id uuid,
    institution_name text NOT NULL,
    institution_country text NOT NULL,
    city text,
    department text,
    program_name text NOT NULL,
    degree_type text NOT NULL,
    specialization text,
    cip_code text,
    is_stem_designated boolean,
    language_of_instruction jsonb DEFAULT '["English"]'::jsonb,
    intake_term text,
    intake_year integer,
    gre_requirement text,
    gmat_requirement text,
    min_gpa numeric(5,2),
    min_gpa_scale numeric(5,2),
    min_toefl integer,
    min_ielts numeric(2,1),
    funding_availability text,
    assistantship_types jsonb DEFAULT '[]'::jsonb,
    tuition_waiver_available boolean,
    tuition_total numeric(12,2),
    tuition_currency text,
    program_length_months integer,
    median_earnings numeric(12,2),
    median_debt numeric(12,2),
    roi_source text,
    program_url text,
    data_source text,
    data_quality_score numeric(4,2),
    last_scraped_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    acceptance_rate numeric(5,4),
    cohort_size integer,
    yield_rate numeric(5,4),
    avg_gpa numeric(4,2),
    avg_gre_verbal integer,
    avg_gre_quant integer,
    avg_gre_awa numeric(3,1),
    avg_gmat integer,
    avg_work_exp_years numeric(4,1),
    avg_publications numeric(4,1),
    avg_research_years numeric(4,1),
    lor_count integer,
    sop_required boolean,
    cv_required boolean,
    interview_required boolean,
    ta_available boolean,
    ra_available boolean,
    ga_available boolean,
    fellowship_available boolean,
    avg_stipend_usd numeric(10,2),
    median_stipend_usd numeric(10,2),
    funding_probability numeric(5,2),
    full_funding_probability numeric(5,2),
    graduation_rate numeric(5,2),
    attrition_rate numeric(5,2),
    time_to_degree_months integer,
    placement_rate numeric(5,2),
    median_salary_post numeric(12,2),
    salary_25th numeric(12,2),
    salary_75th numeric(12,2),
    phd_placement_pct numeric(5,2),
    faculty_placement_pct numeric(5,2),
    startup_outcomes_pct numeric(5,2),
    top_employers_masters jsonb DEFAULT '[]'::jsonb,
    opt_eligible boolean,
    stem_opt_eligible boolean,
    visa_support_provided boolean,
    h1b_sponsorship_rate numeric(5,2),
    pr_pathway_info text,
    research_areas jsonb DEFAULT '[]'::jsonb,
    research_groups jsonb DEFAULT '[]'::jsonb,
    faculty_research_count integer,
    open_positions integer,
    industry_collaborations jsonb DEFAULT '[]'::jsonb,
    annual_grants_usd numeric(14,0),
    admission_difficulty numeric(5,1),
    funding_attractiveness numeric(5,1),
    career_outcome_score numeric(5,1),
    research_fit_score numeric(5,1),
    roi_score numeric(5,1),
    raw_admission_requirements text,
    raw_test_requirements text,
    raw_scholarships text,
    raw_cost text,
    raw_deadlines text,
    CONSTRAINT masters_programs_degree_type_check CHECK ((degree_type = ANY (ARRAY['MS'::text, 'MA'::text, 'MBA'::text]))),
    CONSTRAINT masters_programs_funding_availability_check CHECK (((funding_availability IS NULL) OR (funding_availability = ANY (ARRAY['fully_funded'::text, 'partial'::text, 'unfunded'::text, 'varies'::text, 'unknown'::text])))),
    CONSTRAINT masters_programs_gmat_requirement_check CHECK (((gmat_requirement IS NULL) OR (gmat_requirement = ANY (ARRAY['required'::text, 'optional'::text, 'waived'::text, 'not_accepted'::text, 'unknown'::text])))),
    CONSTRAINT masters_programs_gre_requirement_check CHECK (((gre_requirement IS NULL) OR (gre_requirement = ANY (ARRAY['required'::text, 'optional'::text, 'waived'::text, 'not_accepted'::text, 'unknown'::text]))))
);


ALTER TABLE canonical.masters_programs OWNER TO postgres;

--
-- Name: masters_scrape_log; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.masters_scrape_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    program_url text NOT NULL,
    institution_name text,
    program_name text,
    status text NOT NULL,
    confidence numeric(4,2),
    issues jsonb DEFAULT '[]'::jsonb,
    missing_fields jsonb DEFAULT '[]'::jsonb,
    http_bytes integer,
    scraped_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT masters_scrape_log_status_check CHECK ((status = ANY (ARRAY['fetched'::text, 'fetch_failed'::text, 'rejected'::text, 'accepted'::text])))
);


ALTER TABLE canonical.masters_scrape_log OWNER TO postgres;

--
-- Name: popularity_index; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.popularity_index (
    institution_id uuid NOT NULL,
    popularity_score numeric DEFAULT 0,
    popularity_tier text,
    qs_score numeric DEFAULT 0,
    the_score numeric DEFAULT 0,
    usnews_score numeric DEFAULT 0,
    nirf_score numeric DEFAULT 0,
    admissions_volume_score numeric DEFAULT 0,
    engagement_score numeric DEFAULT 0,
    recommendation_score numeric DEFAULT 0,
    outcomes_score numeric DEFAULT 0,
    overall_rank integer,
    country_rank integer,
    subject_rank integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE canonical.popularity_index OWNER TO postgres;

--
-- Name: mv_college_cards; Type: MATERIALIZED VIEW; Schema: canonical; Owner: postgres
--

CREATE MATERIALIZED VIEW canonical.mv_college_cards AS
 SELECT i.id,
    i.canonical_name,
    i.country_code,
    i.state_region,
    i.city,
    i.website,
    i.logo_url,
    (i.metadata ->> 'description'::text) AS description,
    i.institution_type,
    COALESCE(pi.popularity_score, i.popularity_score, (0)::numeric) AS popularity_score,
    lr.global_rank,
    la.acceptance_rate,
    la.test_optional,
    la.sat_50,
    la.act_50,
    lf.tuition_international,
    lf.cost_of_attendance,
    lf.avg_financial_aid,
    lf.merit_scholarship_flag,
    lf.need_blind_flag,
    lo.graduation_rate_4yr,
    lo.employment_rate,
    lo.median_start_salary,
    COALESCE(i.metadata, '{}'::jsonb) AS metadata,
    GREATEST(COALESCE(i.updated_at, now()), COALESCE(pi.updated_at, to_timestamp((0)::double precision)), COALESCE(la.updated_at, to_timestamp((0)::double precision)), COALESCE(lf.updated_at, to_timestamp((0)::double precision)), COALESCE(lo.updated_at, to_timestamp((0)::double precision))) AS updated_at
   FROM (((((canonical.institutions i
     LEFT JOIN canonical.popularity_index pi ON ((pi.institution_id = i.id)))
     LEFT JOIN LATERAL ( SELECT r.global_rank
           FROM canonical.institution_rankings r
          WHERE (r.institution_id = i.id)
          ORDER BY r.ranking_year DESC NULLS LAST, r.created_at DESC NULLS LAST
         LIMIT 1) lr ON (true))
     LEFT JOIN LATERAL ( SELECT a.acceptance_rate,
            a.test_optional,
            a.sat_50,
            a.act_50,
            a.updated_at
           FROM canonical.institution_admissions a
          WHERE (a.institution_id = i.id)
          ORDER BY a.data_year DESC NULLS LAST, a.updated_at DESC NULLS LAST
         LIMIT 1) la ON (true))
     LEFT JOIN LATERAL ( SELECT f.tuition_international,
            f.cost_of_attendance,
            f.avg_financial_aid,
            f.merit_scholarship_flag,
            f.need_blind_flag,
            f.updated_at
           FROM canonical.institution_financials f
          WHERE (f.institution_id = i.id)
          ORDER BY f.data_year DESC NULLS LAST, f.updated_at DESC NULLS LAST
         LIMIT 1) lf ON (true))
     LEFT JOIN LATERAL ( SELECT o.graduation_rate_4yr,
            o.employment_rate,
            o.median_start_salary,
            o.updated_at
           FROM canonical.institution_outcomes o
          WHERE (o.institution_id = i.id)
          ORDER BY o.data_year DESC NULLS LAST, o.updated_at DESC NULLS LAST
         LIMIT 1) lo ON (true))
  WHERE ((i.canonical_name IS NOT NULL) AND (i.deprecated_duplicate_of IS NULL))
  WITH NO DATA;


ALTER MATERIALIZED VIEW canonical.mv_college_cards OWNER TO postgres;

--
-- Name: mv_masters_program_cards; Type: MATERIALIZED VIEW; Schema: canonical; Owner: postgres
--

CREATE MATERIALIZED VIEW canonical.mv_masters_program_cards AS
 SELECT id,
    institution_name,
    institution_country,
    city,
    program_name,
    degree_type,
    specialization,
    is_stem_designated,
    gre_requirement,
    gmat_requirement,
    funding_availability,
    tuition_total,
    tuition_currency,
    program_length_months,
    median_earnings,
    median_debt,
    data_quality_score,
    last_scraped_at,
    assistantship_types,
    tuition_waiver_available,
    ( SELECT count(*) AS count
           FROM canonical.masters_program_pathways pw
          WHERE (pw.masters_program_id = p.id)) AS pathway_count,
    ( SELECT count(*) AS count
           FROM canonical.masters_admission_datapoints dp
          WHERE (dp.masters_program_id = p.id)) AS datapoint_count
   FROM canonical.masters_programs p
  WITH NO DATA;


ALTER MATERIALIZED VIEW canonical.mv_masters_program_cards OWNER TO postgres;

--
-- Name: recommendation_feedback; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.recommendation_feedback (
    id bigint NOT NULL,
    session_id uuid,
    user_id integer NOT NULL,
    institution_id uuid,
    explicit_rating numeric(5,2),
    fit_rating numeric(5,2),
    affordability_rating numeric(5,2),
    reason_codes text[] DEFAULT '{}'::text[] NOT NULL,
    notes text,
    confidence numeric(8,4),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE canonical.recommendation_feedback OWNER TO postgres;

--
-- Name: recommendation_feedback_id_seq; Type: SEQUENCE; Schema: canonical; Owner: postgres
--

CREATE SEQUENCE canonical.recommendation_feedback_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE canonical.recommendation_feedback_id_seq OWNER TO postgres;

--
-- Name: recommendation_feedback_id_seq; Type: SEQUENCE OWNED BY; Schema: canonical; Owner: postgres
--

ALTER SEQUENCE canonical.recommendation_feedback_id_seq OWNED BY canonical.recommendation_feedback.id;


--
-- Name: recommendation_sessions; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.recommendation_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    session_started_at timestamp with time zone DEFAULT now() NOT NULL,
    session_ended_at timestamp with time zone,
    request_context jsonb DEFAULT '{}'::jsonb NOT NULL,
    profile_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    recommendation_model_version text,
    retrieval_version text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE canonical.recommendation_sessions OWNER TO postgres;

--
-- Name: requirement_history; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.requirement_history (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    institution_requirement_id uuid,
    changed_fields jsonb DEFAULT '{}'::jsonb,
    previous_payload jsonb DEFAULT '{}'::jsonb,
    new_payload jsonb DEFAULT '{}'::jsonb,
    changed_at timestamp with time zone DEFAULT now()
);


ALTER TABLE canonical.requirement_history OWNER TO postgres;

--
-- Name: retrieval_eval_history; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.retrieval_eval_history (
    id bigint NOT NULL,
    benchmark_name text NOT NULL,
    retrieval_version text NOT NULL,
    metrics jsonb NOT NULL,
    sample_size integer,
    run_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE canonical.retrieval_eval_history OWNER TO postgres;

--
-- Name: retrieval_eval_history_id_seq; Type: SEQUENCE; Schema: canonical; Owner: postgres
--

CREATE SEQUENCE canonical.retrieval_eval_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE canonical.retrieval_eval_history_id_seq OWNER TO postgres;

--
-- Name: retrieval_eval_history_id_seq; Type: SEQUENCE OWNED BY; Schema: canonical; Owner: postgres
--

ALTER SEQUENCE canonical.retrieval_eval_history_id_seq OWNED BY canonical.retrieval_eval_history.id;


--
-- Name: source_reliability; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.source_reliability (
    source_key text NOT NULL,
    trust_score numeric(8,4) DEFAULT 0.6 NOT NULL,
    extraction_accuracy numeric(8,4) DEFAULT 0.6 NOT NULL,
    freshness_score numeric(8,4) DEFAULT 0.5 NOT NULL,
    conflict_rate numeric(8,4) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE canonical.source_reliability OWNER TO postgres;

--
-- Name: stg_institution_candidates; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.stg_institution_candidates (
    stg_id bigint NOT NULL,
    source_table text NOT NULL,
    source_pk text NOT NULL,
    source_tier canonical.source_tier NOT NULL,
    source_priority smallint NOT NULL,
    source_timestamp timestamp with time zone,
    payload jsonb NOT NULL,
    canonical_name text,
    normalized_name text,
    short_name text,
    website text,
    website_domain text,
    country_code text,
    region_code text,
    state_region text,
    city text,
    address text,
    postal_code text,
    latitude double precision,
    longitude double precision,
    institution_type text,
    control_type text,
    established_year integer,
    external_ids jsonb DEFAULT canonical.base_external_ids() NOT NULL,
    aliases jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stg_institution_candidates_source_priority_check CHECK (((source_priority >= 1) AND (source_priority <= 6)))
);


ALTER TABLE canonical.stg_institution_candidates OWNER TO postgres;

--
-- Name: stg_institution_candidates_stg_id_seq; Type: SEQUENCE; Schema: canonical; Owner: postgres
--

CREATE SEQUENCE canonical.stg_institution_candidates_stg_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE canonical.stg_institution_candidates_stg_id_seq OWNER TO postgres;

--
-- Name: stg_institution_candidates_stg_id_seq; Type: SEQUENCE OWNED BY; Schema: canonical; Owner: postgres
--

ALTER SEQUENCE canonical.stg_institution_candidates_stg_id_seq OWNED BY canonical.stg_institution_candidates.stg_id;


--
-- Name: stg_institution_matches; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.stg_institution_matches (
    stg_id bigint NOT NULL,
    institution_id uuid NOT NULL,
    match_method text NOT NULL,
    match_score numeric(8,4) NOT NULL,
    priority_rank smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE canonical.stg_institution_matches OWNER TO postgres;

--
-- Name: uk_admissions_profile; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.uk_admissions_profile (
    institution_id uuid NOT NULL,
    ucas_required boolean,
    ucas_code text,
    a_levels_required boolean,
    ib_requirements text,
    source_attribution jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    verification_status canonical.verification_status DEFAULT 'unknown'::canonical.verification_status NOT NULL,
    last_verified_at timestamp with time zone
);


ALTER TABLE canonical.uk_admissions_profile OWNER TO postgres;

--
-- Name: uk_financial_support; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.uk_financial_support (
    institution_id uuid NOT NULL,
    student_finance_england boolean,
    bursary_available boolean,
    international_scholarships boolean,
    source_attribution jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    verification_status canonical.verification_status DEFAULT 'unknown'::canonical.verification_status NOT NULL,
    last_verified_at timestamp with time zone
);


ALTER TABLE canonical.uk_financial_support OWNER TO postgres;

--
-- Name: us_admissions_profile; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.us_admissions_profile (
    institution_id uuid NOT NULL,
    sat_required boolean,
    sat_range jsonb,
    act_required boolean,
    act_range jsonb,
    common_app_supported boolean,
    fafsa_required boolean,
    css_profile_required boolean,
    source_attribution jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    verification_status canonical.verification_status DEFAULT 'unknown'::canonical.verification_status NOT NULL,
    last_verified_at timestamp with time zone
);


ALTER TABLE canonical.us_admissions_profile OWNER TO postgres;

--
-- Name: us_financial_aid; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.us_financial_aid (
    institution_id uuid NOT NULL,
    fafsa_priority_deadline date,
    css_profile_deadline date,
    federal_aid_available boolean,
    avg_pell_grant numeric(14,2),
    source_attribution jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    verification_status canonical.verification_status DEFAULT 'unknown'::canonical.verification_status NOT NULL,
    last_verified_at timestamp with time zone
);


ALTER TABLE canonical.us_financial_aid OWNER TO postgres;

--
-- Name: user_recommendation_events; Type: TABLE; Schema: canonical; Owner: postgres
--

CREATE TABLE canonical.user_recommendation_events (
    id bigint NOT NULL,
    session_id uuid,
    user_id integer NOT NULL,
    institution_id uuid,
    event_type text NOT NULL,
    event_value numeric(10,4),
    dwell_ms integer,
    "position" integer,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE canonical.user_recommendation_events OWNER TO postgres;

--
-- Name: user_recommendation_events_id_seq; Type: SEQUENCE; Schema: canonical; Owner: postgres
--

CREATE SEQUENCE canonical.user_recommendation_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE canonical.user_recommendation_events_id_seq OWNER TO postgres;

--
-- Name: user_recommendation_events_id_seq; Type: SEQUENCE OWNED BY; Schema: canonical; Owner: postgres
--

ALTER SEQUENCE canonical.user_recommendation_events_id_seq OWNED BY canonical.user_recommendation_events.id;


--
-- Name: v_college_cards_extended; Type: VIEW; Schema: canonical; Owner: postgres
--

CREATE VIEW canonical.v_college_cards_extended AS
 SELECT mv.id,
    mv.canonical_name,
    mv.country_code,
    mv.state_region,
    mv.city,
    mv.website,
    mv.logo_url,
    mv.description,
    mv.institution_type,
    mv.popularity_score,
    mv.global_rank,
    mv.acceptance_rate,
    mv.test_optional,
    mv.sat_50,
    mv.act_50,
    mv.tuition_international,
    mv.cost_of_attendance,
    mv.avg_financial_aid,
    mv.merit_scholarship_flag,
    mv.need_blind_flag,
    mv.graduation_rate_4yr,
    mv.employment_rate,
    mv.median_start_salary,
    mv.metadata,
    mv.updated_at,
    i.founded_year,
    i.campus_type,
    i.campus_size_acres,
    i.total_enrollment,
    i.undergraduate_enrollment,
    i.international_enrollment,
    i.international_pct,
    i.faculty_count,
    i.student_faculty_ratio,
    i.endowment_usd,
    i.research_expenditure_usd,
    i.latitude,
    i.longitude,
    i.prestige_score,
    i.academic_reputation_score,
    i.employer_reputation_score,
    i.safety_score,
    i.diversity_score,
    i.walkability_score,
    i.campus_fit_score,
    i.student_happiness_score,
    i.risk_score,
    a.ed_acceptance_rate,
    a.ea_acceptance_rate,
    a.transfer_acceptance_rate,
    a.international_acceptance_rate,
    a.yield_rate,
    a.sat_total_25,
    a.sat_total_75,
    a.sat_math_25,
    a.sat_math_75,
    a.act_25,
    a.act_75,
    a.gpa_avg,
    a.gpa_25,
    a.gpa_75,
    a.test_blind,
    a.essays_required,
    a.essay_count,
    a.lor_count,
    a.min_toefl,
    a.min_ielts,
    a.admission_difficulty,
    f.tuition_domestic,
    f.fees,
    f.housing_cost,
    f.meal_cost,
    f.net_price,
    f.need_based_aid_avg,
    f.merit_aid_avg,
    f.avg_scholarship,
    f.avg_debt_at_graduation,
    f.financial_difficulty,
    o.employment_rate_6mo,
    o.grad_school_rate,
    o.median_salary_1yr,
    o.median_salary_5yr,
    o.salary_25th_1yr,
    o.salary_75th_1yr,
    o.faang_placement_pct,
    o.startup_placement_pct,
    o.top_employers,
    o.internship_pct,
    o.career_roi_score,
    o.academic_difficulty,
    cl.housing_guarantee,
    cl.dorm_quality_score,
    cl.dining_quality_score,
    cl.clubs_count,
    cl.greek_life,
    cl.workload_score,
    cl.avg_class_size,
    cl.honors_program,
    cl.study_abroad,
    cl.co_op_programs
   FROM (((((canonical.mv_college_cards mv
     LEFT JOIN canonical.institutions i ON ((i.id = mv.id)))
     LEFT JOIN LATERAL ( SELECT ia.id,
            ia.institution_id,
            ia.data_year,
            ia.admissions_cycle,
            ia.acceptance_rate,
            ia.early_decision_rate,
            ia.early_action_rate,
            ia.regular_decision_rate,
            ia.waitlist_rate,
            ia.transfer_acceptance_rate,
            ia.yield_rate,
            ia.application_volume,
            ia.admit_volume,
            ia.enrollment_volume,
            ia.international_accept_rate,
            ia.in_state_accept_rate,
            ia.out_state_accept_rate,
            ia.test_optional,
            ia.sat_25,
            ia.sat_50,
            ia.sat_75,
            ia.act_25,
            ia.act_50,
            ia.act_75,
            ia.exam_requirements,
            ia.source_attribution,
            ia.raw_payload,
            ia.created_at,
            ia.updated_at,
            ia.ed_acceptance_rate,
            ia.ea_acceptance_rate,
            ia.international_acceptance_rate,
            ia.applied_count,
            ia.admitted_count,
            ia.enrolled_count,
            ia.sat_total_25,
            ia.sat_total_75,
            ia.sat_ebrw_25,
            ia.sat_ebrw_75,
            ia.sat_math_25,
            ia.sat_math_75,
            ia.gpa_avg,
            ia.gpa_25,
            ia.gpa_75,
            ia.gpa_scale,
            ia.test_blind,
            ia.demonstrated_interest,
            ia.interview_required,
            ia.portfolio_required,
            ia.ap_accepted,
            ia.ib_accepted,
            ia.alevel_accepted,
            ia.essays_required,
            ia.essay_count,
            ia.lor_count,
            ia.min_toefl,
            ia.min_ielts,
            ia.min_duolingo,
            ia.admission_difficulty
           FROM canonical.institution_admissions ia
          WHERE (ia.institution_id = mv.id)
          ORDER BY ia.data_year DESC NULLS LAST
         LIMIT 1) a ON (true))
     LEFT JOIN LATERAL ( SELECT if2.id,
            if2.institution_id,
            if2.data_year,
            if2.data_year_key,
            if2.academic_year,
            if2.academic_year_key,
            if2.currency_code,
            if2.tuition_in_state,
            if2.tuition_out_state,
            if2.tuition_international,
            if2.cost_of_attendance,
            if2.avg_financial_aid,
            if2.percent_receiving_aid,
            if2.avg_debt,
            if2.net_price_low_income,
            if2.net_price_mid_income,
            if2.net_price_high_income,
            if2.merit_scholarship_flag,
            if2.need_blind_flag,
            if2.no_loan_policy,
            if2.source_attribution,
            if2.raw_payload,
            if2.created_at,
            if2.updated_at,
            if2.tuition_domestic,
            if2.fees,
            if2.housing_cost,
            if2.meal_cost,
            if2.insurance_cost,
            if2.books_cost,
            if2.personal_expenses,
            if2.net_price,
            if2.need_based_aid_avg,
            if2.merit_aid_avg,
            if2.avg_scholarship,
            if2.pct_need_met,
            if2.avg_debt_at_graduation,
            if2.monthly_loan_payment,
            if2.need_blind_intl,
            if2.financial_difficulty
           FROM canonical.institution_financials if2
          WHERE (if2.institution_id = mv.id)
          ORDER BY if2.data_year DESC NULLS LAST
         LIMIT 1) f ON (true))
     LEFT JOIN LATERAL ( SELECT io.id,
            io.institution_id,
            io.data_year,
            io.data_year_key,
            io.graduation_rate_4yr,
            io.graduation_rate_6yr,
            io.retention_rate,
            io.employment_rate,
            io.median_start_salary,
            io.median_mid_career_salary,
            io.grad_school_rate,
            io.internship_rate,
            io.source_attribution,
            io.raw_payload,
            io.created_at,
            io.updated_at,
            io.employment_rate_6mo,
            io.employment_rate_1yr,
            io.median_salary_1yr,
            io.median_salary_5yr,
            io.salary_25th_1yr,
            io.salary_75th_1yr,
            io.faang_placement_pct,
            io.startup_placement_pct,
            io.top_employers,
            io.career_services_rank,
            io.internship_pct,
            io.career_roi_score,
            io.academic_difficulty
           FROM canonical.institution_outcomes io
          WHERE (io.institution_id = mv.id)
          ORDER BY io.data_year DESC NULLS LAST
         LIMIT 1) o ON (true))
     LEFT JOIN LATERAL ( SELECT icl.id,
            icl.institution_id,
            icl.housing_guarantee,
            icl.campus_safety_score,
            icl.cost_of_living_index,
            icl.climate_zone,
            icl.student_satisfaction_score,
            icl.athletics_division,
            icl.club_count,
            icl.mental_health_rating,
            icl.source_attribution,
            icl.raw_payload,
            icl.created_at,
            icl.updated_at,
            icl.pct_living_on_campus,
            icl.dorm_quality_score,
            icl.dining_quality_score,
            icl.clubs_count,
            icl.varsity_sports_count,
            icl.greek_life,
            icl.greek_life_pct,
            icl.workload_score,
            icl.mental_health_services,
            icl.party_score,
            icl.international_friendly,
            icl.avg_class_size,
            icl.honors_program,
            icl.study_abroad,
            icl.co_op_programs,
            icl.research_opportunities,
            icl.internship_support
           FROM canonical.institution_campus_life icl
          WHERE (icl.institution_id = mv.id)
         LIMIT 1) cl ON (true));


ALTER VIEW canonical.v_college_cards_extended OWNER TO postgres;

--
-- Name: v_data_quality_summary; Type: VIEW; Schema: canonical; Owner: postgres
--

CREATE VIEW canonical.v_data_quality_summary AS
 SELECT severity,
    category,
    count(*) AS issue_count
   FROM canonical.fn_data_quality_issues() fn_data_quality_issues(institution_id, canonical_name, severity, category, field, detail)
  GROUP BY severity, category
  ORDER BY
        CASE severity
            WHEN 'HIGH'::text THEN 1
            WHEN 'MEDIUM'::text THEN 2
            ELSE 3
        END, (count(*)) DESC;


ALTER VIEW canonical.v_data_quality_summary OWNER TO postgres;

--
-- Name: academic_details; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.academic_details (
    id integer NOT NULL,
    college_id integer,
    graduation_rate_4yr real,
    retention_rate real,
    median_salary_6yr integer,
    median_salary_10yr integer,
    median_debt integer,
    data_year integer,
    confidence_score real,
    graduation_rate_6yr numeric(6,4),
    pct_stem numeric(6,4),
    pct_employed_2yr numeric(6,4),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.academic_details OWNER TO postgres;

--
-- Name: academic_details_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.academic_details_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.academic_details_id_seq OWNER TO postgres;

--
-- Name: academic_details_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.academic_details_id_seq OWNED BY public.academic_details.id;


--
-- Name: academic_outcomes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.academic_outcomes (
    id integer NOT NULL,
    college_id integer,
    graduation_rate numeric(5,2),
    retention_rate numeric(5,2),
    median_earnings integer,
    created_at timestamp without time zone DEFAULT now(),
    grad_school_acceptance_rate double precision,
    med_school_acceptance_rate double precision,
    law_school_acceptance_rate double precision,
    business_school_acceptance_rate double precision,
    phd_program_acceptance_rate double precision,
    top_grad_schools_attended text,
    top_med_schools_attended text,
    top_law_schools_attended text,
    employed_at_graduation_rate double precision,
    employed_6_months_rate double precision,
    employed_in_field_rate double precision,
    median_mid_career_salary integer,
    salary_growth_rate double precision
);


ALTER TABLE public.academic_outcomes OWNER TO postgres;

--
-- Name: academic_outcomes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.academic_outcomes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.academic_outcomes_id_seq OWNER TO postgres;

--
-- Name: academic_outcomes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.academic_outcomes_id_seq OWNED BY public.academic_outcomes.id;


--
-- Name: admission_outcomes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admission_outcomes (
    id integer NOT NULL,
    college_name text NOT NULL,
    sat_total integer,
    gpa double precision,
    admitted integer DEFAULT 0 NOT NULL,
    year integer,
    source text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.admission_outcomes OWNER TO postgres;

--
-- Name: admission_outcomes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.admission_outcomes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.admission_outcomes_id_seq OWNER TO postgres;

--
-- Name: admission_outcomes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.admission_outcomes_id_seq OWNED BY public.admission_outcomes.id;


--
-- Name: application_deadlines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.application_deadlines (
    id integer NOT NULL,
    college_id integer NOT NULL,
    academic_year text NOT NULL,
    early_decision_1_deadline date,
    early_decision_1_notification date,
    early_decision_2_deadline date,
    early_decision_2_notification date,
    early_action_deadline date,
    early_action_notification date,
    restrictive_early_action_deadline date,
    restrictive_early_action_notification date,
    regular_decision_deadline date,
    regular_decision_notification date,
    priority_deadline date,
    priority_notification date,
    rolling_admission integer DEFAULT 0,
    rolling_admission_start date,
    rolling_admission_end date,
    rolling_response_time_weeks integer,
    transfer_fall_deadline date,
    transfer_spring_deadline date,
    transfer_notification_date date,
    fafsa_priority_deadline date,
    css_profile_deadline date,
    institutional_aid_deadline date,
    merit_scholarship_deadline date,
    scholarship_application_required integer DEFAULT 0,
    separate_scholarship_app_deadline date,
    enrollment_deposit_deadline date,
    enrollment_deposit_amount integer,
    housing_application_deadline date,
    housing_deposit_deadline date,
    housing_deposit_amount integer,
    course_registration_start date,
    orientation_date date,
    classes_start_date date,
    deadline_notes text,
    source text,
    last_verified date,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.application_deadlines OWNER TO postgres;

--
-- Name: application_deadlines_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.application_deadlines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.application_deadlines_id_seq OWNER TO postgres;

--
-- Name: application_deadlines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.application_deadlines_id_seq OWNED BY public.application_deadlines.id;


--
-- Name: application_tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.application_tasks (
    id integer NOT NULL,
    application_id integer,
    task_type character varying(50),
    title text NOT NULL,
    description text,
    completed boolean DEFAULT false,
    due_date date,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.application_tasks OWNER TO postgres;

--
-- Name: application_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.application_tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.application_tasks_id_seq OWNER TO postgres;

--
-- Name: application_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.application_tasks_id_seq OWNED BY public.application_tasks.id;


--
-- Name: applications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.applications (
    id integer NOT NULL,
    user_id integer,
    college_id integer,
    status character varying(50) DEFAULT 'planning'::character varying,
    round_type character varying(50),
    priority character varying(20) DEFAULT 'medium'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    application_type character varying(50) DEFAULT 'regular'::character varying,
    deadline date
);


ALTER TABLE public.applications OWNER TO postgres;

--
-- Name: applications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.applications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.applications_id_seq OWNER TO postgres;

--
-- Name: applications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.applications_id_seq OWNED BY public.applications.id;


--
-- Name: campus_life; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.campus_life (
    id integer NOT NULL,
    college_id integer,
    housing_guarantee boolean,
    distance_only boolean,
    campus_setting text,
    campus_size_description text,
    campus_architecture_style text,
    campus_beauty_rating integer,
    weather_description text,
    average_temp_fall double precision,
    average_temp_winter double precision,
    average_temp_spring double precision,
    snowfall_inches_annual double precision,
    nearest_major_city text,
    distance_to_city_miles integer,
    nearest_airport text,
    distance_to_airport_miles integer,
    public_transportation_access integer DEFAULT 0,
    car_necessity_rating integer,
    campus_walkability_score integer,
    bike_friendly integer DEFAULT 0,
    campus_shuttle integer DEFAULT 0,
    parking_availability text,
    freshman_parking_allowed integer DEFAULT 0,
    greek_life_available integer DEFAULT 1,
    greek_life_percentage double precision,
    fraternities_count integer,
    sororities_count integer,
    greek_housing_available integer DEFAULT 0,
    freshman_housing_required integer DEFAULT 0,
    sophomore_housing_required integer DEFAULT 0,
    on_campus_housing_percentage double precision,
    substance_free_housing integer DEFAULT 0,
    themed_housing_options text,
    single_room_availability text,
    apartment_style_available integer DEFAULT 0,
    dining_hall_count integer,
    dining_hall_rating integer,
    food_options_count integer,
    meal_plan_required integer DEFAULT 0,
    meal_plan_flexibility text,
    dietary_accommodations text,
    gym_facilities_rating integer,
    recreation_center_count integer,
    pool_available integer DEFAULT 0,
    outdoor_recreation_options text
);


ALTER TABLE public.campus_life OWNER TO postgres;

--
-- Name: campus_life_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.campus_life_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.campus_life_id_seq OWNER TO postgres;

--
-- Name: campus_life_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.campus_life_id_seq OWNED BY public.campus_life.id;


--
-- Name: career_outcomes_detail; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.career_outcomes_detail (
    id integer NOT NULL,
    college_id integer NOT NULL,
    year integer NOT NULL,
    top_employers_list text,
    top_employers_count integer,
    industry_distribution text,
    top_industries text,
    average_starting_salary_by_major text,
    employment_by_region text,
    percent_stay_in_state double precision,
    percent_major_city double precision,
    percent_fortune_500 double precision,
    percent_startup double precision,
    percent_nonprofit double precision,
    percent_government double precision,
    percent_self_employed double precision,
    career_fairs_per_year integer,
    on_campus_recruiting_companies integer,
    job_posting_platform text,
    mock_interview_availability integer DEFAULT 1,
    resume_review_availability integer DEFAULT 1,
    alumni_network_strength_rating integer,
    alumni_mentorship_program integer DEFAULT 0,
    alumni_job_board integer DEFAULT 0,
    alumni_database_access integer DEFAULT 0,
    regional_alumni_chapters_count integer,
    internship_completion_rate double precision,
    paid_internship_percentage double precision,
    average_internships_per_student double precision,
    summer_internship_funding integer DEFAULT 0,
    source text,
    outcomes_response_rate double precision,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.career_outcomes_detail OWNER TO postgres;

--
-- Name: career_outcomes_detail_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.career_outcomes_detail_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.career_outcomes_detail_id_seq OWNER TO postgres;

--
-- Name: career_outcomes_detail_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.career_outcomes_detail_id_seq OWNED BY public.career_outcomes_detail.id;


--
-- Name: chance_me_posts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chance_me_posts (
    id bigint NOT NULL,
    reddit_post_id text,
    college_name text NOT NULL,
    gpa double precision,
    sat_score integer,
    act_score integer,
    num_aps integer,
    num_ecs integer,
    state character(2),
    intended_major text,
    ethnicity text,
    first_gen boolean,
    outcome text,
    source text DEFAULT 'reddit'::text NOT NULL,
    post_url text,
    post_date timestamp with time zone,
    sample_weight double precision DEFAULT 1.0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chance_me_posts_outcome_check CHECK ((outcome = ANY (ARRAY['accepted'::text, 'rejected'::text, 'waitlisted'::text, 'deferred'::text, 'pending'::text])))
);


ALTER TABLE public.chance_me_posts OWNER TO postgres;

--
-- Name: chance_me_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.chance_me_posts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chance_me_posts_id_seq OWNER TO postgres;

--
-- Name: chance_me_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.chance_me_posts_id_seq OWNED BY public.chance_me_posts.id;


--
-- Name: chancing_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chancing_audit_log (
    id integer NOT NULL,
    user_id integer,
    college_id integer,
    raw_probability numeric(5,4),
    displayed_chance numeric(5,4),
    ceiling_applied boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.chancing_audit_log OWNER TO postgres;

--
-- Name: chancing_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.chancing_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chancing_audit_log_id_seq OWNER TO postgres;

--
-- Name: chancing_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.chancing_audit_log_id_seq OWNED BY public.chancing_audit_log.id;


--
-- Name: chancing_predictions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chancing_predictions (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    college_id integer NOT NULL,
    features_json jsonb NOT NULL,
    predicted_prob numeric(5,4) NOT NULL,
    actual_admit boolean,
    brier_score numeric(10,6),
    calculated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chancing_predictions_predicted_prob_check CHECK (((predicted_prob >= (0)::numeric) AND (predicted_prob <= (1)::numeric)))
);


ALTER TABLE public.chancing_predictions OWNER TO postgres;

--
-- Name: TABLE chancing_predictions; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.chancing_predictions IS 'Stores chancing predictions for Brier Score calibration tracking';


--
-- Name: COLUMN chancing_predictions.features_json; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.chancing_predictions.features_json IS 'JSON with student features: sat_normalized, gpa, acceptance_rate, etc.';


--
-- Name: COLUMN chancing_predictions.brier_score; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.chancing_predictions.brier_score IS '(predicted_prob - actual_admit)^2, precomputed for analytics';


--
-- Name: chancing_predictions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.chancing_predictions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chancing_predictions_id_seq OWNER TO postgres;

--
-- Name: chancing_predictions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.chancing_predictions_id_seq OWNED BY public.chancing_predictions.id;


--
-- Name: colleges_comprehensive; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.colleges_comprehensive (
    id integer NOT NULL,
    name character varying(500) NOT NULL,
    alternate_names text,
    country character varying(200),
    state_region character varying(200),
    city character varying(200),
    urban_classification character varying(100),
    institution_type character varying(100),
    classification character varying(200),
    religious_affiliation character varying(200),
    founding_year integer,
    campus_size_acres real,
    undergraduate_enrollment integer,
    graduate_enrollment integer,
    total_enrollment integer,
    student_faculty_ratio character varying(50),
    website_url character varying(500),
    latitude real,
    longitude real,
    source character varying(100),
    confidence_score real,
    created_at timestamp without time zone DEFAULT now(),
    state text,
    type text,
    setting text,
    control text,
    size_category text,
    logo_url text,
    description text,
    website text,
    founded_year integer,
    ipeds_unit_id integer,
    feature_vector jsonb,
    vector_updated_at timestamp with time zone,
    opeid text,
    zip text,
    accreditation text,
    hbcu boolean DEFAULT false,
    hsi boolean DEFAULT false,
    men_only boolean DEFAULT false,
    women_only boolean DEFAULT false,
    locale_code smallint,
    carnegie_basic smallint,
    predominant_deg smallint,
    highest_deg smallint,
    pct_pell numeric(5,2),
    pct_fed_loan numeric(5,2),
    search_vector tsvector,
    popularity_score numeric(6,2) DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now(),
    pct_first_gen numeric(6,4),
    test_optional boolean,
    online_only boolean,
    sat_25 integer,
    sat_75 integer,
    act_25 integer,
    act_75 integer,
    act_avg numeric(4,1),
    gpa_25 numeric(4,2),
    gpa_75 numeric(4,2),
    intl_acceptance_rate numeric(5,4),
    intl_percent numeric(5,2),
    yield_rate numeric(5,4),
    need_aware_intl boolean DEFAULT false,
    meets_full_need boolean DEFAULT false,
    tracks_demonstrated_interest boolean DEFAULT false,
    top_majors json,
    college_type text,
    wikidata_id text,
    programs text,
    qs_rank integer,
    the_rank integer,
    normalized_website text,
    normalized_name text,
    application_deadline date,
    rd_deadline date,
    ed_deadline date,
    ea_deadline date,
    CONSTRAINT colleges_comprehensive_college_type_check CHECK ((college_type = ANY (ARRAY['university'::text, 'liberal_arts'::text, 'technical'::text, 'public'::text, 'community'::text, 'for_profit'::text, 'specialty'::text, 'graduate'::text])))
);


ALTER TABLE public.colleges_comprehensive OWNER TO postgres;

--
-- Name: clean_colleges; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.clean_colleges AS
 SELECT id,
    name,
    country,
    COALESCE(state, (state_region)::text) AS state,
    city,
    website_url AS official_website,
    institution_type,
    latitude,
    longitude,
    logo_url,
    description,
    top_majors,
    total_enrollment,
    undergraduate_enrollment,
    popularity_score,
    need_aware_intl,
    meets_full_need
   FROM public.colleges_comprehensive cc
  WHERE ((name IS NOT NULL) AND (country IS NOT NULL));


ALTER VIEW public.clean_colleges OWNER TO postgres;

--
-- Name: college_admissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.college_admissions (
    id integer NOT NULL,
    college_id integer,
    acceptance_rate real,
    test_optional boolean,
    sat_avg integer,
    sat_range character varying(50),
    act_range character varying(50),
    gpa_50 real,
    data_year integer,
    confidence_score real,
    test_optional_permanent integer DEFAULT 0,
    test_blind integer DEFAULT 0,
    test_policy_details text,
    superscore_sat integer DEFAULT 0,
    superscore_act integer DEFAULT 0,
    sat_essay_required integer DEFAULT 0,
    act_writing_required integer DEFAULT 0,
    subject_tests_recommended integer DEFAULT 0,
    subject_tests_considered integer DEFAULT 0,
    score_choice_allowed integer DEFAULT 1,
    all_scores_required integer DEFAULT 0,
    self_reported_scores_accepted integer DEFAULT 0,
    sat_verbal_25 smallint,
    sat_verbal_75 smallint,
    sat_math_25 smallint,
    sat_math_75 smallint,
    act_25 smallint,
    act_75 smallint,
    act_mid smallint,
    sat_total_25 integer,
    sat_total_75 integer,
    yield_rate numeric(6,4),
    applicants_total integer,
    admitted_total integer,
    enrolled_total integer,
    sat_verbal_mid integer,
    sat_math_mid integer,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.college_admissions OWNER TO postgres;

--
-- Name: college_admissions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.college_admissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.college_admissions_id_seq OWNER TO postgres;

--
-- Name: college_admissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.college_admissions_id_seq OWNED BY public.college_admissions.id;


--
-- Name: college_admissions_stats; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.college_admissions_stats (
    id bigint NOT NULL,
    college_id integer,
    year integer NOT NULL,
    acceptance_rate double precision,
    median_sat integer,
    median_act double precision,
    median_gpa_admitted double precision,
    total_applicants integer,
    total_admitted integer,
    yield_rate double precision,
    ed_acceptance_rate double precision,
    ea_acceptance_rate double precision,
    data_freshness text DEFAULT 'fresh'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.college_admissions_stats OWNER TO postgres;

--
-- Name: college_admissions_stats_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.college_admissions_stats_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.college_admissions_stats_id_seq OWNER TO postgres;

--
-- Name: college_admissions_stats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.college_admissions_stats_id_seq OWNED BY public.college_admissions_stats.id;


--
-- Name: college_data_contributions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.college_data_contributions (
    id integer NOT NULL,
    college_id integer,
    requested_college_id integer,
    contributed_by_user_id integer,
    contributed_by_email text,
    contributed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    data_type text NOT NULL,
    data_value text NOT NULL,
    source_url text,
    status text DEFAULT 'pending'::text,
    verified_by_admin_id integer,
    verified_at timestamp without time zone,
    verification_notes text,
    CONSTRAINT college_data_contributions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


ALTER TABLE public.college_data_contributions OWNER TO postgres;

--
-- Name: college_data_contributions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.college_data_contributions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.college_data_contributions_id_seq OWNER TO postgres;

--
-- Name: college_data_contributions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.college_data_contributions_id_seq OWNED BY public.college_data_contributions.id;


--
-- Name: college_deadlines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.college_deadlines (
    id integer NOT NULL,
    college_id integer,
    deadline_type character varying(100),
    deadline_date date,
    notification_date date,
    is_binding boolean,
    data_year integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_url text,
    confidence_score double precision DEFAULT 0.5,
    last_verified timestamp with time zone,
    is_estimated boolean DEFAULT false,
    estimation_basis text,
    source_count integer DEFAULT 1,
    source_type text DEFAULT 'aggregator'::text
);


ALTER TABLE public.college_deadlines OWNER TO postgres;

--
-- Name: COLUMN college_deadlines.confidence_score; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.college_deadlines.confidence_score IS '0.0–0.4 unverified, 0.4–0.7 partial, 0.7–1.0 confirmed';


--
-- Name: COLUMN college_deadlines.is_estimated; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.college_deadlines.is_estimated IS 'TRUE when date was inferred from history, not scraped';


--
-- Name: COLUMN college_deadlines.estimation_basis; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.college_deadlines.estimation_basis IS 'historical_pattern | country_average | confirmed';


--
-- Name: COLUMN college_deadlines.source_count; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.college_deadlines.source_count IS 'Number of independent sources agreeing on this date';


--
-- Name: college_deadlines_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.college_deadlines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.college_deadlines_id_seq OWNER TO postgres;

--
-- Name: college_deadlines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.college_deadlines_id_seq OWNED BY public.college_deadlines.id;


--
-- Name: college_financial_aid; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.college_financial_aid (
    id bigint NOT NULL,
    college_id integer,
    academic_year text NOT NULL,
    avg_financial_aid_package integer,
    avg_net_price_0_30k integer,
    avg_net_price_30_48k integer,
    avg_net_price_48_75k integer,
    avg_net_price_75_110k integer,
    avg_net_price_110k_plus integer,
    percent_receiving_aid double precision,
    percent_receiving_grants double precision,
    meets_full_need boolean,
    no_loan_policy boolean,
    endowment_per_student integer,
    scholarship_count integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.college_financial_aid OWNER TO postgres;

--
-- Name: college_financial_aid_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.college_financial_aid_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.college_financial_aid_id_seq OWNER TO postgres;

--
-- Name: college_financial_aid_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.college_financial_aid_id_seq OWNED BY public.college_financial_aid.id;


--
-- Name: college_financial_data; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.college_financial_data (
    id integer NOT NULL,
    college_id integer,
    tuition_in_state integer,
    tuition_out_state integer,
    tuition_international integer,
    avg_net_price integer,
    data_year integer,
    confidence_score real,
    meets_full_need integer DEFAULT 0,
    meets_full_need_percentage double precision,
    loan_free_for_income_under integer,
    no_parent_contribution_income_under integer,
    work_study_available integer DEFAULT 1,
    work_study_percentage double precision,
    average_work_study_earnings integer,
    on_campus_jobs_available integer DEFAULT 1,
    average_hours_worked_weekly double precision,
    merit_scholarship_available integer DEFAULT 1,
    merit_scholarship_average integer,
    merit_scholarship_percentage double precision,
    merit_scholarship_range text,
    automatic_merit_scholarships integer DEFAULT 0,
    athletic_scholarship_available integer DEFAULT 0,
    athletic_scholarship_sports text,
    institutional_grant_average integer,
    institutional_grant_percentage double precision,
    endowment_per_student integer,
    outside_scholarship_policy text,
    fafsa_required integer DEFAULT 1,
    css_profile_required integer DEFAULT 0,
    institutional_form_required integer DEFAULT 0,
    tax_returns_required integer DEFAULT 1,
    noncustodial_parent_form integer DEFAULT 0,
    international_aid_available integer DEFAULT 0,
    international_need_blind integer DEFAULT 0,
    international_aid_percentage double precision,
    international_avg_aid integer,
    payment_plan_available integer DEFAULT 1,
    payment_plan_fee integer,
    tuition_lock_available integer DEFAULT 0,
    tuition_insurance_available integer DEFAULT 0,
    average_loan_amount integer,
    percent_with_loans double precision,
    parent_plus_usage_rate double precision,
    total_coa integer,
    net_price_0_30k integer,
    net_price_30_48k integer,
    net_price_48_75k integer,
    net_price_75_110k integer,
    net_price_110k_plus integer,
    pct_receiving_pell numeric(5,2),
    median_debt_at_graduation integer,
    loan_default_rate_3yr numeric(5,2),
    median_earnings_6yr integer,
    median_earnings_10yr integer,
    updated_at timestamp with time zone DEFAULT now(),
    avg_family_income integer,
    median_family_income integer
);


ALTER TABLE public.college_financial_data OWNER TO postgres;

--
-- Name: college_financial_data_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.college_financial_data_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.college_financial_data_id_seq OWNER TO postgres;

--
-- Name: college_financial_data_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.college_financial_data_id_seq OWNED BY public.college_financial_data.id;


--
-- Name: college_insights; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.college_insights (
    id integer NOT NULL,
    reddit_post_id text NOT NULL,
    subreddit text NOT NULL,
    post_url text,
    posted_at timestamp with time zone,
    author_flair text,
    college_id integer,
    college_name_raw text NOT NULL,
    insight_type text NOT NULL,
    content_snippet text NOT NULL,
    full_text text,
    sentiment text DEFAULT 'neutral'::text NOT NULL,
    sentiment_score numeric(4,3),
    sentiment_model text,
    is_validated boolean DEFAULT false NOT NULL,
    is_spam boolean DEFAULT false NOT NULL,
    scraped_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT college_insights_insight_type_check CHECK ((insight_type = ANY (ARRAY['cost_experience'::text, 'scholarship_success'::text, 'perceived_value'::text, 'general'::text]))),
    CONSTRAINT college_insights_sentiment_check CHECK ((sentiment = ANY (ARRAY['positive'::text, 'negative'::text, 'neutral'::text, 'mixed'::text])))
);


ALTER TABLE public.college_insights OWNER TO postgres;

--
-- Name: college_insights_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.college_insights_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.college_insights_id_seq OWNER TO postgres;

--
-- Name: college_insights_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.college_insights_id_seq OWNED BY public.college_insights.id;


--
-- Name: college_majors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.college_majors (
    college_id integer NOT NULL,
    major_id integer NOT NULL,
    offered boolean DEFAULT true,
    awlevel smallint NOT NULL,
    completions_count integer,
    completions_pct numeric(6,4)
);


ALTER TABLE public.college_majors OWNER TO postgres;

--
-- Name: college_programs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.college_programs (
    id integer NOT NULL,
    college_id integer,
    program_name character varying(300),
    degree_type character varying(100)
);


ALTER TABLE public.college_programs OWNER TO postgres;

--
-- Name: college_programs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.college_programs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.college_programs_id_seq OWNER TO postgres;

--
-- Name: college_programs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.college_programs_id_seq OWNED BY public.college_programs.id;


--
-- Name: college_rankings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.college_rankings (
    id integer NOT NULL,
    college_id integer,
    ranking_source character varying(200),
    ranking_value character varying(100),
    ranking_year integer
);


ALTER TABLE public.college_rankings OWNER TO postgres;

--
-- Name: college_rankings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.college_rankings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.college_rankings_id_seq OWNER TO postgres;

--
-- Name: college_rankings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.college_rankings_id_seq OWNED BY public.college_rankings.id;


--
-- Name: college_requirements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.college_requirements (
    id integer NOT NULL,
    college_id integer NOT NULL,
    test_policy text,
    sat_required boolean DEFAULT false,
    act_required boolean DEFAULT false,
    sat_subject_tests_required boolean DEFAULT false,
    sat_subject_tests_recommended integer DEFAULT 0,
    common_app_essay_required boolean DEFAULT true,
    supplemental_essays_count integer DEFAULT 0,
    supplemental_essays_max_words integer,
    teacher_recommendations_required integer DEFAULT 2,
    counselor_recommendation_required boolean DEFAULT true,
    peer_recommendation_required boolean DEFAULT false,
    additional_recommendations_allowed integer DEFAULT 1,
    interview_offered boolean DEFAULT false,
    interview_required boolean DEFAULT false,
    interview_type text,
    portfolio_required boolean DEFAULT false,
    audition_required boolean DEFAULT false,
    demonstrated_interest_considered boolean DEFAULT false,
    early_decision_binding boolean DEFAULT true,
    toefl_required_international boolean DEFAULT true,
    toefl_minimum_score integer,
    ielts_required_international boolean DEFAULT false,
    ielts_minimum_score double precision,
    additional_requirements text,
    source_url text,
    last_verified date,
    confidence_score double precision DEFAULT 0.5,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT college_requirements_test_policy_check CHECK ((test_policy = ANY (ARRAY['required'::text, 'optional'::text, 'test-blind'::text, 'flexible'::text])))
);


ALTER TABLE public.college_requirements OWNER TO postgres;

--
-- Name: college_requirements_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.college_requirements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.college_requirements_id_seq OWNER TO postgres;

--
-- Name: college_requirements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.college_requirements_id_seq OWNED BY public.college_requirements.id;


--
-- Name: colleges; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.colleges (
    id bigint NOT NULL,
    canonical_institution_id uuid DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text,
    website_url text,
    normalized_website text,
    city text,
    state text,
    country text,
    latitude numeric,
    longitude numeric,
    description text,
    logo_url text,
    institution_type text,
    campus_setting text,
    acceptance_rate numeric,
    tuition_domestic numeric,
    tuition_international numeric,
    qs_rank integer,
    the_rank integer,
    ranking_us_news integer,
    undergraduate_enrollment integer,
    graduate_enrollment integer,
    total_enrollment integer,
    student_faculty_ratio text,
    sat_25 integer,
    sat_75 integer,
    act_25 integer,
    act_75 integer,
    gpa_25 numeric,
    gpa_75 numeric,
    top_majors jsonb,
    feature_vector jsonb,
    search_vector tsvector,
    is_corrupted boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    type text,
    official_website text,
    website text,
    act_avg double precision,
    popularity_score double precision,
    size_category text,
    needs_enrichment boolean DEFAULT true,
    data_quality_score numeric,
    data_source text,
    data_source_url text,
    last_updated_at timestamp with time zone,
    annual_cost_usd integer,
    annual_cost_inr bigint,
    avg_net_price_usd integer,
    avg_sat integer,
    avg_act integer,
    graduation_rate numeric,
    retention_rate numeric,
    international_student_pct numeric,
    first_gen_pct numeric,
    pct_receiving_aid numeric,
    enrollment integer,
    college_type text,
    overall_ranking integer,
    ranking_source text,
    avg_gpa numeric,
    majors_offered text[],
    last_data_refresh timestamp with time zone,
    international_aid_avg numeric,
    application_deadline date
);


ALTER TABLE public.colleges OWNER TO postgres;

--
-- Name: colleges_canonical; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.colleges_canonical AS
 SELECT cc.id,
    cc.name,
    cc.ipeds_unit_id,
    cc.city,
    cc.state_region,
    ca.acceptance_rate,
    ca.sat_avg,
    cfd.tuition_in_state,
    ad.graduation_rate_4yr
   FROM (((public.colleges_comprehensive cc
     LEFT JOIN public.college_admissions ca ON ((cc.id = ca.college_id)))
     LEFT JOIN public.college_financial_data cfd ON ((cc.id = cfd.college_id)))
     LEFT JOIN public.academic_details ad ON ((cc.id = ad.college_id)));


ALTER VIEW public.colleges_canonical OWNER TO postgres;

--
-- Name: colleges_comprehensive_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.colleges_comprehensive_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.colleges_comprehensive_id_seq OWNER TO postgres;

--
-- Name: colleges_comprehensive_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.colleges_comprehensive_id_seq OWNED BY public.colleges_comprehensive.id;


--
-- Name: colleges_full; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.colleges_full AS
 SELECT c.id,
    c.name,
    c.slug,
    c.country,
    c.city,
    c.state,
    c.latitude,
    c.longitude,
    c.institution_type,
    c.size_category,
    c.campus_setting,
    c.total_enrollment,
    COALESCE(c.enrollment, c.total_enrollment) AS enrollment,
    c.undergraduate_enrollment,
    c.graduate_enrollment,
    c.website_url,
    c.official_website,
    c.logo_url,
    c.description,
    c.acceptance_rate,
    c.sat_25,
    c.sat_75,
    c.act_25,
    c.act_75,
    c.act_avg,
    c.gpa_25,
    c.gpa_75,
    c.tuition_domestic,
    c.tuition_international,
    c.tuition_domestic AS tuition_cost,
    c.qs_rank,
    c.the_rank,
    c.ranking_us_news,
    c.popularity_score,
    c.feature_vector,
    c.search_vector,
    c.top_majors,
    c.is_corrupted,
    c.type,
    c.website,
    c.normalized_website,
    c.canonical_institution_id,
    c.student_faculty_ratio,
    c.data_source,
    c.data_source_url,
    c.data_quality_score,
    c.needs_enrichment,
    c.last_updated_at,
    c.last_data_refresh,
    c.annual_cost_usd,
    c.annual_cost_inr,
    c.avg_net_price_usd,
    c.avg_sat,
    c.avg_act,
    c.graduation_rate,
    c.retention_rate,
    c.international_student_pct,
    c.first_gen_pct,
    c.pct_receiving_aid,
    c.college_type,
    c.overall_ranking,
    c.ranking_source,
    c.avg_gpa,
    c.majors_offered,
    c.created_at,
    c.updated_at,
    max(
        CASE
            WHEN ((cd.deadline_type)::text = 'RD'::text) THEN cd.deadline_date
            ELSE NULL::date
        END) AS rd_deadline,
    max(
        CASE
            WHEN ((cd.deadline_type)::text = 'ED'::text) THEN cd.deadline_date
            ELSE NULL::date
        END) AS ed_deadline,
    max(
        CASE
            WHEN ((cd.deadline_type)::text = 'EA'::text) THEN cd.deadline_date
            ELSE NULL::date
        END) AS ea_deadline,
    min(cd.deadline_date) AS application_deadline,
    fd.median_earnings_10yr,
    fd.median_earnings_6yr,
    fd.total_coa,
    fd.net_price_0_30k,
    fd.net_price_30_48k,
    fd.net_price_48_75k,
    fd.net_price_75_110k,
    fd.net_price_110k_plus,
    fd.international_aid_available,
    fd.meets_full_need_percentage,
    fd.institutional_grant_average AS avg_institutional_grant,
    fd.merit_scholarship_average AS avg_merit_aid,
    fd.merit_scholarship_percentage AS pct_receiving_merit_aid,
    fd.international_avg_aid,
    fd.international_avg_aid AS international_aid_avg,
    fd.css_profile_required,
    fa.meets_full_need,
    fa.percent_receiving_grants AS pct_students_receiving_aid,
    ca.test_optional,
    ca.sat_avg,
    ca.yield_rate,
    ca.applicants_total
   FROM ((((public.colleges c
     LEFT JOIN public.college_deadlines cd ON ((cd.college_id = c.id)))
     LEFT JOIN public.college_financial_data fd ON ((fd.college_id = c.id)))
     LEFT JOIN public.college_financial_aid fa ON ((fa.college_id = c.id)))
     LEFT JOIN public.college_admissions ca ON ((ca.college_id = c.id)))
  GROUP BY c.id, c.name, c.slug, c.country, c.city, c.state, c.latitude, c.longitude, c.institution_type, c.size_category, c.campus_setting, c.total_enrollment, c.enrollment, c.undergraduate_enrollment, c.graduate_enrollment, c.website_url, c.official_website, c.logo_url, c.description, c.acceptance_rate, c.sat_25, c.sat_75, c.act_25, c.act_75, c.act_avg, c.gpa_25, c.gpa_75, c.tuition_domestic, c.tuition_international, c.qs_rank, c.the_rank, c.ranking_us_news, c.popularity_score, c.feature_vector, c.search_vector, c.top_majors, c.is_corrupted, c.type, c.website, c.normalized_website, c.canonical_institution_id, c.student_faculty_ratio, c.data_source, c.data_source_url, c.data_quality_score, c.needs_enrichment, c.last_updated_at, c.last_data_refresh, c.annual_cost_usd, c.annual_cost_inr, c.avg_net_price_usd, c.avg_sat, c.avg_act, c.graduation_rate, c.retention_rate, c.international_student_pct, c.first_gen_pct, c.pct_receiving_aid, c.college_type, c.overall_ranking, c.ranking_source, c.avg_gpa, c.majors_offered, c.created_at, c.updated_at, fd.median_earnings_10yr, fd.median_earnings_6yr, fd.total_coa, fd.net_price_0_30k, fd.net_price_30_48k, fd.net_price_48_75k, fd.net_price_75_110k, fd.net_price_110k_plus, fd.international_aid_available, fd.meets_full_need_percentage, fd.institutional_grant_average, fd.merit_scholarship_average, fd.merit_scholarship_percentage, fd.international_avg_aid, fd.css_profile_required, fa.meets_full_need, fa.percent_receiving_grants, ca.test_optional, ca.sat_avg, ca.yield_rate, ca.applicants_total;


ALTER VIEW public.colleges_full OWNER TO postgres;

--
-- Name: colleges_legacy; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.colleges_legacy (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255),
    country character varying(100),
    state character varying(100),
    city character varying(100),
    official_website character varying(500),
    acceptance_rate numeric(5,2),
    tuition_international numeric(10,2),
    tuition_domestic numeric(10,2),
    ranking_qs integer,
    ranking_us_news integer,
    type character varying(50),
    size_category character varying(50),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    is_verified boolean DEFAULT false,
    location character varying(255),
    application_deadline date,
    application_platforms text,
    deadlines_page_url text,
    priority_tier integer DEFAULT 2,
    scraping_failures_count integer DEFAULT 0,
    search_vector tsvector,
    feature_vector jsonb,
    vector_updated_at timestamp with time zone,
    common_app_essays_required integer DEFAULT 1,
    supplemental_essays_required integer DEFAULT 0,
    supplemental_essay_prompts jsonb,
    rd_deadline date,
    ed_deadline date,
    ea_deadline date,
    avg_net_price_0_30k integer,
    avg_net_price_30_48k integer,
    avg_net_price_48_75k integer,
    avg_net_price_75_110k integer,
    avg_net_price_110k_plus integer,
    pct_students_receiving_aid numeric(5,2),
    avg_institutional_grant integer,
    avg_merit_aid integer,
    pct_receiving_merit_aid numeric(5,2),
    need_blind_domestic boolean DEFAULT true,
    need_blind_international boolean DEFAULT false,
    meets_full_need boolean DEFAULT false,
    median_earnings_6yr integer,
    median_earnings_10yr integer,
    loan_default_rate numeric(5,2),
    avg_total_debt_at_graduation integer,
    css_profile_required boolean DEFAULT false,
    international_aid_available boolean DEFAULT false,
    international_aid_avg integer,
    comprehensive_id integer,
    alternate_names text,
    urban_classification text,
    classification text,
    religious_affiliation text,
    founding_year integer,
    campus_size_acres real,
    undergraduate_enrollment integer,
    graduate_enrollment integer,
    total_enrollment integer,
    student_faculty_ratio text,
    latitude real,
    longitude real,
    logo_url text,
    description text,
    ipeds_unit_id integer,
    opeid text,
    zip text,
    accreditation text,
    hbcu boolean,
    hsi boolean,
    men_only boolean,
    women_only boolean,
    locale_code smallint,
    carnegie_basic smallint,
    predominant_deg smallint,
    highest_deg smallint,
    pct_pell numeric,
    pct_fed_loan numeric,
    popularity_score numeric,
    pct_first_gen numeric,
    test_optional boolean,
    online_only boolean,
    sat_25 integer,
    sat_75 integer,
    act_25 integer,
    act_75 integer,
    act_avg numeric,
    gpa_25 numeric,
    gpa_75 numeric,
    intl_acceptance_rate numeric,
    intl_percent numeric,
    yield_rate numeric,
    need_aware_intl boolean,
    tracks_demonstrated_interest boolean,
    top_majors jsonb,
    wikidata_id text,
    programs text,
    qs_rank integer,
    the_rank integer,
    normalized_website text,
    normalized_name text,
    is_corrupted boolean DEFAULT false,
    data_quality_score numeric DEFAULT 1.0,
    canonical_institution_id uuid DEFAULT gen_random_uuid()
);


ALTER TABLE public.colleges_legacy OWNER TO postgres;

--
-- Name: colleges_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.colleges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.colleges_id_seq OWNER TO postgres;

--
-- Name: colleges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.colleges_id_seq OWNED BY public.colleges_legacy.id;


--
-- Name: colleges_new_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.colleges_new_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.colleges_new_id_seq OWNER TO postgres;

--
-- Name: colleges_new_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.colleges_new_id_seq OWNED BY public.colleges.id;


--
-- Name: colleges_public; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.colleges_public AS
 SELECT id,
    canonical_institution_id,
    COALESCE(name, ''::text) AS name,
    COALESCE(slug, ''::text) AS slug,
    COALESCE(city, ''::text) AS city,
    COALESCE(state, ''::text) AS state,
    COALESCE(country, ''::text) AS country,
    COALESCE(description, ''::text) AS description,
    logo_url,
    website_url,
    acceptance_rate,
    tuition_domestic,
    tuition_international,
    qs_rank,
    the_rank,
    ranking_us_news,
    undergraduate_enrollment,
    sat_25,
    sat_75,
    act_25,
    act_75,
    top_majors
   FROM public.colleges
  WHERE (is_corrupted = false);


ALTER VIEW public.colleges_public OWNER TO postgres;

--
-- Name: cost_of_attendance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cost_of_attendance (
    id integer NOT NULL,
    college_id integer NOT NULL,
    academic_year text NOT NULL,
    region text DEFAULT 'US'::text NOT NULL,
    student_type text DEFAULT 'international'::text NOT NULL,
    tuition_usd numeric(12,2),
    mandatory_fees_usd numeric(12,2),
    room_board_usd numeric(12,2),
    personal_expenses_usd numeric(12,2),
    books_supplies_usd numeric(12,2),
    transportation_usd numeric(12,2),
    health_insurance_usd numeric(12,2),
    visa_fee_usd numeric(12,2),
    sevis_fee_usd numeric(12,2),
    total_usd numeric(14,2) GENERATED ALWAYS AS (((((((((COALESCE(tuition_usd, (0)::numeric) + COALESCE(mandatory_fees_usd, (0)::numeric)) + COALESCE(room_board_usd, (0)::numeric)) + COALESCE(personal_expenses_usd, (0)::numeric)) + COALESCE(books_supplies_usd, (0)::numeric)) + COALESCE(transportation_usd, (0)::numeric)) + COALESCE(health_insurance_usd, (0)::numeric)) + COALESCE(visa_fee_usd, (0)::numeric)) + COALESCE(sevis_fee_usd, (0)::numeric))) STORED,
    data_source text,
    academic_year_confirmed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cost_of_attendance_student_type_check CHECK ((student_type = ANY (ARRAY['international'::text, 'domestic_instate'::text, 'domestic_outstate'::text])))
);


ALTER TABLE public.cost_of_attendance OWNER TO postgres;

--
-- Name: cost_of_attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.cost_of_attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cost_of_attendance_id_seq OWNER TO postgres;

--
-- Name: cost_of_attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.cost_of_attendance_id_seq OWNED BY public.cost_of_attendance.id;


--
-- Name: currency_rates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.currency_rates (
    id integer NOT NULL,
    base_currency character varying(10) NOT NULL,
    quote_currency character varying(10) NOT NULL,
    rate numeric(15,6) NOT NULL,
    rate_date date DEFAULT CURRENT_DATE,
    fetched_at timestamp without time zone DEFAULT now(),
    source_api text NOT NULL
);


ALTER TABLE public.currency_rates OWNER TO postgres;

--
-- Name: currency_rates_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.currency_rates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.currency_rates_id_seq OWNER TO postgres;

--
-- Name: currency_rates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.currency_rates_id_seq OWNED BY public.currency_rates.id;


--
-- Name: deadline_alerts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.deadline_alerts (
    id integer NOT NULL,
    user_id integer,
    deadline_id integer,
    is_read boolean DEFAULT false,
    is_dismissed boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.deadline_alerts OWNER TO postgres;

--
-- Name: deadline_alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.deadline_alerts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.deadline_alerts_id_seq OWNER TO postgres;

--
-- Name: deadline_alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.deadline_alerts_id_seq OWNED BY public.deadline_alerts.id;


--
-- Name: deadline_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.deadline_history (
    id bigint NOT NULL,
    college_id integer NOT NULL,
    deadline_type character varying(100) NOT NULL,
    deadline_date date,
    notification_date date,
    data_year integer NOT NULL,
    source_url text,
    confidence_score double precision DEFAULT 0.5,
    is_estimated boolean DEFAULT false,
    estimation_basis text,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.deadline_history OWNER TO postgres;

--
-- Name: deadline_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.deadline_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.deadline_history_id_seq OWNER TO postgres;

--
-- Name: deadline_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.deadline_history_id_seq OWNED BY public.deadline_history.id;


--
-- Name: deadlines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.deadlines (
    id integer NOT NULL,
    application_id integer,
    deadline_date timestamp without time zone,
    deadline_type character varying(100),
    is_completed boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    recently_changed integer DEFAULT 0,
    user_id integer,
    college_id integer,
    title text,
    description text,
    source_url text,
    completed_at timestamp with time zone
);


ALTER TABLE public.deadlines OWNER TO postgres;

--
-- Name: deadlines_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.deadlines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.deadlines_id_seq OWNER TO postgres;

--
-- Name: deadlines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.deadlines_id_seq OWNED BY public.deadlines.id;


--
-- Name: documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.documents (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    file_type text,
    file_size bigint,
    file_path text,
    file_url text,
    description text,
    status text DEFAULT 'pending'::text NOT NULL,
    expiry_date date,
    tags text DEFAULT '[]'::text,
    college_ids text DEFAULT '[]'::text,
    metadata text DEFAULT '{}'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.documents OWNER TO postgres;

--
-- Name: documents_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.documents_id_seq OWNER TO postgres;

--
-- Name: documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.documents_id_seq OWNED BY public.documents.id;


--
-- Name: essays; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.essays (
    id integer NOT NULL,
    application_id integer,
    prompt text,
    content text,
    word_count integer DEFAULT 0,
    word_limit integer,
    status character varying(50) DEFAULT 'not_started'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    platform text,
    shared_across_colleges integer DEFAULT 0,
    historical_data integer DEFAULT 0,
    essay_number integer,
    user_id integer,
    college_id integer,
    title text
);


ALTER TABLE public.essays OWNER TO postgres;

--
-- Name: essays_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.essays_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.essays_id_seq OWNER TO postgres;

--
-- Name: essays_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.essays_id_seq OWNED BY public.essays.id;


--
-- Name: financing_options; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.financing_options (
    id integer NOT NULL,
    name text NOT NULL,
    provider text NOT NULL,
    financing_type text NOT NULL,
    country_of_study text,
    home_country text,
    amount_min_usd numeric(12,2),
    amount_max_usd numeric(12,2),
    amount_notes text,
    interest_rate_pct numeric(6,4),
    interest_type text,
    repayment_grace_months integer,
    repayment_term_months integer,
    loan_forgiveness_available boolean DEFAULT false,
    eligibility_criteria jsonb DEFAULT '{}'::jsonb NOT NULL,
    application_url text,
    deadline_description text,
    deadline_month smallint,
    renewable boolean DEFAULT false,
    renewal_conditions text,
    source_url text NOT NULL,
    source_type text DEFAULT 'official'::text NOT NULL,
    last_verified_at timestamp with time zone DEFAULT now() NOT NULL,
    scraped_at timestamp with time zone DEFAULT now() NOT NULL,
    is_validated boolean DEFAULT false NOT NULL,
    validation_errors jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT financing_options_financing_type_check CHECK ((financing_type = ANY (ARRAY['federal_loan'::text, 'private_loan'::text, 'grant'::text, 'scholarship'::text, 'work_study'::text, 'fellowship'::text]))),
    CONSTRAINT financing_options_interest_type_check CHECK (((interest_type IS NULL) OR (interest_type = ANY (ARRAY['fixed'::text, 'variable'::text])))),
    CONSTRAINT financing_options_source_type_check CHECK ((source_type = ANY (ARRAY['official'::text, 'government'::text, 'embassy'::text, 'university'::text, 'other'::text])))
);


ALTER TABLE public.financing_options OWNER TO postgres;

--
-- Name: financing_options_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.financing_options_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.financing_options_id_seq OWNER TO postgres;

--
-- Name: financing_options_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.financing_options_id_seq OWNED BY public.financing_options.id;


--
-- Name: government_loans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.government_loans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    provider text NOT NULL,
    provider_type text,
    scheme_name text,
    country_of_study text[],
    eligible_nationalities text[] DEFAULT ARRAY['Indian'::text],
    degree_levels text[],
    max_loan_amount_inr numeric(16,2),
    interest_rate_pct numeric(5,2),
    interest_rate_type text,
    subsidy_available boolean DEFAULT false NOT NULL,
    subsidy_scheme text,
    moratorium_months integer,
    repayment_years integer,
    collateral_required_above_inr numeric(16,2),
    processing_fee_pct numeric(5,2),
    requires_co_applicant boolean DEFAULT true NOT NULL,
    eligible_colleges_type text,
    portal_url text,
    official_source_url text,
    status text DEFAULT 'active'::text NOT NULL,
    last_verified_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT government_loans_provider_type_check CHECK ((provider_type = ANY (ARRAY['public_sector_bank'::text, 'private_bank'::text, 'nbfc'::text, 'government_scheme'::text, 'foreign_government'::text]))),
    CONSTRAINT government_loans_status_check CHECK ((status = ANY (ARRAY['active'::text, 'discontinued'::text, 'paused'::text, 'unverified'::text])))
);


ALTER TABLE public.government_loans OWNER TO postgres;

--
-- Name: grants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    provider text NOT NULL,
    provider_type text,
    country_of_study text,
    country_of_origin text[],
    eligible_nationalities text[] DEFAULT ARRAY['Indian'::text],
    eligible_states text[],
    degree_levels text[],
    eligible_majors text[] DEFAULT ARRAY['All'::text],
    eligible_genders text[] DEFAULT ARRAY['All'::text],
    minority_required text[],
    first_gen_required boolean DEFAULT false NOT NULL,
    income_based boolean DEFAULT false NOT NULL,
    max_family_income_inr numeric(16,2),
    award_inr_per_year numeric(16,2),
    award_usd_per_year numeric(14,2),
    award_covers text[],
    renewable boolean DEFAULT false NOT NULL,
    renewal_conditions text,
    application_deadline date,
    deadline_is_rolling boolean DEFAULT false NOT NULL,
    portal_url text,
    official_source_url text,
    status text DEFAULT 'active'::text NOT NULL,
    last_verified_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT grants_provider_type_check CHECK ((provider_type = ANY (ARRAY['central_government'::text, 'state_government'::text, 'foreign_government'::text, 'university'::text, 'ngo'::text, 'foundation'::text]))),
    CONSTRAINT grants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'discontinued'::text, 'paused'::text, 'unverified'::text])))
);


ALTER TABLE public.grants OWNER TO postgres;

--
-- Name: login_attempts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.login_attempts (
    email text NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    last_attempt integer DEFAULT 0 NOT NULL,
    locked_until integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.login_attempts OWNER TO postgres;

--
-- Name: majors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.majors (
    id integer NOT NULL,
    cip_code character varying(10) NOT NULL,
    name character varying(255) NOT NULL,
    broad_category character varying(100),
    is_stem boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.majors OWNER TO postgres;

--
-- Name: majors_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.majors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.majors_id_seq OWNER TO postgres;

--
-- Name: majors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.majors_id_seq OWNED BY public.majors.id;


--
-- Name: masters_application_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.masters_application_documents (
    id bigint NOT NULL,
    masters_application_id bigint NOT NULL,
    document_type text NOT NULL,
    status text DEFAULT 'not_started'::text NOT NULL,
    document_id integer,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT masters_application_documents_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text, 'not_applicable'::text])))
);


ALTER TABLE public.masters_application_documents OWNER TO postgres;

--
-- Name: masters_application_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.masters_application_documents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.masters_application_documents_id_seq OWNER TO postgres;

--
-- Name: masters_application_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.masters_application_documents_id_seq OWNED BY public.masters_application_documents.id;


--
-- Name: masters_application_recommenders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.masters_application_recommenders (
    id bigint NOT NULL,
    masters_application_id bigint NOT NULL,
    recommender_id integer NOT NULL,
    status text DEFAULT 'not_requested'::text NOT NULL,
    request_date timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT masters_application_recommenders_status_check CHECK ((status = ANY (ARRAY['not_requested'::text, 'requested'::text, 'in_progress'::text, 'completed'::text, 'declined'::text])))
);


ALTER TABLE public.masters_application_recommenders OWNER TO postgres;

--
-- Name: masters_application_recommenders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.masters_application_recommenders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.masters_application_recommenders_id_seq OWNER TO postgres;

--
-- Name: masters_application_recommenders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.masters_application_recommenders_id_seq OWNED BY public.masters_application_recommenders.id;


--
-- Name: masters_applications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.masters_applications (
    id bigint NOT NULL,
    user_id integer NOT NULL,
    masters_program_id uuid NOT NULL,
    status text,
    intake_term text,
    intake_year integer,
    priority text,
    notes text,
    decision_outcome text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    application_portal_link text,
    application_fee numeric(10,2),
    application_fee_currency text,
    CONSTRAINT masters_applications_decision_outcome_check CHECK (((decision_outcome IS NULL) OR (decision_outcome = ANY (ARRAY['admitted'::text, 'rejected'::text, 'waitlisted'::text, 'interview'::text, 'withdrawn'::text, 'pending'::text]))))
);


ALTER TABLE public.masters_applications OWNER TO postgres;

--
-- Name: masters_applications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.masters_applications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.masters_applications_id_seq OWNER TO postgres;

--
-- Name: masters_applications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.masters_applications_id_seq OWNED BY public.masters_applications.id;


--
-- Name: masters_profile; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.masters_profile (
    id bigint NOT NULL,
    user_id integer NOT NULL,
    target_degree_type text,
    intended_program text,
    intended_specialization text,
    gre_verbal integer,
    gre_quant integer,
    gre_awa numeric(2,1),
    gmat_total integer,
    gmat_focus_total integer,
    toefl_score integer,
    ielts_score numeric(2,1),
    duolingo_score integer,
    pte_score integer,
    undergrad_gpa numeric(5,2),
    undergrad_gpa_scale numeric(5,2),
    undergrad_institution text,
    undergrad_major text,
    undergrad_country text,
    research_experience text,
    publication_count integer DEFAULT 0,
    work_experience_years numeric(4,1) DEFAULT 0,
    work_experience_desc text,
    sop_status text,
    lors_secured integer DEFAULT 0,
    lors_required integer,
    target_intake_term text,
    target_intake_year integer,
    target_countries jsonb DEFAULT '[]'::jsonb,
    profile_version integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    target_budget_max numeric(12,2),
    target_budget_currency text,
    CONSTRAINT masters_profile_sop_status_check CHECK (((sop_status IS NULL) OR (sop_status = ANY (ARRAY['not_started'::text, 'drafting'::text, 'reviewing'::text, 'final'::text])))),
    CONSTRAINT masters_profile_target_degree_type_check CHECK (((target_degree_type IS NULL) OR (target_degree_type = ANY (ARRAY['MS'::text, 'MA'::text, 'MBA'::text])))),
    CONSTRAINT masters_profile_target_intake_term_check CHECK (((target_intake_term IS NULL) OR (target_intake_term = ANY (ARRAY['fall'::text, 'spring'::text, 'summer'::text, 'winter'::text]))))
);


ALTER TABLE public.masters_profile OWNER TO postgres;

--
-- Name: masters_profile_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.masters_profile_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.masters_profile_id_seq OWNER TO postgres;

--
-- Name: masters_profile_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.masters_profile_id_seq OWNED BY public.masters_profile.id;


--
-- Name: migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    filename text NOT NULL,
    executed_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.migrations OWNER TO postgres;

--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.migrations_id_seq OWNER TO postgres;

--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: ml_metadata; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ml_metadata (
    id bigint NOT NULL,
    model_version text NOT NULL,
    accuracy double precision NOT NULL,
    f1_score double precision NOT NULL,
    precision_val double precision,
    recall_val double precision,
    training_samples integer DEFAULT 0 NOT NULL,
    last_trained timestamp with time zone DEFAULT now() NOT NULL,
    model_path text,
    encoder_path text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ml_metadata OWNER TO postgres;

--
-- Name: ml_metadata_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ml_metadata_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ml_metadata_id_seq OWNER TO postgres;

--
-- Name: ml_metadata_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ml_metadata_id_seq OWNED BY public.ml_metadata.id;


--
-- Name: ml_training_data; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ml_training_data (
    id integer NOT NULL,
    user_id integer,
    college_id integer,
    outcome character varying(20),
    gpa numeric(4,2),
    sat_score integer,
    act_score integer,
    features jsonb,
    created_at timestamp without time zone DEFAULT now(),
    source text DEFAULT 'user_submitted'::text,
    source_url text,
    source_year integer,
    confidence_score double precision DEFAULT 0.7,
    is_verified integer DEFAULT 0,
    verification_date timestamp with time zone,
    major_applied text,
    is_athlete integer DEFAULT 0,
    num_ib_courses integer DEFAULT 0,
    activity_tier_3_count integer DEFAULT 0,
    coursework_rigor_score double precision,
    essay_quality_estimate integer,
    education_system text DEFAULT 'US'::text,
    board_percentage double precision,
    jee_rank integer,
    a_level_grades text,
    ib_points integer,
    abitur_grade double precision
);


ALTER TABLE public.ml_training_data OWNER TO postgres;

--
-- Name: ml_training_data_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ml_training_data_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ml_training_data_id_seq OWNER TO postgres;

--
-- Name: ml_training_data_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ml_training_data_id_seq OWNED BY public.ml_training_data.id;


--
-- Name: model_training_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.model_training_history (
    id integer NOT NULL,
    college_id integer NOT NULL,
    model_version text,
    trigger_type text,
    samples_used integer,
    training_duration_ms integer,
    accuracy_before double precision,
    accuracy_after double precision,
    improvement_delta double precision,
    success integer DEFAULT 1,
    failure_reason text,
    trained_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT model_training_history_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['scheduled'::text, 'manual'::text, 'data_threshold'::text, 'initial'::text])))
);


ALTER TABLE public.model_training_history OWNER TO postgres;

--
-- Name: model_training_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.model_training_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.model_training_history_id_seq OWNER TO postgres;

--
-- Name: model_training_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.model_training_history_id_seq OWNED BY public.model_training_history.id;


--
-- Name: mv_college_cards; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.mv_college_cards AS
 SELECT id,
    canonical_name,
    country_code,
    state_region,
    city,
    website,
    logo_url,
    description,
    institution_type,
    popularity_score,
    global_rank,
    acceptance_rate,
    test_optional,
    sat_50,
    act_50,
    tuition_international,
    cost_of_attendance,
    avg_financial_aid,
    merit_scholarship_flag,
    need_blind_flag,
    graduation_rate_4yr,
    employment_rate,
    median_start_salary,
    metadata
   FROM canonical.mv_college_cards;


ALTER VIEW public.mv_college_cards OWNER TO postgres;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    user_id integer,
    title character varying(255),
    message text,
    type character varying(50),
    is_read boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    metadata jsonb
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.notifications_id_seq OWNER TO postgres;

--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: prediction_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.prediction_audit_log (
    id integer NOT NULL,
    user_id integer,
    college_id integer NOT NULL,
    prediction_type text,
    probability double precision,
    category text,
    confidence double precision,
    model_version text,
    feature_snapshot text,
    factors_json text,
    predicted_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT prediction_audit_log_prediction_type_check CHECK ((prediction_type = ANY (ARRAY['ml_lda'::text, 'rule_based'::text, 'hybrid'::text])))
);


ALTER TABLE public.prediction_audit_log OWNER TO postgres;

--
-- Name: prediction_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.prediction_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.prediction_audit_log_id_seq OWNER TO postgres;

--
-- Name: prediction_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.prediction_audit_log_id_seq OWNED BY public.prediction_audit_log.id;


--
-- Name: prediction_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.prediction_logs (
    id integer NOT NULL,
    user_id integer NOT NULL,
    college_id integer,
    predicted_probability numeric(5,4),
    actual_outcome smallint,
    engine character varying(50) DEFAULT 'deterministic-sigmoid'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT prediction_logs_actual_outcome_check CHECK ((actual_outcome = ANY (ARRAY[0, 1]))),
    CONSTRAINT prediction_logs_predicted_probability_check CHECK (((predicted_probability >= (0)::numeric) AND (predicted_probability <= (1)::numeric)))
);


ALTER TABLE public.prediction_logs OWNER TO postgres;

--
-- Name: prediction_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.prediction_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.prediction_logs_id_seq OWNER TO postgres;

--
-- Name: prediction_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.prediction_logs_id_seq OWNED BY public.prediction_logs.id;


--
-- Name: private_loans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.private_loans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    provider text NOT NULL,
    provider_type text,
    country_of_study text[],
    eligible_nationalities text[] DEFAULT ARRAY['Indian'::text],
    degree_levels text[],
    requires_co_signer boolean DEFAULT false NOT NULL,
    requires_collateral boolean DEFAULT false NOT NULL,
    collateral_required_above_inr numeric(16,2),
    max_loan_amount_usd numeric(14,2),
    max_loan_amount_inr numeric(16,2),
    interest_rate_min_pct numeric(5,2),
    interest_rate_max_pct numeric(5,2),
    rate_type text,
    disbursement_currency text DEFAULT 'USD'::text NOT NULL,
    repayment_years_min integer,
    repayment_years_max integer,
    moratorium_months integer,
    processing_fee_pct numeric(5,2),
    covers_living_costs boolean DEFAULT false NOT NULL,
    eligible_colleges_type text,
    min_gpa_4_scale numeric(3,2),
    portal_url text,
    status text DEFAULT 'active'::text NOT NULL,
    last_verified_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT private_loans_provider_type_check CHECK ((provider_type = ANY (ARRAY['indian_nbfc'::text, 'international_lender'::text, 'edtech_lender'::text]))),
    CONSTRAINT private_loans_status_check CHECK ((status = ANY (ARRAY['active'::text, 'discontinued'::text, 'paused'::text, 'unverified'::text])))
);


ALTER TABLE public.private_loans OWNER TO postgres;

--
-- Name: recommendation_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.recommendation_requests (
    id integer NOT NULL,
    user_id integer,
    recommender_name character varying(255),
    recommender_email character varying(255),
    status character varying(50) DEFAULT 'requested'::character varying,
    deadline timestamp without time zone,
    last_reminder_date timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    recommender_id integer,
    college_id integer,
    college_name text,
    application_system text,
    request_date timestamp with time zone DEFAULT now(),
    notes text
);


ALTER TABLE public.recommendation_requests OWNER TO postgres;

--
-- Name: recommendation_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.recommendation_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.recommendation_requests_id_seq OWNER TO postgres;

--
-- Name: recommendation_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.recommendation_requests_id_seq OWNED BY public.recommendation_requests.id;


--
-- Name: recommenders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.recommenders (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    type text,
    relationship text,
    subject text,
    institution text,
    years_known integer,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.recommenders OWNER TO postgres;

--
-- Name: recommenders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.recommenders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.recommenders_id_seq OWNER TO postgres;

--
-- Name: recommenders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.recommenders_id_seq OWNED BY public.recommenders.id;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.refresh_tokens (
    id integer NOT NULL,
    user_id integer,
    token text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.refresh_tokens OWNER TO postgres;

--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.refresh_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.refresh_tokens_id_seq OWNER TO postgres;

--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.refresh_tokens_id_seq OWNED BY public.refresh_tokens.id;


--
-- Name: requested_colleges; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.requested_colleges (
    id integer NOT NULL,
    name text NOT NULL,
    website text,
    city text,
    state text,
    country text NOT NULL,
    request_reason text,
    requested_by_user_id integer,
    requested_by_email text,
    request_count integer DEFAULT 1,
    first_requested_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_requested_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status text DEFAULT 'pending'::text,
    reviewed_by_admin_id integer,
    reviewed_at timestamp without time zone,
    admin_notes text,
    approved_college_id integer,
    CONSTRAINT requested_colleges_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'in_progress'::text])))
);


ALTER TABLE public.requested_colleges OWNER TO postgres;

--
-- Name: requested_colleges_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.requested_colleges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.requested_colleges_id_seq OWNER TO postgres;

--
-- Name: requested_colleges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.requested_colleges_id_seq OWNED BY public.requested_colleges.id;


--
-- Name: scholarships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scholarships (
    id integer NOT NULL,
    name text NOT NULL,
    provider text NOT NULL,
    country text,
    currency text DEFAULT 'USD'::text NOT NULL,
    amount numeric(14,2),
    amount_min numeric(14,2),
    amount_max numeric(14,2),
    need_based boolean DEFAULT false NOT NULL,
    merit_based boolean DEFAULT true NOT NULL,
    deadline date,
    renewable boolean DEFAULT false NOT NULL,
    renewable_years smallint,
    description text,
    eligibility_summary text,
    application_url text,
    source_url text,
    nationality_requirements jsonb DEFAULT '[]'::jsonb NOT NULL,
    academic_requirements jsonb DEFAULT '[]'::jsonb NOT NULL,
    major_requirements jsonb DEFAULT '[]'::jsonb NOT NULL,
    demographic_requirements jsonb DEFAULT '[]'::jsonb NOT NULL,
    documentation_required jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    scraped_at timestamp with time zone,
    last_verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    eligible_nationalities jsonb DEFAULT '["All"]'::jsonb NOT NULL,
    degree_levels jsonb DEFAULT '["undergraduate", "postgraduate"]'::jsonb NOT NULL,
    eligible_majors jsonb DEFAULT '["All"]'::jsonb NOT NULL,
    eligible_genders jsonb DEFAULT '["All"]'::jsonb NOT NULL,
    min_gpa_4_scale numeric(3,2),
    min_percentage numeric(5,2),
    min_sat integer,
    min_ielts numeric(3,1),
    max_family_income_usd numeric(14,2),
    award_usd_per_year numeric(14,2),
    award_covers jsonb DEFAULT '["tuition"]'::jsonb NOT NULL,
    scholarship_type text DEFAULT 'external'::text NOT NULL,
    renewal_conditions text,
    portal_url text,
    university_name text,
    CONSTRAINT scholarships_scholarship_type_check CHECK ((scholarship_type = ANY (ARRAY['merit'::text, 'need-based'::text, 'merit-need'::text, 'government'::text, 'external'::text]))),
    CONSTRAINT scholarships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'expired'::text])))
);


ALTER TABLE public.scholarships OWNER TO postgres;

--
-- Name: scholarships_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.scholarships_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.scholarships_id_seq OWNER TO postgres;

--
-- Name: scholarships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.scholarships_id_seq OWNED BY public.scholarships.id;


--
-- Name: scraped_applicants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scraped_applicants (
    id integer NOT NULL,
    reddit_post_id text NOT NULL,
    gpa double precision,
    sat_score integer,
    act_score integer,
    num_ap_courses integer,
    nationality text,
    intended_major text,
    first_gen integer,
    income_bracket text,
    raw_text text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.scraped_applicants OWNER TO postgres;

--
-- Name: scraped_applicants_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.scraped_applicants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.scraped_applicants_id_seq OWNER TO postgres;

--
-- Name: scraped_applicants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.scraped_applicants_id_seq OWNED BY public.scraped_applicants.id;


--
-- Name: scraped_results; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scraped_results (
    id integer NOT NULL,
    applicant_id integer NOT NULL,
    school_name_raw text NOT NULL,
    school_name_normalized text NOT NULL,
    outcome text NOT NULL,
    round text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT scraped_results_outcome_check CHECK ((outcome = ANY (ARRAY['accepted'::text, 'rejected'::text, 'waitlisted'::text, 'deferred'::text]))),
    CONSTRAINT scraped_results_round_check CHECK ((round = ANY (ARRAY['ED'::text, 'EA'::text, 'RD'::text, 'REA'::text, 'SCEA'::text])))
);


ALTER TABLE public.scraped_results OWNER TO postgres;

--
-- Name: scraped_results_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.scraped_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.scraped_results_id_seq OWNER TO postgres;

--
-- Name: scraped_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.scraped_results_id_seq OWNED BY public.scraped_results.id;


--
-- Name: scraper_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scraper_logs (
    id bigint NOT NULL,
    scraper_name text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    status text DEFAULT 'running'::text NOT NULL,
    exit_code integer,
    stdout text,
    stderr text,
    error_msg text,
    CONSTRAINT scraper_logs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'error'::text])))
);


ALTER TABLE public.scraper_logs OWNER TO postgres;

--
-- Name: scraper_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.scraper_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.scraper_logs_id_seq OWNER TO postgres;

--
-- Name: scraper_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.scraper_logs_id_seq OWNED BY public.scraper_logs.id;


--
-- Name: scraper_run_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scraper_run_logs (
    id bigint NOT NULL,
    job_name text NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    rows_upserted integer DEFAULT 0 NOT NULL,
    status text,
    error_message text,
    CONSTRAINT scraper_run_logs_status_check CHECK ((status = ANY (ARRAY['success'::text, 'failed'::text, 'partial'::text])))
);


ALTER TABLE public.scraper_run_logs OWNER TO postgres;

--
-- Name: scraper_run_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.scraper_run_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.scraper_run_logs_id_seq OWNER TO postgres;

--
-- Name: scraper_run_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.scraper_run_logs_id_seq OWNED BY public.scraper_run_logs.id;


--
-- Name: student_activities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_activities (
    id integer NOT NULL,
    student_id integer,
    activity_name text NOT NULL,
    activity_type text,
    position_title text,
    organization_name text,
    description text,
    grade_9 integer DEFAULT 0,
    grade_10 integer DEFAULT 0,
    grade_11 integer DEFAULT 0,
    grade_12 integer DEFAULT 0,
    hours_per_week double precision,
    weeks_per_year integer,
    total_hours integer,
    awards_recognition text,
    tier_rating integer DEFAULT 4,
    participation_during_school integer DEFAULT 1,
    participation_during_break integer DEFAULT 0,
    participation_all_year integer DEFAULT 0,
    participation_post_graduation integer DEFAULT 0,
    display_order integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.student_activities OWNER TO postgres;

--
-- Name: student_activities_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.student_activities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.student_activities_id_seq OWNER TO postgres;

--
-- Name: student_activities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.student_activities_id_seq OWNED BY public.student_activities.id;


--
-- Name: student_awards; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_awards (
    id integer NOT NULL,
    student_id integer,
    award_name text NOT NULL,
    award_level text,
    organization text,
    grade_received integer,
    year_received integer,
    description text,
    display_order integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.student_awards OWNER TO postgres;

--
-- Name: student_awards_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.student_awards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.student_awards_id_seq OWNER TO postgres;

--
-- Name: student_awards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.student_awards_id_seq OWNED BY public.student_awards.id;


--
-- Name: student_coursework; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_coursework (
    id integer NOT NULL,
    student_id integer,
    course_name text NOT NULL,
    course_level text,
    subject_area text,
    grade_level integer,
    final_grade text,
    grade_points double precision,
    weighted integer DEFAULT 0,
    exam_score integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.student_coursework OWNER TO postgres;

--
-- Name: student_coursework_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.student_coursework_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.student_coursework_id_seq OWNER TO postgres;

--
-- Name: student_coursework_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.student_coursework_id_seq OWNED BY public.student_coursework.id;


--
-- Name: student_demographics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_demographics (
    id integer NOT NULL,
    college_id integer,
    percent_male real,
    percent_female real,
    percent_white real,
    percent_black real,
    percent_hispanic real,
    percent_asian real,
    percent_international real,
    data_year integer,
    percent_native_american real,
    percent_pacific_islander real,
    percent_multiracial real,
    percent_unknown_race real,
    percent_nonbinary real,
    lgbtq_friendly_rating integer,
    lgbtq_resources text,
    religious_diversity_score integer,
    socioeconomic_diversity_score integer,
    political_diversity_score integer,
    percent_pell_recipients real,
    percent_low_income real,
    percent_middle_income real,
    percent_high_income real,
    average_age real,
    percent_over_25 real,
    percent_in_state real,
    percent_out_of_state real,
    top_feeder_states text
);


ALTER TABLE public.student_demographics OWNER TO postgres;

--
-- Name: student_demographics_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.student_demographics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.student_demographics_id_seq OWNER TO postgres;

--
-- Name: student_demographics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.student_demographics_id_seq OWNED BY public.student_demographics.id;


--
-- Name: student_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_profiles (
    id integer NOT NULL,
    user_id integer,
    first_name text,
    last_name text,
    email text,
    graduation_year integer,
    gpa_weighted double precision,
    gpa_unweighted double precision,
    gpa_scale text,
    class_rank integer,
    class_size integer,
    class_rank_percentile double precision,
    sat_ebrw integer,
    sat_math integer,
    sat_total integer,
    act_composite integer,
    act_english integer,
    act_math integer,
    act_reading integer,
    act_science integer,
    jee_main_percentile double precision,
    jee_advanced_rank integer,
    neet_score integer,
    board_exam_percentage double precision,
    board_type text,
    predicted_a_levels text,
    ib_predicted_score integer,
    gcse_results text,
    abitur_grade double precision,
    german_proficiency text,
    toefl_score integer,
    ielts_score double precision,
    duolingo_score integer,
    country text,
    state_province text,
    city text,
    high_school_name text,
    high_school_type text,
    curriculum_type text,
    is_first_generation integer DEFAULT 0,
    is_legacy integer DEFAULT 0,
    legacy_schools text,
    ethnicity text,
    citizenship_status text,
    intended_majors text,
    preferred_states text,
    preferred_countries text,
    preferred_college_size text,
    preferred_setting text,
    budget_max integer,
    min_acceptance_rate double precision,
    max_acceptance_rate double precision,
    special_circumstances text,
    hooks text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    phone character varying(20),
    date_of_birth date,
    grade_level character varying(20),
    stream character varying(50),
    subjects text DEFAULT '[]'::text,
    sat_breakdown text,
    act_breakdown text,
    ielts_breakdown text,
    budget_min integer,
    college_size_preference character varying(50),
    campus_setting_preference character varying(50),
    profile_completion_percentage integer DEFAULT 0,
    ib_program_type character varying(50),
    tok_grade character varying(2),
    ee_grade character varying(2),
    ib_subjects text DEFAULT '[]'::text,
    exam_board character varying(50),
    a_level_subjects text DEFAULT '[]'::text,
    as_levels text DEFAULT '[]'::text,
    epq_completed integer DEFAULT 0,
    epq_grade character varying(5),
    cbse_subjects text DEFAULT '[]'::text,
    board_exam_year integer,
    overall_percentage double precision,
    school_city character varying(100),
    onboarding_draft text,
    onboarding_step integer DEFAULT 0,
    career_goals text,
    why_college text,
    interest_tags text,
    why_college_matters text,
    life_goals_raw text,
    values_vector jsonb,
    values_computed_at timestamp with time zone,
    school_type text,
    extracurriculars json,
    awards json,
    research boolean DEFAULT false,
    leadership_roles json,
    need_based_aid boolean,
    intended_major character varying(100),
    custom_majors json,
    custom_subjects json,
    trait_weights json,
    trait_profile json,
    curriculum_type_other text,
    profile_version integer DEFAULT 0,
    last_profile_request_id text,
    trait_interpretation json,
    CONSTRAINT student_profiles_school_type_check CHECK ((school_type = ANY (ARRAY['international_school'::text, 'local_curriculum'::text, 'homeschool'::text])))
);


ALTER TABLE public.student_profiles OWNER TO postgres;

--
-- Name: student_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.student_profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.student_profiles_id_seq OWNER TO postgres;

--
-- Name: student_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.student_profiles_id_seq OWNED BY public.student_profiles.id;


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tasks (
    id integer NOT NULL,
    user_id integer,
    college_id integer,
    title character varying(255),
    description text,
    status character varying(50) DEFAULT 'pending'::character varying,
    priority integer DEFAULT 2,
    deadline timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    task_type character varying(50) DEFAULT 'general'::character varying,
    application_id integer,
    estimated_hours numeric DEFAULT 1,
    blocking_reason text,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.tasks OWNER TO postgres;

--
-- Name: tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tasks_id_seq OWNER TO postgres;

--
-- Name: tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tasks_id_seq OWNED BY public.tasks.id;


--
-- Name: timeline_actions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.timeline_actions (
    id integer NOT NULL,
    title text NOT NULL,
    description text,
    category text NOT NULL,
    target_month integer NOT NULL,
    target_year integer NOT NULL,
    priority text DEFAULT 'medium'::text,
    completed boolean DEFAULT false,
    completed_date timestamp with time zone,
    related_country text,
    related_college_id integer,
    related_deadline_id integer,
    is_system_generated boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    user_id integer
);


ALTER TABLE public.timeline_actions OWNER TO postgres;

--
-- Name: timeline_actions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.timeline_actions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.timeline_actions_id_seq OWNER TO postgres;

--
-- Name: timeline_actions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.timeline_actions_id_seq OWNED BY public.timeline_actions.id;


--
-- Name: user_deadlines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_deadlines (
    id integer NOT NULL,
    user_id integer,
    college_id integer,
    title character varying(255),
    deadline_date timestamp without time zone,
    is_completed boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.user_deadlines OWNER TO postgres;

--
-- Name: user_deadlines_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_deadlines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_deadlines_id_seq OWNER TO postgres;

--
-- Name: user_deadlines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_deadlines_id_seq OWNED BY public.user_deadlines.id;


--
-- Name: user_financial_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_financial_profiles (
    id integer NOT NULL,
    user_id integer NOT NULL,
    annual_family_income_usd numeric(14,2),
    income_currency text DEFAULT 'USD'::text NOT NULL,
    savings_available_usd numeric(14,2),
    preferred_display_currency text DEFAULT 'USD'::text NOT NULL,
    max_loan_amount_usd numeric(14,2),
    loan_repayment_years smallint DEFAULT 10,
    is_first_generation boolean DEFAULT false,
    is_international boolean DEFAULT true,
    home_country text,
    citizenship text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_financial_profiles_preferred_display_currency_check CHECK ((preferred_display_currency = ANY (ARRAY['USD'::text, 'INR'::text, 'GBP'::text, 'EUR'::text, 'CAD'::text, 'AUD'::text])))
);


ALTER TABLE public.user_financial_profiles OWNER TO postgres;

--
-- Name: user_financial_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_financial_profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_financial_profiles_id_seq OWNER TO postgres;

--
-- Name: user_financial_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_financial_profiles_id_seq OWNED BY public.user_financial_profiles.id;


--
-- Name: user_ml_stats; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_ml_stats (
    id integer NOT NULL,
    user_id integer NOT NULL,
    total_contributions integer DEFAULT 0,
    verified_contributions integer DEFAULT 0,
    total_points integer DEFAULT 0,
    contribution_rank text DEFAULT 'contributor'::text,
    models_improved integer DEFAULT 0,
    last_contribution_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_ml_stats OWNER TO postgres;

--
-- Name: user_ml_stats_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_ml_stats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_ml_stats_id_seq OWNER TO postgres;

--
-- Name: user_ml_stats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_ml_stats_id_seq OWNED BY public.user_ml_stats.id;


--
-- Name: user_outcome_contributions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_outcome_contributions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    training_data_id integer NOT NULL,
    college_id integer NOT NULL,
    decision text NOT NULL,
    contribution_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    points_awarded integer DEFAULT 10,
    used_in_training integer DEFAULT 0,
    model_version_used text
);


ALTER TABLE public.user_outcome_contributions OWNER TO postgres;

--
-- Name: user_outcome_contributions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_outcome_contributions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_outcome_contributions_id_seq OWNER TO postgres;

--
-- Name: user_outcome_contributions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_outcome_contributions_id_seq OWNED BY public.user_outcome_contributions.id;


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_profiles (
    id integer NOT NULL,
    user_id character varying(255) NOT NULL,
    student_profile jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.user_profiles OWNER TO postgres;

--
-- Name: user_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_profiles_id_seq OWNER TO postgres;

--
-- Name: user_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_profiles_id_seq OWNED BY public.user_profiles.id;


--
-- Name: user_scholarships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_scholarships (
    id integer NOT NULL,
    user_id integer NOT NULL,
    scholarship_id integer NOT NULL,
    status text DEFAULT 'interested'::text NOT NULL,
    notes text,
    application_date date,
    decision_date date,
    award_amount numeric(14,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_scholarships_status_check CHECK ((status = ANY (ARRAY['interested'::text, 'applied'::text, 'awarded'::text, 'rejected'::text, 'withdrawn'::text])))
);


ALTER TABLE public.user_scholarships OWNER TO postgres;

--
-- Name: user_scholarships_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_scholarships_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_scholarships_id_seq OWNER TO postgres;

--
-- Name: user_scholarships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_scholarships_id_seq OWNED BY public.user_scholarships.id;


--
-- Name: user_signals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_signals (
    id integer NOT NULL,
    user_id integer,
    college_id integer,
    signal_type character varying(30) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_signals_signal_type_check CHECK (((signal_type)::text = ANY ((ARRAY['added'::character varying, 'dismissed'::character varying, 'viewed'::character varying, 'removed'::character varying])::text[])))
);


ALTER TABLE public.user_signals OWNER TO postgres;

--
-- Name: user_signals_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_signals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_signals_id_seq OWNER TO postgres;

--
-- Name: user_signals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_signals_id_seq OWNED BY public.user_signals.id;


--
-- Name: user_suggestions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_suggestions (
    id integer NOT NULL,
    user_id character varying(255) NOT NULL,
    suggestions jsonb,
    generated_at timestamp with time zone DEFAULT now(),
    is_fallback boolean DEFAULT false
);


ALTER TABLE public.user_suggestions OWNER TO postgres;

--
-- Name: user_suggestions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_suggestions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_suggestions_id_seq OWNER TO postgres;

--
-- Name: user_suggestions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_suggestions_id_seq OWNED BY public.user_suggestions.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email text NOT NULL,
    password_hash text,
    google_id text,
    full_name text NOT NULL,
    country text NOT NULL,
    target_countries text,
    intended_majors text,
    test_status text,
    language_preferences text,
    onboarding_complete integer DEFAULT 0,
    academic_board text,
    grade_level text,
    graduation_year integer,
    subjects text,
    percentage double precision,
    gpa double precision,
    medium_of_instruction text,
    exams_taken text,
    max_budget_per_year double precision,
    can_take_loan integer DEFAULT 0,
    need_financial_aid integer DEFAULT 0,
    intended_major text,
    career_goals text,
    profile_completed integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    phone character varying(20),
    has_completed_tour boolean DEFAULT false,
    role text DEFAULT 'student'::text NOT NULL,
    terms_accepted integer DEFAULT 0,
    onboarding_completed boolean DEFAULT false,
    onboarding_data jsonb,
    profile_score integer DEFAULT 0,
    sat_score integer,
    act_score integer,
    budget integer,
    preferred_location text[],
    extracurriculars jsonb,
    essays_started boolean DEFAULT false,
    preference_vector jsonb,
    current_grade character varying(50),
    gender character varying(50),
    family_income_inr bigint,
    family_income_usd integer,
    willing_to_take_loan boolean DEFAULT true,
    has_collateral boolean DEFAULT false,
    preferred_currency text DEFAULT 'USD'::text,
    program_track text DEFAULT 'undergraduate'::text NOT NULL,
    university_enrollment_status text,
    current_year_of_study integer,
    ml_consent boolean DEFAULT false NOT NULL,
    CONSTRAINT users_current_year_of_study_chk CHECK (((current_year_of_study IS NULL) OR ((current_year_of_study >= 1) AND (current_year_of_study <= 6)))),
    CONSTRAINT users_enrollment_status_chk CHECK (((university_enrollment_status IS NULL) OR (university_enrollment_status = ANY (ARRAY['not_enrolled'::text, 'enrolled_yr1_2'::text, 'enrolled_yr3_4'::text])))),
    CONSTRAINT users_program_track_chk CHECK ((program_track = ANY (ARRAY['undergraduate'::text, 'masters'::text, 'transfer'::text])))
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: experiment_assignments id; Type: DEFAULT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.experiment_assignments ALTER COLUMN id SET DEFAULT nextval('canonical.experiment_assignments_id_seq'::regclass);


--
-- Name: major_ontology id; Type: DEFAULT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.major_ontology ALTER COLUMN id SET DEFAULT nextval('canonical.major_ontology_id_seq'::regclass);


--
-- Name: recommendation_feedback id; Type: DEFAULT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.recommendation_feedback ALTER COLUMN id SET DEFAULT nextval('canonical.recommendation_feedback_id_seq'::regclass);


--
-- Name: retrieval_eval_history id; Type: DEFAULT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.retrieval_eval_history ALTER COLUMN id SET DEFAULT nextval('canonical.retrieval_eval_history_id_seq'::regclass);


--
-- Name: stg_institution_candidates stg_id; Type: DEFAULT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.stg_institution_candidates ALTER COLUMN stg_id SET DEFAULT nextval('canonical.stg_institution_candidates_stg_id_seq'::regclass);


--
-- Name: user_recommendation_events id; Type: DEFAULT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.user_recommendation_events ALTER COLUMN id SET DEFAULT nextval('canonical.user_recommendation_events_id_seq'::regclass);


--
-- Name: academic_details id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.academic_details ALTER COLUMN id SET DEFAULT nextval('public.academic_details_id_seq'::regclass);


--
-- Name: academic_outcomes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.academic_outcomes ALTER COLUMN id SET DEFAULT nextval('public.academic_outcomes_id_seq'::regclass);


--
-- Name: admission_outcomes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admission_outcomes ALTER COLUMN id SET DEFAULT nextval('public.admission_outcomes_id_seq'::regclass);


--
-- Name: application_deadlines id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.application_deadlines ALTER COLUMN id SET DEFAULT nextval('public.application_deadlines_id_seq'::regclass);


--
-- Name: application_tasks id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.application_tasks ALTER COLUMN id SET DEFAULT nextval('public.application_tasks_id_seq'::regclass);


--
-- Name: applications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.applications ALTER COLUMN id SET DEFAULT nextval('public.applications_id_seq'::regclass);


--
-- Name: campus_life id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campus_life ALTER COLUMN id SET DEFAULT nextval('public.campus_life_id_seq'::regclass);


--
-- Name: career_outcomes_detail id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.career_outcomes_detail ALTER COLUMN id SET DEFAULT nextval('public.career_outcomes_detail_id_seq'::regclass);


--
-- Name: chance_me_posts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chance_me_posts ALTER COLUMN id SET DEFAULT nextval('public.chance_me_posts_id_seq'::regclass);


--
-- Name: chancing_audit_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chancing_audit_log ALTER COLUMN id SET DEFAULT nextval('public.chancing_audit_log_id_seq'::regclass);


--
-- Name: chancing_predictions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chancing_predictions ALTER COLUMN id SET DEFAULT nextval('public.chancing_predictions_id_seq'::regclass);


--
-- Name: college_admissions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_admissions ALTER COLUMN id SET DEFAULT nextval('public.college_admissions_id_seq'::regclass);


--
-- Name: college_admissions_stats id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_admissions_stats ALTER COLUMN id SET DEFAULT nextval('public.college_admissions_stats_id_seq'::regclass);


--
-- Name: college_data_contributions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_data_contributions ALTER COLUMN id SET DEFAULT nextval('public.college_data_contributions_id_seq'::regclass);


--
-- Name: college_deadlines id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_deadlines ALTER COLUMN id SET DEFAULT nextval('public.college_deadlines_id_seq'::regclass);


--
-- Name: college_financial_aid id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_financial_aid ALTER COLUMN id SET DEFAULT nextval('public.college_financial_aid_id_seq'::regclass);


--
-- Name: college_financial_data id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_financial_data ALTER COLUMN id SET DEFAULT nextval('public.college_financial_data_id_seq'::regclass);


--
-- Name: college_insights id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_insights ALTER COLUMN id SET DEFAULT nextval('public.college_insights_id_seq'::regclass);


--
-- Name: college_programs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_programs ALTER COLUMN id SET DEFAULT nextval('public.college_programs_id_seq'::regclass);


--
-- Name: college_rankings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_rankings ALTER COLUMN id SET DEFAULT nextval('public.college_rankings_id_seq'::regclass);


--
-- Name: college_requirements id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_requirements ALTER COLUMN id SET DEFAULT nextval('public.college_requirements_id_seq'::regclass);


--
-- Name: colleges id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.colleges ALTER COLUMN id SET DEFAULT nextval('public.colleges_new_id_seq'::regclass);


--
-- Name: colleges_comprehensive id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.colleges_comprehensive ALTER COLUMN id SET DEFAULT nextval('public.colleges_comprehensive_id_seq'::regclass);


--
-- Name: colleges_legacy id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.colleges_legacy ALTER COLUMN id SET DEFAULT nextval('public.colleges_id_seq'::regclass);


--
-- Name: cost_of_attendance id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_of_attendance ALTER COLUMN id SET DEFAULT nextval('public.cost_of_attendance_id_seq'::regclass);


--
-- Name: currency_rates id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.currency_rates ALTER COLUMN id SET DEFAULT nextval('public.currency_rates_id_seq'::regclass);


--
-- Name: deadline_alerts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deadline_alerts ALTER COLUMN id SET DEFAULT nextval('public.deadline_alerts_id_seq'::regclass);


--
-- Name: deadline_history id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deadline_history ALTER COLUMN id SET DEFAULT nextval('public.deadline_history_id_seq'::regclass);


--
-- Name: deadlines id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deadlines ALTER COLUMN id SET DEFAULT nextval('public.deadlines_id_seq'::regclass);


--
-- Name: documents id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents ALTER COLUMN id SET DEFAULT nextval('public.documents_id_seq'::regclass);


--
-- Name: essays id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.essays ALTER COLUMN id SET DEFAULT nextval('public.essays_id_seq'::regclass);


--
-- Name: financing_options id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.financing_options ALTER COLUMN id SET DEFAULT nextval('public.financing_options_id_seq'::regclass);


--
-- Name: majors id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.majors ALTER COLUMN id SET DEFAULT nextval('public.majors_id_seq'::regclass);


--
-- Name: masters_application_documents id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.masters_application_documents ALTER COLUMN id SET DEFAULT nextval('public.masters_application_documents_id_seq'::regclass);


--
-- Name: masters_application_recommenders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.masters_application_recommenders ALTER COLUMN id SET DEFAULT nextval('public.masters_application_recommenders_id_seq'::regclass);


--
-- Name: masters_applications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.masters_applications ALTER COLUMN id SET DEFAULT nextval('public.masters_applications_id_seq'::regclass);


--
-- Name: masters_profile id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.masters_profile ALTER COLUMN id SET DEFAULT nextval('public.masters_profile_id_seq'::regclass);


--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Name: ml_metadata id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ml_metadata ALTER COLUMN id SET DEFAULT nextval('public.ml_metadata_id_seq'::regclass);


--
-- Name: ml_training_data id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ml_training_data ALTER COLUMN id SET DEFAULT nextval('public.ml_training_data_id_seq'::regclass);


--
-- Name: model_training_history id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.model_training_history ALTER COLUMN id SET DEFAULT nextval('public.model_training_history_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: prediction_audit_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prediction_audit_log ALTER COLUMN id SET DEFAULT nextval('public.prediction_audit_log_id_seq'::regclass);


--
-- Name: prediction_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prediction_logs ALTER COLUMN id SET DEFAULT nextval('public.prediction_logs_id_seq'::regclass);


--
-- Name: recommendation_requests id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recommendation_requests ALTER COLUMN id SET DEFAULT nextval('public.recommendation_requests_id_seq'::regclass);


--
-- Name: recommenders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recommenders ALTER COLUMN id SET DEFAULT nextval('public.recommenders_id_seq'::regclass);


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('public.refresh_tokens_id_seq'::regclass);


--
-- Name: requested_colleges id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.requested_colleges ALTER COLUMN id SET DEFAULT nextval('public.requested_colleges_id_seq'::regclass);


--
-- Name: scholarships id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scholarships ALTER COLUMN id SET DEFAULT nextval('public.scholarships_id_seq'::regclass);


--
-- Name: scraped_applicants id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scraped_applicants ALTER COLUMN id SET DEFAULT nextval('public.scraped_applicants_id_seq'::regclass);


--
-- Name: scraped_results id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scraped_results ALTER COLUMN id SET DEFAULT nextval('public.scraped_results_id_seq'::regclass);


--
-- Name: scraper_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scraper_logs ALTER COLUMN id SET DEFAULT nextval('public.scraper_logs_id_seq'::regclass);


--
-- Name: scraper_run_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scraper_run_logs ALTER COLUMN id SET DEFAULT nextval('public.scraper_run_logs_id_seq'::regclass);


--
-- Name: student_activities id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_activities ALTER COLUMN id SET DEFAULT nextval('public.student_activities_id_seq'::regclass);


--
-- Name: student_awards id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_awards ALTER COLUMN id SET DEFAULT nextval('public.student_awards_id_seq'::regclass);


--
-- Name: student_coursework id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_coursework ALTER COLUMN id SET DEFAULT nextval('public.student_coursework_id_seq'::regclass);


--
-- Name: student_demographics id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_demographics ALTER COLUMN id SET DEFAULT nextval('public.student_demographics_id_seq'::regclass);


--
-- Name: student_profiles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_profiles ALTER COLUMN id SET DEFAULT nextval('public.student_profiles_id_seq'::regclass);


--
-- Name: tasks id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks ALTER COLUMN id SET DEFAULT nextval('public.tasks_id_seq'::regclass);


--
-- Name: timeline_actions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.timeline_actions ALTER COLUMN id SET DEFAULT nextval('public.timeline_actions_id_seq'::regclass);


--
-- Name: user_deadlines id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_deadlines ALTER COLUMN id SET DEFAULT nextval('public.user_deadlines_id_seq'::regclass);


--
-- Name: user_financial_profiles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_financial_profiles ALTER COLUMN id SET DEFAULT nextval('public.user_financial_profiles_id_seq'::regclass);


--
-- Name: user_ml_stats id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_ml_stats ALTER COLUMN id SET DEFAULT nextval('public.user_ml_stats_id_seq'::regclass);


--
-- Name: user_outcome_contributions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_outcome_contributions ALTER COLUMN id SET DEFAULT nextval('public.user_outcome_contributions_id_seq'::regclass);


--
-- Name: user_profiles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_profiles ALTER COLUMN id SET DEFAULT nextval('public.user_profiles_id_seq'::regclass);


--
-- Name: user_scholarships id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_scholarships ALTER COLUMN id SET DEFAULT nextval('public.user_scholarships_id_seq'::regclass);


--
-- Name: user_signals id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_signals ALTER COLUMN id SET DEFAULT nextval('public.user_signals_id_seq'::regclass);


--
-- Name: user_suggestions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_suggestions ALTER COLUMN id SET DEFAULT nextval('public.user_suggestions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: data_quality_snapshots data_quality_snapshots_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.data_quality_snapshots
    ADD CONSTRAINT data_quality_snapshots_pkey PRIMARY KEY (id);


--
-- Name: deadline_history deadline_history_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.deadline_history
    ADD CONSTRAINT deadline_history_pkey PRIMARY KEY (id);


--
-- Name: eu_admissions_profile eu_admissions_profile_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.eu_admissions_profile
    ADD CONSTRAINT eu_admissions_profile_pkey PRIMARY KEY (institution_id);


--
-- Name: experiment_assignments experiment_assignments_experiment_key_user_id_key; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.experiment_assignments
    ADD CONSTRAINT experiment_assignments_experiment_key_user_id_key UNIQUE (experiment_key, user_id);


--
-- Name: experiment_assignments experiment_assignments_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.experiment_assignments
    ADD CONSTRAINT experiment_assignments_pkey PRIMARY KEY (id);


--
-- Name: india_admissions_profile india_admissions_profile_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.india_admissions_profile
    ADD CONSTRAINT india_admissions_profile_pkey PRIMARY KEY (institution_id);


--
-- Name: india_financial_aid india_financial_aid_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.india_financial_aid
    ADD CONSTRAINT india_financial_aid_pkey PRIMARY KEY (institution_id);


--
-- Name: institution_admissions institution_admissions_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_admissions
    ADD CONSTRAINT institution_admissions_pkey PRIMARY KEY (id);


--
-- Name: institution_aliases institution_aliases_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_aliases
    ADD CONSTRAINT institution_aliases_pkey PRIMARY KEY (id);


--
-- Name: institution_campus_life institution_campus_life_institution_id_key; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_campus_life
    ADD CONSTRAINT institution_campus_life_institution_id_key UNIQUE (institution_id);


--
-- Name: institution_campus_life institution_campus_life_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_campus_life
    ADD CONSTRAINT institution_campus_life_pkey PRIMARY KEY (id);


--
-- Name: institution_completeness institution_completeness_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_completeness
    ADD CONSTRAINT institution_completeness_pkey PRIMARY KEY (institution_id);


--
-- Name: institution_deadlines institution_deadlines_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_deadlines
    ADD CONSTRAINT institution_deadlines_pkey PRIMARY KEY (id);


--
-- Name: institution_demographics institution_demographics_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_demographics
    ADD CONSTRAINT institution_demographics_pkey PRIMARY KEY (id);


--
-- Name: institution_financials institution_financials_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_financials
    ADD CONSTRAINT institution_financials_pkey PRIMARY KEY (id);


--
-- Name: institution_identity_map institution_identity_map_canonical_unique; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_identity_map
    ADD CONSTRAINT institution_identity_map_canonical_unique UNIQUE (canonical_institution_id);


--
-- Name: institution_identity_map institution_identity_map_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_identity_map
    ADD CONSTRAINT institution_identity_map_pkey PRIMARY KEY (id);


--
-- Name: institution_merge_history institution_merge_history_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_merge_history
    ADD CONSTRAINT institution_merge_history_pkey PRIMARY KEY (id);


--
-- Name: institution_outcomes institution_outcomes_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_outcomes
    ADD CONSTRAINT institution_outcomes_pkey PRIMARY KEY (id);


--
-- Name: institution_placements institution_placements_institution_id_cycle_year_key; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_placements
    ADD CONSTRAINT institution_placements_institution_id_cycle_year_key UNIQUE (institution_id, cycle_year);


--
-- Name: institution_placements institution_placements_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_placements
    ADD CONSTRAINT institution_placements_pkey PRIMARY KEY (id);


--
-- Name: institution_programs institution_programs_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_programs
    ADD CONSTRAINT institution_programs_pkey PRIMARY KEY (id);


--
-- Name: institution_quality_scores institution_quality_scores_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_quality_scores
    ADD CONSTRAINT institution_quality_scores_pkey PRIMARY KEY (institution_id);


--
-- Name: institution_rankings institution_rankings_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_rankings
    ADD CONSTRAINT institution_rankings_pkey PRIMARY KEY (id);


--
-- Name: institution_requirements institution_requirements_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_requirements
    ADD CONSTRAINT institution_requirements_pkey PRIMARY KEY (id);


--
-- Name: institution_search_index institution_search_index_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_search_index
    ADD CONSTRAINT institution_search_index_pkey PRIMARY KEY (institution_id);


--
-- Name: institution_source_registry institution_source_registry_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_source_registry
    ADD CONSTRAINT institution_source_registry_pkey PRIMARY KEY (id);


--
-- Name: institutions institutions_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institutions
    ADD CONSTRAINT institutions_pkey PRIMARY KEY (id);


--
-- Name: major_ontology major_ontology_canonical_major_alias_key; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.major_ontology
    ADD CONSTRAINT major_ontology_canonical_major_alias_key UNIQUE (canonical_major, alias);


--
-- Name: major_ontology major_ontology_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.major_ontology
    ADD CONSTRAINT major_ontology_pkey PRIMARY KEY (id);


--
-- Name: masters_admission_datapoints masters_admission_datapoints_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.masters_admission_datapoints
    ADD CONSTRAINT masters_admission_datapoints_pkey PRIMARY KEY (id);


--
-- Name: masters_pathways masters_pathways_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.masters_pathways
    ADD CONSTRAINT masters_pathways_pkey PRIMARY KEY (id);


--
-- Name: masters_program_deadlines masters_program_deadlines_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.masters_program_deadlines
    ADD CONSTRAINT masters_program_deadlines_pkey PRIMARY KEY (id);


--
-- Name: masters_program_pathways masters_program_pathways_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.masters_program_pathways
    ADD CONSTRAINT masters_program_pathways_pkey PRIMARY KEY (id);


--
-- Name: masters_programs masters_programs_canonical_institution_id_program_name_degr_key; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.masters_programs
    ADD CONSTRAINT masters_programs_canonical_institution_id_program_name_degr_key UNIQUE (canonical_institution_id, program_name, degree_type, intake_term, intake_year);


--
-- Name: masters_programs masters_programs_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.masters_programs
    ADD CONSTRAINT masters_programs_pkey PRIMARY KEY (id);


--
-- Name: masters_scrape_log masters_scrape_log_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.masters_scrape_log
    ADD CONSTRAINT masters_scrape_log_pkey PRIMARY KEY (id);


--
-- Name: popularity_index popularity_index_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.popularity_index
    ADD CONSTRAINT popularity_index_pkey PRIMARY KEY (institution_id);


--
-- Name: recommendation_feedback recommendation_feedback_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.recommendation_feedback
    ADD CONSTRAINT recommendation_feedback_pkey PRIMARY KEY (id);


--
-- Name: recommendation_feedback recommendation_feedback_user_id_institution_id_key; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.recommendation_feedback
    ADD CONSTRAINT recommendation_feedback_user_id_institution_id_key UNIQUE (user_id, institution_id);


--
-- Name: recommendation_sessions recommendation_sessions_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.recommendation_sessions
    ADD CONSTRAINT recommendation_sessions_pkey PRIMARY KEY (id);


--
-- Name: requirement_history requirement_history_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.requirement_history
    ADD CONSTRAINT requirement_history_pkey PRIMARY KEY (id);


--
-- Name: retrieval_eval_history retrieval_eval_history_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.retrieval_eval_history
    ADD CONSTRAINT retrieval_eval_history_pkey PRIMARY KEY (id);


--
-- Name: source_reliability source_reliability_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.source_reliability
    ADD CONSTRAINT source_reliability_pkey PRIMARY KEY (source_key);


--
-- Name: stg_institution_candidates stg_institution_candidates_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.stg_institution_candidates
    ADD CONSTRAINT stg_institution_candidates_pkey PRIMARY KEY (stg_id);


--
-- Name: stg_institution_matches stg_institution_matches_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.stg_institution_matches
    ADD CONSTRAINT stg_institution_matches_pkey PRIMARY KEY (stg_id, institution_id, match_method);


--
-- Name: uk_admissions_profile uk_admissions_profile_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.uk_admissions_profile
    ADD CONSTRAINT uk_admissions_profile_pkey PRIMARY KEY (institution_id);


--
-- Name: uk_financial_support uk_financial_support_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.uk_financial_support
    ADD CONSTRAINT uk_financial_support_pkey PRIMARY KEY (institution_id);


--
-- Name: institution_deadlines uq_deadline_record; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_deadlines
    ADD CONSTRAINT uq_deadline_record UNIQUE (institution_id, cycle_year_key, applicant_type, degree_level, intake_term, deadline_type);


--
-- Name: institution_identity_map uq_identity_map_source; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_identity_map
    ADD CONSTRAINT uq_identity_map_source UNIQUE (source_table, source_pk);


--
-- Name: institution_admissions uq_institution_admissions; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_admissions
    ADD CONSTRAINT uq_institution_admissions UNIQUE (institution_id, data_year, admissions_cycle);


--
-- Name: institution_aliases uq_institution_alias; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_aliases
    ADD CONSTRAINT uq_institution_alias UNIQUE (institution_id, normalized_alias);


--
-- Name: institution_demographics uq_institution_demographics; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_demographics
    ADD CONSTRAINT uq_institution_demographics UNIQUE (institution_id, data_year_key);


--
-- Name: institution_embeddings uq_institution_embeddings; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_embeddings
    ADD CONSTRAINT uq_institution_embeddings UNIQUE (institution_id, model_name);


--
-- Name: institution_financials uq_institution_financials; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_financials
    ADD CONSTRAINT uq_institution_financials UNIQUE (institution_id, data_year_key, academic_year_key);


--
-- Name: institution_outcomes uq_institution_outcomes; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_outcomes
    ADD CONSTRAINT uq_institution_outcomes UNIQUE (institution_id, data_year_key);


--
-- Name: institution_programs uq_institution_programs; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_programs
    ADD CONSTRAINT uq_institution_programs UNIQUE (institution_id, normalized_program_name, degree_type_key);


--
-- Name: institution_rankings uq_institution_rankings; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_rankings
    ADD CONSTRAINT uq_institution_rankings UNIQUE (institution_id, ranking_year_key, ranking_body);


--
-- Name: institutions uq_institutions_country_normalized; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institutions
    ADD CONSTRAINT uq_institutions_country_normalized UNIQUE (country_code, normalized_name);


--
-- Name: institutions uq_institutions_slug; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institutions
    ADD CONSTRAINT uq_institutions_slug UNIQUE (slug);


--
-- Name: institution_requirements uq_requirement_record; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_requirements
    ADD CONSTRAINT uq_requirement_record UNIQUE (institution_id, cycle_year, degree_level, applicant_type);


--
-- Name: stg_institution_candidates uq_stg_source; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.stg_institution_candidates
    ADD CONSTRAINT uq_stg_source UNIQUE (source_table, source_pk);


--
-- Name: us_admissions_profile us_admissions_profile_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.us_admissions_profile
    ADD CONSTRAINT us_admissions_profile_pkey PRIMARY KEY (institution_id);


--
-- Name: us_financial_aid us_financial_aid_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.us_financial_aid
    ADD CONSTRAINT us_financial_aid_pkey PRIMARY KEY (institution_id);


--
-- Name: user_recommendation_events user_recommendation_events_pkey; Type: CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.user_recommendation_events
    ADD CONSTRAINT user_recommendation_events_pkey PRIMARY KEY (id);


--
-- Name: academic_details academic_details_college_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.academic_details
    ADD CONSTRAINT academic_details_college_id_key UNIQUE (college_id);


--
-- Name: academic_details academic_details_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.academic_details
    ADD CONSTRAINT academic_details_pkey PRIMARY KEY (id);


--
-- Name: academic_outcomes academic_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.academic_outcomes
    ADD CONSTRAINT academic_outcomes_pkey PRIMARY KEY (id);


--
-- Name: admission_outcomes admission_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admission_outcomes
    ADD CONSTRAINT admission_outcomes_pkey PRIMARY KEY (id);


--
-- Name: application_deadlines application_deadlines_college_id_academic_year_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.application_deadlines
    ADD CONSTRAINT application_deadlines_college_id_academic_year_key UNIQUE (college_id, academic_year);


--
-- Name: application_deadlines application_deadlines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.application_deadlines
    ADD CONSTRAINT application_deadlines_pkey PRIMARY KEY (id);


--
-- Name: application_tasks application_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.application_tasks
    ADD CONSTRAINT application_tasks_pkey PRIMARY KEY (id);


--
-- Name: applications applications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_pkey PRIMARY KEY (id);


--
-- Name: applications applications_user_id_college_id_application_type_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_user_id_college_id_application_type_key UNIQUE (user_id, college_id, application_type);


--
-- Name: campus_life campus_life_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campus_life
    ADD CONSTRAINT campus_life_pkey PRIMARY KEY (id);


--
-- Name: career_outcomes_detail career_outcomes_detail_college_id_year_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.career_outcomes_detail
    ADD CONSTRAINT career_outcomes_detail_college_id_year_key UNIQUE (college_id, year);


--
-- Name: career_outcomes_detail career_outcomes_detail_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.career_outcomes_detail
    ADD CONSTRAINT career_outcomes_detail_pkey PRIMARY KEY (id);


--
-- Name: chance_me_posts chance_me_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chance_me_posts
    ADD CONSTRAINT chance_me_posts_pkey PRIMARY KEY (id);


--
-- Name: chance_me_posts chance_me_posts_reddit_post_id_college_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chance_me_posts
    ADD CONSTRAINT chance_me_posts_reddit_post_id_college_name_key UNIQUE (reddit_post_id, college_name);


--
-- Name: chancing_audit_log chancing_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chancing_audit_log
    ADD CONSTRAINT chancing_audit_log_pkey PRIMARY KEY (id);


--
-- Name: chancing_predictions chancing_predictions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chancing_predictions
    ADD CONSTRAINT chancing_predictions_pkey PRIMARY KEY (id);


--
-- Name: college_admissions college_admissions_college_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_admissions
    ADD CONSTRAINT college_admissions_college_id_key UNIQUE (college_id);


--
-- Name: college_admissions college_admissions_college_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_admissions
    ADD CONSTRAINT college_admissions_college_unique UNIQUE (college_id);


--
-- Name: college_admissions college_admissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_admissions
    ADD CONSTRAINT college_admissions_pkey PRIMARY KEY (id);


--
-- Name: college_admissions_stats college_admissions_stats_college_id_year_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_admissions_stats
    ADD CONSTRAINT college_admissions_stats_college_id_year_key UNIQUE (college_id, year);


--
-- Name: college_admissions_stats college_admissions_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_admissions_stats
    ADD CONSTRAINT college_admissions_stats_pkey PRIMARY KEY (id);


--
-- Name: college_data_contributions college_data_contributions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_data_contributions
    ADD CONSTRAINT college_data_contributions_pkey PRIMARY KEY (id);


--
-- Name: college_deadlines college_deadlines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_deadlines
    ADD CONSTRAINT college_deadlines_pkey PRIMARY KEY (id);


--
-- Name: college_financial_aid college_financial_aid_college_id_academic_year_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_financial_aid
    ADD CONSTRAINT college_financial_aid_college_id_academic_year_key UNIQUE (college_id, academic_year);


--
-- Name: college_financial_aid college_financial_aid_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_financial_aid
    ADD CONSTRAINT college_financial_aid_pkey PRIMARY KEY (id);


--
-- Name: college_financial_data college_financial_data_college_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_financial_data
    ADD CONSTRAINT college_financial_data_college_id_key UNIQUE (college_id);


--
-- Name: college_financial_data college_financial_data_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_financial_data
    ADD CONSTRAINT college_financial_data_pkey PRIMARY KEY (id);


--
-- Name: college_insights college_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_insights
    ADD CONSTRAINT college_insights_pkey PRIMARY KEY (id);


--
-- Name: college_insights college_insights_reddit_post_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_insights
    ADD CONSTRAINT college_insights_reddit_post_id_key UNIQUE (reddit_post_id);


--
-- Name: college_majors college_majors_college_id_major_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_majors
    ADD CONSTRAINT college_majors_college_id_major_id_key UNIQUE (college_id, major_id);


--
-- Name: college_majors college_majors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_majors
    ADD CONSTRAINT college_majors_pkey PRIMARY KEY (college_id, major_id, awlevel);


--
-- Name: college_programs college_programs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_programs
    ADD CONSTRAINT college_programs_pkey PRIMARY KEY (id);


--
-- Name: college_rankings college_rankings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_rankings
    ADD CONSTRAINT college_rankings_pkey PRIMARY KEY (id);


--
-- Name: college_requirements college_requirements_college_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_requirements
    ADD CONSTRAINT college_requirements_college_id_key UNIQUE (college_id);


--
-- Name: college_requirements college_requirements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_requirements
    ADD CONSTRAINT college_requirements_pkey PRIMARY KEY (id);


--
-- Name: colleges_comprehensive colleges_comprehensive_ipeds_unit_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.colleges_comprehensive
    ADD CONSTRAINT colleges_comprehensive_ipeds_unit_id_key UNIQUE (ipeds_unit_id);


--
-- Name: colleges_comprehensive colleges_comprehensive_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.colleges_comprehensive
    ADD CONSTRAINT colleges_comprehensive_pkey PRIMARY KEY (id);


--
-- Name: colleges_comprehensive colleges_name_country_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.colleges_comprehensive
    ADD CONSTRAINT colleges_name_country_key UNIQUE (name, country);


--
-- Name: colleges colleges_new_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.colleges
    ADD CONSTRAINT colleges_new_pkey PRIMARY KEY (id);


--
-- Name: colleges_legacy colleges_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.colleges_legacy
    ADD CONSTRAINT colleges_pkey PRIMARY KEY (id);


--
-- Name: colleges_legacy colleges_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.colleges_legacy
    ADD CONSTRAINT colleges_slug_key UNIQUE (slug);


--
-- Name: colleges_comprehensive colleges_unique_name_country; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.colleges_comprehensive
    ADD CONSTRAINT colleges_unique_name_country UNIQUE (name, country);


--
-- Name: cost_of_attendance cost_of_attendance_college_id_academic_year_region_student__key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_of_attendance
    ADD CONSTRAINT cost_of_attendance_college_id_academic_year_region_student__key UNIQUE (college_id, academic_year, region, student_type);


--
-- Name: cost_of_attendance cost_of_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_of_attendance
    ADD CONSTRAINT cost_of_attendance_pkey PRIMARY KEY (id);


--
-- Name: currency_rates currency_rates_base_currency_quote_currency_rate_date_sou_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.currency_rates
    ADD CONSTRAINT currency_rates_base_currency_quote_currency_rate_date_sou_key UNIQUE (base_currency, quote_currency, rate_date, source_api);


--
-- Name: currency_rates currency_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.currency_rates
    ADD CONSTRAINT currency_rates_pkey PRIMARY KEY (id);


--
-- Name: deadline_alerts deadline_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deadline_alerts
    ADD CONSTRAINT deadline_alerts_pkey PRIMARY KEY (id);


--
-- Name: deadline_history deadline_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deadline_history
    ADD CONSTRAINT deadline_history_pkey PRIMARY KEY (id);


--
-- Name: deadlines deadlines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deadlines
    ADD CONSTRAINT deadlines_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: essays essays_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.essays
    ADD CONSTRAINT essays_pkey PRIMARY KEY (id);


--
-- Name: financing_options financing_options_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.financing_options
    ADD CONSTRAINT financing_options_pkey PRIMARY KEY (id);


--
-- Name: government_loans government_loans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.government_loans
    ADD CONSTRAINT government_loans_pkey PRIMARY KEY (id);


--
-- Name: grants grants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grants
    ADD CONSTRAINT grants_pkey PRIMARY KEY (id);


--
-- Name: login_attempts login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (email);


--
-- Name: majors majors_cip_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.majors
    ADD CONSTRAINT majors_cip_code_key UNIQUE (cip_code);


--
-- Name: majors majors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.majors
    ADD CONSTRAINT majors_pkey PRIMARY KEY (id);


--
-- Name: masters_application_documents masters_application_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.masters_application_documents
    ADD CONSTRAINT masters_application_documents_pkey PRIMARY KEY (id);


--
-- Name: masters_application_recommenders masters_application_recommend_masters_application_id_recomm_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.masters_application_recommenders
    ADD CONSTRAINT masters_application_recommend_masters_application_id_recomm_key UNIQUE (masters_application_id, recommender_id);


--
-- Name: masters_application_recommenders masters_application_recommenders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.masters_application_recommenders
    ADD CONSTRAINT masters_application_recommenders_pkey PRIMARY KEY (id);


--
-- Name: masters_applications masters_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.masters_applications
    ADD CONSTRAINT masters_applications_pkey PRIMARY KEY (id);


--
-- Name: masters_applications masters_applications_user_id_masters_program_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.masters_applications
    ADD CONSTRAINT masters_applications_user_id_masters_program_id_key UNIQUE (user_id, masters_program_id);


--
-- Name: masters_profile masters_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.masters_profile
    ADD CONSTRAINT masters_profile_pkey PRIMARY KEY (id);


--
-- Name: masters_profile masters_profile_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.masters_profile
    ADD CONSTRAINT masters_profile_user_id_key UNIQUE (user_id);


--
-- Name: migrations migrations_filename_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT migrations_filename_key UNIQUE (filename);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: ml_metadata ml_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ml_metadata
    ADD CONSTRAINT ml_metadata_pkey PRIMARY KEY (id);


--
-- Name: ml_training_data ml_training_data_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ml_training_data
    ADD CONSTRAINT ml_training_data_pkey PRIMARY KEY (id);


--
-- Name: model_training_history model_training_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.model_training_history
    ADD CONSTRAINT model_training_history_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: prediction_audit_log prediction_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prediction_audit_log
    ADD CONSTRAINT prediction_audit_log_pkey PRIMARY KEY (id);


--
-- Name: prediction_logs prediction_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prediction_logs
    ADD CONSTRAINT prediction_logs_pkey PRIMARY KEY (id);


--
-- Name: private_loans private_loans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.private_loans
    ADD CONSTRAINT private_loans_pkey PRIMARY KEY (id);


--
-- Name: recommendation_requests recommendation_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recommendation_requests
    ADD CONSTRAINT recommendation_requests_pkey PRIMARY KEY (id);


--
-- Name: recommenders recommenders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recommenders
    ADD CONSTRAINT recommenders_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: requested_colleges requested_colleges_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.requested_colleges
    ADD CONSTRAINT requested_colleges_pkey PRIMARY KEY (id);


--
-- Name: scholarships scholarships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scholarships
    ADD CONSTRAINT scholarships_pkey PRIMARY KEY (id);


--
-- Name: scraped_applicants scraped_applicants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scraped_applicants
    ADD CONSTRAINT scraped_applicants_pkey PRIMARY KEY (id);


--
-- Name: scraped_applicants scraped_applicants_reddit_post_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scraped_applicants
    ADD CONSTRAINT scraped_applicants_reddit_post_id_key UNIQUE (reddit_post_id);


--
-- Name: scraped_results scraped_results_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scraped_results
    ADD CONSTRAINT scraped_results_pkey PRIMARY KEY (id);


--
-- Name: scraper_logs scraper_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scraper_logs
    ADD CONSTRAINT scraper_logs_pkey PRIMARY KEY (id);


--
-- Name: scraper_run_logs scraper_run_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scraper_run_logs
    ADD CONSTRAINT scraper_run_logs_pkey PRIMARY KEY (id);


--
-- Name: student_activities student_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_activities
    ADD CONSTRAINT student_activities_pkey PRIMARY KEY (id);


--
-- Name: student_awards student_awards_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_awards
    ADD CONSTRAINT student_awards_pkey PRIMARY KEY (id);


--
-- Name: student_coursework student_coursework_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_coursework
    ADD CONSTRAINT student_coursework_pkey PRIMARY KEY (id);


--
-- Name: student_demographics student_demographics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_demographics
    ADD CONSTRAINT student_demographics_pkey PRIMARY KEY (id);


--
-- Name: student_profiles student_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_profiles
    ADD CONSTRAINT student_profiles_pkey PRIMARY KEY (id);


--
-- Name: student_profiles student_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_profiles
    ADD CONSTRAINT student_profiles_user_id_key UNIQUE (user_id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: timeline_actions timeline_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.timeline_actions
    ADD CONSTRAINT timeline_actions_pkey PRIMARY KEY (id);


--
-- Name: college_majors unique_college_major; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_majors
    ADD CONSTRAINT unique_college_major UNIQUE (college_id, major_id);


--
-- Name: student_demographics unique_demographics; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_demographics
    ADD CONSTRAINT unique_demographics UNIQUE (college_id);


--
-- Name: colleges_comprehensive unique_ipeds; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.colleges_comprehensive
    ADD CONSTRAINT unique_ipeds UNIQUE (ipeds_unit_id);


--
-- Name: government_loans uq_government_loans_name_provider; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.government_loans
    ADD CONSTRAINT uq_government_loans_name_provider UNIQUE (name, provider);


--
-- Name: grants uq_grants_name_provider; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grants
    ADD CONSTRAINT uq_grants_name_provider UNIQUE (name, provider);


--
-- Name: private_loans uq_private_loans_name_provider; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.private_loans
    ADD CONSTRAINT uq_private_loans_name_provider UNIQUE (name, provider);


--
-- Name: scholarships uq_scholarships_name_provider; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scholarships
    ADD CONSTRAINT uq_scholarships_name_provider UNIQUE (name, provider);


--
-- Name: user_scholarships uq_user_scholarships_user_scholarship; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_scholarships
    ADD CONSTRAINT uq_user_scholarships_user_scholarship UNIQUE (user_id, scholarship_id);


--
-- Name: user_deadlines user_deadlines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_deadlines
    ADD CONSTRAINT user_deadlines_pkey PRIMARY KEY (id);


--
-- Name: user_financial_profiles user_financial_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_financial_profiles
    ADD CONSTRAINT user_financial_profiles_pkey PRIMARY KEY (id);


--
-- Name: user_financial_profiles user_financial_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_financial_profiles
    ADD CONSTRAINT user_financial_profiles_user_id_key UNIQUE (user_id);


--
-- Name: user_ml_stats user_ml_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_ml_stats
    ADD CONSTRAINT user_ml_stats_pkey PRIMARY KEY (id);


--
-- Name: user_ml_stats user_ml_stats_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_ml_stats
    ADD CONSTRAINT user_ml_stats_user_id_key UNIQUE (user_id);


--
-- Name: user_outcome_contributions user_outcome_contributions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_outcome_contributions
    ADD CONSTRAINT user_outcome_contributions_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_key UNIQUE (user_id);


--
-- Name: user_scholarships user_scholarships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_scholarships
    ADD CONSTRAINT user_scholarships_pkey PRIMARY KEY (id);


--
-- Name: user_signals user_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_signals
    ADD CONSTRAINT user_signals_pkey PRIMARY KEY (id);


--
-- Name: user_suggestions user_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_suggestions
    ADD CONSTRAINT user_suggestions_pkey PRIMARY KEY (id);


--
-- Name: user_suggestions user_suggestions_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_suggestions
    ADD CONSTRAINT user_suggestions_user_id_key UNIQUE (user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_google_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_google_id_key UNIQUE (google_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: data_quality_snapshots_idx_captured; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX data_quality_snapshots_idx_captured ON canonical.data_quality_snapshots USING btree (captured_at DESC);


--
-- Name: idx_admissions_institution_year; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_admissions_institution_year ON canonical.institution_admissions USING btree (institution_id, data_year DESC);


--
-- Name: idx_alias_normalized_trgm; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_alias_normalized_trgm ON canonical.institution_aliases USING gin (normalized_alias public.gin_trgm_ops);


--
-- Name: idx_completeness_overall; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_completeness_overall ON canonical.institution_completeness USING btree (overall_score DESC);


--
-- Name: idx_deadlines_confidence; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_deadlines_confidence ON canonical.institution_deadlines USING btree (confidence_score);


--
-- Name: idx_deadlines_cycle; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_deadlines_cycle ON canonical.institution_deadlines USING btree (cycle_year_key);


--
-- Name: idx_deadlines_institution; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_deadlines_institution ON canonical.institution_deadlines USING btree (institution_id);


--
-- Name: idx_deadlines_payload; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_deadlines_payload ON canonical.institution_deadlines USING gin (raw_payload);


--
-- Name: idx_deadlines_term; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_deadlines_term ON canonical.institution_deadlines USING btree (intake_term);


--
-- Name: idx_deadlines_type; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_deadlines_type ON canonical.institution_deadlines USING btree (deadline_type);


--
-- Name: idx_demographics_institution_year; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_demographics_institution_year ON canonical.institution_demographics USING btree (institution_id, data_year DESC);


--
-- Name: idx_embeddings_model; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_embeddings_model ON canonical.institution_embeddings USING btree (model_name);


--
-- Name: idx_eu_admissions_profile_last_verified_at; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_eu_admissions_profile_last_verified_at ON canonical.eu_admissions_profile USING btree (last_verified_at);


--
-- Name: idx_eu_admissions_profile_verification_status; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_eu_admissions_profile_verification_status ON canonical.eu_admissions_profile USING btree (verification_status);


--
-- Name: idx_financials_institution_year; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_financials_institution_year ON canonical.institution_financials USING btree (institution_id, data_year DESC);


--
-- Name: idx_identity_map_institution; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_identity_map_institution ON canonical.institution_identity_map USING btree (institution_id);


--
-- Name: idx_identity_map_legacy; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_identity_map_legacy ON canonical.institution_identity_map USING btree (legacy_id);


--
-- Name: idx_identity_map_match_method; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_identity_map_match_method ON canonical.institution_identity_map USING btree (match_method);


--
-- Name: idx_identity_map_uuid; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_identity_map_uuid ON canonical.institution_identity_map USING btree (canonical_institution_id);


--
-- Name: idx_india_admissions_profile_last_verified_at; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_india_admissions_profile_last_verified_at ON canonical.india_admissions_profile USING btree (last_verified_at);


--
-- Name: idx_india_admissions_profile_verification_status; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_india_admissions_profile_verification_status ON canonical.india_admissions_profile USING btree (verification_status);


--
-- Name: idx_india_financial_aid_last_verified_at; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_india_financial_aid_last_verified_at ON canonical.india_financial_aid USING btree (last_verified_at);


--
-- Name: idx_india_financial_aid_verification_status; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_india_financial_aid_verification_status ON canonical.india_financial_aid USING btree (verification_status);


--
-- Name: idx_inst_country_region; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_inst_country_region ON canonical.institutions USING btree (country_code, region_code);


--
-- Name: idx_inst_external_ids_gin; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_inst_external_ids_gin ON canonical.institutions USING gin (canonical_external_ids jsonb_path_ops);


--
-- Name: idx_inst_metadata_gin; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_inst_metadata_gin ON canonical.institutions USING gin (metadata);


--
-- Name: idx_inst_name_trgm; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_inst_name_trgm ON canonical.institutions USING gin (normalized_name public.gin_trgm_ops);


--
-- Name: idx_inst_slug_btree; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_inst_slug_btree ON canonical.institutions USING btree (slug);


--
-- Name: idx_inst_updated; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_inst_updated ON canonical.institutions USING btree (updated_at DESC);


--
-- Name: idx_institution_admissions_last_verified_at; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_institution_admissions_last_verified_at ON canonical.institution_admissions USING btree (last_verified_at);


--
-- Name: idx_institution_admissions_verification_status; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_institution_admissions_verification_status ON canonical.institution_admissions USING btree (verification_status);


--
-- Name: idx_institution_campus_life_last_verified_at; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_institution_campus_life_last_verified_at ON canonical.institution_campus_life USING btree (last_verified_at);


--
-- Name: idx_institution_campus_life_verification_status; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_institution_campus_life_verification_status ON canonical.institution_campus_life USING btree (verification_status);


--
-- Name: idx_institution_demographics_last_verified_at; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_institution_demographics_last_verified_at ON canonical.institution_demographics USING btree (last_verified_at);


--
-- Name: idx_institution_demographics_verification_status; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_institution_demographics_verification_status ON canonical.institution_demographics USING btree (verification_status);


--
-- Name: idx_institution_embeddings_hnsw; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_institution_embeddings_hnsw ON canonical.institution_embeddings USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: idx_institution_financials_last_verified_at; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_institution_financials_last_verified_at ON canonical.institution_financials USING btree (last_verified_at);


--
-- Name: idx_institution_financials_verification_status; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_institution_financials_verification_status ON canonical.institution_financials USING btree (verification_status);


--
-- Name: idx_institution_outcomes_last_verified_at; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_institution_outcomes_last_verified_at ON canonical.institution_outcomes USING btree (last_verified_at);


--
-- Name: idx_institution_outcomes_verification_status; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_institution_outcomes_verification_status ON canonical.institution_outcomes USING btree (verification_status);


--
-- Name: idx_institution_placements_inst; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_institution_placements_inst ON canonical.institution_placements USING btree (institution_id);


--
-- Name: idx_institution_programs_last_verified_at; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_institution_programs_last_verified_at ON canonical.institution_programs USING btree (last_verified_at);


--
-- Name: idx_institution_programs_verification_status; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_institution_programs_verification_status ON canonical.institution_programs USING btree (verification_status);


--
-- Name: idx_institution_rankings_last_verified_at; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_institution_rankings_last_verified_at ON canonical.institution_rankings USING btree (last_verified_at);


--
-- Name: idx_institution_rankings_verification_status; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_institution_rankings_verification_status ON canonical.institution_rankings USING btree (verification_status);


--
-- Name: idx_institutions_deprecated_duplicate_of; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_institutions_deprecated_duplicate_of ON canonical.institutions USING btree (deprecated_duplicate_of);


--
-- Name: idx_masters_datapoints_program; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_masters_datapoints_program ON canonical.masters_admission_datapoints USING btree (masters_program_id);


--
-- Name: idx_masters_datapoints_source; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_masters_datapoints_source ON canonical.masters_admission_datapoints USING btree (source);


--
-- Name: idx_masters_deadlines_program; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_masters_deadlines_program ON canonical.masters_program_deadlines USING btree (masters_program_id);


--
-- Name: idx_masters_pathways_program; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_masters_pathways_program ON canonical.masters_program_pathways USING btree (masters_program_id);


--
-- Name: idx_masters_pathways_type; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_masters_pathways_type ON canonical.masters_program_pathways USING btree (pathway_type);


--
-- Name: idx_masters_programs_cip; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_masters_programs_cip ON canonical.masters_programs USING btree (cip_code);


--
-- Name: idx_masters_programs_country; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_masters_programs_country ON canonical.masters_programs USING btree (institution_country);


--
-- Name: idx_masters_programs_degree; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_masters_programs_degree ON canonical.masters_programs USING btree (degree_type);


--
-- Name: idx_masters_programs_denorm_dedup; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE UNIQUE INDEX idx_masters_programs_denorm_dedup ON canonical.masters_programs USING btree (institution_name, program_name, degree_type) WHERE (canonical_institution_id IS NULL);


--
-- Name: idx_masters_programs_inst; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_masters_programs_inst ON canonical.masters_programs USING btree (canonical_institution_id);


--
-- Name: idx_masters_scrape_log_status; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_masters_scrape_log_status ON canonical.masters_scrape_log USING btree (status);


--
-- Name: idx_masters_scrape_log_time; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_masters_scrape_log_time ON canonical.masters_scrape_log USING btree (scraped_at DESC);


--
-- Name: idx_masters_scrape_log_url; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_masters_scrape_log_url ON canonical.masters_scrape_log USING btree (program_url);


--
-- Name: idx_mv_masters_cards_country; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_mv_masters_cards_country ON canonical.mv_masters_program_cards USING btree (institution_country);


--
-- Name: idx_mv_masters_cards_degree; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_mv_masters_cards_degree ON canonical.mv_masters_program_cards USING btree (degree_type);


--
-- Name: idx_mv_masters_cards_id; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE UNIQUE INDEX idx_mv_masters_cards_id ON canonical.mv_masters_program_cards USING btree (id);


--
-- Name: idx_outcomes_institution_year; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_outcomes_institution_year ON canonical.institution_outcomes USING btree (institution_id, data_year DESC);


--
-- Name: idx_programs_institution; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_programs_institution ON canonical.institution_programs USING btree (institution_id);


--
-- Name: idx_programs_name_trgm; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_programs_name_trgm ON canonical.institution_programs USING gin (normalized_program_name public.gin_trgm_ops);


--
-- Name: idx_quality_final; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_quality_final ON canonical.institution_quality_scores USING btree (final_quality_score DESC);


--
-- Name: idx_rankings_institution_year; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_rankings_institution_year ON canonical.institution_rankings USING btree (institution_id, ranking_year DESC);


--
-- Name: idx_requirements_act_policy; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_requirements_act_policy ON canonical.institution_requirements USING btree (act_policy);


--
-- Name: idx_requirements_common_app; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_requirements_common_app ON canonical.institution_requirements USING btree (common_app_supported);


--
-- Name: idx_requirements_confidence; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_requirements_confidence ON canonical.institution_requirements USING btree (confidence_score);


--
-- Name: idx_requirements_institution; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_requirements_institution ON canonical.institution_requirements USING btree (institution_id);


--
-- Name: idx_requirements_payload; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_requirements_payload ON canonical.institution_requirements USING gin (raw_payload);


--
-- Name: idx_requirements_sat_policy; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_requirements_sat_policy ON canonical.institution_requirements USING btree (sat_policy);


--
-- Name: idx_requirements_test_blind; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_requirements_test_blind ON canonical.institution_requirements USING btree (test_blind);


--
-- Name: idx_requirements_ucas; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_requirements_ucas ON canonical.institution_requirements USING btree (ucas_supported);


--
-- Name: idx_search_index_autocomplete_trgm; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_search_index_autocomplete_trgm ON canonical.institution_search_index USING gin (autocomplete_text public.gin_trgm_ops);


--
-- Name: idx_search_index_doc; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_search_index_doc ON canonical.institution_search_index USING gin (search_document);


--
-- Name: idx_search_index_tokens_gin; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_search_index_tokens_gin ON canonical.institution_search_index USING gin (search_tokens);


--
-- Name: idx_source_registry_category; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_source_registry_category ON canonical.institution_source_registry USING btree (source_category);


--
-- Name: idx_source_registry_institution; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_source_registry_institution ON canonical.institution_source_registry USING btree (institution_id);


--
-- Name: idx_stg_candidates_domain; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_stg_candidates_domain ON canonical.stg_institution_candidates USING btree (website_domain);


--
-- Name: idx_stg_candidates_ext_ids; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_stg_candidates_ext_ids ON canonical.stg_institution_candidates USING gin (external_ids jsonb_path_ops);


--
-- Name: idx_stg_candidates_name; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_stg_candidates_name ON canonical.stg_institution_candidates USING btree (normalized_name);


--
-- Name: idx_uk_admissions_profile_last_verified_at; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_uk_admissions_profile_last_verified_at ON canonical.uk_admissions_profile USING btree (last_verified_at);


--
-- Name: idx_uk_admissions_profile_verification_status; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_uk_admissions_profile_verification_status ON canonical.uk_admissions_profile USING btree (verification_status);


--
-- Name: idx_uk_financial_support_last_verified_at; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_uk_financial_support_last_verified_at ON canonical.uk_financial_support USING btree (last_verified_at);


--
-- Name: idx_uk_financial_support_verification_status; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_uk_financial_support_verification_status ON canonical.uk_financial_support USING btree (verification_status);


--
-- Name: idx_us_admissions_profile_last_verified_at; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_us_admissions_profile_last_verified_at ON canonical.us_admissions_profile USING btree (last_verified_at);


--
-- Name: idx_us_admissions_profile_verification_status; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_us_admissions_profile_verification_status ON canonical.us_admissions_profile USING btree (verification_status);


--
-- Name: idx_us_financial_aid_last_verified_at; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_us_financial_aid_last_verified_at ON canonical.us_financial_aid USING btree (last_verified_at);


--
-- Name: idx_us_financial_aid_verification_status; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX idx_us_financial_aid_verification_status ON canonical.us_financial_aid USING btree (verification_status);


--
-- Name: institution_aliases_uq_inst_norm; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE UNIQUE INDEX institution_aliases_uq_inst_norm ON canonical.institution_aliases USING btree (institution_id, normalized_alias);


--
-- Name: institution_campus_life_uq_inst; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE UNIQUE INDEX institution_campus_life_uq_inst ON canonical.institution_campus_life USING btree (institution_id);


--
-- Name: institution_demographics_uq_inst_year; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE UNIQUE INDEX institution_demographics_uq_inst_year ON canonical.institution_demographics USING btree (institution_id, data_year_key);


--
-- Name: institution_programs_uq_inst_norm_degree; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE UNIQUE INDEX institution_programs_uq_inst_norm_degree ON canonical.institution_programs USING btree (institution_id, normalized_program_name, degree_type_key);


--
-- Name: institution_rankings_idx_global_rank; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX institution_rankings_idx_global_rank ON canonical.institution_rankings USING btree (global_rank);


--
-- Name: institution_rankings_idx_subject_rank; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX institution_rankings_idx_subject_rank ON canonical.institution_rankings USING btree (subject_rank);


--
-- Name: institution_rankings_uq_institution_body_year; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE UNIQUE INDEX institution_rankings_uq_institution_body_year ON canonical.institution_rankings USING btree (institution_id, ranking_body, ranking_year);


--
-- Name: institutions_idx_popularity_score; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX institutions_idx_popularity_score ON canonical.institutions USING btree (popularity_score DESC NULLS LAST);


--
-- Name: major_ontology_alias_idx; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX major_ontology_alias_idx ON canonical.major_ontology USING btree (lower(alias));


--
-- Name: major_ontology_canonical_idx; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX major_ontology_canonical_idx ON canonical.major_ontology USING btree (lower(canonical_major));


--
-- Name: major_ontology_uq_canonical_alias; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE UNIQUE INDEX major_ontology_uq_canonical_alias ON canonical.major_ontology USING btree (canonical_major, alias);


--
-- Name: mv_college_cards_idx_country_rank; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX mv_college_cards_idx_country_rank ON canonical.mv_college_cards USING btree (country_code, global_rank, popularity_score DESC NULLS LAST);


--
-- Name: mv_college_cards_idx_id; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE UNIQUE INDEX mv_college_cards_idx_id ON canonical.mv_college_cards USING btree (id);


--
-- Name: mv_college_cards_idx_popularity; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX mv_college_cards_idx_popularity ON canonical.mv_college_cards USING btree (popularity_score DESC NULLS LAST, global_rank);


--
-- Name: recommendation_feedback_user_idx; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX recommendation_feedback_user_idx ON canonical.recommendation_feedback USING btree (user_id, updated_at DESC);


--
-- Name: recommendation_sessions_user_idx; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX recommendation_sessions_user_idx ON canonical.recommendation_sessions USING btree (user_id, session_started_at DESC);


--
-- Name: user_recommendation_events_institution_idx; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX user_recommendation_events_institution_idx ON canonical.user_recommendation_events USING btree (institution_id, created_at DESC);


--
-- Name: user_recommendation_events_type_idx; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX user_recommendation_events_type_idx ON canonical.user_recommendation_events USING btree (event_type, created_at DESC);


--
-- Name: user_recommendation_events_user_idx; Type: INDEX; Schema: canonical; Owner: postgres
--

CREATE INDEX user_recommendation_events_user_idx ON canonical.user_recommendation_events USING btree (user_id, created_at DESC);


--
-- Name: colleges_comprehensive_ipeds_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX colleges_comprehensive_ipeds_uq ON public.colleges_comprehensive USING btree (ipeds_unit_id) WHERE (ipeds_unit_id IS NOT NULL);


--
-- Name: colleges_comprehensive_name_country_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX colleges_comprehensive_name_country_uq ON public.colleges_comprehensive USING btree (name, country) WHERE (country IS NOT NULL);


--
-- Name: idx_academic_details_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_academic_details_college ON public.academic_details USING btree (college_id);


--
-- Name: idx_admission_outcomes_admitted; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admission_outcomes_admitted ON public.admission_outcomes USING btree (admitted);


--
-- Name: idx_admission_outcomes_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admission_outcomes_college ON public.admission_outcomes USING btree (college_name);


--
-- Name: idx_admission_outcomes_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admission_outcomes_year ON public.admission_outcomes USING btree (year);


--
-- Name: idx_admissions_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admissions_college ON public.college_admissions USING btree (college_id);


--
-- Name: idx_admissions_college_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admissions_college_id ON public.college_admissions USING btree (college_id, id DESC);


--
-- Name: idx_admissions_rate; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admissions_rate ON public.college_admissions USING btree (acceptance_rate);


--
-- Name: idx_app_tasks_app; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_app_tasks_app ON public.application_tasks USING btree (application_id);


--
-- Name: idx_applications_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_applications_college ON public.applications USING btree (college_id);


--
-- Name: idx_applications_college_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_applications_college_id ON public.applications USING btree (college_id);


--
-- Name: idx_applications_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_applications_status ON public.applications USING btree (status);


--
-- Name: idx_applications_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_applications_user ON public.applications USING btree (user_id);


--
-- Name: idx_campus_life_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_campus_life_college ON public.campus_life USING btree (college_id);


--
-- Name: idx_career_outcomes_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_career_outcomes_college ON public.career_outcomes_detail USING btree (college_id);


--
-- Name: idx_career_outcomes_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_career_outcomes_year ON public.career_outcomes_detail USING btree (year);


--
-- Name: idx_cas_college_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cas_college_year ON public.college_admissions_stats USING btree (college_id, year);


--
-- Name: idx_cas_freshness; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cas_freshness ON public.college_admissions_stats USING btree (data_freshness);


--
-- Name: idx_cc_feature_vector; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cc_feature_vector ON public.colleges_comprehensive USING gin (feature_vector) WHERE (feature_vector IS NOT NULL);


--
-- Name: idx_cc_ipeds_unit_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cc_ipeds_unit_id ON public.colleges_comprehensive USING btree (ipeds_unit_id) WHERE (ipeds_unit_id IS NOT NULL);


--
-- Name: idx_cfa_college_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cfa_college_year ON public.college_financial_aid USING btree (college_id, academic_year);


--
-- Name: idx_chancing_audit_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chancing_audit_created ON public.chancing_audit_log USING btree (created_at DESC);


--
-- Name: idx_chancing_audit_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chancing_audit_user ON public.chancing_audit_log USING btree (user_id);


--
-- Name: idx_chancing_predictions_calculated_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chancing_predictions_calculated_at ON public.chancing_predictions USING btree (calculated_at DESC);


--
-- Name: idx_chancing_predictions_college_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chancing_predictions_college_id ON public.chancing_predictions USING btree (college_id);


--
-- Name: idx_chancing_predictions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chancing_predictions_user_id ON public.chancing_predictions USING btree (user_id);


--
-- Name: idx_cmp_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cmp_college ON public.chance_me_posts USING btree (college_name);


--
-- Name: idx_cmp_gpa_sat; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cmp_gpa_sat ON public.chance_me_posts USING btree (gpa, sat_score);


--
-- Name: idx_cmp_outcome; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cmp_outcome ON public.chance_me_posts USING btree (outcome);


--
-- Name: idx_cmp_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cmp_source ON public.chance_me_posts USING btree (source);


--
-- Name: idx_coa_college_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_coa_college_year ON public.cost_of_attendance USING btree (college_id, academic_year DESC);


--
-- Name: idx_coa_student_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_coa_student_type ON public.cost_of_attendance USING btree (student_type);


--
-- Name: idx_college_admissions_college_id_desc; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_college_admissions_college_id_desc ON public.college_admissions USING btree (college_id DESC);


--
-- Name: idx_college_deadlines_college_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_college_deadlines_college_id ON public.college_deadlines USING btree (college_id);


--
-- Name: idx_college_financial_data_college_id_desc; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_college_financial_data_college_id_desc ON public.college_financial_data USING btree (college_id DESC);


--
-- Name: idx_college_majors_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_college_majors_college ON public.college_majors USING btree (college_id);


--
-- Name: idx_college_majors_major; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_college_majors_major ON public.college_majors USING btree (major_id);


--
-- Name: idx_college_programs_program_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_college_programs_program_name ON public.college_programs USING btree (program_name);


--
-- Name: idx_college_req_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_college_req_college ON public.college_requirements USING btree (college_id);


--
-- Name: idx_college_req_test_policy; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_college_req_test_policy ON public.college_requirements USING btree (test_policy);


--
-- Name: idx_college_req_verified; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_college_req_verified ON public.college_requirements USING btree (last_verified);


--
-- Name: idx_colleges_acceptance_rate; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_acceptance_rate ON public.colleges_legacy USING btree (acceptance_rate);


--
-- Name: idx_colleges_canonical_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_canonical_id ON public.colleges_legacy USING btree (canonical_institution_id);


--
-- Name: idx_colleges_city_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_city_trgm ON public.colleges_legacy USING gin (city public.gin_trgm_ops);


--
-- Name: idx_colleges_comp_country; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_comp_country ON public.colleges_comprehensive USING btree (country);


--
-- Name: idx_colleges_comp_ipeds; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_comp_ipeds ON public.colleges_comprehensive USING btree (ipeds_unit_id);


--
-- Name: idx_colleges_comp_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_comp_name ON public.colleges_comprehensive USING btree (name);


--
-- Name: idx_colleges_comp_popularity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_comp_popularity ON public.colleges_comprehensive USING btree (popularity_score DESC);


--
-- Name: idx_colleges_comp_search; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_comp_search ON public.colleges_comprehensive USING gin (search_vector);


--
-- Name: idx_colleges_comp_setting; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_comp_setting ON public.colleges_comprehensive USING btree (setting);


--
-- Name: idx_colleges_comp_state; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_comp_state ON public.colleges_comprehensive USING btree (state_region);


--
-- Name: idx_colleges_comp_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_comp_type ON public.colleges_comprehensive USING btree (institution_type);


--
-- Name: idx_colleges_comp_yield_rate; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_comp_yield_rate ON public.colleges_comprehensive USING btree (yield_rate);


--
-- Name: idx_colleges_comprehensive_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_comprehensive_id ON public.colleges_legacy USING btree (comprehensive_id) WHERE (comprehensive_id IS NOT NULL);


--
-- Name: idx_colleges_country; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_country ON public.colleges_comprehensive USING btree (country);


--
-- Name: idx_colleges_country_notnull; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_country_notnull ON public.colleges_legacy USING btree (country) WHERE (country IS NOT NULL);


--
-- Name: idx_colleges_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_name ON public.colleges_legacy USING btree (name);


--
-- Name: idx_colleges_name_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_name_gin ON public.colleges_legacy USING gin (to_tsvector('english'::regconfig, (COALESCE(name, ''::character varying))::text));


--
-- Name: idx_colleges_name_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_name_trgm ON public.colleges_comprehensive USING gin (name public.gin_trgm_ops);


--
-- Name: idx_colleges_qs_rank; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_qs_rank ON public.colleges USING btree (qs_rank);


--
-- Name: idx_colleges_ranking_qs; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_ranking_qs ON public.colleges_legacy USING btree (ranking_qs);


--
-- Name: idx_colleges_ranking_us_news; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_ranking_us_news ON public.colleges_legacy USING btree (ranking_us_news);


--
-- Name: idx_colleges_search_vector; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_search_vector ON public.colleges_legacy USING gin (search_vector);


--
-- Name: idx_colleges_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_slug ON public.colleges USING btree (slug);


--
-- Name: idx_colleges_state; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_state ON public.colleges_legacy USING btree (state);


--
-- Name: idx_colleges_tuition_international; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_tuition_international ON public.colleges_legacy USING btree (tuition_international);


--
-- Name: idx_colleges_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_type ON public.colleges_legacy USING btree (type);


--
-- Name: idx_colleges_website; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_colleges_website ON public.colleges USING btree (normalized_website);


--
-- Name: idx_contributions_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contributions_college ON public.user_outcome_contributions USING btree (college_id);


--
-- Name: idx_contributions_college_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contributions_college_id ON public.college_data_contributions USING btree (college_id);


--
-- Name: idx_contributions_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contributions_status ON public.college_data_contributions USING btree (status);


--
-- Name: idx_contributions_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contributions_type ON public.college_data_contributions USING btree (data_type);


--
-- Name: idx_contributions_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contributions_user ON public.user_outcome_contributions USING btree (user_id);


--
-- Name: idx_currency_rates_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_currency_rates_date ON public.currency_rates USING btree (rate_date DESC);


--
-- Name: idx_currency_rates_pair_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_currency_rates_pair_date ON public.currency_rates USING btree (base_currency, quote_currency, rate_date DESC);


--
-- Name: idx_deadline_alerts_unread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deadline_alerts_unread ON public.deadline_alerts USING btree (user_id, is_read);


--
-- Name: idx_deadline_alerts_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deadline_alerts_user ON public.deadline_alerts USING btree (user_id);


--
-- Name: idx_deadline_history_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deadline_history_college ON public.deadline_history USING btree (college_id);


--
-- Name: idx_deadline_history_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deadline_history_year ON public.deadline_history USING btree (data_year);


--
-- Name: idx_deadlines_application; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deadlines_application ON public.deadlines USING btree (application_id);


--
-- Name: idx_deadlines_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deadlines_college ON public.application_deadlines USING btree (college_id);


--
-- Name: idx_deadlines_completed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deadlines_completed ON public.deadlines USING btree (is_completed);


--
-- Name: idx_deadlines_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deadlines_date ON public.deadlines USING btree (deadline_date);


--
-- Name: idx_deadlines_deadline_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deadlines_deadline_date ON public.deadlines USING btree (deadline_date);


--
-- Name: idx_deadlines_ea; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deadlines_ea ON public.application_deadlines USING btree (early_action_deadline);


--
-- Name: idx_deadlines_ed1; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deadlines_ed1 ON public.application_deadlines USING btree (early_decision_1_deadline);


--
-- Name: idx_deadlines_rd; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deadlines_rd ON public.application_deadlines USING btree (regular_decision_deadline);


--
-- Name: idx_deadlines_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deadlines_user_id ON public.deadlines USING btree (user_id);


--
-- Name: idx_deadlines_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deadlines_year ON public.application_deadlines USING btree (academic_year);


--
-- Name: idx_demographics_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_demographics_college ON public.student_demographics USING btree (college_id);


--
-- Name: idx_documents_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_documents_status ON public.documents USING btree (status);


--
-- Name: idx_documents_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_documents_user ON public.documents USING btree (user_id);


--
-- Name: idx_documents_user_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_documents_user_category ON public.documents USING btree (user_id, category);


--
-- Name: idx_essays_application; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_essays_application ON public.essays USING btree (application_id);


--
-- Name: idx_essays_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_essays_status ON public.essays USING btree (status);


--
-- Name: idx_essays_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_essays_user_id ON public.essays USING btree (user_id);


--
-- Name: idx_financial_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_financial_college ON public.college_financial_data USING btree (college_id);


--
-- Name: idx_financial_college_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_financial_college_id ON public.college_financial_data USING btree (college_id, id DESC);


--
-- Name: idx_financing_country; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_financing_country ON public.financing_options USING btree (country_of_study, home_country);


--
-- Name: idx_financing_eligibility; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_financing_eligibility ON public.financing_options USING gin (eligibility_criteria);


--
-- Name: idx_financing_scraped; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_financing_scraped ON public.financing_options USING btree (scraped_at DESC);


--
-- Name: idx_financing_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_financing_type ON public.financing_options USING btree (financing_type);


--
-- Name: idx_financing_validated; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_financing_validated ON public.financing_options USING btree (is_validated);


--
-- Name: idx_government_loans_country_of_study; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_government_loans_country_of_study ON public.government_loans USING gin (country_of_study);


--
-- Name: idx_grants_eligible_nationalities; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_grants_eligible_nationalities ON public.grants USING gin (eligible_nationalities);


--
-- Name: idx_insights_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_insights_college ON public.college_insights USING btree (college_id);


--
-- Name: idx_insights_fts; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_insights_fts ON public.college_insights USING gin (to_tsvector('english'::regconfig, content_snippet));


--
-- Name: idx_insights_post_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_insights_post_id ON public.college_insights USING btree (reddit_post_id);


--
-- Name: idx_insights_scraped; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_insights_scraped ON public.college_insights USING btree (scraped_at DESC);


--
-- Name: idx_insights_sentiment; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_insights_sentiment ON public.college_insights USING btree (sentiment);


--
-- Name: idx_insights_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_insights_type ON public.college_insights USING btree (insight_type);


--
-- Name: idx_login_attempts_locked_until; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_login_attempts_locked_until ON public.login_attempts USING btree (locked_until);


--
-- Name: idx_majors_broad_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_majors_broad_category ON public.majors USING btree (broad_category);


--
-- Name: idx_majors_name_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_majors_name_trgm ON public.majors USING gin (name public.gin_trgm_ops);


--
-- Name: idx_masters_app_docs_app; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_masters_app_docs_app ON public.masters_application_documents USING btree (masters_application_id);


--
-- Name: idx_masters_app_recs_app; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_masters_app_recs_app ON public.masters_application_recommenders USING btree (masters_application_id);


--
-- Name: idx_masters_app_recs_recommender; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_masters_app_recs_recommender ON public.masters_application_recommenders USING btree (recommender_id);


--
-- Name: idx_masters_applications_program; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_masters_applications_program ON public.masters_applications USING btree (masters_program_id);


--
-- Name: idx_masters_applications_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_masters_applications_user ON public.masters_applications USING btree (user_id);


--
-- Name: idx_masters_profile_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_masters_profile_user ON public.masters_profile USING btree (user_id);


--
-- Name: idx_ml_metadata_trained; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ml_metadata_trained ON public.ml_metadata USING btree (last_trained DESC);


--
-- Name: idx_ml_stats_points; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ml_stats_points ON public.user_ml_stats USING btree (total_points);


--
-- Name: idx_ml_stats_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ml_stats_user ON public.user_ml_stats USING btree (user_id);


--
-- Name: idx_ml_training_confidence; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ml_training_confidence ON public.ml_training_data USING btree (confidence_score);


--
-- Name: idx_ml_training_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ml_training_source ON public.ml_training_data USING btree (source);


--
-- Name: idx_ml_training_verified; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ml_training_verified ON public.ml_training_data USING btree (is_verified);


--
-- Name: idx_notifications_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_created ON public.notifications USING btree (created_at);


--
-- Name: idx_notifications_unread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_unread ON public.notifications USING btree (user_id) WHERE (is_read = false);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id) WHERE (is_read IS FALSE);


--
-- Name: idx_outcomes_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_outcomes_college ON public.academic_outcomes USING btree (college_id);


--
-- Name: idx_prediction_audit_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_prediction_audit_college ON public.prediction_audit_log USING btree (college_id);


--
-- Name: idx_prediction_audit_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_prediction_audit_date ON public.prediction_audit_log USING btree (predicted_at);


--
-- Name: idx_prediction_audit_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_prediction_audit_user ON public.prediction_audit_log USING btree (user_id);


--
-- Name: idx_prediction_logs_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_prediction_logs_user ON public.prediction_logs USING btree (user_id);


--
-- Name: idx_prediction_logs_user_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_prediction_logs_user_college ON public.prediction_logs USING btree (user_id, college_id) WHERE (college_id IS NOT NULL);


--
-- Name: idx_private_loans_eligible_nationalities; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_private_loans_eligible_nationalities ON public.private_loans USING gin (eligible_nationalities);


--
-- Name: idx_programs_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_programs_college ON public.college_programs USING btree (college_id);


--
-- Name: idx_programs_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_programs_name ON public.college_programs USING btree (program_name);


--
-- Name: idx_rankings_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_rankings_college ON public.college_rankings USING btree (college_id);


--
-- Name: idx_rec_requests_recommender; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_rec_requests_recommender ON public.recommendation_requests USING btree (recommender_id);


--
-- Name: idx_rec_requests_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_rec_requests_user ON public.recommendation_requests USING btree (user_id);


--
-- Name: idx_recommenders_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_recommenders_user ON public.recommenders USING btree (user_id);


--
-- Name: idx_refresh_tokens_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_refresh_tokens_expires ON public.refresh_tokens USING btree (expires_at);


--
-- Name: idx_refresh_tokens_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_refresh_tokens_token ON public.refresh_tokens USING btree (token);


--
-- Name: idx_refresh_tokens_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_refresh_tokens_user ON public.refresh_tokens USING btree (user_id);


--
-- Name: idx_refresh_tokens_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_refresh_tokens_user_id ON public.refresh_tokens USING btree (user_id);


--
-- Name: idx_refresh_tokens_user_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_refresh_tokens_user_token ON public.refresh_tokens USING btree (user_id, token);


--
-- Name: idx_requested_colleges_country; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_requested_colleges_country ON public.requested_colleges USING btree (country);


--
-- Name: idx_requested_colleges_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_requested_colleges_name ON public.requested_colleges USING btree (name);


--
-- Name: idx_requested_colleges_request_count; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_requested_colleges_request_count ON public.requested_colleges USING btree (request_count DESC);


--
-- Name: idx_requested_colleges_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_requested_colleges_status ON public.requested_colleges USING btree (status);


--
-- Name: idx_scholarships_country; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scholarships_country ON public.scholarships USING btree (country);


--
-- Name: idx_scholarships_deadline; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scholarships_deadline ON public.scholarships USING btree (deadline);


--
-- Name: idx_scholarships_degree_levels; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scholarships_degree_levels ON public.scholarships USING gin (degree_levels);


--
-- Name: idx_scholarships_eligible_majors; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scholarships_eligible_majors ON public.scholarships USING gin (eligible_majors);


--
-- Name: idx_scholarships_eligible_nationalities; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scholarships_eligible_nationalities ON public.scholarships USING gin (eligible_nationalities);


--
-- Name: idx_scholarships_nationality; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scholarships_nationality ON public.scholarships USING gin (nationality_requirements);


--
-- Name: idx_scholarships_scholarship_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scholarships_scholarship_type ON public.scholarships USING btree (scholarship_type);


--
-- Name: idx_scholarships_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scholarships_status ON public.scholarships USING btree (status);


--
-- Name: idx_scraped_applicants_act; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scraped_applicants_act ON public.scraped_applicants USING btree (act_score);


--
-- Name: idx_scraped_applicants_gpa; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scraped_applicants_gpa ON public.scraped_applicants USING btree (gpa);


--
-- Name: idx_scraped_applicants_post_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scraped_applicants_post_id ON public.scraped_applicants USING btree (reddit_post_id);


--
-- Name: idx_scraped_applicants_sat; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scraped_applicants_sat ON public.scraped_applicants USING btree (sat_score);


--
-- Name: idx_scraped_results_applicant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scraped_results_applicant ON public.scraped_results USING btree (applicant_id);


--
-- Name: idx_scraped_results_outcome; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scraped_results_outcome ON public.scraped_results USING btree (outcome);


--
-- Name: idx_scraped_results_school; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scraped_results_school ON public.scraped_results USING btree (school_name_normalized);


--
-- Name: idx_scraper_logs_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scraper_logs_name ON public.scraper_logs USING btree (scraper_name);


--
-- Name: idx_scraper_logs_started; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scraper_logs_started ON public.scraper_logs USING btree (started_at DESC);


--
-- Name: idx_scraper_logs_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scraper_logs_status ON public.scraper_logs USING btree (status);


--
-- Name: idx_srl_job_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_srl_job_name ON public.scraper_run_logs USING btree (job_name);


--
-- Name: idx_srl_started_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_srl_started_at ON public.scraper_run_logs USING btree (started_at DESC);


--
-- Name: idx_srl_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_srl_status ON public.scraper_run_logs USING btree (status);


--
-- Name: idx_student_activities_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_activities_student ON public.student_activities USING btree (student_id);


--
-- Name: idx_student_activities_tier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_activities_tier ON public.student_activities USING btree (tier_rating);


--
-- Name: idx_student_awards_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_awards_student ON public.student_awards USING btree (student_id);


--
-- Name: idx_student_coursework_level; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_coursework_level ON public.student_coursework USING btree (course_level);


--
-- Name: idx_student_coursework_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_coursework_student ON public.student_coursework USING btree (student_id);


--
-- Name: idx_student_profiles_country; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_profiles_country ON public.student_profiles USING btree (country);


--
-- Name: idx_student_profiles_curriculum; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_profiles_curriculum ON public.student_profiles USING btree (curriculum_type);


--
-- Name: idx_student_profiles_curriculum_other; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_profiles_curriculum_other ON public.student_profiles USING btree (curriculum_type_other);


--
-- Name: idx_student_profiles_graduation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_profiles_graduation ON public.student_profiles USING btree (graduation_year);


--
-- Name: idx_student_profiles_profile_version; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_profiles_profile_version ON public.student_profiles USING btree (user_id, profile_version);


--
-- Name: idx_student_profiles_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_profiles_user ON public.student_profiles USING btree (user_id);


--
-- Name: idx_student_profiles_values_vector; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_profiles_values_vector ON public.student_profiles USING gin (values_vector);


--
-- Name: idx_tasks_application_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_application_id ON public.tasks USING btree (application_id);


--
-- Name: idx_tasks_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_college ON public.tasks USING btree (college_id);


--
-- Name: idx_tasks_deadline; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_deadline ON public.tasks USING btree (deadline);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);


--
-- Name: idx_tasks_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_type ON public.tasks USING btree (task_type);


--
-- Name: idx_tasks_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_user ON public.tasks USING btree (user_id);


--
-- Name: idx_timeline_actions_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_timeline_actions_user ON public.timeline_actions USING btree (user_id, target_year, target_month);


--
-- Name: idx_timeline_user_month; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_timeline_user_month ON public.timeline_actions USING btree (target_month, target_year);


--
-- Name: idx_training_history_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_training_history_college ON public.model_training_history USING btree (college_id);


--
-- Name: idx_training_history_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_training_history_date ON public.model_training_history USING btree (trained_at);


--
-- Name: idx_user_deadlines_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_deadlines_date ON public.user_deadlines USING btree (deadline_date);


--
-- Name: idx_user_deadlines_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_deadlines_user ON public.user_deadlines USING btree (user_id);


--
-- Name: idx_user_financial_profiles_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_financial_profiles_user ON public.user_financial_profiles USING btree (user_id);


--
-- Name: idx_user_outcome_contributions_college_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_outcome_contributions_college_id ON public.user_outcome_contributions USING btree (college_id);


--
-- Name: idx_user_profiles_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_profiles_user_id ON public.user_profiles USING btree (user_id);


--
-- Name: idx_user_scholarships_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_scholarships_user ON public.user_scholarships USING btree (user_id);


--
-- Name: idx_user_signals_college; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_signals_college ON public.user_signals USING btree (college_id);


--
-- Name: idx_user_signals_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_signals_user_id ON public.user_signals USING btree (user_id, created_at DESC);


--
-- Name: idx_user_suggestions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_suggestions_user_id ON public.user_suggestions USING btree (user_id);


--
-- Name: idx_users_google_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_google_id ON public.users USING btree (google_id);


--
-- Name: idx_users_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_phone ON public.users USING btree (phone);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: uq_college_deadlines_college_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_college_deadlines_college_type ON public.college_deadlines USING btree (college_id, deadline_type);


--
-- Name: uq_deadline_history_college_type_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_deadline_history_college_type_year ON public.deadline_history USING btree (college_id, deadline_type, data_year);


--
-- Name: institution_deadlines trg_deadlines_updated_at; Type: TRIGGER; Schema: canonical; Owner: postgres
--

CREATE TRIGGER trg_deadlines_updated_at BEFORE UPDATE ON canonical.institution_deadlines FOR EACH ROW EXECUTE FUNCTION canonical.update_updated_at_column();


--
-- Name: institution_requirements trg_requirements_updated_at; Type: TRIGGER; Schema: canonical; Owner: postgres
--

CREATE TRIGGER trg_requirements_updated_at BEFORE UPDATE ON canonical.institution_requirements FOR EACH ROW EXECUTE FUNCTION canonical.update_updated_at_column();


--
-- Name: institution_source_registry trg_source_registry_updated_at; Type: TRIGGER; Schema: canonical; Owner: postgres
--

CREATE TRIGGER trg_source_registry_updated_at BEFORE UPDATE ON canonical.institution_source_registry FOR EACH ROW EXECUTE FUNCTION canonical.update_updated_at_column();


--
-- Name: colleges_comprehensive colleges_search_vector_update_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER colleges_search_vector_update_trigger BEFORE INSERT OR UPDATE ON public.colleges_comprehensive FOR EACH ROW EXECUTE FUNCTION public.colleges_search_vector_update();


--
-- Name: cost_of_attendance trg_coa_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_coa_updated_at BEFORE UPDATE ON public.cost_of_attendance FOR EACH ROW EXECUTE FUNCTION public.coa_set_updated_at();


--
-- Name: financing_options trg_financing_options_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_financing_options_updated_at BEFORE UPDATE ON public.financing_options FOR EACH ROW EXECUTE FUNCTION public.financing_options_set_updated_at();


--
-- Name: user_profiles trg_user_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.update_user_profiles_updated_at();


--
-- Name: deadline_history deadline_history_institution_deadline_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.deadline_history
    ADD CONSTRAINT deadline_history_institution_deadline_id_fkey FOREIGN KEY (institution_deadline_id) REFERENCES canonical.institution_deadlines(id) ON DELETE CASCADE;


--
-- Name: eu_admissions_profile eu_admissions_profile_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.eu_admissions_profile
    ADD CONSTRAINT eu_admissions_profile_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: experiment_assignments experiment_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.experiment_assignments
    ADD CONSTRAINT experiment_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: india_admissions_profile india_admissions_profile_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.india_admissions_profile
    ADD CONSTRAINT india_admissions_profile_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: india_financial_aid india_financial_aid_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.india_financial_aid
    ADD CONSTRAINT india_financial_aid_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_admissions institution_admissions_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_admissions
    ADD CONSTRAINT institution_admissions_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_aliases institution_aliases_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_aliases
    ADD CONSTRAINT institution_aliases_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_campus_life institution_campus_life_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_campus_life
    ADD CONSTRAINT institution_campus_life_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_completeness institution_completeness_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_completeness
    ADD CONSTRAINT institution_completeness_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_deadlines institution_deadlines_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_deadlines
    ADD CONSTRAINT institution_deadlines_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_demographics institution_demographics_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_demographics
    ADD CONSTRAINT institution_demographics_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_embeddings institution_embeddings_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_embeddings
    ADD CONSTRAINT institution_embeddings_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_financials institution_financials_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_financials
    ADD CONSTRAINT institution_financials_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_identity_map institution_identity_map_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_identity_map
    ADD CONSTRAINT institution_identity_map_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_merge_history institution_merge_history_canonical_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_merge_history
    ADD CONSTRAINT institution_merge_history_canonical_institution_id_fkey FOREIGN KEY (canonical_institution_id) REFERENCES canonical.institutions(id);


--
-- Name: institution_outcomes institution_outcomes_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_outcomes
    ADD CONSTRAINT institution_outcomes_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_placements institution_placements_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_placements
    ADD CONSTRAINT institution_placements_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_programs institution_programs_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_programs
    ADD CONSTRAINT institution_programs_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_quality_scores institution_quality_scores_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_quality_scores
    ADD CONSTRAINT institution_quality_scores_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_rankings institution_rankings_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_rankings
    ADD CONSTRAINT institution_rankings_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_requirements institution_requirements_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_requirements
    ADD CONSTRAINT institution_requirements_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_search_index institution_search_index_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_search_index
    ADD CONSTRAINT institution_search_index_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_source_registry institution_source_registry_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institution_source_registry
    ADD CONSTRAINT institution_source_registry_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: institutions institutions_deprecated_duplicate_of_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.institutions
    ADD CONSTRAINT institutions_deprecated_duplicate_of_fkey FOREIGN KEY (deprecated_duplicate_of) REFERENCES canonical.institutions(id);


--
-- Name: masters_admission_datapoints masters_admission_datapoints_masters_program_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.masters_admission_datapoints
    ADD CONSTRAINT masters_admission_datapoints_masters_program_id_fkey FOREIGN KEY (masters_program_id) REFERENCES canonical.masters_programs(id) ON DELETE CASCADE;


--
-- Name: masters_pathways masters_pathways_program_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.masters_pathways
    ADD CONSTRAINT masters_pathways_program_id_fkey FOREIGN KEY (program_id) REFERENCES canonical.masters_programs(id) ON DELETE CASCADE;


--
-- Name: masters_program_deadlines masters_program_deadlines_masters_program_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.masters_program_deadlines
    ADD CONSTRAINT masters_program_deadlines_masters_program_id_fkey FOREIGN KEY (masters_program_id) REFERENCES canonical.masters_programs(id) ON DELETE CASCADE;


--
-- Name: masters_program_pathways masters_program_pathways_masters_program_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.masters_program_pathways
    ADD CONSTRAINT masters_program_pathways_masters_program_id_fkey FOREIGN KEY (masters_program_id) REFERENCES canonical.masters_programs(id) ON DELETE CASCADE;


--
-- Name: masters_programs masters_programs_canonical_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.masters_programs
    ADD CONSTRAINT masters_programs_canonical_institution_id_fkey FOREIGN KEY (canonical_institution_id) REFERENCES canonical.institutions(id) ON DELETE SET NULL;


--
-- Name: popularity_index popularity_index_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.popularity_index
    ADD CONSTRAINT popularity_index_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: recommendation_feedback recommendation_feedback_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.recommendation_feedback
    ADD CONSTRAINT recommendation_feedback_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: recommendation_feedback recommendation_feedback_session_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.recommendation_feedback
    ADD CONSTRAINT recommendation_feedback_session_id_fkey FOREIGN KEY (session_id) REFERENCES canonical.recommendation_sessions(id) ON DELETE SET NULL;


--
-- Name: recommendation_feedback recommendation_feedback_user_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.recommendation_feedback
    ADD CONSTRAINT recommendation_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: recommendation_sessions recommendation_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.recommendation_sessions
    ADD CONSTRAINT recommendation_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: requirement_history requirement_history_institution_requirement_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.requirement_history
    ADD CONSTRAINT requirement_history_institution_requirement_id_fkey FOREIGN KEY (institution_requirement_id) REFERENCES canonical.institution_requirements(id) ON DELETE CASCADE;


--
-- Name: stg_institution_matches stg_institution_matches_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.stg_institution_matches
    ADD CONSTRAINT stg_institution_matches_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: stg_institution_matches stg_institution_matches_stg_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.stg_institution_matches
    ADD CONSTRAINT stg_institution_matches_stg_id_fkey FOREIGN KEY (stg_id) REFERENCES canonical.stg_institution_candidates(stg_id) ON DELETE CASCADE;


--
-- Name: uk_admissions_profile uk_admissions_profile_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.uk_admissions_profile
    ADD CONSTRAINT uk_admissions_profile_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: uk_financial_support uk_financial_support_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.uk_financial_support
    ADD CONSTRAINT uk_financial_support_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: us_admissions_profile us_admissions_profile_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.us_admissions_profile
    ADD CONSTRAINT us_admissions_profile_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: us_financial_aid us_financial_aid_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.us_financial_aid
    ADD CONSTRAINT us_financial_aid_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: user_recommendation_events user_recommendation_events_institution_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.user_recommendation_events
    ADD CONSTRAINT user_recommendation_events_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES canonical.institutions(id) ON DELETE CASCADE;


--
-- Name: user_recommendation_events user_recommendation_events_session_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.user_recommendation_events
    ADD CONSTRAINT user_recommendation_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES canonical.recommendation_sessions(id) ON DELETE SET NULL;


--
-- Name: user_recommendation_events user_recommendation_events_user_id_fkey; Type: FK CONSTRAINT; Schema: canonical; Owner: postgres
--

ALTER TABLE ONLY canonical.user_recommendation_events
    ADD CONSTRAINT user_recommendation_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: academic_details academic_details_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.academic_details
    ADD CONSTRAINT academic_details_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_comprehensive(id) ON DELETE CASCADE;


--
-- Name: academic_outcomes academic_outcomes_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.academic_outcomes
    ADD CONSTRAINT academic_outcomes_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_comprehensive(id);


--
-- Name: application_deadlines application_deadlines_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.application_deadlines
    ADD CONSTRAINT application_deadlines_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_comprehensive(id) ON DELETE CASCADE;


--
-- Name: application_tasks application_tasks_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.application_tasks
    ADD CONSTRAINT application_tasks_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: applications applications_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(id) ON DELETE CASCADE;


--
-- Name: applications applications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: campus_life campus_life_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campus_life
    ADD CONSTRAINT campus_life_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_comprehensive(id) ON DELETE CASCADE;


--
-- Name: career_outcomes_detail career_outcomes_detail_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.career_outcomes_detail
    ADD CONSTRAINT career_outcomes_detail_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_comprehensive(id) ON DELETE CASCADE;


--
-- Name: chancing_audit_log chancing_audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chancing_audit_log
    ADD CONSTRAINT chancing_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chancing_predictions chancing_predictions_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chancing_predictions
    ADD CONSTRAINT chancing_predictions_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(id) ON DELETE CASCADE;


--
-- Name: chancing_predictions chancing_predictions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chancing_predictions
    ADD CONSTRAINT chancing_predictions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: college_admissions college_admissions_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_admissions
    ADD CONSTRAINT college_admissions_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_comprehensive(id) ON DELETE CASCADE;


--
-- Name: college_admissions_stats college_admissions_stats_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_admissions_stats
    ADD CONSTRAINT college_admissions_stats_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_comprehensive(id) ON DELETE CASCADE;


--
-- Name: college_data_contributions college_data_contributions_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_data_contributions
    ADD CONSTRAINT college_data_contributions_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(id);


--
-- Name: college_data_contributions college_data_contributions_contributed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_data_contributions
    ADD CONSTRAINT college_data_contributions_contributed_by_user_id_fkey FOREIGN KEY (contributed_by_user_id) REFERENCES public.users(id);


--
-- Name: college_data_contributions college_data_contributions_requested_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_data_contributions
    ADD CONSTRAINT college_data_contributions_requested_college_id_fkey FOREIGN KEY (requested_college_id) REFERENCES public.requested_colleges(id);


--
-- Name: college_data_contributions college_data_contributions_verified_by_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_data_contributions
    ADD CONSTRAINT college_data_contributions_verified_by_admin_id_fkey FOREIGN KEY (verified_by_admin_id) REFERENCES public.users(id);


--
-- Name: college_deadlines college_deadlines_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_deadlines
    ADD CONSTRAINT college_deadlines_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_comprehensive(id) ON DELETE CASCADE;


--
-- Name: college_financial_aid college_financial_aid_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_financial_aid
    ADD CONSTRAINT college_financial_aid_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_comprehensive(id) ON DELETE CASCADE;


--
-- Name: college_financial_data college_financial_data_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_financial_data
    ADD CONSTRAINT college_financial_data_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_comprehensive(id) ON DELETE CASCADE;


--
-- Name: college_insights college_insights_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_insights
    ADD CONSTRAINT college_insights_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_legacy(id) ON DELETE SET NULL;


--
-- Name: college_majors college_majors_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_majors
    ADD CONSTRAINT college_majors_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_comprehensive(id) ON DELETE CASCADE;


--
-- Name: college_majors college_majors_major_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_majors
    ADD CONSTRAINT college_majors_major_id_fkey FOREIGN KEY (major_id) REFERENCES public.majors(id) ON DELETE CASCADE;


--
-- Name: college_programs college_programs_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_programs
    ADD CONSTRAINT college_programs_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_comprehensive(id) ON DELETE CASCADE;


--
-- Name: college_rankings college_rankings_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_rankings
    ADD CONSTRAINT college_rankings_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_comprehensive(id) ON DELETE CASCADE;


--
-- Name: college_requirements college_requirements_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.college_requirements
    ADD CONSTRAINT college_requirements_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_comprehensive(id);


--
-- Name: colleges_legacy colleges_comprehensive_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.colleges_legacy
    ADD CONSTRAINT colleges_comprehensive_id_fkey FOREIGN KEY (comprehensive_id) REFERENCES public.colleges_comprehensive(id) ON DELETE SET NULL;


--
-- Name: cost_of_attendance cost_of_attendance_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_of_attendance
    ADD CONSTRAINT cost_of_attendance_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_comprehensive(id);


--
-- Name: deadline_alerts deadline_alerts_deadline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deadline_alerts
    ADD CONSTRAINT deadline_alerts_deadline_id_fkey FOREIGN KEY (deadline_id) REFERENCES public.user_deadlines(id) ON DELETE CASCADE;


--
-- Name: deadline_alerts deadline_alerts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deadline_alerts
    ADD CONSTRAINT deadline_alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: deadline_history deadline_history_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deadline_history
    ADD CONSTRAINT deadline_history_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_comprehensive(id) ON DELETE CASCADE;


--
-- Name: deadlines deadlines_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deadlines
    ADD CONSTRAINT deadlines_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: deadlines deadlines_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deadlines
    ADD CONSTRAINT deadlines_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: documents documents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: essays essays_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.essays
    ADD CONSTRAINT essays_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: essays essays_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.essays
    ADD CONSTRAINT essays_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: masters_application_documents masters_application_documents_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.masters_application_documents
    ADD CONSTRAINT masters_application_documents_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;


--
-- Name: masters_application_documents masters_application_documents_masters_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.masters_application_documents
    ADD CONSTRAINT masters_application_documents_masters_application_id_fkey FOREIGN KEY (masters_application_id) REFERENCES public.masters_applications(id) ON DELETE CASCADE;


--
-- Name: masters_application_recommenders masters_application_recommenders_masters_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.masters_application_recommenders
    ADD CONSTRAINT masters_application_recommenders_masters_application_id_fkey FOREIGN KEY (masters_application_id) REFERENCES public.masters_applications(id) ON DELETE CASCADE;


--
-- Name: masters_application_recommenders masters_application_recommenders_recommender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.masters_application_recommenders
    ADD CONSTRAINT masters_application_recommenders_recommender_id_fkey FOREIGN KEY (recommender_id) REFERENCES public.recommenders(id) ON DELETE CASCADE;


--
-- Name: masters_applications masters_applications_masters_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.masters_applications
    ADD CONSTRAINT masters_applications_masters_program_id_fkey FOREIGN KEY (masters_program_id) REFERENCES canonical.masters_programs(id) ON DELETE CASCADE;


--
-- Name: masters_applications masters_applications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.masters_applications
    ADD CONSTRAINT masters_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: masters_profile masters_profile_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.masters_profile
    ADD CONSTRAINT masters_profile_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ml_training_data ml_training_data_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ml_training_data
    ADD CONSTRAINT ml_training_data_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_legacy(id);


--
-- Name: model_training_history model_training_history_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.model_training_history
    ADD CONSTRAINT model_training_history_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_legacy(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: prediction_audit_log prediction_audit_log_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prediction_audit_log
    ADD CONSTRAINT prediction_audit_log_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_legacy(id) ON DELETE CASCADE;


--
-- Name: prediction_audit_log prediction_audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prediction_audit_log
    ADD CONSTRAINT prediction_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: prediction_logs prediction_logs_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prediction_logs
    ADD CONSTRAINT prediction_logs_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_legacy(id) ON DELETE SET NULL;


--
-- Name: prediction_logs prediction_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prediction_logs
    ADD CONSTRAINT prediction_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: recommendation_requests recommendation_requests_recommender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recommendation_requests
    ADD CONSTRAINT recommendation_requests_recommender_id_fkey FOREIGN KEY (recommender_id) REFERENCES public.recommenders(id) ON DELETE CASCADE;


--
-- Name: recommendation_requests recommendation_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recommendation_requests
    ADD CONSTRAINT recommendation_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: recommenders recommenders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recommenders
    ADD CONSTRAINT recommenders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: requested_colleges requested_colleges_approved_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.requested_colleges
    ADD CONSTRAINT requested_colleges_approved_college_id_fkey FOREIGN KEY (approved_college_id) REFERENCES public.colleges(id);


--
-- Name: requested_colleges requested_colleges_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.requested_colleges
    ADD CONSTRAINT requested_colleges_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id);


--
-- Name: requested_colleges requested_colleges_reviewed_by_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.requested_colleges
    ADD CONSTRAINT requested_colleges_reviewed_by_admin_id_fkey FOREIGN KEY (reviewed_by_admin_id) REFERENCES public.users(id);


--
-- Name: scraped_results scraped_results_applicant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scraped_results
    ADD CONSTRAINT scraped_results_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.scraped_applicants(id) ON DELETE CASCADE;


--
-- Name: student_activities student_activities_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_activities
    ADD CONSTRAINT student_activities_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.student_profiles(id) ON DELETE CASCADE;


--
-- Name: student_awards student_awards_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_awards
    ADD CONSTRAINT student_awards_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.student_profiles(id) ON DELETE CASCADE;


--
-- Name: student_coursework student_coursework_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_coursework
    ADD CONSTRAINT student_coursework_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.student_profiles(id) ON DELETE CASCADE;


--
-- Name: student_demographics student_demographics_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_demographics
    ADD CONSTRAINT student_demographics_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_comprehensive(id) ON DELETE CASCADE;


--
-- Name: student_profiles student_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_profiles
    ADD CONSTRAINT student_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_legacy(id);


--
-- Name: tasks tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: timeline_actions timeline_actions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.timeline_actions
    ADD CONSTRAINT timeline_actions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_deadlines user_deadlines_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_deadlines
    ADD CONSTRAINT user_deadlines_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_legacy(id);


--
-- Name: user_deadlines user_deadlines_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_deadlines
    ADD CONSTRAINT user_deadlines_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_financial_profiles user_financial_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_financial_profiles
    ADD CONSTRAINT user_financial_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_ml_stats user_ml_stats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_ml_stats
    ADD CONSTRAINT user_ml_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_outcome_contributions user_outcome_contributions_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_outcome_contributions
    ADD CONSTRAINT user_outcome_contributions_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_legacy(id) ON DELETE CASCADE;


--
-- Name: user_outcome_contributions user_outcome_contributions_training_data_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_outcome_contributions
    ADD CONSTRAINT user_outcome_contributions_training_data_id_fkey FOREIGN KEY (training_data_id) REFERENCES public.ml_training_data(id) ON DELETE CASCADE;


--
-- Name: user_outcome_contributions user_outcome_contributions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_outcome_contributions
    ADD CONSTRAINT user_outcome_contributions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_scholarships user_scholarships_scholarship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_scholarships
    ADD CONSTRAINT user_scholarships_scholarship_id_fkey FOREIGN KEY (scholarship_id) REFERENCES public.scholarships(id) ON DELETE CASCADE;


--
-- Name: user_scholarships user_scholarships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_scholarships
    ADD CONSTRAINT user_scholarships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_signals user_signals_college_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_signals
    ADD CONSTRAINT user_signals_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges_comprehensive(id) ON DELETE CASCADE;


--
-- Name: user_signals user_signals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_signals
    ADD CONSTRAINT user_signals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: deadline_history; Type: ROW SECURITY; Schema: canonical; Owner: postgres
--

ALTER TABLE canonical.deadline_history ENABLE ROW LEVEL SECURITY;

--
-- Name: experiment_assignments; Type: ROW SECURITY; Schema: canonical; Owner: postgres
--

ALTER TABLE canonical.experiment_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: institution_deadlines; Type: ROW SECURITY; Schema: canonical; Owner: postgres
--

ALTER TABLE canonical.institution_deadlines ENABLE ROW LEVEL SECURITY;

--
-- Name: institution_identity_map; Type: ROW SECURITY; Schema: canonical; Owner: postgres
--

ALTER TABLE canonical.institution_identity_map ENABLE ROW LEVEL SECURITY;

--
-- Name: institution_requirements; Type: ROW SECURITY; Schema: canonical; Owner: postgres
--

ALTER TABLE canonical.institution_requirements ENABLE ROW LEVEL SECURITY;

--
-- Name: institution_source_registry; Type: ROW SECURITY; Schema: canonical; Owner: postgres
--

ALTER TABLE canonical.institution_source_registry ENABLE ROW LEVEL SECURITY;

--
-- Name: institutions; Type: ROW SECURITY; Schema: canonical; Owner: postgres
--

ALTER TABLE canonical.institutions ENABLE ROW LEVEL SECURITY;

--
-- Name: major_ontology; Type: ROW SECURITY; Schema: canonical; Owner: postgres
--

ALTER TABLE canonical.major_ontology ENABLE ROW LEVEL SECURITY;

--
-- Name: popularity_index; Type: ROW SECURITY; Schema: canonical; Owner: postgres
--

ALTER TABLE canonical.popularity_index ENABLE ROW LEVEL SECURITY;

--
-- Name: institutions public read; Type: POLICY; Schema: canonical; Owner: postgres
--

CREATE POLICY "public read" ON canonical.institutions FOR SELECT TO authenticated, anon USING (true);


--
-- Name: recommendation_feedback; Type: ROW SECURITY; Schema: canonical; Owner: postgres
--

ALTER TABLE canonical.recommendation_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: recommendation_sessions; Type: ROW SECURITY; Schema: canonical; Owner: postgres
--

ALTER TABLE canonical.recommendation_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: requirement_history; Type: ROW SECURITY; Schema: canonical; Owner: postgres
--

ALTER TABLE canonical.requirement_history ENABLE ROW LEVEL SECURITY;

--
-- Name: retrieval_eval_history; Type: ROW SECURITY; Schema: canonical; Owner: postgres
--

ALTER TABLE canonical.retrieval_eval_history ENABLE ROW LEVEL SECURITY;

--
-- Name: source_reliability; Type: ROW SECURITY; Schema: canonical; Owner: postgres
--

ALTER TABLE canonical.source_reliability ENABLE ROW LEVEL SECURITY;

--
-- Name: user_recommendation_events; Type: ROW SECURITY; Schema: canonical; Owner: postgres
--

ALTER TABLE canonical.user_recommendation_events ENABLE ROW LEVEL SECURITY;

--
-- Name: academic_details; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.academic_details ENABLE ROW LEVEL SECURITY;

--
-- Name: academic_details academic_details_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY academic_details_deny ON public.academic_details USING (false);


--
-- Name: academic_outcomes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.academic_outcomes ENABLE ROW LEVEL SECURITY;

--
-- Name: academic_outcomes academic_outcomes_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY academic_outcomes_deny ON public.academic_outcomes USING (false);


--
-- Name: admission_outcomes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.admission_outcomes ENABLE ROW LEVEL SECURITY;

--
-- Name: admission_outcomes admission_outcomes_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admission_outcomes_deny ON public.admission_outcomes USING (false);


--
-- Name: applications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

--
-- Name: applications applications_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY applications_deny ON public.applications USING (false);


--
-- Name: campus_life; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.campus_life ENABLE ROW LEVEL SECURITY;

--
-- Name: campus_life campus_life_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY campus_life_public_read ON public.campus_life FOR SELECT USING (true);


--
-- Name: career_outcomes_detail; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.career_outcomes_detail ENABLE ROW LEVEL SECURITY;

--
-- Name: career_outcomes_detail career_outcomes_detail_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY career_outcomes_detail_public_read ON public.career_outcomes_detail FOR SELECT USING (true);


--
-- Name: chance_me_posts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chance_me_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: chance_me_posts chance_me_posts_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY chance_me_posts_deny ON public.chance_me_posts USING (false);


--
-- Name: chancing_audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chancing_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: college_admissions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.college_admissions ENABLE ROW LEVEL SECURITY;

--
-- Name: college_admissions college_admissions_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY college_admissions_public_read ON public.college_admissions FOR SELECT USING (true);


--
-- Name: college_data_contributions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.college_data_contributions ENABLE ROW LEVEL SECURITY;

--
-- Name: college_data_contributions college_data_contributions_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY college_data_contributions_deny ON public.college_data_contributions USING (false);


--
-- Name: college_deadlines; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.college_deadlines ENABLE ROW LEVEL SECURITY;

--
-- Name: college_financial_data; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.college_financial_data ENABLE ROW LEVEL SECURITY;

--
-- Name: college_financial_data college_financial_data_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY college_financial_data_public_read ON public.college_financial_data FOR SELECT USING (true);


--
-- Name: college_insights; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.college_insights ENABLE ROW LEVEL SECURITY;

--
-- Name: college_insights college_insights_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY college_insights_public_read ON public.college_insights FOR SELECT USING (true);


--
-- Name: college_programs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.college_programs ENABLE ROW LEVEL SECURITY;

--
-- Name: college_programs college_programs_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY college_programs_public_read ON public.college_programs FOR SELECT USING (true);


--
-- Name: college_rankings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.college_rankings ENABLE ROW LEVEL SECURITY;

--
-- Name: college_rankings college_rankings_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY college_rankings_public_read ON public.college_rankings FOR SELECT USING (true);


--
-- Name: college_requirements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.college_requirements ENABLE ROW LEVEL SECURITY;

--
-- Name: college_requirements college_requirements_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY college_requirements_public_read ON public.college_requirements FOR SELECT USING (true);


--
-- Name: colleges_comprehensive; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.colleges_comprehensive ENABLE ROW LEVEL SECURITY;

--
-- Name: colleges_comprehensive colleges_comprehensive_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY colleges_comprehensive_public_read ON public.colleges_comprehensive FOR SELECT USING (true);


--
-- Name: colleges_legacy; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.colleges_legacy ENABLE ROW LEVEL SECURITY;

--
-- Name: colleges_legacy colleges_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY colleges_public_read ON public.colleges_legacy FOR SELECT USING (true);


--
-- Name: currency_rates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.currency_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: currency_rates currency_rates_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY currency_rates_public_read ON public.currency_rates FOR SELECT USING (true);


--
-- Name: deadline_alerts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.deadline_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: deadline_alerts deadline_alerts_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY deadline_alerts_deny ON public.deadline_alerts USING (false);


--
-- Name: deadlines; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.deadlines ENABLE ROW LEVEL SECURITY;

--
-- Name: deadlines deadlines_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY deadlines_deny ON public.deadlines USING (false);


--
-- Name: essays; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.essays ENABLE ROW LEVEL SECURITY;

--
-- Name: essays essays_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY essays_deny ON public.essays USING (false);


--
-- Name: login_attempts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: login_attempts login_attempts_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY login_attempts_deny ON public.login_attempts USING (false);


--
-- Name: migrations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations migrations_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY migrations_deny ON public.migrations USING (false);


--
-- Name: ml_training_data; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ml_training_data ENABLE ROW LEVEL SECURITY;

--
-- Name: ml_training_data ml_training_data_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ml_training_data_deny ON public.ml_training_data USING (false);


--
-- Name: model_training_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.model_training_history ENABLE ROW LEVEL SECURITY;

--
-- Name: model_training_history model_training_history_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY model_training_history_deny ON public.model_training_history USING (false);


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_deny ON public.notifications USING (false);


--
-- Name: prediction_audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.prediction_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: prediction_audit_log prediction_audit_log_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY prediction_audit_log_deny ON public.prediction_audit_log USING (false);


--
-- Name: academic_details public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.academic_details FOR SELECT TO authenticated, anon USING (true);


--
-- Name: campus_life public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.campus_life FOR SELECT TO authenticated, anon USING (true);


--
-- Name: college_admissions public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.college_admissions FOR SELECT TO authenticated, anon USING (true);


--
-- Name: college_deadlines public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.college_deadlines FOR SELECT TO authenticated, anon USING (true);


--
-- Name: college_financial_data public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.college_financial_data FOR SELECT TO authenticated, anon USING (true);


--
-- Name: college_programs public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.college_programs FOR SELECT TO authenticated, anon USING (true);


--
-- Name: college_rankings public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.college_rankings FOR SELECT TO authenticated, anon USING (true);


--
-- Name: colleges_comprehensive public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.colleges_comprehensive FOR SELECT TO authenticated, anon USING (true);


--
-- Name: student_demographics public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read ON public.student_demographics FOR SELECT TO authenticated, anon USING (true);


--
-- Name: recommendation_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.recommendation_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: recommendation_requests recommendation_requests_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY recommendation_requests_deny ON public.recommendation_requests USING (false);


--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens refresh_tokens_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY refresh_tokens_deny ON public.refresh_tokens USING (false);


--
-- Name: requested_colleges; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.requested_colleges ENABLE ROW LEVEL SECURITY;

--
-- Name: requested_colleges requested_colleges_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY requested_colleges_deny ON public.requested_colleges USING (false);


--
-- Name: scraped_applicants; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.scraped_applicants ENABLE ROW LEVEL SECURITY;

--
-- Name: scraped_applicants scraped_applicants_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY scraped_applicants_deny ON public.scraped_applicants USING (false);


--
-- Name: scraped_results; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.scraped_results ENABLE ROW LEVEL SECURITY;

--
-- Name: scraped_results scraped_results_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY scraped_results_deny ON public.scraped_results USING (false);


--
-- Name: scraper_run_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.scraper_run_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: scraper_run_logs scraper_run_logs_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY scraper_run_logs_deny ON public.scraper_run_logs USING (false);


--
-- Name: student_activities; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.student_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: student_activities student_activities_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY student_activities_deny ON public.student_activities USING (false);


--
-- Name: student_awards; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.student_awards ENABLE ROW LEVEL SECURITY;

--
-- Name: student_awards student_awards_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY student_awards_deny ON public.student_awards USING (false);


--
-- Name: student_coursework; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.student_coursework ENABLE ROW LEVEL SECURITY;

--
-- Name: student_coursework student_coursework_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY student_coursework_deny ON public.student_coursework USING (false);


--
-- Name: student_demographics; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.student_demographics ENABLE ROW LEVEL SECURITY;

--
-- Name: student_demographics student_demographics_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY student_demographics_deny ON public.student_demographics USING (false);


--
-- Name: student_profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: student_profiles student_profiles_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY student_profiles_deny ON public.student_profiles USING (false);


--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks tasks_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tasks_deny ON public.tasks USING (false);


--
-- Name: timeline_actions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.timeline_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: timeline_actions timeline_actions_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY timeline_actions_deny ON public.timeline_actions USING (false);


--
-- Name: user_deadlines; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_deadlines ENABLE ROW LEVEL SECURITY;

--
-- Name: user_deadlines user_deadlines_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY user_deadlines_deny ON public.user_deadlines USING (false);


--
-- Name: user_ml_stats; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_ml_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: user_ml_stats user_ml_stats_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY user_ml_stats_deny ON public.user_ml_stats USING (false);


--
-- Name: user_outcome_contributions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_outcome_contributions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_outcome_contributions user_outcome_contributions_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY user_outcome_contributions_deny ON public.user_outcome_contributions USING (false);


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_deny; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY users_deny ON public.users USING (false);


--
-- Name: notifications users_own_notifications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY users_own_notifications ON public.notifications USING ((user_id = (current_setting('app.current_user_id'::text, true))::integer));


--
-- Name: SCHEMA canonical; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA canonical TO anon;
GRANT USAGE ON SCHEMA canonical TO authenticated;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION base_external_ids(); Type: ACL; Schema: canonical; Owner: postgres
--

GRANT ALL ON FUNCTION canonical.base_external_ids() TO anon;
GRANT ALL ON FUNCTION canonical.base_external_ids() TO authenticated;
GRANT ALL ON FUNCTION canonical.base_external_ids() TO service_role;


--
-- Name: FUNCTION external_ids_overlap(p_left jsonb, p_right jsonb); Type: ACL; Schema: canonical; Owner: postgres
--

GRANT ALL ON FUNCTION canonical.external_ids_overlap(p_left jsonb, p_right jsonb) TO anon;
GRANT ALL ON FUNCTION canonical.external_ids_overlap(p_left jsonb, p_right jsonb) TO authenticated;
GRANT ALL ON FUNCTION canonical.external_ids_overlap(p_left jsonb, p_right jsonb) TO service_role;


--
-- Name: FUNCTION extract_domain(p_url text); Type: ACL; Schema: canonical; Owner: postgres
--

GRANT ALL ON FUNCTION canonical.extract_domain(p_url text) TO anon;
GRANT ALL ON FUNCTION canonical.extract_domain(p_url text) TO authenticated;
GRANT ALL ON FUNCTION canonical.extract_domain(p_url text) TO service_role;


--
-- Name: FUNCTION get_distinct_country_codes(); Type: ACL; Schema: canonical; Owner: postgres
--

GRANT ALL ON FUNCTION canonical.get_distinct_country_codes() TO anon;
GRANT ALL ON FUNCTION canonical.get_distinct_country_codes() TO authenticated;


--
-- Name: FUNCTION get_distinct_state_regions(); Type: ACL; Schema: canonical; Owner: postgres
--

GRANT ALL ON FUNCTION canonical.get_distinct_state_regions() TO anon;
GRANT ALL ON FUNCTION canonical.get_distinct_state_regions() TO authenticated;


--
-- Name: FUNCTION make_slug(p_name text); Type: ACL; Schema: canonical; Owner: postgres
--

GRANT ALL ON FUNCTION canonical.make_slug(p_name text) TO anon;
GRANT ALL ON FUNCTION canonical.make_slug(p_name text) TO authenticated;
GRANT ALL ON FUNCTION canonical.make_slug(p_name text) TO service_role;


--
-- Name: FUNCTION merge_external_ids(p_existing jsonb, p_incoming jsonb); Type: ACL; Schema: canonical; Owner: postgres
--

GRANT ALL ON FUNCTION canonical.merge_external_ids(p_existing jsonb, p_incoming jsonb) TO anon;
GRANT ALL ON FUNCTION canonical.merge_external_ids(p_existing jsonb, p_incoming jsonb) TO authenticated;
GRANT ALL ON FUNCTION canonical.merge_external_ids(p_existing jsonb, p_incoming jsonb) TO service_role;


--
-- Name: FUNCTION normalize_country_code(p_value text); Type: ACL; Schema: canonical; Owner: postgres
--

GRANT ALL ON FUNCTION canonical.normalize_country_code(p_value text) TO anon;
GRANT ALL ON FUNCTION canonical.normalize_country_code(p_value text) TO authenticated;
GRANT ALL ON FUNCTION canonical.normalize_country_code(p_value text) TO service_role;


--
-- Name: FUNCTION normalize_institution_name(p_input text); Type: ACL; Schema: canonical; Owner: postgres
--

GRANT ALL ON FUNCTION canonical.normalize_institution_name(p_input text) TO anon;
GRANT ALL ON FUNCTION canonical.normalize_institution_name(p_input text) TO authenticated;
GRANT ALL ON FUNCTION canonical.normalize_institution_name(p_input text) TO service_role;


--
-- Name: FUNCTION normalize_region_code(p_country_code text, p_region text); Type: ACL; Schema: canonical; Owner: postgres
--

GRANT ALL ON FUNCTION canonical.normalize_region_code(p_country_code text, p_region text) TO anon;
GRANT ALL ON FUNCTION canonical.normalize_region_code(p_country_code text, p_region text) TO authenticated;
GRANT ALL ON FUNCTION canonical.normalize_region_code(p_country_code text, p_region text) TO service_role;


--
-- Name: FUNCTION normalize_text(p_input text); Type: ACL; Schema: canonical; Owner: postgres
--

GRANT ALL ON FUNCTION canonical.normalize_text(p_input text) TO anon;
GRANT ALL ON FUNCTION canonical.normalize_text(p_input text) TO authenticated;
GRANT ALL ON FUNCTION canonical.normalize_text(p_input text) TO service_role;


--
-- Name: FUNCTION normalize_url(p_input text); Type: ACL; Schema: canonical; Owner: postgres
--

GRANT ALL ON FUNCTION canonical.normalize_url(p_input text) TO anon;
GRANT ALL ON FUNCTION canonical.normalize_url(p_input text) TO authenticated;
GRANT ALL ON FUNCTION canonical.normalize_url(p_input text) TO service_role;


--
-- Name: FUNCTION normalized_external_ids(p_payload jsonb); Type: ACL; Schema: canonical; Owner: postgres
--

GRANT ALL ON FUNCTION canonical.normalized_external_ids(p_payload jsonb) TO anon;
GRANT ALL ON FUNCTION canonical.normalized_external_ids(p_payload jsonb) TO authenticated;
GRANT ALL ON FUNCTION canonical.normalized_external_ids(p_payload jsonb) TO service_role;


--
-- Name: FUNCTION rebuild_staging_institution_candidates(); Type: ACL; Schema: canonical; Owner: postgres
--

GRANT ALL ON FUNCTION canonical.rebuild_staging_institution_candidates() TO anon;
GRANT ALL ON FUNCTION canonical.rebuild_staging_institution_candidates() TO authenticated;
GRANT ALL ON FUNCTION canonical.rebuild_staging_institution_candidates() TO service_role;


--
-- Name: FUNCTION resolve_source_tier(p_source_table text, p_payload jsonb); Type: ACL; Schema: canonical; Owner: postgres
--

GRANT ALL ON FUNCTION canonical.resolve_source_tier(p_source_table text, p_payload jsonb) TO anon;
GRANT ALL ON FUNCTION canonical.resolve_source_tier(p_source_table text, p_payload jsonb) TO authenticated;
GRANT ALL ON FUNCTION canonical.resolve_source_tier(p_source_table text, p_payload jsonb) TO service_role;


--
-- Name: FUNCTION safe_timestamptz(p_value text); Type: ACL; Schema: canonical; Owner: postgres
--

GRANT ALL ON FUNCTION canonical.safe_timestamptz(p_value text) TO anon;
GRANT ALL ON FUNCTION canonical.safe_timestamptz(p_value text) TO authenticated;
GRANT ALL ON FUNCTION canonical.safe_timestamptz(p_value text) TO service_role;


--
-- Name: FUNCTION search_institutions(p_q text, p_limit integer, p_offset integer); Type: ACL; Schema: canonical; Owner: postgres
--

GRANT ALL ON FUNCTION canonical.search_institutions(p_q text, p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION canonical.search_institutions(p_q text, p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION canonical.search_institutions(p_q text, p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION source_priority_from_tier(p_tier canonical.source_tier); Type: ACL; Schema: canonical; Owner: postgres
--

GRANT ALL ON FUNCTION canonical.source_priority_from_tier(p_tier canonical.source_tier) TO anon;
GRANT ALL ON FUNCTION canonical.source_priority_from_tier(p_tier canonical.source_tier) TO authenticated;
GRANT ALL ON FUNCTION canonical.source_priority_from_tier(p_tier canonical.source_tier) TO service_role;


--
-- Name: FUNCTION coa_set_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.coa_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.coa_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.coa_set_updated_at() TO service_role;


--
-- Name: FUNCTION colleges_search_vector_update(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.colleges_search_vector_update() TO anon;
GRANT ALL ON FUNCTION public.colleges_search_vector_update() TO authenticated;
GRANT ALL ON FUNCTION public.colleges_search_vector_update() TO service_role;


--
-- Name: FUNCTION compute_popularity_score(p_enrollment integer, p_ranking_us_news integer, p_applications bigint, p_acceptance_rate numeric); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.compute_popularity_score(p_enrollment integer, p_ranking_us_news integer, p_applications bigint, p_acceptance_rate numeric) TO anon;
GRANT ALL ON FUNCTION public.compute_popularity_score(p_enrollment integer, p_ranking_us_news integer, p_applications bigint, p_acceptance_rate numeric) TO authenticated;
GRANT ALL ON FUNCTION public.compute_popularity_score(p_enrollment integer, p_ranking_us_news integer, p_applications bigint, p_acceptance_rate numeric) TO service_role;


--
-- Name: FUNCTION financing_options_set_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.financing_options_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.financing_options_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.financing_options_set_updated_at() TO service_role;


--
-- Name: FUNCTION get_distinct_countries(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_distinct_countries() TO anon;
GRANT ALL ON FUNCTION public.get_distinct_countries() TO authenticated;
GRANT ALL ON FUNCTION public.get_distinct_countries() TO service_role;


--
-- Name: FUNCTION get_distinct_states(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_distinct_states() TO anon;
GRANT ALL ON FUNCTION public.get_distinct_states() TO authenticated;
GRANT ALL ON FUNCTION public.get_distinct_states() TO service_role;


--
-- Name: FUNCTION get_latest_rate(p_base text, p_quote text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_latest_rate(p_base text, p_quote text) TO anon;
GRANT ALL ON FUNCTION public.get_latest_rate(p_base text, p_quote text) TO authenticated;
GRANT ALL ON FUNCTION public.get_latest_rate(p_base text, p_quote text) TO service_role;


--
-- Name: FUNCTION search_colleges_filtered(p_query text, p_country text, p_state text, p_type text, p_setting text, p_min_acceptance double precision, p_max_acceptance double precision, p_max_tuition double precision, p_sort_by text, p_page integer, p_page_size integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.search_colleges_filtered(p_query text, p_country text, p_state text, p_type text, p_setting text, p_min_acceptance double precision, p_max_acceptance double precision, p_max_tuition double precision, p_sort_by text, p_page integer, p_page_size integer) TO anon;
GRANT ALL ON FUNCTION public.search_colleges_filtered(p_query text, p_country text, p_state text, p_type text, p_setting text, p_min_acceptance double precision, p_max_acceptance double precision, p_max_tuition double precision, p_sort_by text, p_page integer, p_page_size integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_colleges_filtered(p_query text, p_country text, p_state text, p_type text, p_setting text, p_min_acceptance double precision, p_max_acceptance double precision, p_max_tuition double precision, p_sort_by text, p_page integer, p_page_size integer) TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: FUNCTION update_user_profiles_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_user_profiles_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_user_profiles_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_user_profiles_updated_at() TO service_role;


--
-- Name: TABLE data_quality_snapshots; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.data_quality_snapshots TO anon;
GRANT SELECT ON TABLE canonical.data_quality_snapshots TO authenticated;


--
-- Name: TABLE deadline_history; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.deadline_history TO anon;
GRANT SELECT ON TABLE canonical.deadline_history TO authenticated;


--
-- Name: TABLE eu_admissions_profile; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.eu_admissions_profile TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.eu_admissions_profile TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.eu_admissions_profile TO service_role;


--
-- Name: TABLE experiment_assignments; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.experiment_assignments TO anon;
GRANT SELECT ON TABLE canonical.experiment_assignments TO authenticated;


--
-- Name: TABLE india_admissions_profile; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.india_admissions_profile TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.india_admissions_profile TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.india_admissions_profile TO service_role;


--
-- Name: TABLE india_financial_aid; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.india_financial_aid TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.india_financial_aid TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.india_financial_aid TO service_role;


--
-- Name: TABLE institution_admissions; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_admissions TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_admissions TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_admissions TO service_role;


--
-- Name: TABLE institution_admissions_merge_archive; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.institution_admissions_merge_archive TO anon;
GRANT SELECT ON TABLE canonical.institution_admissions_merge_archive TO authenticated;


--
-- Name: TABLE institution_aliases; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_aliases TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_aliases TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_aliases TO service_role;


--
-- Name: TABLE institution_campus_life; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_campus_life TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_campus_life TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_campus_life TO service_role;


--
-- Name: TABLE institution_completeness; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_completeness TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_completeness TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_completeness TO service_role;


--
-- Name: TABLE institution_completeness_merge_archive; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.institution_completeness_merge_archive TO anon;
GRANT SELECT ON TABLE canonical.institution_completeness_merge_archive TO authenticated;


--
-- Name: TABLE institution_deadlines; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.institution_deadlines TO anon;
GRANT SELECT ON TABLE canonical.institution_deadlines TO authenticated;


--
-- Name: TABLE institution_demographics; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_demographics TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_demographics TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_demographics TO service_role;


--
-- Name: TABLE institution_embeddings; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_embeddings TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_embeddings TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_embeddings TO service_role;


--
-- Name: TABLE institution_financials; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_financials TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_financials TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_financials TO service_role;


--
-- Name: TABLE institution_financials_merge_archive; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.institution_financials_merge_archive TO anon;
GRANT SELECT ON TABLE canonical.institution_financials_merge_archive TO authenticated;


--
-- Name: TABLE institution_identity_map; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_identity_map TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_identity_map TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_identity_map TO service_role;


--
-- Name: TABLE institution_merge_history; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.institution_merge_history TO anon;
GRANT SELECT ON TABLE canonical.institution_merge_history TO authenticated;


--
-- Name: TABLE institution_outcomes; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_outcomes TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_outcomes TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_outcomes TO service_role;


--
-- Name: TABLE institution_placements; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.institution_placements TO anon;
GRANT SELECT ON TABLE canonical.institution_placements TO authenticated;


--
-- Name: TABLE institution_programs; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_programs TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_programs TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_programs TO service_role;


--
-- Name: TABLE institution_quality_scores; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_quality_scores TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_quality_scores TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_quality_scores TO service_role;


--
-- Name: TABLE institution_rankings; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_rankings TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_rankings TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_rankings TO service_role;


--
-- Name: TABLE institution_rankings_merge_archive; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.institution_rankings_merge_archive TO anon;
GRANT SELECT ON TABLE canonical.institution_rankings_merge_archive TO authenticated;


--
-- Name: TABLE institution_requirements; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.institution_requirements TO anon;
GRANT SELECT ON TABLE canonical.institution_requirements TO authenticated;


--
-- Name: TABLE institution_search_index; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_search_index TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_search_index TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institution_search_index TO service_role;


--
-- Name: TABLE institution_source_registry; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.institution_source_registry TO anon;
GRANT SELECT ON TABLE canonical.institution_source_registry TO authenticated;


--
-- Name: TABLE institutions; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institutions TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institutions TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.institutions TO service_role;


--
-- Name: TABLE major_ontology; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.major_ontology TO anon;
GRANT SELECT ON TABLE canonical.major_ontology TO authenticated;


--
-- Name: TABLE masters_admission_datapoints; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.masters_admission_datapoints TO anon;
GRANT SELECT ON TABLE canonical.masters_admission_datapoints TO authenticated;


--
-- Name: TABLE masters_pathways; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.masters_pathways TO anon;
GRANT SELECT ON TABLE canonical.masters_pathways TO authenticated;


--
-- Name: TABLE masters_program_deadlines; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.masters_program_deadlines TO anon;
GRANT SELECT ON TABLE canonical.masters_program_deadlines TO authenticated;


--
-- Name: TABLE masters_program_pathways; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.masters_program_pathways TO anon;
GRANT SELECT ON TABLE canonical.masters_program_pathways TO authenticated;


--
-- Name: TABLE masters_programs; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.masters_programs TO anon;
GRANT SELECT ON TABLE canonical.masters_programs TO authenticated;


--
-- Name: TABLE masters_scrape_log; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.masters_scrape_log TO anon;
GRANT SELECT ON TABLE canonical.masters_scrape_log TO authenticated;


--
-- Name: TABLE popularity_index; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.popularity_index TO anon;
GRANT SELECT ON TABLE canonical.popularity_index TO authenticated;


--
-- Name: TABLE mv_college_cards; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.mv_college_cards TO anon;
GRANT SELECT ON TABLE canonical.mv_college_cards TO authenticated;


--
-- Name: TABLE mv_masters_program_cards; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.mv_masters_program_cards TO anon;
GRANT SELECT ON TABLE canonical.mv_masters_program_cards TO authenticated;


--
-- Name: TABLE recommendation_feedback; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.recommendation_feedback TO anon;
GRANT SELECT ON TABLE canonical.recommendation_feedback TO authenticated;


--
-- Name: TABLE recommendation_sessions; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.recommendation_sessions TO anon;
GRANT SELECT ON TABLE canonical.recommendation_sessions TO authenticated;


--
-- Name: TABLE requirement_history; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.requirement_history TO anon;
GRANT SELECT ON TABLE canonical.requirement_history TO authenticated;


--
-- Name: TABLE retrieval_eval_history; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.retrieval_eval_history TO anon;
GRANT SELECT ON TABLE canonical.retrieval_eval_history TO authenticated;


--
-- Name: TABLE source_reliability; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.source_reliability TO anon;
GRANT SELECT ON TABLE canonical.source_reliability TO authenticated;


--
-- Name: TABLE stg_institution_candidates; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.stg_institution_candidates TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.stg_institution_candidates TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.stg_institution_candidates TO service_role;


--
-- Name: SEQUENCE stg_institution_candidates_stg_id_seq; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON SEQUENCE canonical.stg_institution_candidates_stg_id_seq TO anon;
GRANT SELECT ON SEQUENCE canonical.stg_institution_candidates_stg_id_seq TO authenticated;


--
-- Name: TABLE stg_institution_matches; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.stg_institution_matches TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.stg_institution_matches TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.stg_institution_matches TO service_role;


--
-- Name: TABLE uk_admissions_profile; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.uk_admissions_profile TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.uk_admissions_profile TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.uk_admissions_profile TO service_role;


--
-- Name: TABLE uk_financial_support; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.uk_financial_support TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.uk_financial_support TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.uk_financial_support TO service_role;


--
-- Name: TABLE us_admissions_profile; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.us_admissions_profile TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.us_admissions_profile TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.us_admissions_profile TO service_role;


--
-- Name: TABLE us_financial_aid; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.us_financial_aid TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.us_financial_aid TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE canonical.us_financial_aid TO service_role;


--
-- Name: TABLE user_recommendation_events; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.user_recommendation_events TO anon;
GRANT SELECT ON TABLE canonical.user_recommendation_events TO authenticated;


--
-- Name: TABLE v_college_cards_extended; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.v_college_cards_extended TO anon;
GRANT SELECT ON TABLE canonical.v_college_cards_extended TO authenticated;


--
-- Name: TABLE v_data_quality_summary; Type: ACL; Schema: canonical; Owner: postgres
--

GRANT SELECT ON TABLE canonical.v_data_quality_summary TO anon;
GRANT SELECT ON TABLE canonical.v_data_quality_summary TO authenticated;


--
-- Name: TABLE academic_details; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.academic_details TO anon;
GRANT ALL ON TABLE public.academic_details TO authenticated;
GRANT ALL ON TABLE public.academic_details TO service_role;


--
-- Name: SEQUENCE academic_details_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.academic_details_id_seq TO anon;
GRANT ALL ON SEQUENCE public.academic_details_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.academic_details_id_seq TO service_role;


--
-- Name: TABLE academic_outcomes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.academic_outcomes TO anon;
GRANT ALL ON TABLE public.academic_outcomes TO authenticated;
GRANT ALL ON TABLE public.academic_outcomes TO service_role;


--
-- Name: SEQUENCE academic_outcomes_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.academic_outcomes_id_seq TO anon;
GRANT ALL ON SEQUENCE public.academic_outcomes_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.academic_outcomes_id_seq TO service_role;


--
-- Name: TABLE admission_outcomes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admission_outcomes TO anon;
GRANT ALL ON TABLE public.admission_outcomes TO authenticated;
GRANT ALL ON TABLE public.admission_outcomes TO service_role;


--
-- Name: SEQUENCE admission_outcomes_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.admission_outcomes_id_seq TO anon;
GRANT ALL ON SEQUENCE public.admission_outcomes_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.admission_outcomes_id_seq TO service_role;


--
-- Name: TABLE application_deadlines; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.application_deadlines TO anon;
GRANT ALL ON TABLE public.application_deadlines TO authenticated;
GRANT ALL ON TABLE public.application_deadlines TO service_role;


--
-- Name: SEQUENCE application_deadlines_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.application_deadlines_id_seq TO anon;
GRANT ALL ON SEQUENCE public.application_deadlines_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.application_deadlines_id_seq TO service_role;


--
-- Name: TABLE application_tasks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.application_tasks TO anon;
GRANT ALL ON TABLE public.application_tasks TO authenticated;
GRANT ALL ON TABLE public.application_tasks TO service_role;


--
-- Name: SEQUENCE application_tasks_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.application_tasks_id_seq TO anon;
GRANT ALL ON SEQUENCE public.application_tasks_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.application_tasks_id_seq TO service_role;


--
-- Name: TABLE applications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.applications TO anon;
GRANT ALL ON TABLE public.applications TO authenticated;
GRANT ALL ON TABLE public.applications TO service_role;


--
-- Name: SEQUENCE applications_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.applications_id_seq TO anon;
GRANT ALL ON SEQUENCE public.applications_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.applications_id_seq TO service_role;


--
-- Name: TABLE campus_life; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.campus_life TO anon;
GRANT ALL ON TABLE public.campus_life TO authenticated;
GRANT ALL ON TABLE public.campus_life TO service_role;


--
-- Name: SEQUENCE campus_life_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.campus_life_id_seq TO anon;
GRANT ALL ON SEQUENCE public.campus_life_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.campus_life_id_seq TO service_role;


--
-- Name: TABLE career_outcomes_detail; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.career_outcomes_detail TO anon;
GRANT ALL ON TABLE public.career_outcomes_detail TO authenticated;
GRANT ALL ON TABLE public.career_outcomes_detail TO service_role;


--
-- Name: SEQUENCE career_outcomes_detail_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.career_outcomes_detail_id_seq TO anon;
GRANT ALL ON SEQUENCE public.career_outcomes_detail_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.career_outcomes_detail_id_seq TO service_role;


--
-- Name: TABLE chance_me_posts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.chance_me_posts TO anon;
GRANT ALL ON TABLE public.chance_me_posts TO authenticated;
GRANT ALL ON TABLE public.chance_me_posts TO service_role;


--
-- Name: SEQUENCE chance_me_posts_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.chance_me_posts_id_seq TO anon;
GRANT ALL ON SEQUENCE public.chance_me_posts_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.chance_me_posts_id_seq TO service_role;


--
-- Name: TABLE chancing_audit_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.chancing_audit_log TO anon;
GRANT ALL ON TABLE public.chancing_audit_log TO authenticated;
GRANT ALL ON TABLE public.chancing_audit_log TO service_role;


--
-- Name: SEQUENCE chancing_audit_log_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.chancing_audit_log_id_seq TO anon;
GRANT ALL ON SEQUENCE public.chancing_audit_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.chancing_audit_log_id_seq TO service_role;


--
-- Name: TABLE chancing_predictions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.chancing_predictions TO anon;
GRANT ALL ON TABLE public.chancing_predictions TO authenticated;
GRANT ALL ON TABLE public.chancing_predictions TO service_role;


--
-- Name: SEQUENCE chancing_predictions_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.chancing_predictions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.chancing_predictions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.chancing_predictions_id_seq TO service_role;


--
-- Name: TABLE colleges_comprehensive; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.colleges_comprehensive TO anon;
GRANT ALL ON TABLE public.colleges_comprehensive TO authenticated;
GRANT ALL ON TABLE public.colleges_comprehensive TO service_role;


--
-- Name: TABLE clean_colleges; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.clean_colleges TO anon;
GRANT ALL ON TABLE public.clean_colleges TO authenticated;
GRANT ALL ON TABLE public.clean_colleges TO service_role;


--
-- Name: TABLE college_admissions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.college_admissions TO anon;
GRANT ALL ON TABLE public.college_admissions TO authenticated;
GRANT ALL ON TABLE public.college_admissions TO service_role;


--
-- Name: SEQUENCE college_admissions_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.college_admissions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.college_admissions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.college_admissions_id_seq TO service_role;


--
-- Name: TABLE college_admissions_stats; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.college_admissions_stats TO anon;
GRANT ALL ON TABLE public.college_admissions_stats TO authenticated;
GRANT ALL ON TABLE public.college_admissions_stats TO service_role;


--
-- Name: SEQUENCE college_admissions_stats_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.college_admissions_stats_id_seq TO anon;
GRANT ALL ON SEQUENCE public.college_admissions_stats_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.college_admissions_stats_id_seq TO service_role;


--
-- Name: TABLE college_data_contributions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.college_data_contributions TO anon;
GRANT ALL ON TABLE public.college_data_contributions TO authenticated;
GRANT ALL ON TABLE public.college_data_contributions TO service_role;


--
-- Name: SEQUENCE college_data_contributions_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.college_data_contributions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.college_data_contributions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.college_data_contributions_id_seq TO service_role;


--
-- Name: TABLE college_deadlines; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.college_deadlines TO anon;
GRANT ALL ON TABLE public.college_deadlines TO authenticated;
GRANT ALL ON TABLE public.college_deadlines TO service_role;


--
-- Name: SEQUENCE college_deadlines_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.college_deadlines_id_seq TO anon;
GRANT ALL ON SEQUENCE public.college_deadlines_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.college_deadlines_id_seq TO service_role;


--
-- Name: TABLE college_financial_aid; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.college_financial_aid TO anon;
GRANT ALL ON TABLE public.college_financial_aid TO authenticated;
GRANT ALL ON TABLE public.college_financial_aid TO service_role;


--
-- Name: SEQUENCE college_financial_aid_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.college_financial_aid_id_seq TO anon;
GRANT ALL ON SEQUENCE public.college_financial_aid_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.college_financial_aid_id_seq TO service_role;


--
-- Name: TABLE college_financial_data; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.college_financial_data TO anon;
GRANT ALL ON TABLE public.college_financial_data TO authenticated;
GRANT ALL ON TABLE public.college_financial_data TO service_role;


--
-- Name: SEQUENCE college_financial_data_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.college_financial_data_id_seq TO anon;
GRANT ALL ON SEQUENCE public.college_financial_data_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.college_financial_data_id_seq TO service_role;


--
-- Name: TABLE college_insights; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.college_insights TO anon;
GRANT ALL ON TABLE public.college_insights TO authenticated;
GRANT ALL ON TABLE public.college_insights TO service_role;


--
-- Name: SEQUENCE college_insights_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.college_insights_id_seq TO anon;
GRANT ALL ON SEQUENCE public.college_insights_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.college_insights_id_seq TO service_role;


--
-- Name: TABLE college_majors; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.college_majors TO anon;
GRANT ALL ON TABLE public.college_majors TO authenticated;
GRANT ALL ON TABLE public.college_majors TO service_role;


--
-- Name: TABLE college_programs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.college_programs TO anon;
GRANT ALL ON TABLE public.college_programs TO authenticated;
GRANT ALL ON TABLE public.college_programs TO service_role;


--
-- Name: SEQUENCE college_programs_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.college_programs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.college_programs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.college_programs_id_seq TO service_role;


--
-- Name: TABLE college_rankings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.college_rankings TO anon;
GRANT ALL ON TABLE public.college_rankings TO authenticated;
GRANT ALL ON TABLE public.college_rankings TO service_role;


--
-- Name: SEQUENCE college_rankings_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.college_rankings_id_seq TO anon;
GRANT ALL ON SEQUENCE public.college_rankings_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.college_rankings_id_seq TO service_role;


--
-- Name: TABLE college_requirements; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.college_requirements TO anon;
GRANT ALL ON TABLE public.college_requirements TO authenticated;
GRANT ALL ON TABLE public.college_requirements TO service_role;


--
-- Name: SEQUENCE college_requirements_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.college_requirements_id_seq TO anon;
GRANT ALL ON SEQUENCE public.college_requirements_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.college_requirements_id_seq TO service_role;


--
-- Name: TABLE colleges; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.colleges TO anon;
GRANT ALL ON TABLE public.colleges TO authenticated;
GRANT ALL ON TABLE public.colleges TO service_role;


--
-- Name: TABLE colleges_canonical; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.colleges_canonical TO anon;
GRANT ALL ON TABLE public.colleges_canonical TO authenticated;
GRANT ALL ON TABLE public.colleges_canonical TO service_role;


--
-- Name: SEQUENCE colleges_comprehensive_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.colleges_comprehensive_id_seq TO anon;
GRANT ALL ON SEQUENCE public.colleges_comprehensive_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.colleges_comprehensive_id_seq TO service_role;


--
-- Name: TABLE colleges_full; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.colleges_full TO anon;
GRANT ALL ON TABLE public.colleges_full TO authenticated;
GRANT ALL ON TABLE public.colleges_full TO service_role;


--
-- Name: TABLE colleges_legacy; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.colleges_legacy TO anon;
GRANT ALL ON TABLE public.colleges_legacy TO authenticated;
GRANT ALL ON TABLE public.colleges_legacy TO service_role;


--
-- Name: SEQUENCE colleges_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.colleges_id_seq TO anon;
GRANT ALL ON SEQUENCE public.colleges_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.colleges_id_seq TO service_role;


--
-- Name: SEQUENCE colleges_new_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.colleges_new_id_seq TO anon;
GRANT ALL ON SEQUENCE public.colleges_new_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.colleges_new_id_seq TO service_role;


--
-- Name: TABLE colleges_public; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.colleges_public TO anon;
GRANT ALL ON TABLE public.colleges_public TO authenticated;
GRANT ALL ON TABLE public.colleges_public TO service_role;


--
-- Name: TABLE cost_of_attendance; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.cost_of_attendance TO anon;
GRANT ALL ON TABLE public.cost_of_attendance TO authenticated;
GRANT ALL ON TABLE public.cost_of_attendance TO service_role;


--
-- Name: SEQUENCE cost_of_attendance_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.cost_of_attendance_id_seq TO anon;
GRANT ALL ON SEQUENCE public.cost_of_attendance_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.cost_of_attendance_id_seq TO service_role;


--
-- Name: TABLE currency_rates; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.currency_rates TO anon;
GRANT ALL ON TABLE public.currency_rates TO authenticated;
GRANT ALL ON TABLE public.currency_rates TO service_role;


--
-- Name: SEQUENCE currency_rates_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.currency_rates_id_seq TO anon;
GRANT ALL ON SEQUENCE public.currency_rates_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.currency_rates_id_seq TO service_role;


--
-- Name: TABLE deadline_alerts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.deadline_alerts TO anon;
GRANT ALL ON TABLE public.deadline_alerts TO authenticated;
GRANT ALL ON TABLE public.deadline_alerts TO service_role;


--
-- Name: SEQUENCE deadline_alerts_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.deadline_alerts_id_seq TO anon;
GRANT ALL ON SEQUENCE public.deadline_alerts_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.deadline_alerts_id_seq TO service_role;


--
-- Name: TABLE deadline_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.deadline_history TO anon;
GRANT ALL ON TABLE public.deadline_history TO authenticated;
GRANT ALL ON TABLE public.deadline_history TO service_role;


--
-- Name: SEQUENCE deadline_history_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.deadline_history_id_seq TO anon;
GRANT ALL ON SEQUENCE public.deadline_history_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.deadline_history_id_seq TO service_role;


--
-- Name: TABLE deadlines; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.deadlines TO anon;
GRANT ALL ON TABLE public.deadlines TO authenticated;
GRANT ALL ON TABLE public.deadlines TO service_role;


--
-- Name: SEQUENCE deadlines_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.deadlines_id_seq TO anon;
GRANT ALL ON SEQUENCE public.deadlines_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.deadlines_id_seq TO service_role;


--
-- Name: TABLE documents; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.documents TO anon;
GRANT ALL ON TABLE public.documents TO authenticated;
GRANT ALL ON TABLE public.documents TO service_role;


--
-- Name: SEQUENCE documents_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.documents_id_seq TO anon;
GRANT ALL ON SEQUENCE public.documents_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.documents_id_seq TO service_role;


--
-- Name: TABLE essays; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.essays TO anon;
GRANT ALL ON TABLE public.essays TO authenticated;
GRANT ALL ON TABLE public.essays TO service_role;


--
-- Name: SEQUENCE essays_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.essays_id_seq TO anon;
GRANT ALL ON SEQUENCE public.essays_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.essays_id_seq TO service_role;


--
-- Name: TABLE financing_options; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.financing_options TO anon;
GRANT ALL ON TABLE public.financing_options TO authenticated;
GRANT ALL ON TABLE public.financing_options TO service_role;


--
-- Name: SEQUENCE financing_options_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.financing_options_id_seq TO anon;
GRANT ALL ON SEQUENCE public.financing_options_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.financing_options_id_seq TO service_role;


--
-- Name: TABLE government_loans; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.government_loans TO anon;
GRANT ALL ON TABLE public.government_loans TO authenticated;
GRANT ALL ON TABLE public.government_loans TO service_role;


--
-- Name: TABLE grants; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.grants TO anon;
GRANT ALL ON TABLE public.grants TO authenticated;
GRANT ALL ON TABLE public.grants TO service_role;


--
-- Name: TABLE login_attempts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.login_attempts TO anon;
GRANT ALL ON TABLE public.login_attempts TO authenticated;
GRANT ALL ON TABLE public.login_attempts TO service_role;


--
-- Name: TABLE majors; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.majors TO anon;
GRANT ALL ON TABLE public.majors TO authenticated;
GRANT ALL ON TABLE public.majors TO service_role;


--
-- Name: SEQUENCE majors_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.majors_id_seq TO anon;
GRANT ALL ON SEQUENCE public.majors_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.majors_id_seq TO service_role;


--
-- Name: TABLE masters_application_documents; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.masters_application_documents TO anon;
GRANT ALL ON TABLE public.masters_application_documents TO authenticated;
GRANT ALL ON TABLE public.masters_application_documents TO service_role;


--
-- Name: SEQUENCE masters_application_documents_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.masters_application_documents_id_seq TO anon;
GRANT ALL ON SEQUENCE public.masters_application_documents_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.masters_application_documents_id_seq TO service_role;


--
-- Name: TABLE masters_application_recommenders; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.masters_application_recommenders TO anon;
GRANT ALL ON TABLE public.masters_application_recommenders TO authenticated;
GRANT ALL ON TABLE public.masters_application_recommenders TO service_role;


--
-- Name: SEQUENCE masters_application_recommenders_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.masters_application_recommenders_id_seq TO anon;
GRANT ALL ON SEQUENCE public.masters_application_recommenders_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.masters_application_recommenders_id_seq TO service_role;


--
-- Name: TABLE masters_applications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.masters_applications TO anon;
GRANT ALL ON TABLE public.masters_applications TO authenticated;
GRANT ALL ON TABLE public.masters_applications TO service_role;


--
-- Name: SEQUENCE masters_applications_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.masters_applications_id_seq TO anon;
GRANT ALL ON SEQUENCE public.masters_applications_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.masters_applications_id_seq TO service_role;


--
-- Name: TABLE masters_profile; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.masters_profile TO anon;
GRANT ALL ON TABLE public.masters_profile TO authenticated;
GRANT ALL ON TABLE public.masters_profile TO service_role;


--
-- Name: SEQUENCE masters_profile_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.masters_profile_id_seq TO anon;
GRANT ALL ON SEQUENCE public.masters_profile_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.masters_profile_id_seq TO service_role;


--
-- Name: TABLE migrations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.migrations TO anon;
GRANT ALL ON TABLE public.migrations TO authenticated;
GRANT ALL ON TABLE public.migrations TO service_role;


--
-- Name: SEQUENCE migrations_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.migrations_id_seq TO anon;
GRANT ALL ON SEQUENCE public.migrations_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.migrations_id_seq TO service_role;


--
-- Name: TABLE ml_metadata; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ml_metadata TO anon;
GRANT ALL ON TABLE public.ml_metadata TO authenticated;
GRANT ALL ON TABLE public.ml_metadata TO service_role;


--
-- Name: SEQUENCE ml_metadata_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.ml_metadata_id_seq TO anon;
GRANT ALL ON SEQUENCE public.ml_metadata_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.ml_metadata_id_seq TO service_role;


--
-- Name: TABLE ml_training_data; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ml_training_data TO anon;
GRANT ALL ON TABLE public.ml_training_data TO authenticated;
GRANT ALL ON TABLE public.ml_training_data TO service_role;


--
-- Name: SEQUENCE ml_training_data_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.ml_training_data_id_seq TO anon;
GRANT ALL ON SEQUENCE public.ml_training_data_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.ml_training_data_id_seq TO service_role;


--
-- Name: TABLE model_training_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.model_training_history TO anon;
GRANT ALL ON TABLE public.model_training_history TO authenticated;
GRANT ALL ON TABLE public.model_training_history TO service_role;


--
-- Name: SEQUENCE model_training_history_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.model_training_history_id_seq TO anon;
GRANT ALL ON SEQUENCE public.model_training_history_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.model_training_history_id_seq TO service_role;


--
-- Name: TABLE mv_college_cards; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.mv_college_cards TO anon;
GRANT ALL ON TABLE public.mv_college_cards TO authenticated;
GRANT ALL ON TABLE public.mv_college_cards TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: SEQUENCE notifications_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.notifications_id_seq TO anon;
GRANT ALL ON SEQUENCE public.notifications_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.notifications_id_seq TO service_role;


--
-- Name: TABLE prediction_audit_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.prediction_audit_log TO anon;
GRANT ALL ON TABLE public.prediction_audit_log TO authenticated;
GRANT ALL ON TABLE public.prediction_audit_log TO service_role;


--
-- Name: SEQUENCE prediction_audit_log_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.prediction_audit_log_id_seq TO anon;
GRANT ALL ON SEQUENCE public.prediction_audit_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.prediction_audit_log_id_seq TO service_role;


--
-- Name: TABLE prediction_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.prediction_logs TO anon;
GRANT ALL ON TABLE public.prediction_logs TO authenticated;
GRANT ALL ON TABLE public.prediction_logs TO service_role;


--
-- Name: SEQUENCE prediction_logs_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.prediction_logs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.prediction_logs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.prediction_logs_id_seq TO service_role;


--
-- Name: TABLE private_loans; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.private_loans TO anon;
GRANT ALL ON TABLE public.private_loans TO authenticated;
GRANT ALL ON TABLE public.private_loans TO service_role;


--
-- Name: TABLE recommendation_requests; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.recommendation_requests TO anon;
GRANT ALL ON TABLE public.recommendation_requests TO authenticated;
GRANT ALL ON TABLE public.recommendation_requests TO service_role;


--
-- Name: SEQUENCE recommendation_requests_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.recommendation_requests_id_seq TO anon;
GRANT ALL ON SEQUENCE public.recommendation_requests_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.recommendation_requests_id_seq TO service_role;


--
-- Name: TABLE recommenders; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.recommenders TO anon;
GRANT ALL ON TABLE public.recommenders TO authenticated;
GRANT ALL ON TABLE public.recommenders TO service_role;


--
-- Name: SEQUENCE recommenders_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.recommenders_id_seq TO anon;
GRANT ALL ON SEQUENCE public.recommenders_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.recommenders_id_seq TO service_role;


--
-- Name: TABLE refresh_tokens; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.refresh_tokens TO anon;
GRANT ALL ON TABLE public.refresh_tokens TO authenticated;
GRANT ALL ON TABLE public.refresh_tokens TO service_role;


--
-- Name: SEQUENCE refresh_tokens_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.refresh_tokens_id_seq TO anon;
GRANT ALL ON SEQUENCE public.refresh_tokens_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.refresh_tokens_id_seq TO service_role;


--
-- Name: TABLE requested_colleges; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.requested_colleges TO anon;
GRANT ALL ON TABLE public.requested_colleges TO authenticated;
GRANT ALL ON TABLE public.requested_colleges TO service_role;


--
-- Name: SEQUENCE requested_colleges_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.requested_colleges_id_seq TO anon;
GRANT ALL ON SEQUENCE public.requested_colleges_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.requested_colleges_id_seq TO service_role;


--
-- Name: TABLE scholarships; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.scholarships TO anon;
GRANT ALL ON TABLE public.scholarships TO authenticated;
GRANT ALL ON TABLE public.scholarships TO service_role;


--
-- Name: SEQUENCE scholarships_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.scholarships_id_seq TO anon;
GRANT ALL ON SEQUENCE public.scholarships_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.scholarships_id_seq TO service_role;


--
-- Name: TABLE scraped_applicants; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.scraped_applicants TO anon;
GRANT ALL ON TABLE public.scraped_applicants TO authenticated;
GRANT ALL ON TABLE public.scraped_applicants TO service_role;


--
-- Name: SEQUENCE scraped_applicants_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.scraped_applicants_id_seq TO anon;
GRANT ALL ON SEQUENCE public.scraped_applicants_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.scraped_applicants_id_seq TO service_role;


--
-- Name: TABLE scraped_results; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.scraped_results TO anon;
GRANT ALL ON TABLE public.scraped_results TO authenticated;
GRANT ALL ON TABLE public.scraped_results TO service_role;


--
-- Name: SEQUENCE scraped_results_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.scraped_results_id_seq TO anon;
GRANT ALL ON SEQUENCE public.scraped_results_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.scraped_results_id_seq TO service_role;


--
-- Name: TABLE scraper_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.scraper_logs TO anon;
GRANT ALL ON TABLE public.scraper_logs TO authenticated;
GRANT ALL ON TABLE public.scraper_logs TO service_role;


--
-- Name: SEQUENCE scraper_logs_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.scraper_logs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.scraper_logs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.scraper_logs_id_seq TO service_role;


--
-- Name: TABLE scraper_run_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.scraper_run_logs TO anon;
GRANT ALL ON TABLE public.scraper_run_logs TO authenticated;
GRANT ALL ON TABLE public.scraper_run_logs TO service_role;


--
-- Name: SEQUENCE scraper_run_logs_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.scraper_run_logs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.scraper_run_logs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.scraper_run_logs_id_seq TO service_role;


--
-- Name: TABLE student_activities; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.student_activities TO anon;
GRANT ALL ON TABLE public.student_activities TO authenticated;
GRANT ALL ON TABLE public.student_activities TO service_role;


--
-- Name: SEQUENCE student_activities_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.student_activities_id_seq TO anon;
GRANT ALL ON SEQUENCE public.student_activities_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.student_activities_id_seq TO service_role;


--
-- Name: TABLE student_awards; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.student_awards TO anon;
GRANT ALL ON TABLE public.student_awards TO authenticated;
GRANT ALL ON TABLE public.student_awards TO service_role;


--
-- Name: SEQUENCE student_awards_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.student_awards_id_seq TO anon;
GRANT ALL ON SEQUENCE public.student_awards_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.student_awards_id_seq TO service_role;


--
-- Name: TABLE student_coursework; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.student_coursework TO anon;
GRANT ALL ON TABLE public.student_coursework TO authenticated;
GRANT ALL ON TABLE public.student_coursework TO service_role;


--
-- Name: SEQUENCE student_coursework_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.student_coursework_id_seq TO anon;
GRANT ALL ON SEQUENCE public.student_coursework_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.student_coursework_id_seq TO service_role;


--
-- Name: TABLE student_demographics; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.student_demographics TO anon;
GRANT ALL ON TABLE public.student_demographics TO authenticated;
GRANT ALL ON TABLE public.student_demographics TO service_role;


--
-- Name: SEQUENCE student_demographics_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.student_demographics_id_seq TO anon;
GRANT ALL ON SEQUENCE public.student_demographics_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.student_demographics_id_seq TO service_role;


--
-- Name: TABLE student_profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.student_profiles TO anon;
GRANT ALL ON TABLE public.student_profiles TO authenticated;
GRANT ALL ON TABLE public.student_profiles TO service_role;


--
-- Name: SEQUENCE student_profiles_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.student_profiles_id_seq TO anon;
GRANT ALL ON SEQUENCE public.student_profiles_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.student_profiles_id_seq TO service_role;


--
-- Name: TABLE tasks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tasks TO anon;
GRANT ALL ON TABLE public.tasks TO authenticated;
GRANT ALL ON TABLE public.tasks TO service_role;


--
-- Name: SEQUENCE tasks_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.tasks_id_seq TO anon;
GRANT ALL ON SEQUENCE public.tasks_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tasks_id_seq TO service_role;


--
-- Name: TABLE timeline_actions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.timeline_actions TO anon;
GRANT ALL ON TABLE public.timeline_actions TO authenticated;
GRANT ALL ON TABLE public.timeline_actions TO service_role;


--
-- Name: SEQUENCE timeline_actions_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.timeline_actions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.timeline_actions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.timeline_actions_id_seq TO service_role;


--
-- Name: TABLE user_deadlines; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_deadlines TO anon;
GRANT ALL ON TABLE public.user_deadlines TO authenticated;
GRANT ALL ON TABLE public.user_deadlines TO service_role;


--
-- Name: SEQUENCE user_deadlines_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.user_deadlines_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_deadlines_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_deadlines_id_seq TO service_role;


--
-- Name: TABLE user_financial_profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_financial_profiles TO anon;
GRANT ALL ON TABLE public.user_financial_profiles TO authenticated;
GRANT ALL ON TABLE public.user_financial_profiles TO service_role;


--
-- Name: SEQUENCE user_financial_profiles_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.user_financial_profiles_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_financial_profiles_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_financial_profiles_id_seq TO service_role;


--
-- Name: TABLE user_ml_stats; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_ml_stats TO anon;
GRANT ALL ON TABLE public.user_ml_stats TO authenticated;
GRANT ALL ON TABLE public.user_ml_stats TO service_role;


--
-- Name: SEQUENCE user_ml_stats_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.user_ml_stats_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_ml_stats_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_ml_stats_id_seq TO service_role;


--
-- Name: TABLE user_outcome_contributions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_outcome_contributions TO anon;
GRANT ALL ON TABLE public.user_outcome_contributions TO authenticated;
GRANT ALL ON TABLE public.user_outcome_contributions TO service_role;


--
-- Name: SEQUENCE user_outcome_contributions_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.user_outcome_contributions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_outcome_contributions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_outcome_contributions_id_seq TO service_role;


--
-- Name: TABLE user_profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_profiles TO anon;
GRANT ALL ON TABLE public.user_profiles TO authenticated;
GRANT ALL ON TABLE public.user_profiles TO service_role;


--
-- Name: SEQUENCE user_profiles_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.user_profiles_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_profiles_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_profiles_id_seq TO service_role;


--
-- Name: TABLE user_scholarships; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_scholarships TO anon;
GRANT ALL ON TABLE public.user_scholarships TO authenticated;
GRANT ALL ON TABLE public.user_scholarships TO service_role;


--
-- Name: SEQUENCE user_scholarships_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.user_scholarships_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_scholarships_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_scholarships_id_seq TO service_role;


--
-- Name: TABLE user_signals; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_signals TO anon;
GRANT ALL ON TABLE public.user_signals TO authenticated;
GRANT ALL ON TABLE public.user_signals TO service_role;


--
-- Name: SEQUENCE user_signals_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.user_signals_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_signals_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_signals_id_seq TO service_role;


--
-- Name: TABLE user_suggestions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_suggestions TO anon;
GRANT ALL ON TABLE public.user_suggestions TO authenticated;
GRANT ALL ON TABLE public.user_suggestions TO service_role;


--
-- Name: SEQUENCE user_suggestions_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.user_suggestions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_suggestions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_suggestions_id_seq TO service_role;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.users TO anon;
GRANT ALL ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;


--
-- Name: SEQUENCE users_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.users_id_seq TO anon;
GRANT ALL ON SEQUENCE public.users_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.users_id_seq TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: canonical; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA canonical GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA canonical GRANT SELECT ON TABLES TO authenticated;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict fKFMcgMbiZavouT1lwLfXvd6ICP5nR0rU4gIc0miN5xJ21W3cz4kexaqugBIKKU


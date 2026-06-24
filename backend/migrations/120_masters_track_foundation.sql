-- 120_masters_track_foundation.sql
-- Masters / Graduate track — foundational schema (Phase 1 of docs/MASTERS_TRACK_PLAN.md).
--
-- WHY: CollegeOS is undergrad-only. This migration makes the database able to
-- represent a masters applicant (MS/MA/MBA — no PhD) and a masters program WITHOUT
-- touching any existing undergrad row, per the Performance Isolation contract:
--
--   * Masters REFERENCE data (programs / pathways / deadlines / applicant datapoints)
--     lives in the `canonical.*` schema with UUID PKs, mirroring
--     canonical.institution_placements (mig 119). Card reads go through a dedicated
--     materialized view `canonical.mv_masters_program_cards` — never mv_college_cards.
--   * Masters USER data (profile, applications) lives in `public.*` with INTEGER PKs
--     and INTEGER FKs to public.users, mirroring public.recommenders (mig 112) and
--     public.documents (mig 110).
--
-- The ONLY change to an existing undergrad table is an additive, NOT NULL DEFAULT
-- 'undergraduate' column on public.users — so every existing row is explicitly
-- 'undergraduate' the moment this runs (no nullable/unset track can fall through
-- track-specific logic). Verification query for Phase 7:
--   SELECT program_track, COUNT(*) FROM public.users GROUP BY program_track;
--
-- 'transfer' is a reserved enum slot only — no transfer tables are created this round.
-- Native BOOLEAN / JSONB / CHECK constraints are used deliberately for these new,
-- isolated tables (the consuming frontend code is all new, so the legacy `= 1`
-- integer-boolean convention never reaches them; this also satisfies the "narrow
-- projections, not JSON blobs" isolation rule).

CREATE SCHEMA IF NOT EXISTS canonical;

-- ---------------------------------------------------------------------------
-- 1) Track discriminator + university-enrollment state on the identity table
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS program_track TEXT NOT NULL DEFAULT 'undergraduate';

DO $$ BEGIN
  ALTER TABLE public.users
    ADD CONSTRAINT users_program_track_chk
    CHECK (program_track IN ('undergraduate','masters','transfer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS university_enrollment_status TEXT;

DO $$ BEGIN
  ALTER TABLE public.users
    ADD CONSTRAINT users_enrollment_status_chk
    CHECK (university_enrollment_status IS NULL OR university_enrollment_status IN
      ('not_enrolled','enrolled_yr1_2','enrolled_yr3_4'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS current_year_of_study INTEGER;

DO $$ BEGIN
  ALTER TABLE public.users
    ADD CONSTRAINT users_current_year_of_study_chk
    CHECK (current_year_of_study IS NULL OR current_year_of_study BETWEEN 1 AND 6);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2) masters_profile — 1:1 with user (public schema, INTEGER FK to users)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.masters_profile (
  id                       BIGSERIAL PRIMARY KEY,
  user_id                  INTEGER NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  target_degree_type       TEXT CHECK (target_degree_type IS NULL OR target_degree_type IN ('MS','MA','MBA')),
  intended_program         TEXT,
  intended_specialization  TEXT,
  -- GRE (nullable — many programs now waive it)
  gre_verbal               INTEGER,
  gre_quant                INTEGER,
  gre_awa                  NUMERIC(2,1),
  -- GMAT: classic (/800) and Focus Edition (/805) are NOT comparable — separate columns
  gmat_total               INTEGER,
  gmat_focus_total         INTEGER,
  -- English proficiency (still required for international masters applicants)
  toefl_score              INTEGER,
  ielts_score              NUMERIC(2,1),
  duolingo_score           INTEGER,
  pte_score                INTEGER,
  -- Undergrad record
  undergrad_gpa            NUMERIC(5,2),
  undergrad_gpa_scale      NUMERIC(5,2),   -- 4.0 / 10.0 / 100
  undergrad_institution    TEXT,
  undergrad_major          TEXT,
  undergrad_country        TEXT,
  -- Research / work
  research_experience      TEXT,
  publication_count        INTEGER DEFAULT 0,
  work_experience_years    NUMERIC(4,1) DEFAULT 0,
  work_experience_desc     TEXT,
  -- Application artifacts
  sop_status               TEXT CHECK (sop_status IS NULL OR sop_status IN ('not_started','drafting','reviewing','final')),
  lors_secured             INTEGER DEFAULT 0,
  lors_required            INTEGER,
  -- Targets
  target_intake_term       TEXT CHECK (target_intake_term IS NULL OR target_intake_term IN ('fall','spring','summer','winter')),
  target_intake_year       INTEGER,
  target_countries         JSONB DEFAULT '[]'::jsonb,
  profile_version          INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_masters_profile_user ON public.masters_profile(user_id);

-- ---------------------------------------------------------------------------
-- 3) masters_programs — program-level (canonical schema, UUID), separate from colleges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS canonical.masters_programs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_institution_id UUID REFERENCES canonical.institutions(id) ON DELETE SET NULL,
  institution_name         TEXT NOT NULL,   -- denormalized so card queries never join colleges
  institution_country      TEXT NOT NULL,   -- US | UK | CA | DE | NL | AU | SG | ...
  city                     TEXT,
  department               TEXT,
  program_name             TEXT NOT NULL,
  degree_type              TEXT NOT NULL CHECK (degree_type IN ('MS','MA','MBA')),
  specialization           TEXT,
  cip_code                 TEXT,            -- join key for Scorecard Field-of-Study ROI + STEM
  is_stem_designated       BOOLEAN,         -- 24-month OPT (US) — top international factor
  language_of_instruction  JSONB DEFAULT '["English"]'::jsonb,  -- DE/NL programs vary
  intake_term              TEXT,
  intake_year              INTEGER,
  -- Test policy
  gre_requirement          TEXT CHECK (gre_requirement IS NULL OR gre_requirement IN ('required','optional','waived','not_accepted','unknown')),
  gmat_requirement         TEXT CHECK (gmat_requirement IS NULL OR gmat_requirement IN ('required','optional','waived','not_accepted','unknown')),
  min_gpa                  NUMERIC(5,2),
  min_gpa_scale            NUMERIC(5,2),
  min_toefl                INTEGER,
  min_ielts                NUMERIC(2,1),
  -- Funding (captured in data even though v1 does NOT model funding likelihood)
  funding_availability     TEXT CHECK (funding_availability IS NULL OR funding_availability IN ('fully_funded','partial','unfunded','varies','unknown')),
  assistantship_types      JSONB DEFAULT '[]'::jsonb,   -- ["TA","RA","GA"]
  tuition_waiver_available BOOLEAN,
  -- Cost + ROI
  tuition_total            NUMERIC(12,2),
  tuition_currency         TEXT,
  program_length_months    INTEGER,
  median_earnings          NUMERIC(12,2),
  median_debt              NUMERIC(12,2),
  roi_source               TEXT,
  -- Provenance / freshness
  program_url              TEXT,
  data_source              TEXT,
  data_quality_score       NUMERIC(4,2),
  last_scraped_at          TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (canonical_institution_id, program_name, degree_type, intake_term, intake_year)
);

CREATE INDEX IF NOT EXISTS idx_masters_programs_inst    ON canonical.masters_programs(canonical_institution_id);
CREATE INDEX IF NOT EXISTS idx_masters_programs_country ON canonical.masters_programs(institution_country);
CREATE INDEX IF NOT EXISTS idx_masters_programs_degree  ON canonical.masters_programs(degree_type);
CREATE INDEX IF NOT EXISTS idx_masters_programs_cip     ON canonical.masters_programs(cip_code);

-- ---------------------------------------------------------------------------
-- 4) masters_program_deadlines — one program -> many (priority/final/funding/rolling/rounds)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS canonical.masters_program_deadlines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  masters_program_id UUID NOT NULL REFERENCES canonical.masters_programs(id) ON DELETE CASCADE,
  deadline_type      TEXT NOT NULL CHECK (deadline_type IN
    ('priority','final','funding_consideration','round_1','round_2','round_3','rolling')),
  deadline_date      DATE,
  is_rolling         BOOLEAN DEFAULT FALSE,
  intake_term        TEXT,
  intake_year        INTEGER,
  notes              TEXT,
  source_url         TEXT,
  scraped_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_masters_deadlines_program ON canonical.masters_program_deadlines(masters_program_id);

-- ---------------------------------------------------------------------------
-- 5) masters_program_pathways — one program -> many named admission pathways.
--    This is the core deliverable: "how does THIS program admit vs that one".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS canonical.masters_program_pathways (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  masters_program_id UUID NOT NULL REFERENCES canonical.masters_programs(id) ON DELETE CASCADE,
  pathway_type       TEXT NOT NULL CHECK (pathway_type IN (
                       'standard_test_based','test_waived_holistic','work_experience_substitution',
                       'portfolio_based','bridge_certificate','conditional_admission',
                       'executive_part_time','direct_entry_no_test')),
  description        TEXT NOT NULL,                 -- how this pathway actually works here
  weighted_fields   JSONB DEFAULT '[]'::jsonb,      -- which masters_profile fields it weighs
  min_requirements  JSONB DEFAULT '{}'::jsonb,      -- narrow structured per-pathway minimums
  confidence        NUMERIC(3,2),
  source_url        TEXT,
  scraped_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_masters_pathways_program ON canonical.masters_program_pathways(masters_program_id);
CREATE INDEX IF NOT EXISTS idx_masters_pathways_type    ON canonical.masters_program_pathways(pathway_type);

-- ---------------------------------------------------------------------------
-- 6) masters_admission_datapoints — GradCafe self-reports + our own captured
--    outcomes. NEVER presented as "acceptance rate"; sample size = COUNT(*).
--    'our_user' rows are the outcome-capture loop that enables a future v2 model.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS canonical.masters_admission_datapoints (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  masters_program_id UUID REFERENCES canonical.masters_programs(id) ON DELETE CASCADE,
  source             TEXT NOT NULL CHECK (source IN ('gradcafe','self_reported','our_user')),
  gre_verbal         INTEGER,
  gre_quant          INTEGER,
  gre_awa            NUMERIC(2,1),
  gmat_total         INTEGER,
  gpa                NUMERIC(5,2),
  gpa_scale          NUMERIC(5,2),
  decision           TEXT CHECK (decision IS NULL OR decision IN ('admit','reject','waitlist','interview','unknown')),
  decision_date      DATE,
  intake_term        TEXT,
  intake_year        INTEGER,
  raw_program_name   TEXT,            -- original free-text program name before fuzzy match
  match_confidence   NUMERIC(3,2),    -- confidence of the fuzzy join to masters_programs
  scraped_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_masters_datapoints_program ON canonical.masters_admission_datapoints(masters_program_id);
CREATE INDEX IF NOT EXISTS idx_masters_datapoints_source  ON canonical.masters_admission_datapoints(source);

-- ---------------------------------------------------------------------------
-- 7) masters_applications — tracker (public schema, user data).
--    decision_outcome feeds the Phase 5 v2 outcome loop.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.masters_applications (
  id                 BIGSERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  masters_program_id UUID NOT NULL REFERENCES canonical.masters_programs(id) ON DELETE CASCADE,
  status             TEXT,
  intake_term        TEXT,
  intake_year        INTEGER,
  priority           TEXT,
  notes              TEXT,
  decision_outcome   TEXT CHECK (decision_outcome IS NULL OR decision_outcome IN
                       ('admitted','rejected','waitlisted','interview','withdrawn','pending')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, masters_program_id)
);

CREATE INDEX IF NOT EXISTS idx_masters_applications_user    ON public.masters_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_masters_applications_program ON public.masters_applications(masters_program_id);

-- ---------------------------------------------------------------------------
-- 8) mv_masters_program_cards — narrow card projection, own MV/own indexes.
--    Refreshed on its own cadence by materializedViewManager (wired in Phase 4).
--    Has a UNIQUE index on id so REFRESH MATERIALIZED VIEW CONCURRENTLY works.
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS canonical.mv_masters_program_cards AS
SELECT
  p.id,
  p.institution_name,
  p.institution_country,
  p.city,
  p.program_name,
  p.degree_type,
  p.specialization,
  p.is_stem_designated,
  p.gre_requirement,
  p.gmat_requirement,
  p.funding_availability,
  p.tuition_total,
  p.tuition_currency,
  p.program_length_months,
  p.median_earnings,
  p.median_debt,
  p.data_quality_score,
  p.last_scraped_at,
  (SELECT COUNT(*) FROM canonical.masters_program_pathways pw     WHERE pw.masters_program_id = p.id) AS pathway_count,
  (SELECT COUNT(*) FROM canonical.masters_admission_datapoints dp WHERE dp.masters_program_id = p.id) AS datapoint_count
FROM canonical.masters_programs p;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_masters_cards_id      ON canonical.mv_masters_program_cards(id);
CREATE INDEX        IF NOT EXISTS idx_mv_masters_cards_country ON canonical.mv_masters_program_cards(institution_country);
CREATE INDEX        IF NOT EXISTS idx_mv_masters_cards_degree  ON canonical.mv_masters_program_cards(degree_type);

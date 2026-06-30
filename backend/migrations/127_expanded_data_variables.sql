-- 127_expanded_data_variables.sql
--
-- Adds the comprehensive set of undergrad + masters variables requested in the
-- product spec.  All changes are purely ADDITIVE (ADD COLUMN IF NOT EXISTS) so
-- this migration is safe to apply against an existing live database.
--
-- Undergrad additions go into canonical.institution_* tables which are already
-- joined by the MV refresh.  The MV (canonical.mv_college_cards) is rebuilt at
-- the end to expose the new columns to the frontend contract.
--
-- Masters additions go into canonical.masters_programs (already exists).
--
-- Section map:
--   A.  canonical.institutions         — university-level identity + derived scores
--   B.  canonical.institution_admissions — full admissions variables
--   C.  canonical.institution_financials — full cost + aid variables
--   D.  canonical.institution_outcomes  — career + grad-school outcomes
--   E.  canonical.institution_campus_life — student life
--   F.  canonical.institution_rankings  — additional ranking sources
--   G.  canonical.masters_programs     — expanded grad variables
--   H.  canonical.masters_programs     — pathways (moat) + research + immigration
--   I.  Refresh mv_college_cards

-- ============================================================================
-- A. canonical.institutions — university identity + derived scores
-- ============================================================================

ALTER TABLE canonical.institutions
  ADD COLUMN IF NOT EXISTS founded_year            INTEGER,
  ADD COLUMN IF NOT EXISTS campus_type             TEXT,          -- urban | suburban | rural
  ADD COLUMN IF NOT EXISTS campus_size_acres       NUMERIC(10,1),
  ADD COLUMN IF NOT EXISTS total_enrollment        INTEGER,
  ADD COLUMN IF NOT EXISTS undergraduate_enrollment INTEGER,
  ADD COLUMN IF NOT EXISTS international_enrollment INTEGER,
  ADD COLUMN IF NOT EXISTS international_pct       NUMERIC(5,2),  -- 0–100
  ADD COLUMN IF NOT EXISTS faculty_count           INTEGER,
  ADD COLUMN IF NOT EXISTS student_faculty_ratio   NUMERIC(5,1),  -- e.g. 10.5 (students per faculty)
  ADD COLUMN IF NOT EXISTS endowment_usd           NUMERIC(16,0), -- total endowment USD
  ADD COLUMN IF NOT EXISTS research_expenditure_usd NUMERIC(16,0),
  ADD COLUMN IF NOT EXISTS latitude                NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS longitude               NUMERIC(9,6),
  -- Derived / composite scores (0–100 unless noted)
  ADD COLUMN IF NOT EXISTS prestige_score          NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS academic_reputation_score NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS employer_reputation_score NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS safety_score            NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS diversity_score         NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS walkability_score       NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS public_transport_score  NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS weather_score           NUMERIC(5,1),  -- higher = better (warm/mild)
  ADD COLUMN IF NOT EXISTS campus_fit_score        NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS student_happiness_score NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS risk_score              NUMERIC(5,1);  -- lower = lower risk

-- ============================================================================
-- B. canonical.institution_admissions — full admissions picture
-- ============================================================================

ALTER TABLE canonical.institution_admissions
  ADD COLUMN IF NOT EXISTS ed_acceptance_rate      NUMERIC(5,4),  -- Early Decision
  ADD COLUMN IF NOT EXISTS ea_acceptance_rate      NUMERIC(5,4),  -- Early Action
  ADD COLUMN IF NOT EXISTS transfer_acceptance_rate NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS international_acceptance_rate NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS yield_rate              NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS applied_count           INTEGER,
  ADD COLUMN IF NOT EXISTS admitted_count          INTEGER,
  ADD COLUMN IF NOT EXISTS enrolled_count          INTEGER,
  -- SAT percentiles
  ADD COLUMN IF NOT EXISTS sat_total_25            INTEGER,
  ADD COLUMN IF NOT EXISTS sat_total_75            INTEGER,
  ADD COLUMN IF NOT EXISTS sat_ebrw_25             INTEGER,
  ADD COLUMN IF NOT EXISTS sat_ebrw_75             INTEGER,
  ADD COLUMN IF NOT EXISTS sat_math_25             INTEGER,
  ADD COLUMN IF NOT EXISTS sat_math_75             INTEGER,
  -- ACT percentiles
  ADD COLUMN IF NOT EXISTS act_25                  INTEGER,
  ADD COLUMN IF NOT EXISTS act_75                  INTEGER,
  -- GPA
  ADD COLUMN IF NOT EXISTS gpa_avg                 NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS gpa_25                  NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS gpa_75                  NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS gpa_scale               NUMERIC(4,1) DEFAULT 4.0,
  -- Policy flags
  ADD COLUMN IF NOT EXISTS test_blind              BOOLEAN,
  ADD COLUMN IF NOT EXISTS demonstrated_interest   BOOLEAN,
  ADD COLUMN IF NOT EXISTS interview_required      BOOLEAN,
  ADD COLUMN IF NOT EXISTS portfolio_required      BOOLEAN,
  ADD COLUMN IF NOT EXISTS ap_accepted             BOOLEAN,
  ADD COLUMN IF NOT EXISTS ib_accepted             BOOLEAN,
  ADD COLUMN IF NOT EXISTS alevel_accepted         BOOLEAN,
  -- Essay info
  ADD COLUMN IF NOT EXISTS essays_required         BOOLEAN,
  ADD COLUMN IF NOT EXISTS essay_count             INTEGER,
  ADD COLUMN IF NOT EXISTS lor_count               INTEGER,
  -- English requirements (non-US)
  ADD COLUMN IF NOT EXISTS min_toefl               INTEGER,
  ADD COLUMN IF NOT EXISTS min_ielts               NUMERIC(3,1),
  ADD COLUMN IF NOT EXISTS min_duolingo            INTEGER,
  -- Difficulty composite (0–100; higher = harder to get in)
  ADD COLUMN IF NOT EXISTS admission_difficulty    NUMERIC(5,1);

-- ============================================================================
-- C. canonical.institution_financials — full cost + aid picture
-- ============================================================================

ALTER TABLE canonical.institution_financials
  ADD COLUMN IF NOT EXISTS tuition_domestic        NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS fees                    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS housing_cost            NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS meal_cost               NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS insurance_cost          NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS books_cost              NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS personal_expenses       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS net_price               NUMERIC(12,2), -- average after aid
  ADD COLUMN IF NOT EXISTS need_based_aid_avg      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS merit_aid_avg           NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS avg_scholarship         NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS pct_need_met            NUMERIC(5,2),  -- % of demonstrated need met
  ADD COLUMN IF NOT EXISTS avg_debt_at_graduation  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS monthly_loan_payment    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS need_blind_intl         BOOLEAN,       -- need-blind for internationals
  -- Difficulty composite (0–100; higher = harder to afford)
  ADD COLUMN IF NOT EXISTS financial_difficulty    NUMERIC(5,1);

-- ============================================================================
-- D. canonical.institution_outcomes — career + academic outcomes
-- ============================================================================

ALTER TABLE canonical.institution_outcomes
  ADD COLUMN IF NOT EXISTS employment_rate_6mo     NUMERIC(5,2),  -- % employed 6mo after grad
  ADD COLUMN IF NOT EXISTS employment_rate_1yr     NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS grad_school_rate        NUMERIC(5,2),  -- % going to grad school
  ADD COLUMN IF NOT EXISTS median_salary_1yr       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS median_salary_5yr       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS salary_25th_1yr         NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS salary_75th_1yr         NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS faang_placement_pct     NUMERIC(5,2),  -- % at FAANG-tier employers
  ADD COLUMN IF NOT EXISTS startup_placement_pct   NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS top_employers           JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS career_services_rank    INTEGER,       -- peer-relative ranking
  ADD COLUMN IF NOT EXISTS internship_pct          NUMERIC(5,2),  -- % with internship before grad
  -- Derived
  ADD COLUMN IF NOT EXISTS career_roi_score        NUMERIC(5,1),  -- 0–100
  ADD COLUMN IF NOT EXISTS academic_difficulty     NUMERIC(5,1);  -- 0–100

-- ============================================================================
-- E. canonical.institution_campus_life — student life detail
-- ============================================================================

ALTER TABLE canonical.institution_campus_life
  ADD COLUMN IF NOT EXISTS housing_guarantee       BOOLEAN,       -- guaranteed for all 4yrs?
  ADD COLUMN IF NOT EXISTS pct_living_on_campus    NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS dorm_quality_score      NUMERIC(3,1),  -- 1–5
  ADD COLUMN IF NOT EXISTS dining_quality_score    NUMERIC(3,1),  -- 1–5
  ADD COLUMN IF NOT EXISTS clubs_count             INTEGER,
  ADD COLUMN IF NOT EXISTS varsity_sports_count    INTEGER,
  ADD COLUMN IF NOT EXISTS greek_life              BOOLEAN,
  ADD COLUMN IF NOT EXISTS greek_life_pct          NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS workload_score          NUMERIC(3,1),  -- 1–5 (5 = very heavy)
  ADD COLUMN IF NOT EXISTS mental_health_services  BOOLEAN,
  ADD COLUMN IF NOT EXISTS party_score             NUMERIC(3,1),  -- 1–5
  ADD COLUMN IF NOT EXISTS international_friendly  BOOLEAN,
  ADD COLUMN IF NOT EXISTS avg_class_size          INTEGER,
  ADD COLUMN IF NOT EXISTS honors_program          BOOLEAN,
  ADD COLUMN IF NOT EXISTS study_abroad            BOOLEAN,
  ADD COLUMN IF NOT EXISTS co_op_programs          BOOLEAN,
  ADD COLUMN IF NOT EXISTS research_opportunities  BOOLEAN,
  ADD COLUMN IF NOT EXISTS internship_support      BOOLEAN;

-- ============================================================================
-- F. canonical.institution_rankings — additional sources
-- ============================================================================

ALTER TABLE canonical.institution_rankings
  ADD COLUMN IF NOT EXISTS niche_rank              INTEGER,
  ADD COLUMN IF NOT EXISTS wsj_rank                INTEGER,
  ADD COLUMN IF NOT EXISTS forbes_rank             INTEGER,
  ADD COLUMN IF NOT EXISTS guardian_rank           INTEGER,
  ADD COLUMN IF NOT EXISTS complete_uk_rank        INTEGER,
  ADD COLUMN IF NOT EXISTS shanghai_rank           INTEGER,
  ADD COLUMN IF NOT EXISTS nirf_rank               INTEGER,
  ADD COLUMN IF NOT EXISTS employer_reputation_rank INTEGER,
  ADD COLUMN IF NOT EXISTS academic_reputation_rank INTEGER,
  ADD COLUMN IF NOT EXISTS faculty_student_rank    INTEGER,
  ADD COLUMN IF NOT EXISTS citations_rank          INTEGER,
  ADD COLUMN IF NOT EXISTS intl_student_rank       INTEGER;

-- ============================================================================
-- G. canonical.masters_programs — expanded admissions + outcomes variables
-- ============================================================================

ALTER TABLE canonical.masters_programs
  ADD COLUMN IF NOT EXISTS acceptance_rate         NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS cohort_size             INTEGER,
  ADD COLUMN IF NOT EXISTS yield_rate              NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS avg_gpa                 NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS avg_gre_verbal          INTEGER,
  ADD COLUMN IF NOT EXISTS avg_gre_quant           INTEGER,
  ADD COLUMN IF NOT EXISTS avg_gre_awa             NUMERIC(3,1),
  ADD COLUMN IF NOT EXISTS avg_gmat                INTEGER,
  ADD COLUMN IF NOT EXISTS avg_work_exp_years      NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS avg_publications        NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS avg_research_years      NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS lor_count               INTEGER,
  ADD COLUMN IF NOT EXISTS sop_required            BOOLEAN,
  ADD COLUMN IF NOT EXISTS cv_required             BOOLEAN,
  ADD COLUMN IF NOT EXISTS interview_required      BOOLEAN,
  -- Funding detail
  ADD COLUMN IF NOT EXISTS ta_available            BOOLEAN,
  ADD COLUMN IF NOT EXISTS ra_available            BOOLEAN,
  ADD COLUMN IF NOT EXISTS ga_available            BOOLEAN,
  ADD COLUMN IF NOT EXISTS fellowship_available    BOOLEAN,
  ADD COLUMN IF NOT EXISTS avg_stipend_usd         NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS median_stipend_usd      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS funding_probability     NUMERIC(5,2),  -- % chance of any funding
  ADD COLUMN IF NOT EXISTS full_funding_probability NUMERIC(5,2),
  -- Outcomes
  ADD COLUMN IF NOT EXISTS graduation_rate         NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS attrition_rate          NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS time_to_degree_months   INTEGER,
  ADD COLUMN IF NOT EXISTS placement_rate          NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS median_salary_post      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS salary_25th             NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS salary_75th             NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS phd_placement_pct       NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS faculty_placement_pct   NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS startup_outcomes_pct    NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS top_employers_masters   JSONB DEFAULT '[]'::jsonb,
  -- Immigration (critical for international students)
  ADD COLUMN IF NOT EXISTS opt_eligible            BOOLEAN,       -- US OPT available
  ADD COLUMN IF NOT EXISTS stem_opt_eligible       BOOLEAN,       -- 24-mo STEM OPT
  ADD COLUMN IF NOT EXISTS visa_support_provided   BOOLEAN,
  ADD COLUMN IF NOT EXISTS h1b_sponsorship_rate    NUMERIC(5,2), -- % of grads sponsored
  ADD COLUMN IF NOT EXISTS pr_pathway_info         TEXT,
  -- Research
  ADD COLUMN IF NOT EXISTS research_areas          JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS research_groups         JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS faculty_research_count  INTEGER,
  ADD COLUMN IF NOT EXISTS open_positions          INTEGER,
  ADD COLUMN IF NOT EXISTS industry_collaborations JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS annual_grants_usd       NUMERIC(14,0),
  -- Derived scores (0–100)
  ADD COLUMN IF NOT EXISTS admission_difficulty    NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS funding_attractiveness  NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS career_outcome_score    NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS research_fit_score      NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS roi_score               NUMERIC(5,1);

-- ============================================================================
-- H. canonical.masters_pathways — admission pathways (product moat)
-- Each program can have multiple alternative pathways.
-- ============================================================================

CREATE TABLE IF NOT EXISTS canonical.masters_pathways (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id        UUID NOT NULL REFERENCES canonical.masters_programs(id) ON DELETE CASCADE,
  pathway_type      TEXT NOT NULL CHECK (pathway_type IN (
    'gre_waived','research','work_experience','publication',
    'faculty_sponsorship','diversity','interview','holistic',
    'fast_track','other'
  )),
  description       TEXT NOT NULL,
  confidence        TEXT CHECK (confidence IN ('confirmed','likely','speculative')) DEFAULT 'likely',
  evidence_count    INTEGER DEFAULT 1,
  source            TEXT,
  source_date       DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_masters_pathways_program ON canonical.masters_pathways(program_id);
CREATE INDEX IF NOT EXISTS idx_masters_pathways_type    ON canonical.masters_pathways(pathway_type);

-- ============================================================================
-- I. Refresh mv_college_cards to expose new columns
--    (Only runs if the MV already exists; first-time setup via its own script)
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_matviews WHERE schemaname = 'canonical' AND matviewname = 'mv_college_cards'
  ) THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY canonical.mv_college_cards;
  END IF;
END $$;

-- Expose the most commonly needed new fields in the MV via a supporting view
-- that the frontend can also query directly until MV is rebuilt with new cols.
CREATE OR REPLACE VIEW canonical.v_college_cards_extended AS
SELECT
  mv.*,
  -- University-level
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
  -- Admissions extended
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
  -- Financial extended
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
  -- Outcomes extended
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
  -- Campus life
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
FROM canonical.mv_college_cards mv
LEFT JOIN canonical.institutions i ON i.id = mv.id::uuid
LEFT JOIN LATERAL (
  SELECT * FROM canonical.institution_admissions ia
  WHERE ia.institution_id = mv.id::uuid
  ORDER BY ia.data_year DESC NULLS LAST LIMIT 1
) a ON true
LEFT JOIN LATERAL (
  SELECT * FROM canonical.institution_financials if2
  WHERE if2.institution_id = mv.id::uuid
  ORDER BY if2.data_year DESC NULLS LAST LIMIT 1
) f ON true
LEFT JOIN LATERAL (
  SELECT * FROM canonical.institution_outcomes io
  WHERE io.institution_id = mv.id::uuid
  ORDER BY io.data_year DESC NULLS LAST LIMIT 1
) o ON true
LEFT JOIN LATERAL (
  SELECT * FROM canonical.institution_campus_life icl
  WHERE icl.institution_id = mv.id::uuid
  LIMIT 1
) cl ON true;

COMMENT ON VIEW canonical.v_college_cards_extended IS
  'Full variable set for college cards. Joins MV + raw tables for the expanded
   undergrad variables added in migration 127. Use mv_college_cards for list/filter
   queries (fast); use this view for single-college detail pages.';

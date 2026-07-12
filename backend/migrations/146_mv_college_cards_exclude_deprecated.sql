-- 146_mv_college_cards_exclude_deprecated.sql
-- ----------------------------------------------------------------------------
-- canonical.mv_college_cards never filtered out canonical.institutions rows
-- soft-marked as duplicates via deprecated_duplicate_of/deprecated_at
-- (added in migration 132, populated by the 2026-07-02 merge pass and the
-- 2026-07 follow-up dedup covering US/AU/FR/SE/CH/NZ/IN/IE -- see
-- docs/institution_merge_report.md). Confirmed live: querying the view for
-- an already-merged institution (e.g. "University of Toronto") returned 2
-- rows, both the survivor and the deprecated duplicate -- the soft-mark had
-- zero real user-facing effect until now.
--
-- Postgres materialized views don't support CREATE OR REPLACE, so this drops
-- and recreates mv_college_cards (identical definition, one added WHERE
-- clause) along with all 3 of its original indexes, and its two dependent
-- views (both plain VIEWs, definitions unchanged) that would otherwise be
-- dropped by CASCADE: canonical.v_college_cards_extended, and
-- public.mv_college_cards (the PostgREST/Supabase-API-schema exposure shim
-- the frontend actually queries -- discovered live via pg_depend when a
-- dry-run transaction correctly refused to drop with a dependency error;
-- not caught by an initial pg_depend check that only walked pg_rewrite ->
-- pg_class for the canonical schema).
-- ----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.mv_college_cards;
DROP VIEW IF EXISTS canonical.v_college_cards_extended;
DROP MATERIALIZED VIEW IF EXISTS canonical.mv_college_cards;

CREATE MATERIALIZED VIEW canonical.mv_college_cards AS
SELECT i.id,
    i.canonical_name,
    i.country_code,
    i.state_region,
    i.city,
    i.website,
    i.logo_url,
    i.metadata ->> 'description'::text AS description,
    i.institution_type,
    COALESCE(pi.popularity_score, i.popularity_score, 0::numeric) AS popularity_score,
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
    GREATEST(COALESCE(i.updated_at, now()), COALESCE(pi.updated_at, to_timestamp(0::double precision)), COALESCE(la.updated_at, to_timestamp(0::double precision)), COALESCE(lf.updated_at, to_timestamp(0::double precision)), COALESCE(lo.updated_at, to_timestamp(0::double precision))) AS updated_at
   FROM canonical.institutions i
     LEFT JOIN canonical.popularity_index pi ON pi.institution_id = i.id
     LEFT JOIN LATERAL ( SELECT r.global_rank
           FROM canonical.institution_rankings r
          WHERE r.institution_id = i.id
          ORDER BY r.ranking_year DESC NULLS LAST, r.created_at DESC NULLS LAST
         LIMIT 1) lr ON true
     LEFT JOIN LATERAL ( SELECT a.acceptance_rate,
            a.test_optional,
            a.sat_50,
            a.act_50,
            a.updated_at
           FROM canonical.institution_admissions a
          WHERE a.institution_id = i.id
          ORDER BY a.data_year DESC NULLS LAST, a.updated_at DESC NULLS LAST
         LIMIT 1) la ON true
     LEFT JOIN LATERAL ( SELECT f.tuition_international,
            f.cost_of_attendance,
            f.avg_financial_aid,
            f.merit_scholarship_flag,
            f.need_blind_flag,
            f.updated_at
           FROM canonical.institution_financials f
          WHERE f.institution_id = i.id
          ORDER BY f.data_year DESC NULLS LAST, f.updated_at DESC NULLS LAST
         LIMIT 1) lf ON true
     LEFT JOIN LATERAL ( SELECT o.graduation_rate_4yr,
            o.employment_rate,
            o.median_start_salary,
            o.updated_at
           FROM canonical.institution_outcomes o
          WHERE o.institution_id = i.id
          ORDER BY o.data_year DESC NULLS LAST, o.updated_at DESC NULLS LAST
         LIMIT 1) lo ON true
  WHERE i.canonical_name IS NOT NULL AND i.deprecated_duplicate_of IS NULL;

CREATE UNIQUE INDEX mv_college_cards_idx_id ON canonical.mv_college_cards USING btree (id);
CREATE INDEX mv_college_cards_idx_popularity ON canonical.mv_college_cards USING btree (popularity_score DESC NULLS LAST, global_rank);
CREATE INDEX mv_college_cards_idx_country_rank ON canonical.mv_college_cards USING btree (country_code, global_rank, popularity_score DESC NULLS LAST);

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
   FROM canonical.mv_college_cards mv
     LEFT JOIN canonical.institutions i ON i.id = mv.id
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
          WHERE ia.institution_id = mv.id
          ORDER BY ia.data_year DESC NULLS LAST
         LIMIT 1) a ON true
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
          WHERE if2.institution_id = mv.id
          ORDER BY if2.data_year DESC NULLS LAST
         LIMIT 1) f ON true
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
          WHERE io.institution_id = mv.id
          ORDER BY io.data_year DESC NULLS LAST
         LIMIT 1) o ON true
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
          WHERE icl.institution_id = mv.id
         LIMIT 1) cl ON true;

GRANT SELECT ON canonical.v_college_cards_extended TO anon;
GRANT SELECT ON canonical.v_college_cards_extended TO authenticated;

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

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.mv_college_cards TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.mv_college_cards TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.mv_college_cards TO service_role;

export {
  FRONTEND_CANONICAL_RELATION,
  FRONTEND_COLLEGE_CARD_FIELDS as COLLEGE_CARD_FIELDS,
  FRONTEND_COLLEGE_CARD_COLUMNS as COLLEGE_CARD_COLUMNS,
  FrontendCollegeCardSchema as CollegeCardContractSchema,
  FRONTEND_COLLEGE_CARD_ORDER_FIELDS,
  FRONTEND_COLLEGE_CARD_REQUIRED_FIELDS,
  FRONTEND_COLLEGE_CARD_FALLBACKS,
  parseFrontendCollegeCardOrThrow,
  applyFrontendCollegeCardFallback,
} from './frontendCollegeCardContract';

export type { FrontendCollegeCard as CollegeCardContract } from './frontendCollegeCardContract';

/**
 * Column projections for the per-section detail reads in `getCollegeById`.
 * Each value is a comma-separated PostgREST `select` list, validated against
 * the canonical schema (supabase_dump.sql, pg_dump 2026-06-18). Keep these in
 * sync with `canonical.*` tables — selecting a non-existent column 400s the
 * detail page. Do NOT inline these lists at call sites (no duplicates).
 */
export const COLLEGE_DETAIL_SECTION_COLUMNS = {
  institution:
    'id, canonical_name, normalized_name, slug, aliases, short_name, country_code, region_code, state_region, city, latitude, longitude, institution_type, control_type, established_year, website, logo_url, canonical_external_ids, metadata, description, popularity_score, completeness_score, updated_at',
  admissions:
    'institution_id, data_year, acceptance_rate, yield_rate, sat_25, sat_50, sat_75, act_25, act_50, act_75, test_optional, application_volume, admit_volume, enrollment_volume',
  financials:
    'institution_id, data_year, tuition_in_state, tuition_out_state, tuition_international, cost_of_attendance, avg_financial_aid, avg_debt, percent_receiving_aid, merit_scholarship_flag, need_blind_flag, net_price_low_income, net_price_mid_income, net_price_high_income',
  outcomes:
    'institution_id, data_year, graduation_rate_4yr, graduation_rate_6yr, retention_rate, employment_rate, median_start_salary, median_mid_career_salary, grad_school_rate',
  deadlines:
    'deadline_type, deadline_date, notification_date, is_binding, is_rolling, cycle_year, degree_level, applicant_type, intake_term',
  requirements:
    'institution_id, cycle_year, degree_level, applicant_type, sat_policy, act_policy, sat_required, act_required, sat_optional, test_blind, toefl_required, ielts_required, duolingo_required, toefl_min_score, ielts_min_score, duolingo_min_score, transcript_required, resume_required, cv_required, essays_required, supplemental_essays_required, supplemental_essay_count, portfolio_required, audition_required, teacher_recommendations_required, counselor_recommendation_required, interview_required, interview_optional, common_app_supported, coalition_app_supported, ucas_supported, direct_apply_supported, application_platform, financial_documents_required, passport_required, visa_documents_required',
  rankings:
    'ranking_year, ranking_body, national_rank, global_rank, subject_rank, ranking_score',
  demographics:
    'institution_id, data_year, percent_international, gender_ratio, ethnic_distribution, percent_first_gen',
  campus_life:
    'institution_id, housing_guarantee, campus_safety_score, athletics_division, club_count',
  programs: 'program_name, degree_type, field_category, enrollment, acceptance_rate',
  completeness:
    'institution_id, overall_score, admissions_score, financials_score, outcomes_score, rankings_score, programs_score, demographics_score, requirements_score, deadlines_score, score_breakdown',
  quality_scores:
    'institution_id, consistency_score, freshness_score, lineage_score, conflict_score, final_quality_score',
} as const;

export type CollegeDetailSection = keyof typeof COLLEGE_DETAIL_SECTION_COLUMNS;

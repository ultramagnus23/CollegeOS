import { z } from 'zod';

export const COLLEGE_CARD_FIELDS = [
  'id',
  'canonical_name',
  'country_code',
  'state_region',
  'city',
  'website',
  'logo_url',
  'description',
  'institution_type',
  'popularity_score',
  'global_rank',
  'acceptance_rate',
  'test_optional',
  'sat_50',
  'act_50',
  'tuition_international',
  'cost_of_attendance',
  'avg_financial_aid',
  'merit_scholarship_flag',
  'need_blind_flag',
  'graduation_rate_4yr',
  'employment_rate',
  'median_start_salary',
  'metadata',
] as const;

export const COLLEGE_CARD_COLUMNS = COLLEGE_CARD_FIELDS.join(', ');

export const CollegeCardContractSchema = z.object({
  id: z.union([z.string(), z.number()]),
  canonical_name: z.string().nullable().default(''),
  country_code: z.string().nullable().default(null),
  state_region: z.string().nullable().default(null),
  city: z.string().nullable().default(null),
  website: z.string().nullable().default(null),
  logo_url: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  institution_type: z.string().nullable().default(null),
  popularity_score: z.number().nullable().default(0),
  global_rank: z.number().nullable().default(null),
  acceptance_rate: z.number().nullable().default(null),
  test_optional: z.boolean().nullable().default(null),
  sat_50: z.number().nullable().default(null),
  act_50: z.number().nullable().default(null),
  tuition_international: z.number().nullable().default(null),
  cost_of_attendance: z.number().nullable().default(null),
  avg_financial_aid: z.number().nullable().default(null),
  merit_scholarship_flag: z.boolean().nullable().default(null),
  need_blind_flag: z.boolean().nullable().default(null),
  graduation_rate_4yr: z.number().nullable().default(null),
  employment_rate: z.number().nullable().default(null),
  median_start_salary: z.number().nullable().default(null),
  metadata: z.record(z.unknown()).nullable().default({}),
});

export type CollegeCardContract = z.infer<typeof CollegeCardContractSchema>;

export const COLLEGE_DETAIL_SECTION_COLUMNS = {
  institution: 'id, canonical_name, normalized_name, slug, aliases, country_code, region_code, state_region, city, latitude, longitude, institution_type, control_type, established_year, website, logo_url, canonical_external_ids, metadata, updated_at',
  admissions: 'institution_id, data_year, acceptance_rate, yield_rate, sat_25, sat_50, sat_75, act_25, act_50, act_75, test_optional, application_volume, admit_volume, enrollment_volume',
  financials: 'institution_id, data_year, tuition_in_state, tuition_out_state, tuition_international, cost_of_attendance, avg_financial_aid, avg_debt, percent_receiving_aid, merit_scholarship_flag, need_blind_flag, net_price_low_income, net_price_mid_income, net_price_high_income',
  outcomes: 'institution_id, data_year, graduation_rate_4yr, graduation_rate_6yr, retention_rate, employment_rate, median_start_salary, median_mid_career_salary, grad_school_rate',
  deadlines: 'deadline_type, deadline_date, notification_date, is_binding, cycle_year',
  requirements: 'requirement_category, requirement_name, requirement_value, requirement_payload',
  rankings: 'ranking_year, ranking_body, national_rank, global_rank, subject_rank, ranking_score',
  demographics: 'institution_id, data_year, percent_international, gender_ratio, ethnic_distribution, percent_first_gen',
  campus_life: 'institution_id, housing_guarantee, campus_safety_score, athletics_division, club_count',
  programs: 'program_name, degree_type, field_category, enrollment, acceptance_rate',
  completeness: 'institution_id, overall_score, section_scores, missing_required_fields',
  quality_scores: 'institution_id, freshness_score, final_quality_score, confidence_penalty',
} as const;

export type CollegeDetailSection = keyof typeof COLLEGE_DETAIL_SECTION_COLUMNS;

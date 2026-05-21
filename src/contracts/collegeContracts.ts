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

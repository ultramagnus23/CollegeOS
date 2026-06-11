'use strict';

const { z } = require('zod');

const nullableString = (max) => z.string().trim().max(max).nullable().optional();
const nullableInteger = (min, max) => z.number().int().min(min).max(max).nullable().optional();
const nullableNumber = (min, max) => z.number().min(min).max(max).nullable().optional();

const onboardingSchema = z.object({
  target_countries: z.array(z.string().trim().min(1).max(80)).min(1),
  intended_majors: z.array(z.string().trim().min(1).max(120)).min(1),
  test_status: z.object({
    sat_score: nullableInteger(400, 1600),
    act_score: nullableInteger(1, 36),
    ib_predicted: nullableInteger(0, 45),
  }).default({}),
  language_preferences: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  gpa: nullableNumber(0, 100),
  gpa_type: z.enum(['gpa', 'percentage']).nullable().optional().default('percentage'),
  sat_score: nullableInteger(400, 1600),
  act_score: nullableInteger(1, 36),
  budget: nullableInteger(0, 5000000),
  max_budget_per_year: nullableInteger(0, 5000000),
  intended_major: nullableString(255),
  career_goals: nullableString(4000),
  country: nullableString(100),
  need_financial_aid: z.boolean().nullable().optional(),
  can_take_loan: z.boolean().nullable().optional(),
  family_income_usd: nullableInteger(0, 100000000),
  subjects: z.array(z.string().trim().min(1).max(80)).max(60).default([]),
  activities: z.array(z.object({
    name: z.string().trim().min(1).max(160),
    type: nullableString(80),
    tier: z.number().int().min(1).max(4).default(3),
    yearsInvolved: z.number().int().min(0).max(20).default(0),
    hoursPerWeek: z.number().int().min(0).max(80).default(0),
    weeksPerYear: z.number().int().min(0).max(52).default(0),
    leadership: nullableString(200),
    achievements: nullableString(500),
  })).max(30).default([]),
  grade_level: nullableString(50),
  graduation_year: nullableInteger(2020, 2100),
  preferred_location: z.union([z.string().trim().max(120), z.array(z.string().trim().min(1).max(120))]).nullable().optional(),
  gender: nullableString(50),
}).strict();

const onboardingFieldMappings = [
  { frontend_field: 'target_countries', payload_type: 'string[]', backend_expected: 'string[]', db_column: 'users.target_countries', db_type: 'json/text' },
  { frontend_field: 'intended_majors', payload_type: 'string[]', backend_expected: 'string[]', db_column: 'users.intended_majors', db_type: 'json/text' },
  { frontend_field: 'sat_score', payload_type: 'number|null', backend_expected: 'integer|null', db_column: 'users.sat_score', db_type: 'integer' },
  { frontend_field: 'act_score', payload_type: 'number|null', backend_expected: 'integer|null', db_column: 'users.act_score', db_type: 'integer' },
  { frontend_field: 'gpa', payload_type: 'number|null', backend_expected: 'numeric|null', db_column: 'users.gpa', db_type: 'numeric' },
  { frontend_field: 'max_budget_per_year', payload_type: 'number|null', backend_expected: 'integer|numeric|null', db_column: 'users.max_budget_per_year', db_type: 'integer|numeric' },
  { frontend_field: 'need_financial_aid', payload_type: 'boolean|null', backend_expected: 'boolean|integer|null', db_column: 'users.need_financial_aid', db_type: 'boolean|integer' },
  { frontend_field: 'can_take_loan', payload_type: 'boolean|null', backend_expected: 'boolean|integer|null', db_column: 'users.can_take_loan', db_type: 'boolean|integer' },
  { frontend_field: 'family_income_usd', payload_type: 'number|null', backend_expected: 'integer|null', db_column: 'users.family_income_usd', db_type: 'integer' },
  { frontend_field: 'grade_level', payload_type: 'string|null', backend_expected: 'string|null', db_column: 'users.grade_level', db_type: 'text' },
  { frontend_field: 'graduation_year', payload_type: 'number|null', backend_expected: 'integer|null', db_column: 'users.graduation_year', db_type: 'integer' },
  { frontend_field: 'preferred_location', payload_type: 'string|string[]|null', backend_expected: 'text|text[]|null', db_column: 'users.preferred_location', db_type: 'text|array' },
  { frontend_field: 'country', payload_type: 'string|null', backend_expected: 'string|null', db_column: 'users.country', db_type: 'text' },
  { frontend_field: 'career_goals', payload_type: 'string|null', backend_expected: 'string|null', db_column: 'users.career_goals', db_type: 'text' },
  { frontend_field: 'student_profile.grade_level', payload_type: 'string|null', backend_expected: 'string|null', db_column: 'student_profiles.grade_level', db_type: 'text' },
  { frontend_field: 'student_profile.graduation_year', payload_type: 'number|null', backend_expected: 'integer|null', db_column: 'student_profiles.graduation_year', db_type: 'integer' },
  { frontend_field: 'student_profile.country', payload_type: 'string|null', backend_expected: 'string|null', db_column: 'student_profiles.country', db_type: 'text' },
  { frontend_field: 'student_profile.intended_majors', payload_type: 'string[]', backend_expected: 'json/text', db_column: 'student_profiles.intended_majors', db_type: 'json/text' },
];

function parseOnboardingSchema(payload) {
  return onboardingSchema.safeParse(payload);
}

module.exports = {
  onboardingSchema,
  onboardingFieldMappings,
  parseOnboardingSchema,
};

/**
 * src/types/college.ts
 *
 * Canonical TypeScript types for the unified `colleges` table schema.
 * All types are backed by Zod runtime validation.
 *
 * Use these types throughout the frontend instead of ad-hoc inline shapes or
 * references to legacy tables (college_admissions, academic_details,
 * student_demographics, colleges_comprehensive).
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

/** Coerce a value to a finite number, or return null. */
const numericNullable = z.preprocess(
  (v) => (v === '' || v === undefined ? null : Number(v)),
  z.number().finite().nullable()
);

/** Coerce a value to a non-negative finite number, or return null. */
const numericNonNegNullable = z.preprocess(
  (v) => (v === '' || v === undefined ? null : Number(v)),
  z.number().finite().nonnegative().nullable()
);

/** Accept string | string[] and always resolve to string[]. */
const stringArrayNullable = z.preprocess((v) => {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') {
    try { return JSON.parse(v) as string[]; } catch { return v.split(',').map((s) => s.trim()).filter(Boolean); }
  }
  return [];
}, z.array(z.string()).default([]));

// ---------------------------------------------------------------------------
// CollegeStats — numeric admissions / financial / academic snapshot
// ---------------------------------------------------------------------------

export const CollegeStatsSchema = z.object({
  /** Acceptance rate 0–1 (e.g. 0.05 = 5 %). */
  acceptanceRate: numericNullable,
  /** SAT 25th-percentile composite. */
  sat25: numericNullable,
  /** SAT 75th-percentile composite. */
  sat75: numericNullable,
  /** ACT 25th-percentile composite. */
  act25: numericNullable,
  /** ACT 75th-percentile composite. */
  act75: numericNullable,
  /** ACT average. */
  actAvg: numericNullable,
  /** GPA 25th percentile. */
  gpa25: numericNullable,
  /** GPA 75th percentile. */
  gpa75: numericNullable,
  /** In-state / domestic tuition (USD). */
  tuitionDomestic: numericNonNegNullable,
  /** International tuition (USD). */
  tuitionInternational: numericNonNegNullable,
  /** Best national ranking across QS, US News, THE. */
  bestRanking: numericNullable,
  /** QS World University Ranking. */
  rankingQs: numericNullable,
  /** US News ranking. */
  rankingUsNews: numericNullable,
  /** Times Higher Education ranking. */
  rankingThe: numericNullable,
  /** Median earnings 6 years after entry (USD). */
  medianEarnings6yr: numericNullable,
  /** Median earnings 10 years after entry (USD). */
  medianEarnings10yr: numericNullable,
  /** Average institutional grant (USD). */
  avgInstitutionalGrant: numericNullable,
  /** Percentage of students receiving any aid. */
  pctStudentsReceivingAid: numericNullable,
});

export type CollegeStats = z.infer<typeof CollegeStatsSchema>;

// ---------------------------------------------------------------------------
// College — full canonical college row
// ---------------------------------------------------------------------------

export const CollegeSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  slug: z.string().nullable().default(null),
  country: z.string().nullable().default(null),
  state: z.string().nullable().default(null),
  city: z.string().nullable().default(null),
  location: z.string().nullable().default(null),
  type: z.string().nullable().default(null),
  sizeCategory: z.string().nullable().default(null),
  totalEnrollment: numericNullable,
  website: z.string().nullable().default(null),
  logoUrl: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  religiousAffiliation: z.string().nullable().default(null),
  setting: z.string().nullable().default(null),
  foundedYear: numericNullable,
  // Admissions — read directly from colleges
  acceptanceRate: numericNullable,
  sat25: numericNullable,
  sat75: numericNullable,
  act25: numericNullable,
  act75: numericNullable,
  actAvg: numericNullable,
  gpa25: numericNullable,
  gpa75: numericNullable,
  testOptional: z.boolean().nullable().default(null),
  // Tuition & financial
  tuitionDomestic: numericNonNegNullable,
  tuitionInternational: numericNonNegNullable,
  avgInstitutionalGrant: numericNullable,
  avgMeritAid: numericNullable,
  pctReceivingMeritAid: numericNullable,
  pctStudentsReceivingAid: numericNullable,
  internationalAidAvailable: z.boolean().nullable().default(null),
  internationalAidAvg: numericNullable,
  meetsFullNeed: z.boolean().nullable().default(null),
  cssProfileRequired: z.boolean().nullable().default(null),
  // Academic outcomes (from colleges directly, not academic_details)
  medianEarnings6yr: numericNullable,
  medianEarnings10yr: numericNullable,
  // Rankings
  rankingQs: numericNullable,
  rankingUsNews: numericNullable,
  rankingThe: numericNullable,
  // Deadlines
  applicationDeadline: z.string().nullable().default(null),
  rdDeadline: z.string().nullable().default(null),
  edDeadline: z.string().nullable().default(null),
  eaDeadline: z.string().nullable().default(null),
  // Majors / programs
  majors: stringArrayNullable,
  // Data quality
  dataSource: z.string().nullable().default(null),
  dataSourceUrl: z.string().nullable().default(null),
  dataQualityScore: numericNullable,
  needsEnrichment: z.boolean().nullable().default(null),
  lastUpdatedAt: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
});

export type College = z.infer<typeof CollegeSchema>;

// ---------------------------------------------------------------------------
// CollegeSearchResult — lightweight shape for list/card views
// ---------------------------------------------------------------------------

export const CollegeSearchResultSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  country: z.string().nullable().default(null),
  location: z.string().nullable().default(null),
  type: z.string().nullable().default(null),
  acceptanceRate: numericNullable,
  tuitionCost: numericNonNegNullable,
  ranking: numericNullable,
  enrollment: numericNullable,
  description: z.string().nullable().default(null),
  majors: stringArrayNullable,
  /** SAT/ACT score ranges for display. */
  testScores: z
    .object({
      sat25: numericNullable,
      sat75: numericNullable,
      act25: numericNullable,
      act75: numericNullable,
    })
    .nullable()
    .default(null),
  dataSource: z.string().nullable().default(null),
  dataSourceUrl: z.string().nullable().default(null),
  dataQualityScore: numericNullable,
  lastUpdatedAt: z.string().nullable().default(null),
});

export type CollegeSearchResult = z.infer<typeof CollegeSearchResultSchema>;

// ---------------------------------------------------------------------------
// CollegeRecommendation — shape returned from recommendation engine
// ---------------------------------------------------------------------------

export const CollegeRecommendationSchema = z.object({
  college: CollegeSearchResultSchema,
  /** Overall fit score 0–100. */
  overallScore: z.number().min(0).max(100),
  /** Admission chance percentage 0–100. */
  admitChance: z.number().min(0).max(100).nullable().default(null),
  /** 'safety' | 'target' | 'reach' | 'long_shot' */
  tier: z.enum(['safety', 'target', 'reach', 'long_shot']).nullable().default(null),
  /** Human-readable reasons for recommendation. */
  reasoning: z.array(z.string()).default([]),
  /** Score breakdown by dimension. */
  scoreBreakdown: z
    .object({
      academicFit: z.number().min(0).max(100).nullable().default(null),
      financialFit: z.number().min(0).max(100).nullable().default(null),
      locationFit: z.number().min(0).max(100).nullable().default(null),
      valuesMatch: z.number().min(0).max(100).nullable().default(null),
    })
    .nullable()
    .default(null),
});

export type CollegeRecommendation = z.infer<typeof CollegeRecommendationSchema>;

// ---------------------------------------------------------------------------
// Application tracking canonical types
// ---------------------------------------------------------------------------

export const UserApplicationSchema = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  collegeId: z.number().int().positive(),
  canonicalInstitutionId: z.number().int().positive().nullable().default(null),
  collegeName: z.string().min(1),
  country: z.string().nullable().default(null),
  officialWebsite: z.string().nullable().default(null),
  status: z.string().min(1),
  applicationType: z.string().nullable().default(null),
  priority: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string().nullable().default(null),
});

export type UserApplication = z.infer<typeof UserApplicationSchema>;

export const CollegeTrackerEntrySchema = z.object({
  applicationId: z.number().int().positive(),
  collegeId: z.number().int().positive(),
  canonicalInstitutionId: z.number().int().positive().nullable().default(null),
  collegeName: z.string().min(1),
  status: z.string().min(1),
  priority: z.string().nullable().default(null),
  addedAt: z.string(),
});

export type CollegeTrackerEntry = z.infer<typeof CollegeTrackerEntrySchema>;

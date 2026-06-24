/**
 * src/types/mastersProgram.ts
 *
 * Canonical TypeScript types for masters PROGRAM reference data
 * (canonical.masters_programs + child pathways/deadlines, migration 120).
 * Kept separate from src/types/college.ts — masters programs are program-level,
 * not institution-level, and are read through mv_masters_program_cards, never
 * mv_college_cards. Backed by Zod runtime validation.
 */
import { z } from 'zod';

const numericNullable = z.preprocess(
  (v) => (v === '' || v === undefined || v === null ? null : Number(v)),
  z.number().finite().nullable()
);

const stringArrayNullable = z.preprocess((v) => {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String);
      return [];
    } catch {
      return v.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}, z.array(z.string()).default([]));

export const PATHWAY_TYPES = [
  'standard_test_based',
  'test_waived_holistic',
  'work_experience_substitution',
  'portfolio_based',
  'bridge_certificate',
  'conditional_admission',
  'executive_part_time',
  'direct_entry_no_test',
] as const;
export type PathwayType = (typeof PATHWAY_TYPES)[number];

export const DEADLINE_TYPES = [
  'priority',
  'final',
  'funding_consideration',
  'round_1',
  'round_2',
  'round_3',
  'rolling',
] as const;
export type DeadlineType = (typeof DEADLINE_TYPES)[number];

export const TEST_REQUIREMENTS = ['required', 'optional', 'waived', 'not_accepted', 'unknown'] as const;
export const FUNDING_LEVELS = ['fully_funded', 'partial', 'unfunded', 'varies', 'unknown'] as const;

// ---------------------------------------------------------------------------
// Pathway — one named admission route for a program
// ---------------------------------------------------------------------------
export const MastersPathwaySchema = z.object({
  id: z.string().uuid().nullable().default(null),
  pathwayType: z.enum(PATHWAY_TYPES),
  description: z.string().min(1),
  weightedFields: stringArrayNullable,
  minRequirements: z.record(z.unknown()).nullable().default(null),
  confidence: numericNullable,
  sourceUrl: z.string().nullable().default(null),
});
export type MastersPathway = z.infer<typeof MastersPathwaySchema>;

// ---------------------------------------------------------------------------
// Deadline — one program -> many deadlines
// ---------------------------------------------------------------------------
export const MastersDeadlineSchema = z.object({
  id: z.string().uuid().nullable().default(null),
  deadlineType: z.enum(DEADLINE_TYPES),
  deadlineDate: z.string().nullable().default(null),
  isRolling: z.boolean().nullable().default(null),
  intakeTerm: z.string().nullable().default(null),
  intakeYear: numericNullable,
  sourceUrl: z.string().nullable().default(null),
});
export type MastersDeadline = z.infer<typeof MastersDeadlineSchema>;

// ---------------------------------------------------------------------------
// Card — narrow projection backing mv_masters_program_cards (list/card views)
// ---------------------------------------------------------------------------
export const MastersProgramCardSchema = z.object({
  id: z.string().uuid(),
  institutionName: z.string().min(1),
  institutionCountry: z.string().min(1),
  city: z.string().nullable().default(null),
  programName: z.string().min(1),
  degreeType: z.enum(['MS', 'MA', 'MBA']),
  specialization: z.string().nullable().default(null),
  isStemDesignated: z.boolean().nullable().default(null),
  greRequirement: z.enum(TEST_REQUIREMENTS).nullable().default(null),
  gmatRequirement: z.enum(TEST_REQUIREMENTS).nullable().default(null),
  fundingAvailability: z.enum(FUNDING_LEVELS).nullable().default(null),
  tuitionTotal: numericNullable,
  tuitionCurrency: z.string().nullable().default(null),
  programLengthMonths: numericNullable,
  medianEarnings: numericNullable,
  medianDebt: numericNullable,
  dataQualityScore: numericNullable,
  lastScrapedAt: z.string().nullable().default(null),
  /** COUNT of pathway rows — 0 means "insufficient pathway data", never a guessed number. */
  pathwayCount: numericNullable,
  /** COUNT of self-reported applicant datapoints (GradCafe + our users). Sample size, NOT a rate. */
  datapointCount: numericNullable,
});
export type MastersProgramCard = z.infer<typeof MastersProgramCardSchema>;

// ---------------------------------------------------------------------------
// Full program detail = card + child collections
// ---------------------------------------------------------------------------
export const MastersProgramDetailSchema = MastersProgramCardSchema.extend({
  department: z.string().nullable().default(null),
  cipCode: z.string().nullable().default(null),
  languageOfInstruction: stringArrayNullable,
  intakeTerm: z.string().nullable().default(null),
  intakeYear: numericNullable,
  minGpa: numericNullable,
  minGpaScale: numericNullable,
  assistantshipTypes: stringArrayNullable,
  tuitionWaiverAvailable: z.boolean().nullable().default(null),
  programUrl: z.string().nullable().default(null),
  pathways: z.array(MastersPathwaySchema).default([]),
  deadlines: z.array(MastersDeadlineSchema).default([]),
});
export type MastersProgramDetail = z.infer<typeof MastersProgramDetailSchema>;

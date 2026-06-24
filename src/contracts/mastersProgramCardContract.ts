/**
 * src/contracts/mastersProgramCardContract.ts
 *
 * Frontend read contract for masters program cards, mirroring
 * frontendCollegeCardContract.ts. The canonical relation is
 * canonical.mv_masters_program_cards (migration 120) — NEVER mv_college_cards.
 *
 * NOTE: not yet wired into the startup schemaContractChecker. Enforcement is
 * added in Phase 4 (when the masters routes exist) and gated behind the
 * MASTERS_TRACK_ENABLED feature flag, so it cannot break existing startup on a
 * database where migration 120 has not been applied.
 */
import { z } from 'zod';

export const MASTERS_CARD_RELATION = 'canonical.mv_masters_program_cards' as const;

export const MASTERS_PROGRAM_CARD_FIELDS = [
  'id',
  'institution_name',
  'institution_country',
  'city',
  'program_name',
  'degree_type',
  'specialization',
  'is_stem_designated',
  'gre_requirement',
  'gmat_requirement',
  'funding_availability',
  'tuition_total',
  'tuition_currency',
  'program_length_months',
  'median_earnings',
  'median_debt',
  'data_quality_score',
  'last_scraped_at',
  'pathway_count',
  'datapoint_count',
] as const;

export const MASTERS_PROGRAM_CARD_REQUIRED_FIELDS = [
  'id',
  'institution_name',
  'program_name',
  'degree_type',
] as const;

export const MASTERS_PROGRAM_CARD_COLUMNS = MASTERS_PROGRAM_CARD_FIELDS.join(', ');

export const MastersProgramCardContractSchema = z.object({
  id: z.union([z.string(), z.number()]),
  institution_name: z.string().min(1, 'institution_name is required'),
  institution_country: z.string().nullable().default(null),
  city: z.string().nullable().default(null),
  program_name: z.string().min(1, 'program_name is required'),
  degree_type: z.enum(['MS', 'MA', 'MBA']),
  specialization: z.string().nullable().default(null),
  is_stem_designated: z.boolean().nullable().default(null),
  gre_requirement: z.string().nullable().default(null),
  gmat_requirement: z.string().nullable().default(null),
  funding_availability: z.string().nullable().default(null),
  tuition_total: z.number().nullable().default(null),
  tuition_currency: z.string().nullable().default(null),
  program_length_months: z.number().nullable().default(null),
  median_earnings: z.number().nullable().default(null),
  median_debt: z.number().nullable().default(null),
  data_quality_score: z.number().nullable().default(null),
  last_scraped_at: z.string().nullable().default(null),
  pathway_count: z.number().nullable().default(0),
  datapoint_count: z.number().nullable().default(0),
});

export type MastersProgramCardContract = z.infer<typeof MastersProgramCardContractSchema>;

export function parseMastersProgramCardOrThrow(input: unknown): MastersProgramCardContract {
  const parsed = MastersProgramCardContractSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Masters program card contract violation: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

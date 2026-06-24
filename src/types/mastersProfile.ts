/**
 * src/types/mastersProfile.ts
 *
 * Canonical TypeScript types for the MASTERS applicant profile (MS/MA/MBA).
 * Deliberately a SEPARATE schema from canonicalProfileSchema (undergrad) — the two
 * tracks share no fields and must never be merged into one optional-everything shape.
 * Backed by the public.masters_profile table (migration 120).
 *
 * Mirrors the helper shape of src/types/profile.ts:
 *   mastersProfileSchema · normalizeApiMastersProfileToCanonical · mastersProfileToApiPayload
 */
import { z } from 'zod';

export const MASTERS_DEGREE_TYPES = ['MS', 'MA', 'MBA'] as const;
export const SOP_STATUSES = ['not_started', 'drafting', 'reviewing', 'final'] as const;
export const INTAKE_TERMS = ['fall', 'spring', 'summer', 'winter'] as const;

export type MastersDegreeType = (typeof MASTERS_DEGREE_TYPES)[number];
export type SopStatus = (typeof SOP_STATUSES)[number];
export type IntakeTerm = (typeof INTAKE_TERMS)[number];

export const mastersProfileSchema = z.object({
  id: z.number().int().nullable().optional(),
  userId: z.number().int().nullable().optional(),
  version: z.number().int().min(0).default(0),
  targetDegreeType: z.enum(MASTERS_DEGREE_TYPES).nullable().optional(),
  intendedProgram: z.string().max(200).default(''),
  intendedSpecialization: z.string().max(200).default(''),
  // GRE (130–170 per section, AWA 0–6); all nullable — many programs waive it
  greVerbal: z.number().int().min(130).max(170).nullable().optional(),
  greQuant: z.number().int().min(130).max(170).nullable().optional(),
  greAwa: z.number().min(0).max(6).nullable().optional(),
  // GMAT classic (/800) and Focus (/805) — distinct, non-comparable scales
  gmatTotal: z.number().int().min(200).max(800).nullable().optional(),
  gmatFocusTotal: z.number().int().min(205).max(805).nullable().optional(),
  // English proficiency
  toeflScore: z.number().int().min(0).max(120).nullable().optional(),
  ieltsScore: z.number().min(0).max(9).nullable().optional(),
  duolingoScore: z.number().int().min(10).max(160).nullable().optional(),
  pteScore: z.number().int().min(10).max(90).nullable().optional(),
  // Undergrad record
  undergradGpa: z.number().nullable().optional(),
  undergradGpaScale: z.number().nullable().optional(),
  undergradInstitution: z.string().max(255).default(''),
  undergradMajor: z.string().max(200).default(''),
  undergradCountry: z.string().max(100).default(''),
  // Research / work
  researchExperience: z.string().max(2000).default(''),
  publicationCount: z.number().int().min(0).default(0),
  workExperienceYears: z.number().min(0).max(60).default(0),
  workExperienceDesc: z.string().max(2000).default(''),
  // Application artifacts
  sopStatus: z.enum(SOP_STATUSES).nullable().optional(),
  lorsSecured: z.number().int().min(0).default(0),
  lorsRequired: z.number().int().min(0).nullable().optional(),
  // Targets
  targetIntakeTerm: z.enum(INTAKE_TERMS).nullable().optional(),
  targetIntakeYear: z.number().int().nullable().optional(),
  targetCountries: z.array(z.string().trim().min(1).max(100)).default([]),
  updatedAt: z.string().default(''),
});

export type MastersProfile = z.infer<typeof mastersProfileSchema>;
export const mastersPartialProfileSchema = mastersProfileSchema.partial();

// ---------------------------------------------------------------------------
// Local helpers (kept self-contained, matching profile.ts's pattern)
// ---------------------------------------------------------------------------

const parseJSON = <T>(value: unknown, fallback: T): T => {
  if (value == null) return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const toNumberOrNull = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizeText = (value: unknown): string =>
  Array.from(String(value ?? '').normalize('NFKC'))
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .trim();

const dedupe = (items: unknown[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const v = normalizeText(item);
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
};

/** Coerce a value to one of `allowed`, or null if it does not match. */
const toEnumOrNull = <T extends string>(value: unknown, allowed: readonly T[]): T | null => {
  const v = normalizeText(value);
  return (allowed as readonly string[]).includes(v) ? (v as T) : null;
};

export const normalizeApiMastersProfileToCanonical = (rawInput: unknown): MastersProfile => {
  const raw = (rawInput as Record<string, unknown>) || {};
  const base = (raw.profile as Record<string, unknown>) || raw;

  return mastersProfileSchema.parse({
    id: toNumberOrNull(base.id),
    userId: toNumberOrNull(base.user_id ?? raw.user_id ?? raw.userId),
    version: toNumberOrNull(base.profile_version ?? base.version ?? 0) ?? 0,
    targetDegreeType: toEnumOrNull(base.target_degree_type ?? base.targetDegreeType, MASTERS_DEGREE_TYPES),
    intendedProgram: normalizeText(base.intended_program ?? base.intendedProgram),
    intendedSpecialization: normalizeText(base.intended_specialization ?? base.intendedSpecialization),
    greVerbal: toNumberOrNull(base.gre_verbal ?? base.greVerbal),
    greQuant: toNumberOrNull(base.gre_quant ?? base.greQuant),
    greAwa: toNumberOrNull(base.gre_awa ?? base.greAwa),
    gmatTotal: toNumberOrNull(base.gmat_total ?? base.gmatTotal),
    gmatFocusTotal: toNumberOrNull(base.gmat_focus_total ?? base.gmatFocusTotal),
    toeflScore: toNumberOrNull(base.toefl_score ?? base.toeflScore),
    ieltsScore: toNumberOrNull(base.ielts_score ?? base.ieltsScore),
    duolingoScore: toNumberOrNull(base.duolingo_score ?? base.duolingoScore),
    pteScore: toNumberOrNull(base.pte_score ?? base.pteScore),
    undergradGpa: toNumberOrNull(base.undergrad_gpa ?? base.undergradGpa),
    undergradGpaScale: toNumberOrNull(base.undergrad_gpa_scale ?? base.undergradGpaScale),
    undergradInstitution: normalizeText(base.undergrad_institution ?? base.undergradInstitution),
    undergradMajor: normalizeText(base.undergrad_major ?? base.undergradMajor),
    undergradCountry: normalizeText(base.undergrad_country ?? base.undergradCountry),
    researchExperience: normalizeText(base.research_experience ?? base.researchExperience),
    publicationCount: toNumberOrNull(base.publication_count ?? base.publicationCount) ?? 0,
    workExperienceYears: toNumberOrNull(base.work_experience_years ?? base.workExperienceYears) ?? 0,
    workExperienceDesc: normalizeText(base.work_experience_desc ?? base.workExperienceDesc),
    sopStatus: toEnumOrNull(base.sop_status ?? base.sopStatus, SOP_STATUSES),
    lorsSecured: toNumberOrNull(base.lors_secured ?? base.lorsSecured) ?? 0,
    lorsRequired: toNumberOrNull(base.lors_required ?? base.lorsRequired),
    targetIntakeTerm: toEnumOrNull(base.target_intake_term ?? base.targetIntakeTerm, INTAKE_TERMS),
    targetIntakeYear: toNumberOrNull(base.target_intake_year ?? base.targetIntakeYear),
    targetCountries: dedupe(parseJSON(base.target_countries ?? base.targetCountries, [])),
    updatedAt: normalizeText(base.updated_at ?? base.updatedAt),
  });
};

export const mastersProfileToApiPayload = (profile: Partial<MastersProfile>) => ({
  target_degree_type: profile.targetDegreeType,
  intended_program: profile.intendedProgram,
  intended_specialization: profile.intendedSpecialization,
  gre_verbal: profile.greVerbal,
  gre_quant: profile.greQuant,
  gre_awa: profile.greAwa,
  gmat_total: profile.gmatTotal,
  gmat_focus_total: profile.gmatFocusTotal,
  toefl_score: profile.toeflScore,
  ielts_score: profile.ieltsScore,
  duolingo_score: profile.duolingoScore,
  pte_score: profile.pteScore,
  undergrad_gpa: profile.undergradGpa,
  undergrad_gpa_scale: profile.undergradGpaScale,
  undergrad_institution: profile.undergradInstitution,
  undergrad_major: profile.undergradMajor,
  undergrad_country: profile.undergradCountry,
  research_experience: profile.researchExperience,
  publication_count: profile.publicationCount,
  work_experience_years: profile.workExperienceYears,
  work_experience_desc: profile.workExperienceDesc,
  sop_status: profile.sopStatus,
  lors_secured: profile.lorsSecured,
  lors_required: profile.lorsRequired,
  target_intake_term: profile.targetIntakeTerm,
  target_intake_year: profile.targetIntakeYear,
  target_countries: profile.targetCountries,
  profile_version: profile.version,
});

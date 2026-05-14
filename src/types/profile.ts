import { z } from 'zod';

export const canonicalActivitySchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.string().trim().min(1).max(120).default('Other'),
  tier: z.number().int().min(1).max(4).default(4),
  yearsInvolved: z.number().int().min(0).max(20).default(0),
  hoursPerWeek: z.number().int().min(0).max(80).default(0),
  weeksPerYear: z.number().int().min(0).max(52).default(0),
  leadership: z.string().max(200).optional().default(''),
  achievements: z.string().max(500).optional().default(''),
});

export const canonicalTraitProfileSchema = z.object({
  signature: z.string().max(600).default(''),
  topTraits: z.array(z.object({
    trait: z.string().trim().min(1).max(100),
    weight: z.number().min(1).max(5),
  })).default([]),
  pairings: z.array(z.string().max(200)).default([]),
  totalSelected: z.number().int().min(0).default(0),
  avgWeight: z.number().min(0).max(5).default(0),
});

export const canonicalProfileSchema = z.object({
  id: z.number().int().nullable().optional(),
  userId: z.number().int().nullable().optional(),
  version: z.number().int().min(0).default(0),
  firstName: z.string().max(100).default(''),
  lastName: z.string().max(100).default(''),
  email: z.string().email().or(z.literal('')).default(''),
  country: z.string().max(100).default(''),
  phone: z.string().max(30).default(''),
  dateOfBirth: z.string().max(20).default(''),
  gradeLevel: z.string().max(60).default(''),
  graduationYear: z.number().int().nullable().optional(),
  schoolName: z.string().max(255).default(''),
  curriculumType: z.string().max(100).default(''),
  curriculumTypeOther: z.string().max(100).default(''),
  stream: z.string().max(100).default(''),
  gpaWeighted: z.number().nullable().optional(),
  gpaUnweighted: z.number().nullable().optional(),
  boardExamPercentage: z.number().nullable().optional(),
  satTotal: z.number().int().nullable().optional(),
  satMath: z.number().int().nullable().optional(),
  satEbrw: z.number().int().nullable().optional(),
  actComposite: z.number().int().nullable().optional(),
  ieltsScore: z.number().nullable().optional(),
  toeflScore: z.number().int().nullable().optional(),
  duolingoScore: z.number().int().nullable().optional(),
  intendedMajors: z.array(z.string().trim().min(1).max(100)).default([]),
  customMajors: z.array(z.string().trim().min(1).max(100)).default([]),
  subjects: z.array(z.string().trim().min(1).max(100)).default([]),
  customSubjects: z.array(z.string().trim().min(1).max(100)).default([]),
  preferredCountries: z.array(z.string().trim().min(1).max(100)).default([]),
  budgetMin: z.number().int().nullable().optional(),
  budgetMax: z.number().int().nullable().optional(),
  preferredCollegeSize: z.string().max(40).default(''),
  preferredSetting: z.string().max(40).default(''),
  traits: z.array(z.string().trim().min(1).max(100)).default([]),
  traitWeights: z.record(z.number().min(1).max(5)).default({}),
  traitProfile: canonicalTraitProfileSchema.nullable().optional(),
  traitInterpretation: z.record(z.unknown()).nullable().optional(),
  activities: z.array(canonicalActivitySchema).default([]),
  awards: z.array(z.string().max(200)).default([]),
  careerGoals: z.string().max(2000).default(''),
  whyCollege: z.string().max(2000).default(''),
  onboardingStep: z.number().int().min(0).max(7).default(0),
  profileCompletionPercentage: z.number().int().min(0).max(100).default(0),
  updatedAt: z.string().default(''),
});

export type CanonicalActivity = z.infer<typeof canonicalActivitySchema>;
export type CanonicalTraitProfile = z.infer<typeof canonicalTraitProfileSchema>;
export type CanonicalProfile = z.infer<typeof canonicalProfileSchema>;

export const canonicalPartialProfileSchema = canonicalProfileSchema.partial();

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

const toActivities = (value: unknown): CanonicalActivity[] => {
  const arr = Array.isArray(value) ? value : parseJSON<unknown[]>(value, []);
  return arr
    .map((item) => {
      const candidate = item as Record<string, unknown>;
      return canonicalActivitySchema.safeParse({
        name: normalizeText(candidate?.name ?? candidate?.activity_name ?? ''),
        type: normalizeText(candidate?.type ?? candidate?.activity_type ?? 'Other'),
        tier: toNumberOrNull(candidate?.tier ?? candidate?.tier_rating) ?? 4,
        yearsInvolved: toNumberOrNull(candidate?.yearsInvolved ?? candidate?.years ?? 0) ?? 0,
        hoursPerWeek: toNumberOrNull(candidate?.hoursPerWeek ?? candidate?.hours_per_week ?? 0) ?? 0,
        weeksPerYear: toNumberOrNull(candidate?.weeksPerYear ?? candidate?.weeks_per_year ?? 0) ?? 0,
        leadership: normalizeText(candidate?.leadership ?? candidate?.position_title ?? ''),
        achievements: normalizeText(candidate?.achievements ?? candidate?.description ?? ''),
      });
    })
    .filter((result): result is z.SafeParseSuccess<CanonicalActivity> => result.success)
    .map((result) => result.data);
};

export const normalizeApiProfileToCanonical = (rawInput: unknown): CanonicalProfile => {
  const raw = (rawInput as Record<string, unknown>) || {};
  const base = (raw.profile as Record<string, unknown>) || raw;

  const firstName = normalizeText(base.first_name ?? base.firstName);
  const lastName = normalizeText(base.last_name ?? base.lastName);

  const profile: CanonicalProfile = canonicalProfileSchema.parse({
    id: toNumberOrNull(base.id),
    userId: toNumberOrNull(base.user_id ?? raw.user_id ?? raw.userId),
    version: toNumberOrNull(base.profile_version ?? base.version ?? 0) ?? 0,
    firstName,
    lastName,
    email: normalizeText(base.email ?? (raw.user as Record<string, unknown> | undefined)?.email),
    country: normalizeText(base.country ?? (raw.user as Record<string, unknown> | undefined)?.country),
    phone: normalizeText(base.phone),
    dateOfBirth: normalizeText(base.date_of_birth ?? base.dateOfBirth),
    gradeLevel: normalizeText(base.grade_level ?? base.gradeLevel),
    graduationYear: toNumberOrNull(base.graduation_year ?? base.graduationYear),
    schoolName: normalizeText(base.high_school_name ?? base.school_name ?? base.schoolName),
    curriculumType: normalizeText(base.curriculum_type ?? base.curriculumType ?? base.currentBoard),
    curriculumTypeOther: normalizeText(base.curriculum_type_other ?? base.curriculumTypeOther),
    stream: normalizeText(base.stream),
    gpaWeighted: toNumberOrNull(base.gpa_weighted ?? base.gpaWeighted),
    gpaUnweighted: toNumberOrNull(base.gpa_unweighted ?? base.gpaUnweighted),
    boardExamPercentage: toNumberOrNull(base.board_exam_percentage),
    satTotal: toNumberOrNull(base.sat_total ?? base.satScore),
    satMath: toNumberOrNull(base.sat_math),
    satEbrw: toNumberOrNull(base.sat_ebrw),
    actComposite: toNumberOrNull(base.act_composite ?? base.actScore),
    ieltsScore: toNumberOrNull(base.ielts_score),
    toeflScore: toNumberOrNull(base.toefl_score),
    duolingoScore: toNumberOrNull(base.duolingo_score),
    intendedMajors: dedupe(parseJSON(base.intended_majors, [])),
    customMajors: dedupe(parseJSON(base.custom_majors, [])),
    subjects: dedupe(parseJSON(base.subjects, [])),
    customSubjects: dedupe(parseJSON(base.custom_subjects, [])),
    preferredCountries: dedupe(parseJSON(base.preferred_countries, [])),
    budgetMin: toNumberOrNull(base.budget_min),
    budgetMax: toNumberOrNull(base.budget_max),
    preferredCollegeSize: normalizeText(base.preferred_college_size),
    preferredSetting: normalizeText(base.preferred_setting),
    traits: dedupe(parseJSON(base.interest_tags ?? base.traits, [])),
    traitWeights: parseJSON(base.trait_weights, {}),
    traitProfile: parseJSON(base.trait_profile, null),
    traitInterpretation: parseJSON(base.trait_interpretation, null),
    activities: toActivities(base.activities ?? base.extracurriculars ?? raw.activities),
    awards: dedupe(parseJSON(base.awards, [])),
    careerGoals: normalizeText(base.career_goals ?? base.careerGoals),
    whyCollege: normalizeText(base.why_college ?? base.why_college_matters ?? base.whyCollege),
    onboardingStep: toNumberOrNull(base.onboarding_step ?? base.onboardingStep) ?? 0,
    profileCompletionPercentage:
      toNumberOrNull(base.profile_completion_percentage ?? base.profileCompletionPercentage) ?? 0,
    updatedAt: normalizeText(base.updated_at ?? base.updatedAt),
  });

  return profile;
};

export const canonicalProfileToApiPayload = (profile: Partial<CanonicalProfile>) => ({
  first_name: profile.firstName,
  last_name: profile.lastName,
  email: profile.email,
  country: profile.country,
  phone: profile.phone,
  date_of_birth: profile.dateOfBirth,
  grade_level: profile.gradeLevel,
  graduation_year: profile.graduationYear,
  high_school_name: profile.schoolName,
  curriculum_type: profile.curriculumType,
  curriculum_type_other: profile.curriculumTypeOther,
  stream: profile.stream,
  gpa_weighted: profile.gpaWeighted,
  gpa_unweighted: profile.gpaUnweighted,
  board_exam_percentage: profile.boardExamPercentage,
  sat_total: profile.satTotal,
  sat_math: profile.satMath,
  sat_ebrw: profile.satEbrw,
  act_composite: profile.actComposite,
  ielts_score: profile.ieltsScore,
  toefl_score: profile.toeflScore,
  duolingo_score: profile.duolingoScore,
  intended_majors: profile.intendedMajors,
  custom_majors: profile.customMajors,
  subjects: profile.subjects,
  custom_subjects: profile.customSubjects,
  preferred_countries: profile.preferredCountries,
  budget_min: profile.budgetMin,
  budget_max: profile.budgetMax,
  preferred_college_size: profile.preferredCollegeSize,
  preferred_setting: profile.preferredSetting,
  interest_tags: profile.traits,
  trait_weights: profile.traitWeights,
  trait_profile: profile.traitProfile,
  trait_interpretation: profile.traitInterpretation,
  extracurriculars: profile.activities,
  awards: profile.awards,
  career_goals: profile.careerGoals,
  why_college: profile.whyCollege,
  onboarding_step: profile.onboardingStep,
  profile_completion_percentage: profile.profileCompletionPercentage,
  profile_version: profile.version,
});

export const ACTIVITY_LIMITS = {
  years: { min: 0, max: 20 },
  hoursPerWeek: { min: 0, max: 80 },
  weeksPerYear: { min: 0, max: 52 },
} as const;

const normalizeText = (value: unknown): string =>
  Array.from(String(value ?? '').normalize('NFKC'))
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .trim();

export const normalizeLabel = (value: string): string =>
  value
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const dedupeNormalized = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const normalized = normalizeLabel(raw);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
};

export const sanitizeIntegerInput = (raw: string, maxDigits = 3): string => {
  const digits = raw.replace(/\D+/g, '').slice(0, maxDigits);
  if (!digits) return '';
  return String(Number.parseInt(digits, 10));
};

export const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const parseBoundedInteger = (
  raw: string,
  min: number,
  max: number,
): number | null => {
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return null;
  return clampNumber(parsed, min, max);
};

const toArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const toBoundedNumber = (
  value: unknown,
  limits: { min: number; max: number },
  fallback = 0,
): number => {
  const raw = String(value ?? '');
  const bounded = parseBoundedInteger(sanitizeIntegerInput(raw, 3), limits.min, limits.max);
  return bounded ?? fallback;
};

const hasMeaningfulText = (...values: unknown[]) => values.some((v) => normalizeText(v).length > 0);

export interface SanitizedActivity {
  name: string;
  type: string;
  tier: number;
  yearsInvolved: number;
  hoursPerWeek: number;
  weeksPerYear: number;
  leadership: string;
  achievements: string;
}

interface SanitizeActivitiesOptions {
  strict?: boolean;
}

export const sanitizeActivities = (
  value: unknown,
  options: SanitizeActivitiesOptions = {},
): SanitizedActivity[] => {
  const arr = toArray(value);

  return arr
    .map((item) => {
      const candidate = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const name = normalizeText(candidate.name ?? candidate.activity_name);
      const type = normalizeText(candidate.type ?? candidate.activity_type) || 'Other';
      const leadership = normalizeText(candidate.leadership ?? candidate.position_title);
      const achievements = normalizeText(candidate.achievements ?? candidate.description);
      const tier = clampNumber(
        Number.parseInt(String(candidate.tier ?? candidate.tier_rating ?? 4), 10) || 4,
        1,
        4,
      );

      return {
        name,
        type,
        tier,
        yearsInvolved: toBoundedNumber(
          candidate.yearsInvolved ?? candidate.years,
          ACTIVITY_LIMITS.years,
          0,
        ),
        hoursPerWeek: toBoundedNumber(
          candidate.hoursPerWeek ?? candidate.hours_per_week,
          ACTIVITY_LIMITS.hoursPerWeek,
          0,
        ),
        weeksPerYear: toBoundedNumber(
          candidate.weeksPerYear ?? candidate.weeks_per_year,
          ACTIVITY_LIMITS.weeksPerYear,
          0,
        ),
        leadership,
        achievements,
      };
    })
    .filter((activity) => {
      const hasName = activity.name.length > 0;
      if (options.strict) {
        return hasName && activity.type.length > 0;
      }

      return hasName || hasMeaningfulText(activity.leadership, activity.achievements);
    })
    .map((activity) => ({
      ...activity,
      type: activity.type || 'Other',
    }));
};

const normalizeStringArray = (value: unknown): string[] =>
  dedupeNormalized(
    toArray(value)
      .map((entry) => normalizeText(entry))
      .filter(Boolean),
  );

const normalizeTraitWeights = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, number>>((acc, [key, raw]) => {
    const trait = normalizeLabel(key);
    if (!trait) return acc;

    const num = Number(raw);
    const clamped = Number.isFinite(num) ? clampNumber(Math.round(num), 1, 5) : 3;
    acc[trait] = clamped;
    return acc;
  }, {});
};

export const normalizeProfile = (input: Record<string, unknown>): Record<string, unknown> => {
  const curriculumType = normalizeText(input.curriculumType ?? input.curriculum_type ?? input.currentBoard);
  const curriculumTypeOtherRaw = input.curriculumTypeOther ?? input.curriculum_other ?? '';

  return {
    ...input,
    firstName: normalizeText(input.firstName),
    lastName: normalizeText(input.lastName),
    email: normalizeText(input.email),
    country: normalizeText(input.country),
    schoolName: normalizeText(input.schoolName),
    curriculumType,
    curriculumTypeOther: curriculumTypeOtherRaw == null ? '' : normalizeText(curriculumTypeOtherRaw),
    phone: input.phone == null ? '' : normalizeText(input.phone),
    dateOfBirth: input.dateOfBirth == null ? '' : normalizeText(input.dateOfBirth),
    intendedMajors: normalizeStringArray(input.intendedMajors),
    customMajors: normalizeStringArray(input.customMajors),
    subjects: normalizeStringArray(input.subjects),
    customSubjects: normalizeStringArray(input.customSubjects),
    preferredCountries: normalizeStringArray(input.preferredCountries),
    traits: normalizeStringArray(input.traits),
    traitWeights: normalizeTraitWeights(input.traitWeights),
    activities: sanitizeActivities(input.activities),
  };
};

export const sanitizeProfile = (input: Record<string, unknown>): Record<string, unknown> => {
  const out = { ...input };
  const curriculumType = normalizeText(out.curriculumType);

  if (curriculumType !== 'Other') {
    delete out.curriculumTypeOther;
  } else {
    out.curriculumTypeOther = normalizeText(out.curriculumTypeOther ?? '');
  }

  out.activities = sanitizeActivities(out.activities);
  out.traitWeights = normalizeTraitWeights(out.traitWeights);

  return out;
};

export const canonicalizeProfile = (input: Record<string, unknown>): Record<string, unknown> => {
  const out = { ...input };

  out.graduationYear = out.graduationYear == null || out.graduationYear === ''
    ? null
    : Number(out.graduationYear);
  out.onboardingStep = out.onboardingStep == null || out.onboardingStep === ''
    ? 0
    : Number(out.onboardingStep);

  return out;
};

const TRAIT_CLUSTER_MAP: Record<string, string[]> = {
  Analytical: ['Analytical', 'Systems Thinker', 'Problem Solver', 'Logical', 'Detail-Oriented', 'Research-Oriented'],
  Creative: ['Creative', 'Artistic', 'Experimental', 'Imaginative', 'Design-Oriented', 'Aesthetic Thinker', 'Visionary', 'Futurist'],
  Leadership: ['Organizer', 'Community Builder', 'Delegator', 'Strategic Leader', 'Persuasive', 'Mentor', 'Diplomatic'],
  Collaboration: ['Empathetic', 'Collaborative', 'Communicator', 'Listener', 'Community Builder', 'Mentor'],
  Builder: ['Builder', 'Inventor', 'Product Thinker', 'Entrepreneurial', 'Self-Starter', 'Independent', 'Risk-Taker'],
  Execution: ['Disciplined', 'Consistent', 'Competitive', 'Ambitious', 'Self-Starter', 'Detail-Oriented'],
  Impact: ['Humanitarian', 'Culturally Curious', 'Ethical Thinker', 'Sustainability-Oriented', 'Policy-Oriented'],
};

const SYNERGY_RULES = [
  {
    id: 'systems-vision',
    traits: ['Analytical', 'Visionary'],
    label: 'Systems Vision',
    description: 'Combines long-range thinking with structured problem decomposition.',
  },
  {
    id: 'empathetic-leader',
    traits: ['Empathetic', 'Strategic Leader'],
    label: 'Empathetic Leadership',
    description: 'Leads with social awareness while preserving strategic clarity.',
  },
  {
    id: 'builder-researcher',
    traits: ['Builder', 'Research-Oriented'],
    label: 'Evidence-Backed Builder',
    description: 'Builds practical projects grounded in evidence and iteration.',
  },
  {
    id: 'creative-analyst',
    traits: ['Creative', 'Analytical'],
    label: 'Creative Analyst',
    description: 'Finds unconventional solutions that remain rigorous and testable.',
  },
  {
    id: 'competitive-collaborative',
    traits: ['Competitive', 'Collaborative'],
    label: 'Team Competitor',
    description: 'Raises team standards without compromising trust and cohesion.',
  },
] as const;

const TENSION_RULES = [
  {
    id: 'independent-collaborative',
    traits: ['Independent', 'Collaborative'],
    label: 'Autonomy vs Collaboration',
    prompt: 'Balance solo ownership with clear team handoffs.',
  },
  {
    id: 'risk-detail',
    traits: ['Risk-Taker', 'Detail-Oriented'],
    label: 'Speed vs Precision',
    prompt: 'Use milestone checkpoints to keep pace while protecting quality.',
  },
] as const;

const ARCHETYPE_RULES = [
  {
    name: 'Systems Strategist',
    cluster: 'Analytical',
    support: 'Leadership',
    narrative: 'Structured thinker who can prioritize and direct complex initiatives.',
  },
  {
    name: 'Human-Centered Innovator',
    cluster: 'Creative',
    support: 'Collaboration',
    narrative: 'Creates original ideas that stay grounded in human needs.',
  },
  {
    name: 'Impact Architect',
    cluster: 'Impact',
    support: 'Leadership',
    narrative: 'Builds initiatives that connect mission with measurable outcomes.',
  },
  {
    name: 'Venture Builder',
    cluster: 'Builder',
    support: 'Execution',
    narrative: 'Turns initiative into concrete products, ventures, and experiments.',
  },
  {
    name: 'Research Vanguard',
    cluster: 'Analytical',
    support: 'Creative',
    narrative: 'Drives discovery with rigor while spotting novel directions early.',
  },
] as const;

export interface TraitIntelligence {
  primaryArchetype: string;
  secondaryArchetype: string;
  hybridArchetype: string;
  confidence: number;
  dominantClusters: string[];
  synergies: Array<{ label: string; description: string }>;
  tensions: Array<{ label: string; prompt: string }>;
  recommendationLens: {
    leadershipStyle: string;
    collaborationStyle: string;
    learningStyle: string;
    essayAngles: string[];
    projectSuggestions: string[];
  };
}

export const inferTraitIntelligence = (
  traits: string[],
  traitWeights: Record<string, number>,
): TraitIntelligence => {
  const normalizedTraits = dedupeNormalized(traits);
  const traitSet = new Set(normalizedTraits);

  const weightedTraits = normalizedTraits
    .map((trait) => ({ trait, weight: clampNumber(Math.round(traitWeights[trait] ?? 3), 1, 5) }))
    .sort((a, b) => b.weight - a.weight);

  const clusterScores = Object.entries(TRAIT_CLUSTER_MAP).map(([cluster, clusterTraits]) => {
    const score = clusterTraits.reduce((sum, trait) => {
      const weighted = weightedTraits.find((t) => t.trait === trait);
      return sum + (weighted ? weighted.weight : 0);
    }, 0);
    return { cluster, score };
  }).sort((a, b) => b.score - a.score);

  const dominantClusters = clusterScores.filter((c) => c.score > 0).slice(0, 3).map((c) => c.cluster);

  const scoredArchetypes = ARCHETYPE_RULES.map((rule) => {
    const primary = clusterScores.find((c) => c.cluster === rule.cluster)?.score ?? 0;
    const support = clusterScores.find((c) => c.cluster === rule.support)?.score ?? 0;
    return {
      ...rule,
      score: primary * 1.2 + support * 0.8,
    };
  }).sort((a, b) => b.score - a.score);

  const primaryArchetype = scoredArchetypes[0]?.name ?? 'Multidimensional Explorer';
  const secondaryArchetype = scoredArchetypes[1]?.name ?? 'Adaptive Collaborator';
  const hybridArchetype = `${primaryArchetype} × ${secondaryArchetype}`;

  const top = scoredArchetypes[0]?.score ?? 0;
  const next = scoredArchetypes[1]?.score ?? 0;
  const confidence = top > 0 ? clampNumber(Math.round(((top - next + top) / (top * 2)) * 100), 35, 96) : 40;

  const synergies = SYNERGY_RULES
    .filter((rule) => rule.traits.every((trait) => traitSet.has(trait)))
    .map(({ label, description }) => ({ label, description }));

  const tensions = TENSION_RULES
    .filter((rule) => rule.traits.every((trait) => traitSet.has(trait)))
    .map(({ label, prompt }) => ({ label, prompt }));

  const leadershipStyle = dominantClusters.includes('Leadership')
    ? 'Delegates clearly, aligns teams around outcomes, and raises accountability.'
    : dominantClusters.includes('Execution')
      ? 'Leads by example through momentum, follow-through, and reliability.'
      : 'Leads through influence, context setting, and collaborative momentum.';

  const collaborationStyle = dominantClusters.includes('Collaboration')
    ? 'High-empathy collaborator who integrates diverse viewpoints into decisions.'
    : dominantClusters.includes('Builder')
      ? 'Prefers owner-led collaboration with clear interfaces and responsibilities.'
      : 'Balances independent work blocks with structured team check-ins.';

  const learningStyle = dominantClusters.includes('Analytical')
    ? 'Learns fastest through frameworks, first principles, and deliberate practice.'
    : dominantClusters.includes('Creative')
      ? 'Learns fastest through experimentation, prototypes, and reflective iteration.'
      : 'Learns fastest through applied projects and feedback-driven cycles.';

  const essayAngles = [
    `${primaryArchetype}: moments where your decisions shaped outcomes under uncertainty.`,
    'How your strongest trait synergy changed the way you approached a complex problem.',
    tensions.length > 0
      ? `How you resolved ${tensions[0].label.toLowerCase()} in a real team context.`
      : 'A growth story showing how you evolved your working style across contexts.',
  ];

  const projectSuggestions = [
    dominantClusters.includes('Builder')
      ? 'Launch a user-facing product iteration with measurable adoption goals.'
      : 'Lead a scoped initiative with milestones, stakeholders, and outcome metrics.',
    dominantClusters.includes('Impact')
      ? 'Design a community-impact project with clear baseline and improvement tracking.'
      : 'Create a portfolio project that ties technical rigor to real-world utility.',
    dominantClusters.includes('Analytical')
      ? 'Publish a research-backed analysis that informs practical recommendations.'
      : 'Document an end-to-end creative process from concept through validated result.',
  ];

  return {
    primaryArchetype,
    secondaryArchetype,
    hybridArchetype,
    confidence,
    dominantClusters,
    synergies,
    tensions,
    recommendationLens: {
      leadershipStyle,
      collaborationStyle,
      learningStyle,
      essayAngles,
      projectSuggestions,
    },
  };
};

export const buildTraitProfile = (
  traits: string[],
  traitWeights: Record<string, number>,
) => {
  const normalizedTraits = dedupeNormalized(traits);
  const weighted = normalizedTraits
    .map((trait) => ({ trait, weight: traitWeights[trait] ?? 3 }))
    .sort((a, b) => b.weight - a.weight);

  const top = weighted.slice(0, 5);
  const signature = top.map((t) => `${t.trait}:${t.weight}`).join('|');

  const combos: string[] = [];
  for (let i = 0; i < top.length; i += 1) {
    for (let j = i + 1; j < top.length; j += 1) {
      combos.push(`${top[i].trait} + ${top[j].trait}`);
    }
  }

  return {
    signature,
    topTraits: top,
    pairings: combos.slice(0, 6),
    totalSelected: normalizedTraits.length,
    avgWeight:
      weighted.length > 0
        ? Math.round((weighted.reduce((sum, t) => sum + t.weight, 0) / weighted.length) * 10) / 10
        : 0,
  };
};

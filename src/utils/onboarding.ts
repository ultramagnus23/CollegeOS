export const ACTIVITY_LIMITS = {
  years: { min: 0, max: 20 },
  hoursPerWeek: { min: 0, max: 80 },
  weeksPerYear: { min: 0, max: 52 },
} as const;

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

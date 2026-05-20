import { normalizeRankToScore } from './rankingNormalizationService';

type PopularityInputs = {
  globalRank?: number | null;
  applicationVolume?: number | null;
  recommendationFrequency?: number | null;
  searchFrequency?: number | null;
  admissionsCompetitiveness?: number | null;
  salaryOutcomes?: number | null;
};

function clamp01(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function normalize(value: number | null | undefined, cap: number) {
  if (!Number.isFinite(value as number) || (value as number) <= 0) return 0;
  return clamp01(Number(value) / cap);
}

export function computePopularityScore(input: PopularityInputs): number {
  const ranking = normalizeRankToScore(input.globalRank) / 100;
  const applications = normalize(input.applicationVolume, 120000);
  const recommendation = normalize(input.recommendationFrequency, 10000);
  const search = normalize(input.searchFrequency, 200000);
  const competitiveness = clamp01(Number(input.admissionsCompetitiveness ?? 0));
  const salary = normalize(input.salaryOutcomes, 200000);

  const score =
    ranking * 0.35 +
    applications * 0.15 +
    recommendation * 0.15 +
    search * 0.15 +
    competitiveness * 0.1 +
    salary * 0.1;

  return Number((Math.max(0, Math.min(1, score)) * 100).toFixed(2));
}


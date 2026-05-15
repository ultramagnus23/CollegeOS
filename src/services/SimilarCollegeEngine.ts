import type { CollegeSearchResult } from '@/types/college';

function scoreSimilarity(a: CollegeSearchResult, b: CollegeSearchResult): number {
  let score = 0;

  if (a.country && b.country && a.country === b.country) score += 20;
  if (a.type && b.type && a.type === b.type) score += 20;

  if (a.ranking != null && b.ranking != null) {
    const rankDelta = Math.abs(a.ranking - b.ranking);
    score += Math.max(0, 30 - Math.min(30, rankDelta / 5));
  }

  if (a.acceptanceRate != null && b.acceptanceRate != null) {
    const arA = a.acceptanceRate <= 1 ? a.acceptanceRate : a.acceptanceRate / 100;
    const arB = b.acceptanceRate <= 1 ? b.acceptanceRate : b.acceptanceRate / 100;
    const delta = Math.abs(arA - arB);
    score += Math.max(0, 20 - Math.min(20, delta * 100));
  }

  const majorsA = new Set((a.majors ?? []).map((m) => m.toLowerCase()));
  const majorsB = new Set((b.majors ?? []).map((m) => m.toLowerCase()));
  const shared = [...majorsA].filter((m) => majorsB.has(m)).length;
  score += Math.min(10, shared * 2);

  return Math.round(score);
}

export function findSimilarColleges(target: CollegeSearchResult, candidates: CollegeSearchResult[], limit = 6) {
  return candidates
    .filter((c) => c.id !== target.id)
    .map((c) => ({ college: c, similarity: scoreSimilarity(target, c) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.max(1, limit));
}

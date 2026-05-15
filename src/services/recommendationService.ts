import { searchColleges } from '@/lib/collegeService';
import { CollegeRecommendationSchema, type CollegeRecommendation } from '@/types/college';
import { normalizeCollegeSearchResult } from '@/utils/collegeMapper';

const cache = new Map<string, { at: number; value: CollegeRecommendation[] }>();
const TTL_MS = 2 * 60 * 1000;

interface RecommendationInput {
  country?: string;
  maxTuition?: number;
  sat?: number | null;
  act?: number | null;
  gpa?: number | null;
}

export async function getRecommendations(input: RecommendationInput = {}): Promise<CollegeRecommendation[]> {
  const key = JSON.stringify(input);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const result = await searchColleges({
    country: input.country,
    maxTuition: input.maxTuition,
    page: 1,
    pageSize: 30,
    sortBy: 'ranking',
  });

  const recs: CollegeRecommendation[] = result.data
    .map((row) => {
      const c = normalizeCollegeSearchResult(row);
      const satFit = input.sat && c.testScores?.sat75 ? Math.min(100, Math.max(0, (input.sat / c.testScores.sat75) * 100)) : 50;
      const actFit = input.act && c.testScores?.act75 ? Math.min(100, Math.max(0, (input.act / c.testScores.act75) * 100)) : 50;
      const gpaFit = input.gpa ? Math.min(100, Math.max(0, (input.gpa / 4) * 100)) : 50;
      const academicFit = Math.round((satFit + actFit + gpaFit) / 3);
      const selectivity = c.acceptanceRate != null ? (c.acceptanceRate <= 1 ? c.acceptanceRate : c.acceptanceRate / 100) : 0.5;
      const admitChance = Math.round(Math.max(1, Math.min(99, (academicFit / 100) * (1 - selectivity) * 100 + selectivity * 100 * 0.35)));
      const overallScore = Math.round((academicFit * 0.7) + ((100 - (c.ranking ?? 200) / 2) * 0.3));
      const tier = admitChance >= 65 ? 'safety' : admitChance >= 35 ? 'target' : admitChance >= 15 ? 'reach' : 'long_shot';

      const candidate = {
        college: c,
        overallScore,
        admitChance,
        tier,
        reasoning: [
          c.ranking ? `Ranking signal from canonical ranking fields: #${c.ranking}` : 'Ranking unavailable',
          c.acceptanceRate != null ? `Acceptance rate signal: ${Math.round((c.acceptanceRate <= 1 ? c.acceptanceRate : c.acceptanceRate / 100) * 100)}%` : 'Acceptance rate unavailable',
        ],
        scoreBreakdown: {
          academicFit,
          financialFit: 50,
          locationFit: 50,
          valuesMatch: 50,
        },
      };

      const parsed = CollegeRecommendationSchema.safeParse(candidate);
      return parsed.success ? parsed.data : null;
    })
    .filter((r): r is CollegeRecommendation => Boolean(r));

  cache.set(key, { at: Date.now(), value: recs });
  return recs;
}

export function clearRecommendationCache() {
  cache.clear();
}

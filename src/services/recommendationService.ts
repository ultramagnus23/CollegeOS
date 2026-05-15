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
  intendedMajors?: string[];
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

  const scored = result.data
    .map((row) => {
      const c = normalizeCollegeSearchResult(row);
      const normalizePct = (v: number | null | undefined) => {
        if (v == null || Number.isNaN(v)) return null;
        const pct = v <= 1 ? v * 100 : v;
        return Math.min(100, Math.max(0, pct));
      };
      const safeRatio = (a: number | null | undefined, b: number | null | undefined) => {
        if (a == null || b == null || b <= 0) return null;
        return Math.min(1.2, Math.max(0, a / b));
      };

      const satFit = safeRatio(input.sat ?? null, c.testScores?.sat75 ?? null);
      const actFit = safeRatio(input.act ?? null, c.testScores?.act75 ?? null);
      const gpaFit = input.gpa != null ? Math.min(1.2, Math.max(0, input.gpa / 4)) : null;
      const academicInputs = [satFit, actFit, gpaFit].filter((v): v is number => v != null);
      const academicFit = academicInputs.length
        ? Math.round((academicInputs.reduce((a, b) => a + b, 0) / academicInputs.length) * 100)
        : 50;

      const selectivityPct = normalizePct(c.acceptanceRate);
      const selectivityFit = selectivityPct == null ? 50 : Math.round(100 - selectivityPct);

      const tuition = c.tuitionCost ?? null;
      const financialFit = tuition == null || input.maxTuition == null
        ? 55
        : Math.round(Math.max(0, Math.min(100, ((input.maxTuition - tuition) / Math.max(input.maxTuition, 1)) * 100 + 100)));

      const countryFit = input.country && c.country
        ? String(input.country).toLowerCase() === String(c.country).toLowerCase() ? 100 : 35
        : 60;

      const majorTokens = (input.intendedMajors ?? []).map((m) => m.toLowerCase().trim()).filter(Boolean);
      const collegeMajors = (c.majors ?? []).map((m) => String(m).toLowerCase());
      const majorHits = majorTokens.filter((token) => collegeMajors.some((m) => m.includes(token))).length;
      const valuesMatch = majorTokens.length > 0
        ? Math.round((majorHits / majorTokens.length) * 100)
        : 55;

      const rankingSignal = c.ranking != null ? Math.max(0, Math.min(100, 100 - (c.ranking / 6))) : 45;
      const missingSignals = [
        c.acceptanceRate == null,
        c.ranking == null,
        c.tuitionCost == null,
        c.testScores?.sat75 == null && c.testScores?.act75 == null,
      ].filter(Boolean).length;
      const missingPenalty = missingSignals * 4;

      const rawOverall = (
        academicFit * 0.34 +
        selectivityFit * 0.16 +
        financialFit * 0.20 +
        valuesMatch * 0.12 +
        countryFit * 0.08 +
        rankingSignal * 0.10
      ) - missingPenalty;
      const overallScore = Math.round(Math.max(0, Math.min(100, rawOverall)));

      const confidence = Math.max(25, Math.min(100, 100 - (missingSignals * 18)));
      const admitChance = Math.round(Math.max(
        1,
        Math.min(99, (overallScore * 0.7) + ((100 - selectivityFit) * 0.3)),
      ));
      const tier = admitChance >= 65 ? 'safety' : admitChance >= 35 ? 'target' : admitChance >= 15 ? 'reach' : 'long_shot';

      const candidate = {
        college: c,
        overallScore,
        admitChance,
        tier,
        reasoning: [
          c.ranking ? `Ranking signal from canonical ranking fields: #${c.ranking}` : 'Ranking unavailable',
          c.acceptanceRate != null ? `Acceptance-rate selectivity signal: ${Math.round(normalizePct(c.acceptanceRate) ?? 0)}%` : 'Acceptance rate unavailable',
          input.maxTuition != null && tuition != null ? `Affordability signal: budget $${Math.round(input.maxTuition)} vs tuition $${Math.round(tuition)}` : 'Affordability signal limited by missing tuition/budget',
          majorTokens.length > 0 ? `Major-alignment score: ${valuesMatch}% from intended majors` : 'Major-alignment score defaults because intended majors were not provided',
          `Confidence: ${confidence}% (${missingSignals} missing data signals)`,
        ],
        scoreBreakdown: {
          academicFit,
          financialFit,
          locationFit: countryFit,
          valuesMatch,
        },
        confidence,
        explainability: {
          missingSignals,
          selectivityFit,
          rankingSignal: Math.round(rankingSignal),
          diversityKey: `${c.country ?? 'unknown'}:${c.type ?? 'unknown'}`,
        },
      };

      const parsed = CollegeRecommendationSchema.safeParse(candidate);
      if (!parsed.success) return null;
      return parsed.data;
    })
    .filter((r): r is CollegeRecommendation => Boolean(r));

  const seenDiversity = new Map<string, number>();
  const recs: CollegeRecommendation[] = scored
    .map((item) => {
      const key = `${item.college.country ?? 'unknown'}:${item.college.type ?? 'unknown'}`;
      const count = seenDiversity.get(key) ?? 0;
      seenDiversity.set(key, count + 1);
      const diversityPenalty = count * 6;
      return {
        ...item,
        overallScore: Math.max(0, Math.min(100, item.overallScore - diversityPenalty)),
      };
    })
    .sort((a, b) => b.overallScore - a.overallScore || (a.college.ranking ?? 999999) - (b.college.ranking ?? 999999))
    .slice(0, 20);

  cache.set(key, { at: Date.now(), value: recs });
  return recs;
}

export function clearRecommendationCache() {
  cache.clear();
}

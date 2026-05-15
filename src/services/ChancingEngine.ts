import type { CollegeSearchResult } from '@/types/college';

export interface ChancingInput {
  sat?: number | null;
  act?: number | null;
  gpa?: number | null;
}

export interface ChancingResult {
  probability: number;
  tier: 'Safety' | 'Target' | 'Reach';
  confidence: 'High' | 'Medium' | 'Low';
  missingDataFields: string[];
}

export function computeChancing(college: CollegeSearchResult, student: ChancingInput): ChancingResult {
  const missingDataFields: string[] = [];

  const satScore = student.sat ?? null;
  const actScore = student.act ?? null;
  const gpaScore = student.gpa ?? null;

  if (!college.testScores?.sat25 && !college.testScores?.sat75 && !college.testScores?.act25 && !college.testScores?.act75) {
    missingDataFields.push('missing SAT/ACT data');
  }
  if (college.ranking == null) missingDataFields.push('missing rankings');

  const satFit = satScore && college.testScores?.sat75 ? Math.min(1, satScore / college.testScores.sat75) : 0.5;
  const actFit = actScore && college.testScores?.act75 ? Math.min(1, actScore / college.testScores.act75) : 0.5;
  const gpaFit = gpaScore != null ? Math.min(1, Math.max(0, gpaScore / 4)) : 0.5;

  const acceptance = college.acceptanceRate == null
    ? 0.5
    : (college.acceptanceRate <= 1 ? college.acceptanceRate : college.acceptanceRate / 100);

  const raw = (satFit * 0.35 + actFit * 0.2 + gpaFit * 0.35 + acceptance * 0.1);
  const probability = Math.round(Math.max(1, Math.min(99, raw * 100)));

  const tier: ChancingResult['tier'] = probability >= 65 ? 'Safety' : probability >= 35 ? 'Target' : 'Reach';
  const confidence: ChancingResult['confidence'] = missingDataFields.length === 0 ? 'High' : missingDataFields.length <= 2 ? 'Medium' : 'Low';

  return { probability, tier, confidence, missingDataFields };
}

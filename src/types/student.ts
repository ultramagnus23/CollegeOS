// ML-specific student profile type — fields required by the chancing model
// (matches feature vector in ml/model/features.txt)

export interface MLStudentProfile {
  satScore: number | null;        // 400-1600, null if not taken
  actScore: number | null;        // 1-36, null if not taken
  gpaUnweighted: number;          // 1.5-4.0
  gpaWeighted: number;            // 1.5-5.0
  essayQuality: number;           // 1-5 (1=first draft, 5=professionally edited)
  extracurriculars: number;       // 1-15
  leadershipPositions: number;    // 0-extracurriculars
  firstGen: boolean;
  legacy: boolean;
  recruitedAthlete: boolean;
  incomeLevel: 1 | 2 | 3 | 4;    // 1=<30k, 2=30-60k, 3=60-100k, 4=100k+
  maxTuition: number;             // annual USD budget 5000-100000
}

export interface SuggestionResult {
  college_id: string | number;
  college_name: string;
  state?: string;
  probability: number;            // 0.03-0.97
  label: 'Likely' | 'Target' | 'Reach' | 'Unknown';
  acceptance_rate: number | null;
  isFallback?: boolean;
}

export interface SuggestionsPayload {
  success: boolean;
  isFallback: boolean;
  source: 'cache' | 'huggingface' | 'db_fallback';
  data: SuggestionResult[];
  generatedAt: string;            // ISO timestamp
}

/** Shape returned by POST /api/chances/predict */
export interface PredictPayload {
  success: boolean;
  recommendations: SuggestionResult[];
  count: number;
  isFallback: boolean;
  generatedAt: string;
}

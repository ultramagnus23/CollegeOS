import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { SUGGESTED_COLLEGE_COUNT } from '../../constants/ml';
import { api } from '../../services/api';
import { PredictPayload, SuggestionsPayload } from '../../types/student';

const INCOME_LABELS: Record<number, string> = {
  1: 'Under $30k',
  2: '$30k – $60k',
  3: '$60k – $100k',
  4: 'Over $100k',
};

interface StepReviewProps {
  onBack: () => void;
  onComplete: () => void;
}

const StepReview: React.FC<StepReviewProps> = ({ onBack, onComplete }) => {
  const { profile, completeOnboarding } = useOnboarding();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = [
    { label: 'SAT Score', value: profile.satScore ?? '—' },
    { label: 'ACT Score', value: profile.actScore ?? '—' },
    { label: 'Unweighted GPA', value: profile.gpaUnweighted || '—' },
    { label: 'Weighted GPA', value: profile.gpaWeighted || '—' },
    { label: 'Essay Quality', value: `${profile.essayQuality}/5` },
    { label: 'Extracurriculars', value: profile.extracurriculars },
    { label: 'Leadership Positions', value: profile.leadershipPositions },
    { label: 'First-gen', value: profile.firstGen ? 'Yes' : 'No' },
    { label: 'Legacy', value: profile.legacy ? 'Yes' : 'No' },
    { label: 'Recruited Athlete', value: profile.recruitedAthlete ? 'Yes' : 'No' },
    { label: 'Income Bracket', value: INCOME_LABELS[profile.incomeLevel] },
    { label: 'Max Annual Tuition', value: `$${profile.maxTuition.toLocaleString()}` },
  ];

  const handleFindColleges = async () => {
    setLoading(true);
    setError(null);

    const timeoutId = { id: 0 as ReturnType<typeof setTimeout> };

    try {
      // Call POST /api/chances/predict — sends profile directly, handles persist + cache internally
      const predictPromise = api.chances.predict(
        profile as unknown as Record<string, unknown>,
      ) as Promise<PredictPayload>;

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId.id = setTimeout(() => reject(new Error('AbortError')), 90_000);
      });

      const predictRes = await Promise.race([predictPromise, timeoutPromise]);

      clearTimeout(timeoutId.id);

      if (!predictRes?.recommendations || predictRes.recommendations.length === 0) {
        throw new Error('No results returned. Please try again.');
      }

      // Slice to SUGGESTED_COLLEGE_COUNT, sort by probability desc
      const sorted = [...predictRes.recommendations]
        .sort((a, b) => b.probability - a.probability)
        .slice(0, SUGGESTED_COLLEGE_COUNT);

      // Shape as SuggestionsPayload for the suggestions page
      const payload: SuggestionsPayload = {
        success: true,
        isFallback: predictRes.isFallback,
        source: 'huggingface',
        data: sorted,
        generatedAt: predictRes.generatedAt || new Date().toISOString(),
      };

      localStorage.setItem('collegeos_suggestions', JSON.stringify(payload));
      completeOnboarding();
      onComplete();
      navigate('/suggestions');
    } catch (err: unknown) {
      clearTimeout(timeoutId.id);
      if (err instanceof Error && (err.name === 'AbortError' || err.message === 'AbortError')) {
        setError('The request timed out (90 s). The ML service may be waking up — please try again.');
      } else if (err instanceof Error) {
        setError(err.message || 'Something went wrong. Please try again.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Review Your Profile</h2>
        <p className="mt-1 text-sm text-slate-400">
          We'll show you your top {SUGGESTED_COLLEGE_COUNT} colleges based on this profile.
        </p>
      </div>

      {/* Summary card */}
      <div className="rounded-xl border border-slate-700 bg-slate-900">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={`flex items-center justify-between px-4 py-3 text-sm ${
              i < rows.length - 1 ? 'border-b border-slate-800' : ''
            }`}
          >
            <span className="text-slate-400">{row.label}</span>
            <span className="font-medium text-white">{String(row.value)}</span>
          </div>
        ))}
      </div>

      {/* Inline error */}
      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={loading}
          className="flex-1 rounded-xl border border-slate-600 bg-transparent py-3 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-40"
        >
          ← Back
        </button>
        <button
          onClick={handleFindColleges}
          disabled={loading}
          className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-500 active:bg-indigo-700 transition-colors disabled:opacity-60"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Finding colleges…
            </span>
          ) : (
            'Find My Colleges →'
          )}
        </button>
      </div>

      <p className="text-center text-xs text-slate-600">
        This may take up to 90 seconds on first use while the ML model wakes up.
      </p>
    </div>
  );
};

export default StepReview;

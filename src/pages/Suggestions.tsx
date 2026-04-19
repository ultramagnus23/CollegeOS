import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SUGGESTED_COLLEGE_COUNT } from '../constants/ml';
import { SuggestionsPayload, SuggestionResult } from '../types/student';
import { api } from '../services/api';

const LS_KEY = 'collegeos_suggestions';

function labelColor(label: SuggestionResult['label']): string {
  if (label === 'Likely') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
  if (label === 'Target') return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
  return 'bg-red-500/20 text-red-400 border-red-500/40';
}

function pctColor(p: number): string {
  if (p >= 0.7) return 'text-emerald-400';
  if (p >= 0.4) return 'text-amber-400';
  return 'text-red-400';
}

function formatPct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
}

const SuggestionsPage: React.FC = () => {
  const navigate = useNavigate();
  const [payload, setPayload] = useState<SuggestionsPayload | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      navigate('/onboarding', { replace: true });
      return;
    }
    try {
      setPayload(JSON.parse(raw));
    } catch {
      navigate('/onboarding', { replace: true });
    }
  }, [navigate]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshError(null);

    const timeoutId = { id: 0 as ReturnType<typeof setTimeout> };

    try {
      try { await api.chances.invalidate(); } catch { /* non-critical */ }

      const chancesPromise = api.chances.get() as Promise<SuggestionsPayload>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId.id = setTimeout(() => reject(new Error('AbortError')), 90_000);
      });

      const res = await Promise.race([chancesPromise, timeoutPromise]);

      clearTimeout(timeoutId.id);

      if (!res?.data || res.data.length === 0) {
        throw new Error('No results returned.');
      }

      const sorted = [...res.data]
        .sort((a, b) => b.probability - a.probability)
        .slice(0, SUGGESTED_COLLEGE_COUNT);

      const next: SuggestionsPayload = {
        ...res,
        data: sorted,
        generatedAt: new Date().toISOString(),
      };

      localStorage.setItem(LS_KEY, JSON.stringify(next));
      setPayload(next);
    } catch (err: unknown) {
      clearTimeout(timeoutId.id);
      if (err instanceof Error) {
        setRefreshError(err.message === 'AbortError'
          ? 'Timed out. The ML service may be waking up — try again in a moment.'
          : err.message);
      } else {
        setRefreshError('Something went wrong. Please try again.');
      }
    } finally {
      setRefreshing(false);
    }
  };

  if (!payload) return null;

  const colleges = [...payload.data]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, SUGGESTED_COLLEGE_COUNT);

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">
            Your Top {SUGGESTED_COLLEGE_COUNT} Colleges
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Ranked by your personal admission probability.
          </p>
        </div>

        {/* Fallback banner */}
        {payload.isFallback && (
          <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
            <strong>Note:</strong> Personalized ML predictions are temporarily unavailable. Showing
            popular colleges instead. Refresh to retry.
          </div>
        )}

        {/* Refresh error */}
        {refreshError && (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {refreshError}
          </div>
        )}

        {/* College cards */}
        <div className="space-y-3">
          {colleges.map((c, idx) => (
            <button
              key={c.college_id}
              onClick={() => navigate(`/colleges/${c.college_id}`)}
              className="group w-full rounded-xl border border-slate-800 bg-slate-900 p-4 text-left hover:border-indigo-500/50 hover:bg-slate-800 transition-all duration-200"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left — rank + name */}
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-400 group-hover:bg-indigo-900 group-hover:text-indigo-300 transition-colors">
                    {idx + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold text-white">{c.college_name}</h3>
                    {c.state && (
                      <p className="text-xs text-slate-500">{c.state}</p>
                    )}
                  </div>
                </div>

                {/* Right — probability + label */}
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`text-2xl font-black ${pctColor(c.probability)}`}>
                    {formatPct(c.probability)}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${labelColor(c.label)}`}
                  >
                    {c.label}
                  </span>
                </div>
              </div>

              {/* Acceptance rate footer */}
              {c.acceptance_rate !== null && c.acceptance_rate !== undefined && (
                <div className="mt-2 flex items-center gap-1.5">
                  <div className="h-1 w-1 rounded-full bg-slate-600" />
                  <span className="text-xs text-slate-500">
                    College acceptance rate: {Math.round(c.acceptance_rate * 100)}%
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Footer row */}
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <p className="text-xs text-slate-600">
            Last updated {timeAgo(payload.generatedAt)}
            {payload.source && ` · source: ${payload.source}`}
          </p>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            {refreshing ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Refreshing…
              </span>
            ) : (
              '⟳ Refresh Suggestions'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuggestionsPage;

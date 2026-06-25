/**
 * MastersDisclosure.tsx — Phase 6 of docs/MASTERS_TRACK_PLAN.md.
 *
 * The "what we can't do" notice. Persistent and dismissible-but-reappearing:
 * dismissal is remembered for one session only (sessionStorage), so it returns
 * on the next visit. Written plainly, no hedging — surfaced up front, not buried.
 */
import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

const SESSION_KEY = 'masters_disclosure_dismissed';

const POINTS: string[] = [
  'We cannot give you a real admit probability for most masters programs — that data does not exist publicly the way it does for undergrad.',
  'We cannot assess research or advisor “fit”, which is often the single biggest factor in grad admissions.',
  'We cannot evaluate your SOP, your letters of recommendation, or interview performance.',
  'Competitiveness bands come from self-reported data from a limited, self-selected sample — not official statistics — and are absent for programs without enough reports.',
  'Funding and assistantship likelihood is not modeled at all in this version.',
];

interface Props {
  /** 'banner' = full dashboard notice; 'inline' = compact, always visible inside a chancing card. */
  variant?: 'banner' | 'inline';
}

const MastersDisclosure: React.FC<Props> = ({ variant = 'banner' }) => {
  const [dismissed, setDismissed] = useState<boolean>(
    () => variant === 'banner' && sessionStorage.getItem(SESSION_KEY) === '1',
  );

  if (variant === 'inline') {
    return (
      <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
        <p className="font-medium">How to read this</p>
        <p className="mt-1">
          This is a competitiveness band, not an admit probability. It is based on a limited,
          self-selected sample and cannot account for research fit, your SOP, recommendations, or interviews.
        </p>
      </div>
    );
  }

  if (dismissed) return null;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-200">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Before you trust any number here — what we honestly can’t do</h3>
            <button
              aria-label="Dismiss for this session"
              onClick={() => {
                sessionStorage.setItem(SESSION_KEY, '1');
                setDismissed(true);
              }}
              className="text-amber-500 hover:text-amber-600 dark:hover:text-amber-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {POINTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400/80">
            This notice reappears next session — it’s too important to hide for good.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MastersDisclosure;

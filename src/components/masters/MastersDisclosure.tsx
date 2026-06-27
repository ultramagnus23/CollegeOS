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
  const [expanded, setExpanded] = useState(false);

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

  // One short, permanent line — the honesty work is now done by the per-field
  // confidence badges and the explicit "not available for graduate programs"
  // treatment on each card (Phase 4). The full breakdown stays one click away.
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
        <p className="flex-1">
          Grad data works differently from undergrad: bands come from limited self-reported data, and
          admit probability, research fit, and funding aren’t available for graduate programs.{' '}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="font-medium underline underline-offset-2 hover:text-amber-600 dark:hover:text-amber-200"
          >
            {expanded ? 'Show less' : 'What we can’t do'}
          </button>
        </p>
        <button
          aria-label="Dismiss for this session"
          onClick={() => { sessionStorage.setItem(SESSION_KEY, '1'); setDismissed(true); }}
          className="text-amber-500 hover:text-amber-600 dark:hover:text-amber-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {expanded && (
        <ul className="mt-2 list-disc space-y-1 pl-9 text-[13px]">
          {POINTS.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
    </div>
  );
};

export default MastersDisclosure;

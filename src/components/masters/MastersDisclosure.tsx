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

  const amber = '#F59E0B';

  if (variant === 'inline') {
    return (
      <div style={{ marginTop: 12, borderRadius: 10, border: `1px solid ${amber}40`, background: `${amber}14`, padding: 12, fontSize: 12, color: 'var(--color-text-primary)' }}>
        <p style={{ fontWeight: 600, margin: 0 }}>How to read this</p>
        <p style={{ marginTop: 4, color: 'var(--color-text-secondary)' }}>
          This is a competitiveness band, not an admit probability. It is based on a limited,
          self-selected sample and cannot account for research fit, your SOP, recommendations, or interviews.
        </p>
      </div>
    );
  }

  if (dismissed) return null;

  return (
    <div style={{ borderRadius: 16, border: `1px solid ${amber}50`, background: `${amber}12`, padding: 16, color: 'var(--color-text-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <AlertTriangle style={{ marginTop: 2, height: 18, width: 18, flexShrink: 0, color: amber }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>Before you trust any number here — what we honestly can’t do</h3>
            <button
              aria-label="Dismiss for this session"
              onClick={() => {
                sessionStorage.setItem(SESSION_KEY, '1');
                setDismissed(true);
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: amber }}
            >
              <X style={{ height: 16, width: 16 }} />
            </button>
          </div>
          <ul style={{ marginTop: 8, listStyle: 'disc', display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 20, fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {POINTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-disabled)' }}>
            This notice reappears next session — it’s too important to hide for good.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MastersDisclosure;

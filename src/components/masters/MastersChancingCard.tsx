/**
 * MastersChancingCard.tsx — Phase 5 UI of docs/MASTERS_TRACK_PLAN.md.
 *
 * Renders the rules-based competitiveness band from GET /api/masters/chances/:id.
 * Shows a band (never a percentage), the per-pathway breakdown, the stated-
 * requirements checklist, and an inline honesty disclosure. When the band is
 * 'insufficient_data' it shows the checklist only — never a guessed number.
 */
import React from 'react';
import MastersDisclosure from './MastersDisclosure';

type Band = 'below_typical' | 'within_typical' | 'above_typical' | 'insufficient_data';

interface PathwayAssessment {
  pathwayType: string;
  applies: boolean;
  band: Band | null;
  label: string | null;
  basis: string;
}

interface ChecklistItem { requirement: string; value: string }

export interface ChancingAssessment {
  overall: { band: Band; label: string };
  pathways: PathwayAssessment[];
  checklist: ChecklistItem[];
  sampleSize: number;
  disclosures: string[];
}

const BAND_STYLE: Record<Band, { bg: string; text: string; dot: string }> = {
  above_typical: { bg: 'rgba(16,185,129,0.1)', text: '#10B981', dot: '#10B981' },
  within_typical: { bg: 'rgba(59,158,255,0.1)', text: '#3B9EFF', dot: '#3B9EFF' },
  below_typical: { bg: 'rgba(251,146,60,0.1)', text: '#FB923C', dot: '#FB923C' },
  insufficient_data: { bg: 'var(--color-surface-subtle)', text: 'var(--color-text-secondary)', dot: 'var(--color-text-disabled)' },
};

const prettyPathway = (t: string) =>
  t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const MastersChancingCard: React.FC<{ assessment: ChancingAssessment }> = ({ assessment }) => {
  const style = BAND_STYLE[assessment.overall.band];
  const hasBand = assessment.overall.band !== 'insufficient_data';

  return (
    <div style={{ borderRadius: 16, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-secondary)', margin: 0 }}>Competitiveness</h3>
        {assessment.sampleSize > 0 && (
          <span style={{ fontSize: 11, color: 'var(--color-text-disabled)' }}>self-reported data, N={assessment.sampleSize}</span>
        )}
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, borderRadius: 10, border: '1px solid transparent', padding: '12px 16px', background: style.bg }}>
        <span style={{ height: 10, width: 10, borderRadius: '50%', background: style.dot, flexShrink: 0 }} />
        <span style={{ fontWeight: 700, color: style.text, fontSize: 14 }}>{assessment.overall.label}</span>
      </div>

      {hasBand && assessment.pathways.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-disabled)', margin: 0 }}>By pathway</p>
          <ul style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, listStyle: 'none', padding: 0 }}>
            {assessment.pathways.map((p) => (
              <li key={p.pathwayType} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>{prettyPathway(p.pathwayType)}</span>
                <span style={{ color: 'var(--color-text-disabled)' }}>{p.label || '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-disabled)', margin: 0 }}>Stated requirements</p>
        <ul style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', listStyle: 'none', padding: 0, fontSize: 13 }}>
          {assessment.checklist.map((c) => (
            <li key={c.requirement} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-disabled)' }}>{c.requirement}</span>
              <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{c.value}</span>
            </li>
          ))}
        </ul>
      </div>

      <MastersDisclosure variant="inline" />
    </div>
  );
};

export default MastersChancingCard;

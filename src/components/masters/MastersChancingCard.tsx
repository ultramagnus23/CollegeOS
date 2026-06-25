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
  above_typical: { bg: 'bg-green-50 border-green-200', text: 'text-green-800', dot: 'bg-green-500' },
  within_typical: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-800', dot: 'bg-blue-500' },
  below_typical: { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-800', dot: 'bg-orange-500' },
  insufficient_data: { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-700', dot: 'bg-gray-400' },
};

const prettyPathway = (t: string) =>
  t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const MastersChancingCard: React.FC<{ assessment: ChancingAssessment }> = ({ assessment }) => {
  const style = BAND_STYLE[assessment.overall.band];
  const hasBand = assessment.overall.band !== 'insufficient_data';

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Competitiveness</h3>
        {assessment.sampleSize > 0 && (
          <span className="text-xs text-gray-400">self-reported data, N={assessment.sampleSize}</span>
        )}
      </div>

      <div className={`mt-3 flex items-center gap-3 rounded-lg border px-4 py-3 ${style.bg}`}>
        <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
        <span className={`font-semibold ${style.text}`}>{assessment.overall.label}</span>
      </div>

      {hasBand && assessment.pathways.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">By pathway</p>
          <ul className="mt-2 space-y-1.5">
            {assessment.pathways.map((p) => (
              <li key={p.pathwayType} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{prettyPathway(p.pathwayType)}</span>
                <span className="text-gray-500">{p.label || '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Stated requirements</p>
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {assessment.checklist.map((c) => (
            <li key={c.requirement} className="flex justify-between">
              <span className="text-gray-500">{c.requirement}</span>
              <span className="font-medium text-gray-800">{c.value}</span>
            </li>
          ))}
        </ul>
      </div>

      <MastersDisclosure variant="inline" />
    </div>
  );
};

export default MastersChancingCard;

/**
 * MastersChancingCard.tsx — Phase 5 UI of docs/MASTERS_TRACK_PLAN.md.
 *
 * Renders the rules-based competitiveness band from GET /api/masters/chances/:id.
 * Shows a band (never a percentage) on an interactive three-segment meter, the
 * per-pathway breakdown, the stated-requirements checklist, and an inline honesty
 * disclosure. When the band is 'insufficient_data' it shows the checklist only —
 * never a guessed number.
 *
 * Theme-aware: uses semantic design tokens (bg-card / text-foreground / …) plus
 * dark-safe band accents, so it reads correctly in both light and dark mode.
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

/** Band visual language — tuned to read on both light and dark surfaces. */
const BAND_STYLE: Record<Band, { pill: string; dot: string; bar: string; chip: string }> = {
  above_typical: {
    pill: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30',
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-500',
    chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
  within_typical: {
    pill: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/30',
    dot: 'bg-blue-500',
    bar: 'bg-blue-500',
    chip: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  },
  below_typical: {
    pill: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30',
    dot: 'bg-amber-500',
    bar: 'bg-amber-500',
    chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  },
  insufficient_data: {
    pill: 'bg-muted text-muted-foreground ring-1 ring-border',
    dot: 'bg-muted-foreground/50',
    bar: 'bg-muted-foreground/40',
    chip: 'bg-muted text-muted-foreground',
  },
};

/** Left→right meter order; index of the active band drives the highlight + marker. */
const METER: { band: Exclude<Band, 'insufficient_data'>; short: string }[] = [
  { band: 'below_typical', short: 'Below' },
  { band: 'within_typical', short: 'Within' },
  { band: 'above_typical', short: 'Above' },
];

const prettyPathway = (t: string) =>
  t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const MastersChancingCard: React.FC<{ assessment: ChancingAssessment }> = ({ assessment }) => {
  const band = assessment.overall.band;
  const style = BAND_STYLE[band];
  const hasBand = band !== 'insufficient_data';
  const activeIdx = METER.findIndex((m) => m.band === band);

  return (
    <div className="animate-fade-in rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Competitiveness
        </h3>
        {assessment.sampleSize > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            self-reported · N={assessment.sampleSize}
          </span>
        )}
      </div>

      {/* Headline band */}
      <div className="mt-3 flex items-center gap-2.5">
        <span className={`inline-flex h-2.5 w-2.5 rounded-full ${style.dot} ${hasBand ? 'animate-pulse' : ''}`} />
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${style.pill}`}>
          {assessment.overall.label}
        </span>
      </div>

      {/* Interactive three-segment meter (hidden when we have no band) */}
      {hasBand && (
        <div className="mt-4">
          <div className="flex gap-1.5">
            {METER.map((seg, i) => {
              const isActive = i === activeIdx;
              return (
                <div key={seg.band} className="flex-1">
                  <div
                    className={`rounded-full transition-all duration-500 ${
                      isActive ? `h-2.5 ${BAND_STYLE[seg.band].bar}` : 'h-2 bg-muted'
                    }`}
                  />
                  <div
                    className={`mt-1.5 text-center text-[11px] font-medium transition-colors ${
                      isActive ? 'text-foreground' : 'text-muted-foreground/60'
                    }`}
                  >
                    {seg.short}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasBand && assessment.pathways.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">By pathway</p>
          <ul className="mt-2 space-y-1.5">
            {assessment.pathways.map((p) => {
              const ps = BAND_STYLE[(p.band ?? 'insufficient_data') as Band];
              return (
                <li
                  key={p.pathwayType}
                  className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm transition-colors hover:bg-muted/70"
                >
                  <span className="text-foreground">{prettyPathway(p.pathwayType)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ps.chip}`}>
                    {p.label || '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Stated requirements</p>
        <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          {assessment.checklist.map((c) => (
            <li
              key={c.requirement}
              className="flex items-center justify-between gap-2 border-b border-border/50 pb-1.5"
            >
              <span className="text-muted-foreground">{c.requirement}</span>
              <span className="font-medium text-foreground">{c.value}</span>
            </li>
          ))}
        </ul>
      </div>

      <MastersDisclosure variant="inline" />
    </div>
  );
};

export default MastersChancingCard;

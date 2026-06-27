import React from 'react';

/**
 * ConfidenceBadge — the shared data-quality badge used by BOTH undergrad college
 * pages and masters program pages (Completeness · Freshness · Confidence).
 *
 * It is a DATA-QUALITY indicator, not a prediction. A metric that is null is
 * omitted. When `available` is false (no real data source — e.g. grad research
 * fit / funding / admit probability) the badge renders nothing at all, so we
 * never show a confidence number next to a value that has no source.
 */
export interface ConfidenceBadgeProps {
  available?: boolean;
  completeness?: number | null;
  freshness?: number | null;
  confidence?: number | null;
  source?: string | null;
  sampleSize?: number | null;
  className?: string;
}

const tone = (v: number): string =>
  v >= 75 ? 'text-emerald-600 dark:text-emerald-400'
  : v >= 45 ? 'text-amber-600 dark:text-amber-400'
  : 'text-red-600 dark:text-red-400';

const Metric: React.FC<{ label: string; value: number | null | undefined }> = ({ label, value }) =>
  value == null ? null : (
    <span className="whitespace-nowrap">
      {label}: <span className={`font-semibold ${tone(value)}`}>{Math.round(value)}%</span>
    </span>
  );

const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({
  available = true, completeness, freshness, confidence, source, sampleSize, className = '',
}) => {
  if (!available) return null;
  if (completeness == null && freshness == null && confidence == null) return null;

  return (
    <div className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground ${className}`}>
      <Metric label="Completeness" value={completeness} />
      {completeness != null && (freshness != null || confidence != null) && <span aria-hidden>·</span>}
      <Metric label="Freshness" value={freshness} />
      {freshness != null && confidence != null && <span aria-hidden>·</span>}
      <Metric label="Confidence" value={confidence} />
      {sampleSize != null && <span className="whitespace-nowrap">· self-reported, N={sampleSize}</span>}
      {source && <span className="truncate opacity-80">· {source}</span>}
    </div>
  );
};

export default ConfidenceBadge;

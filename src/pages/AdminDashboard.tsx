import { useEffect, useState } from 'react';
import { api } from '../services/api';

interface ScraperJob {
  last_run: string | null;
  status: string | null;
  rows_upserted: number | null;
  next_run: string | null;
}

interface MlModel {
  current_version: string | null;
  accuracy: number | null;
  f1_score: number | null;
  auc_roc: number | null;
  training_samples: number | null;
  new_rows_since_last_train: number | null;
  next_retrain_triggers_at: string | null;
  last_trained: string | null;
}

interface HealthPayload {
  scrapers: Record<string, ScraperJob>;
  database: Record<string, number | string>;
  ml_model: MlModel;
}

const S = {
  page: {
    padding: '32px',
    background: '#0f0f1a',
    minHeight: '100vh',
    fontFamily: "'Inter', system-ui, sans-serif",
  } as React.CSSProperties,
  h1: {
    fontSize: 28,
    fontWeight: 800,
    color: '#f1f5f9',
    marginBottom: 28,
    letterSpacing: '-0.02em',
  } as React.CSSProperties,
  h2: {
    fontSize: 12,
    fontWeight: 700,
    color: '#64748b',
    marginBottom: 16,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  },
  card: {
    background: '#13131f',
    border: '1px solid #1e1e30',
    borderRadius: 14,
    padding: 24,
    marginBottom: 24,
  } as React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 12,
  } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const },
  th: {
    textAlign: 'left' as const,
    padding: '8px 12px',
    color: '#475569',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.07em',
    borderBottom: '1px solid #1e1e30',
  },
  td: {
    padding: '10px 12px',
    color: '#e2e8f0',
    fontSize: 13,
    borderBottom: '1px solid #1a1a2a',
  },
};

function Stat({ label, value, accent = '#94a3b8' }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      background: '#0f0f1a',
      border: '1px solid #1e1e2e',
      borderRadius: 10,
      padding: '14px 18px',
    }}>
      <div style={{
        fontSize: 11,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 6,
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 22,
        fontWeight: 700,
        color: accent,
        fontFamily: "'Inter', system-ui, sans-serif",
        lineHeight: 1.2,
        wordBreak: 'break-word',
      }}>
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const color =
    status === 'success' ? '#4ade80' :
    status === 'error' ? '#f87171' :
    status === 'running' ? '#60a5fa' :
    '#facc15';
  return (
    <span style={{
      color,
      fontWeight: 600,
      fontSize: 13,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {status ?? '—'}
    </span>
  );
}

function fmt(ts: string | null): string {
  if (!ts) return 'Never';
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

interface ScraperHealthJob {
  jobName: string;
  lastSuccessfulRun: string | null;
  lastFoundDataAt: string | null;
  rowsInserted: number;
  rowsUpdated: number;
  rowsFailed: number;
  health: 'healthy' | 'stale' | 'silently_failing' | 'failing' | 'never_run';
}
interface ScraperHealthPayload {
  staleness: { thresholdDays: number; stalePercent: number | null; staleColleges: number; totalColleges: number; source: string | null };
  healthCounts: Record<string, number>;
  jobs: ScraperHealthJob[];
}

const HEALTH_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  healthy:          { bg: 'rgba(16,185,129,0.15)', color: '#34d399', label: 'Healthy' },
  stale:            { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', label: 'Stale' },
  silently_failing: { bg: 'rgba(239,68,68,0.15)',  color: '#f87171', label: 'Ran, 0 rows' },
  failing:          { bg: 'rgba(239,68,68,0.18)',  color: '#f87171', label: 'Failing' },
  never_run:        { bg: 'rgba(100,116,139,0.15)',color: '#94a3b8', label: 'Never run' },
};

export default function AdminDashboard() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [scraperHealth, setScraperHealth] = useState<ScraperHealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.adminHealth()
      .then((res: any) => {
        setHealth((res?.data ?? res) as HealthPayload);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message || 'Failed to load health data');
        setLoading(false);
      });
    // Richer per-source health + staleness rollup (non-fatal if unavailable).
    api.adminScraperHealth()
      .then((res: any) => setScraperHealth((res?.data ?? res) as ScraperHealthPayload))
      .catch(() => { /* section simply hides */ });
  }, []);

  if (loading) {
    return (
      <div style={S.page}>
        <h1 style={S.h1}>Admin Dashboard</h1>
        <div style={{ color: '#64748b', fontSize: 14, marginTop: 40, textAlign: 'center' }}>
          Loading pipeline status…
        </div>
      </div>
    );
  }

  if (error || !health) {
    return (
      <div style={S.page}>
        <h1 style={S.h1}>Admin Dashboard</h1>
        <div style={{
          background: 'rgba(248,113,113,0.08)',
          border: '1px solid rgba(248,113,113,0.3)',
          borderRadius: 10,
          padding: '16px 20px',
          color: '#f87171',
          fontSize: 14,
          marginTop: 20,
        }}>
          ⚠️ {error || 'No data returned from health endpoint'}
        </div>
      </div>
    );
  }

  const scrapers = health.scrapers ?? {};
  const db = health.database ?? {};
  const ml = health.ml_model ?? {} as MlModel;

  return (
    <div style={S.page}>
      <h1 style={S.h1}>🛡️ Admin Dashboard</h1>

      {/* ML Model */}
      <section style={S.card}>
        <h2 style={S.h2}>🤖 ML Model</h2>
        <div style={S.grid}>
          <Stat label="Version" value={ml.current_version ?? '—'} />
          <Stat
            label="Accuracy"
            value={ml.accuracy != null ? `${(ml.accuracy * 100).toFixed(1)}%` : '—'}
            accent="#6C63FF"
          />
          <Stat
            label="F1 Score"
            value={ml.f1_score != null ? `${(ml.f1_score * 100).toFixed(1)}%` : '—'}
            accent="#3B9EFF"
          />
          <Stat
            label="AUC-ROC"
            value={ml.auc_roc != null ? `${(ml.auc_roc * 100).toFixed(1)}%` : '—'}
            accent="#F59E0B"
          />
          <Stat
            label="Training Samples"
            value={ml.training_samples != null ? ml.training_samples?.toLocaleString() : '—'}
          />
          <Stat
            label="New Rows Since Retrain"
            value={ml.new_rows_since_last_train != null ? String(ml.new_rows_since_last_train) : '—'}
          />
          <Stat
            label="Next Retrain At"
            value={ml.next_retrain_triggers_at ?? '—'}
          />
          <Stat
            label="Last Trained"
            value={fmt(ml.last_trained)}
          />
        </div>
      </section>

      {/* Scraper jobs */}
      <section style={S.card}>
        <h2 style={S.h2}>⚙️ Scraper Jobs</h2>
        {Object.keys(scrapers).length === 0 ? (
          <div style={{ color: '#64748b', fontSize: 13 }}>No scraper run logs found yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  {['Job', 'Last Run', 'Status', 'Rows Upserted', 'Next Run'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(scrapers).map(([name, s]) => (
                  <tr key={name}>
                    <td style={{ ...S.td, fontWeight: 600, color: '#f1f5f9' }}>{name}</td>
                    <td style={S.td}>{fmt(s.last_run)}</td>
                    <td style={S.td}><StatusBadge status={s.status} /></td>
                    <td style={S.td}>{s.rows_upserted != null ? s.rows_upserted?.toLocaleString() : '—'}</td>
                    <td style={S.td}>{fmt(s.next_run)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Scraper health & freshness — per-source status + staleness rollup */}
      {scraperHealth && (
        <section style={S.card}>
          <h2 style={S.h2}>🩺 Scraper Health &amp; Freshness</h2>

          {/* Staleness rollup */}
          {scraperHealth.staleness && (
            <div style={{ marginBottom: 16 }}>
              <Stat
                label={`Colleges stale (> ${scraperHealth.staleness.thresholdDays}d)`}
                value={
                  scraperHealth.staleness.stalePercent != null
                    ? `${scraperHealth.staleness.stalePercent}%  (${scraperHealth.staleness.staleColleges.toLocaleString()} / ${scraperHealth.staleness.totalColleges.toLocaleString()})`
                    : '—'
                }
              />
              {scraperHealth.staleness.source && (
                <div style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                  source: {scraperHealth.staleness.source}
                </div>
              )}
            </div>
          )}

          {scraperHealth.jobs.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: 13 }}>
              No scraper run logs found. Once scrapers write to <code>scraper_run_logs</code>, per-source health appears here.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {['Source', 'Health', 'Last Success', 'Last New Data', 'Inserted', 'Updated', 'Failed'].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scraperHealth.jobs.map(j => {
                    const hs = HEALTH_STYLE[j.health] ?? HEALTH_STYLE.never_run;
                    return (
                      <tr key={j.jobName}>
                        <td style={{ ...S.td, fontWeight: 600, color: '#f1f5f9' }}>{j.jobName}</td>
                        <td style={S.td}>
                          <span style={{ background: hs.bg, color: hs.color, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                            {hs.label}
                          </span>
                        </td>
                        <td style={S.td}>{fmt(j.lastSuccessfulRun)}</td>
                        <td style={S.td}>{fmt(j.lastFoundDataAt)}</td>
                        <td style={S.td}>{j.rowsInserted.toLocaleString()}</td>
                        <td style={S.td}>{j.rowsUpdated.toLocaleString()}</td>
                        <td style={S.td}>{j.rowsFailed.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ color: '#64748b', fontSize: 11, marginTop: 8 }}>
                “Ran, 0 rows” = the job completed cleanly but inserted/updated nothing — a likely silent failure (source structure changed).
              </div>
            </div>
          )}
        </section>
      )}

      {/* Database counts */}
      <section style={S.card}>
        <h2 style={S.h2}>🗄️ Database</h2>
        {Object.keys(db).length === 0 ? (
          <div style={{ color: '#64748b', fontSize: 13 }}>No database stats available.</div>
        ) : (
          <div style={S.grid}>
            {Object.entries(db).map(([k, v]) => (
              <Stat
                key={k}
                label={k.replace(/_/g, ' ')}
                value={typeof v === 'number' ? v?.toLocaleString() : String(v)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

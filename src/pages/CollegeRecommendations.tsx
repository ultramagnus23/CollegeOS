// src/pages/CollegeRecommendations.tsx — College Recommendation Engine UI
import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import { toast } from 'sonner';

/* ─── Types ───────────────────────────────────────────────────────────────── */
interface ScoreBreakdown {
  academic_fit:    number;
  financial_fit:   number;
  values_match:    number;
  location_fit:    number;
}
interface Recommendation {
  college_id:           number;
  college_name:         string;
  country?:             string;
  acceptance_rate?:     number;
  overall_score:        number;
  score_breakdown?:     ScoreBreakdown;
  why_values?:          string[];
  net_cost_inr_per_year?: number;
  classification?:      string;
}
interface RecommendationResult {
  recommendations:       Recommendation[];
  generated_at:          string;
  exchange_rate_used:    number;
  exchange_rate_estimated?: boolean;
  summary?: {
    total_colleges_evaluated: number;
    exchange_rate_note: string;
  };
}

/** New ML recommendation from POST /api/recommend */
interface MLRecommendation {
  id:                  number;
  name:                string;
  country?:            string;
  state?:              string;
  overall_fit:         number;
  admit_chance:        number;
  tier:                string;
  reasoning:           string[];
  academic_similarity: number;
}

/* ─── Design tokens ───────────────────────────────────────────────────────── */
const ACCENT = '#6366F1';
const S = {
  bg:      'var(--color-bg-primary)',
  surface: 'var(--color-bg-surface)',
  surface2:'var(--color-surface-subtle)',
  border:  'var(--color-border)',
  border2: 'var(--color-border-strong)',
  muted:   'var(--color-text-secondary)',
  dim:     'var(--color-text-disabled)',
  font:    "'Inter', system-ui, sans-serif",
};

const GLOBAL = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}
`;

const CLASS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  reach:       { label: 'Reach',        color: '#F87171', bg: 'rgba(248,113,113,0.12)' },
  target:      { label: 'Target',       color: '#FBBF24', bg: 'rgba(251,191,36,0.12)'  },
  safety:      { label: 'Safety',       color: '#34D399', bg: 'rgba(52,211,153,0.12)'  },
  'Long Shot': { label: 'Long Shot',    color: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
};

/* ─── Score Bar ───────────────────────────────────────────────────────────── */
const ScoreBar: React.FC<{ label: string; value: number; max: number; color: string }> = ({ label, value, max, color }) => {
  const pct = Math.round((value / max) * 100);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: S.muted, fontFamily: S.font }}>{label}</span>
        <span style={{ fontSize: 11, color: S.muted, fontFamily: S.font }}>{value}/{max}</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: S.surface2 }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: color, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
};

/* ─── College Card ────────────────────────────────────────────────────────── */
const CollegeCard: React.FC<{ rec: Recommendation; rank: number }> = ({ rec, rank }) => {
  const [expanded, setExpanded] = useState(false);
  const cls = CLASS_CFG[rec.classification?.toLowerCase()] || CLASS_CFG.target;
  const sb = rec.score_breakdown;
  const score = Math.round(rec.overall_score);
  const ar = rec.acceptance_rate != null ? `${Math.round(rec.acceptance_rate * 100)}%` : 'N/A';

  return (
    <div
      style={{
        background: S.surface,
        border: `1px solid ${S.border}`,
        borderTop: rank <= 3 ? `3px solid ${ACCENT}` : `1px solid ${S.border}`,
        borderRadius: 16,
        padding: '20px 24px',
        animation: `fadeUp 0.3s ease ${rank * 0.05}s both`,
        fontFamily: S.font,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div
          style={{
            width: 36, height: 36, borderRadius: 10,
            background: rank <= 3 ? `rgba(99,102,241,0.15)` : S.surface2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 800, color: rank <= 3 ? ACCENT : S.muted, flexShrink: 0,
          }}
        >
          #{rank}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {rec.college_name}
            </h3>
            <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT, background: `rgba(99,102,241,0.12)`, padding: '3px 10px', borderRadius: 20 }}>
              Score: {score}/100
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {rec.country && (
              <span style={{ fontSize: 11, color: S.muted }}>{rec.country}</span>
            )}
            <span style={{ fontSize: 11, color: S.dim }}>·</span>
            <span style={{ fontSize: 11, color: S.muted }}>Acceptance: {ar}</span>
            {rec.net_cost_inr_per_year && (
              <>
                <span style={{ fontSize: 11, color: S.dim }}>·</span>
                <span style={{ fontSize: 11, color: S.muted }}>
                  ₹{((rec.net_cost_inr_per_year ?? 0) / 100000).toFixed(1)}L/yr
                </span>
              </>
            )}
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: cls.color, background: cls.bg, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>
          {cls.label}
        </span>
      </div>

      {/* Score breakdown */}
      {sb && (
        <div style={{ marginBottom: 12 }}>
          <ScoreBar label="Academic Fit"  value={Math.round(sb.academic_fit)}  max={35} color="#3B9EFF" />
          <ScoreBar label="Financial Fit" value={Math.round(sb.financial_fit)} max={25} color="#10B981" />
          <ScoreBar label="Values Match"  value={Math.round(sb.values_match)}  max={30} color={ACCENT}  />
          <ScoreBar label="Location Fit"  value={Math.round(sb.location_fit)}  max={10} color="#F59E0B" />
        </div>
      )}

      {/* Values reasons */}
      {rec.why_values && rec.why_values.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ fontSize: 11, color: ACCENT, background: 'none', border: 'none', cursor: 'pointer', fontFamily: S.font, padding: 0, marginBottom: 6 }}
          >
            {expanded ? '▲ Hide reasons' : '▼ Why this college?'}
          </button>
          {expanded && (
            <ul style={{ paddingLeft: 16, margin: 0 }}>
              {rec.why_values.map((w, i) => (
                <li key={i} style={{ fontSize: 13, color: S.muted, marginBottom: 4 }}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

/* ─── Main Page ───────────────────────────────────────────────────────────── */
const CollegeRecommendations: React.FC = () => {
  const [data, setData]       = useState<RecommendationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [generating, setGenerating] = useState(false);

  // ── New ML recommendations (cosine-similarity engine) ────────────────────
  const [mlRecs, setMlRecs]           = useState<MLRecommendation[]>([]);
  const [mlLoading, setMlLoading]     = useState(false);
  const [mlExpanded, setMlExpanded]   = useState<Record<number, boolean>>({});
  const [dismissed, setDismissed]     = useState<Set<number>>(new Set());
  const loadSeqRef = React.useRef(0);
  const mlSeqRef = React.useRef(0);
  const mountedRef = React.useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const loadML = useCallback(async () => {
    const seq = ++mlSeqRef.current;
    try {
      setMlLoading(true);
      const res = await (api as any).recommend.getColleges({});
      const colleges: MLRecommendation[] = (res?.colleges ?? res?.data?.colleges ?? []).slice(0, 20);
      if (!mountedRef.current || seq !== mlSeqRef.current) return;
      setMlRecs(colleges);
    } catch {
      // Non-critical — ML recommendations may not be available yet
    } finally {
      if (mountedRef.current && seq === mlSeqRef.current) {
        setMlLoading(false);
      }
    }
  }, []);

  const dismissML = useCallback((id: number) => {
    (api as any).signals.fire(id, 'dismissed').catch(() => {});
    setDismissed(prev => new Set([...prev, id]));
  }, []);

  const load = async () => {
    const seq = ++loadSeqRef.current;
    try {
      setLoading(true);
      setError('');
      const res = await (api as any).recommendations.get();
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      if (res?.success && res.recommendations) {
        setData(res);
      } else if (res?.recommendations) {
        setData(res);
      } else {
        setError(res?.message || 'No recommendations yet.');
      }
    } catch (err: any) {
      if (mountedRef.current && seq === loadSeqRef.current) {
        setError(err?.message || 'Failed to load recommendations.');
      }
    } finally {
      if (mountedRef.current && seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  };

  const generate = async () => {
    try {
      setGenerating(true);
      setError('');
      const res = await (api as any).recommendations.generate();
      if (res?.recommendations || res?.success) {
        await load();
        toast.success('Recommendations generated!');
      } else {
        setError(res?.message || 'Generation failed.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to generate recommendations.');
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    load();
    loadML();
  }, []);

  const recs = data?.recommendations || [];
  const visibleMLRecs = mlRecs.filter(r => !dismissed.has(r.id));

  return (
    <div style={{ minHeight: '100vh', background: S.bg, fontFamily: S.font, padding: '40px 24px' }}>
      <style>{GLOBAL}</style>

      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {/* ── ML Fit Section ── */}
        {(mlLoading || visibleMLRecs.length > 0) && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                ✨ Best Fit — Vector Engine
              </div>
              <div style={{ fontSize: 13, color: S.muted }}>
                Ranked by cosine similarity between your profile and each college's 28-dimension feature vector.
              </div>
            </div>

            {mlLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0' }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${ACCENT}`, borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
                <span style={{ fontSize: 13, color: S.muted }}>Computing fit scores…</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {visibleMLRecs.map((rec, idx) => {
                const tierColor = rec.tier === 'Safety' ? '#22c55e' : rec.tier === 'Target' ? '#f59e0b' : '#ef4444';
                const isOpen = mlExpanded[rec.id] ?? false;
                return (
                  <div
                    key={rec.id}
                    style={{
                      background: S.surface, border: `1px solid ${S.border}`,
                      borderLeft: `3px solid ${tierColor}`,
                      borderRadius: 14, padding: '16px 20px',
                      animation: `fadeUp 0.25s ease ${idx * 0.04}s both`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      {/* Rank */}
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: `${tierColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: tierColor, flexShrink: 0 }}>
                        #{idx + 1}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 2 }}>{rec.name}</div>
                        {rec.state && <div style={{ fontSize: 11, color: S.muted, marginBottom: 8 }}>{rec.state}{rec.country && rec.country !== 'United States' ? `, ${rec.country}` : ''}</div>}

                        {/* Fit bar */}
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontSize: 10, color: S.muted }}>Overall Fit</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT }}>{rec.overall_fit}%</span>
                          </div>
                          <div style={{ height: 5, background: `${ACCENT}22`, borderRadius: 9999 }}>
                            <div style={{ height: '100%', width: `${rec.overall_fit}%`, background: ACCENT, borderRadius: 9999, transition: 'width 0.5s ease' }} />
                          </div>
                        </div>

                        {/* Admit chance */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12, color: tierColor, fontWeight: 700 }}>
                            {rec.tier} · {rec.admit_chance}% admit chance
                          </span>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={() => setMlExpanded(prev => ({ ...prev, [rec.id]: !prev[rec.id] }))}
                              style={{ fontSize: 11, color: ACCENT, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            >
                              {isOpen ? 'Hide ▲' : 'Why this score? ▼'}
                            </button>
                            <button
                              onClick={() => dismissML(rec.id)}
                              style={{ fontSize: 11, color: S.muted, background: 'none', border: `1px solid ${S.border}`, borderRadius: 6, cursor: 'pointer', padding: '2px 8px' }}
                            >
                              Not for me
                            </button>
                          </div>
                        </div>

                        {/* Reasoning */}
                        {isOpen && rec.reasoning && rec.reasoning.length > 0 && (
                          <ul style={{ paddingLeft: 16, margin: '8px 0 0', borderTop: `1px solid ${S.border}`, paddingTop: 8 }}>
                            {rec.reasoning.map((r, i) => (
                              <li key={i} style={{ fontSize: 12, color: S.muted, marginBottom: 3 }}>{r}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {visibleMLRecs.length === 0 && !mlLoading && (
              <div style={{ fontSize: 13, color: S.muted, padding: '12px 0' }}>
                No ML recommendations available yet. Run <code>node scripts/precomputeCollegeVectors.js</code> to compute college vectors.
              </div>
            )}

            <div style={{ borderBottom: `1px solid ${S.border}`, margin: '32px 0' }} />
          </div>
        )}

        {/* Header */}
        <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
              🎓 College Recommendations
            </h1>
            <p style={{ fontSize: 14, color: S.muted, marginTop: 6 }}>
              Personalized college matches based on your academic profile, values, financials, and location preferences.
            </p>
            {data?.exchange_rate_estimated && (
              <p style={{ fontSize: 12, color: '#F59E0B', marginTop: 4 }}>
                ⚠️ INR figures use an estimated exchange rate (₹{data.exchange_rate_used}/USD) — live rate unavailable.
              </p>
            )}
          </div>
          <button
            onClick={generate}
            disabled={generating}
            style={{
              padding: '10px 20px', background: ACCENT, color: '#fff', border: 'none',
              borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: generating ? 'wait' : 'pointer',
              opacity: generating ? 0.7 : 1, fontFamily: S.font,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {generating
              ? <><span style={{ display:'inline-block', width:14, height:14, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} /> Generating…</>
              : '✨ Refresh Recommendations'
            }
          </button>
        </div>

        {/* Summary bar */}
        {data?.summary && (
          <div style={{
            background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12,
            padding: '14px 20px', marginBottom: 24, display: 'flex', gap: 24, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: 11, color: S.dim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Evaluated</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {data.summary.total_colleges_evaluated}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: S.dim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Showing</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)' }}>{recs.length}</div>
            </div>
            {data.generated_at && (
              <div>
                <div style={{ fontSize: 11, color: S.dim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Generated</div>
                <div style={{ fontSize: 12, color: S.muted }}>
                  {new Date(data.generated_at).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: S.muted }}>
            <div style={{ width: 36, height: 36, border: `3px solid ${S.border}`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
            <p style={{ fontSize: 14 }}>Loading recommendations…</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '20px 24px', color: '#F87171', fontSize: 14, fontFamily: S.font }}>
            <strong>Error:</strong> {error}
            <br />
            <button
              onClick={generate}
              style={{ marginTop: 12, fontSize: 13, color: ACCENT, background: 'none', border: 'none', cursor: 'pointer', fontFamily: S.font, textDecoration: 'underline' }}
            >
              Generate recommendations now →
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && recs.length === 0 && (
          <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, padding: '48px 40px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8 }}>No recommendations yet</h2>
            <p style={{ fontSize: 14, color: S.muted, marginBottom: 24 }}>
              Complete your onboarding profile (GPA, SAT, preferred countries, budget) then generate your first recommendations.
            </p>
            <button
              onClick={generate}
              disabled={generating}
              style={{ padding: '12px 28px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: S.font }}
            >
              Generate Recommendations
            </button>
          </div>
        )}

        {/* College list */}
        {!loading && !error && recs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {recs.map((rec, idx) => (
              <CollegeCard key={rec.college_id ?? idx} rec={rec} rank={idx + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CollegeRecommendations;

// src/pages/Chancing.tsx — Rich Chancing Dashboard
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import ProfileCompleteness from '../components/ProfileCompleteness';
import { useAuth } from '../contexts/AuthContext';

/* ─── Design tokens ──────────────────────────────────────────────────── */
const ACCENT = '#3B9EFF';
const h2r = (hex: string, a: number) => {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
};
const S = {
  bg: 'var(--color-bg-primary)',
  surface: 'var(--color-bg-surface)',
  surface2: 'var(--color-surface-subtle)',
  border: 'var(--color-border)',
  border2: 'var(--color-border-strong)',
  muted: 'var(--color-text-secondary)',
  dim: 'var(--color-text-disabled)',
  font: "'Inter', system-ui, sans-serif",
};

const TIER_META: Record<string, { color: string; bg: string; bar: string; label: string }> = {
  'Safety':        { color: '#10B981', bg: 'rgba(16,185,129,0.1)',  bar: '#10B981', label: 'Safety — High confidence of admission' },
  'Match':         { color: '#3B9EFF', bg: 'rgba(59,158,255,0.1)',  bar: '#3B9EFF', label: 'Match — Reasonable shot at admission' },
  'Reach':         { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  bar: '#F59E0B', label: 'Reach — Challenging but possible' },
  'Long Shot':     { color: '#EF4444', bg: 'rgba(239,68,68,0.1)',   bar: '#EF4444', label: 'Long Shot — Very selective, apply strategically' },
  'Extreme Reach': { color: '#991B1B', bg: 'rgba(153,27,27,0.1)',   bar: '#991B1B', label: 'Extreme Reach — Highly unlikely; include only as a dream school' },
  'Unknown':       { color: 'var(--color-text-secondary)', bg: 'var(--color-surface-subtle)', bar: 'var(--color-border)', label: 'Unknown — Add profile data for analysis' },
};

interface ChancingResult {
  college: {
    id: number; name: string; location?: string;
    acceptanceRate?: number;
  };
  chancing: {
    tier: string; confidence: string;
    explanation: string | { summary: string; factors?: any; probabilityRange?: any; missingDataFields?: string[]; recommendedActions?: string[] };
    probability?: number | null;
    studentSAT?: number; collegeSAT?: number;
    studentGPA?: number; collegeGPA?: number;
    factorsUsed?: number;
    missingDataFields?: string[];
    recommendedActions?: string[];
    probabilityRange?: { low: number; high: number } | null;
    factorScores?: Record<string, { score: number | null; weight: number; contribution: number | null; detail?: string }>;
  };
}

interface CollegeSummary {
  total: number; safetyCount: number; targetCount: number; reachCount: number;
}

const GLOBAL = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
  *{box-sizing:border-box;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
`;

/* ─── Probability bar ─────────────────────────────────────────────── */
function ProbBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ marginTop: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Admission Probability</span>
        <span style={{ fontSize: 20, fontWeight: 800, color }}>{pct}%</span>
      </div>
      <div style={{ height: 7, background: 'var(--color-border)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
      </div>
    </div>
  );
}

/* ─── Stat comparison chip ────────────────────────────────────────── */
function StatComp({
  label, yours, theirs, higherIsBetter = true,
}: { label: string; yours: number | null | undefined; theirs: number | null | undefined; higherIsBetter?: boolean }) {
  if (yours == null || theirs == null) return null;
  const delta = yours - theirs;
  const good = higherIsBetter ? delta >= 0 : delta <= 0;
  const col = good ? '#10B981' : '#F87171';
  const sign = delta > 0 ? '+' : '';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: good ? 'rgba(16,185,129,0.07)' : 'rgba(248,113,113,0.07)', border: `1px solid ${good ? 'rgba(16,185,129,0.2)' : 'rgba(248,113,113,0.2)'}`, borderRadius: 10 }}>
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>{yours}</span>
      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>vs median {theirs}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: col }}>{sign}{delta > 0 || delta < 0 ? Math.abs(delta).toFixed(label.toLowerCase().includes('gpa') ? 2 : 0) : '0'}</span>
    </div>
  );
}

/* ─── Recommendation bullets ─────────────────────────────────────── */
function Recommendations({ result }: { result: ChancingResult }) {
  const recs: string[] = [];
  const { tier, confidence, missingDataFields = [], recommendedActions = [] } = result.chancing;
  const probability = result.chancing.probability ?? 0;
  const { studentSAT, collegeSAT, studentGPA, collegeGPA, factorsUsed = 0 } = result.chancing;

  // Use AI-generated recommendations from the 7-factor service when available
  if (recommendedActions.length > 0) {
    recs.push(...recommendedActions);
  } else {
    // Fallback: derive recommendations locally
    if (confidence === 'Low' || factorsUsed === 0) {
      recs.push('Complete your profile (GPA, SAT/ACT) for a more accurate chancing estimate.');
    }
    if (studentSAT != null && collegeSAT != null && studentSAT < collegeSAT) {
      const gap = collegeSAT - studentSAT;
      recs.push(`Your SAT is ${gap} points below the college median (${collegeSAT}). Retaking to close this gap could meaningfully lift your probability.`);
    }
    if (studentGPA != null && collegeGPA != null && studentGPA < collegeGPA) {
      const gap = (collegeGPA - studentGPA).toFixed(2);
      recs.push(`Your GPA is ${gap} points below the college median (${collegeGPA}). Strong senior-year grades and rigorous coursework strengthen your application.`);
    }
    if (tier === 'Long Shot' || tier === 'Extreme Reach' || probability < 0.15) {
      recs.push('Consider adding this college as a "reach" and ensuring a strong personal statement, recommendations, and extracurricular narrative.');
      recs.push('Balance your college list with Match and Safety schools to improve your overall admission odds.');
    }
    if (tier === 'Reach' && result.college.acceptanceRate != null) {
      const pct = Math.round(result.college.acceptanceRate * 100);
      recs.push(`This college admits ~${pct}% of applicants overall. International pools are more competitive — focus on differentiating your application.`);
    }
    if (tier === 'Safety' || tier === 'Match') {
      recs.push('You are well-positioned for this college. Make sure your essays and recommendations reflect genuine interest and fit.');
    }
  }

  // Show missing profile data hints
  if (missingDataFields.length > 0) {
    recs.push(`Missing profile data that would improve accuracy: ${missingDataFields.join(', ')}.`);
  }

  if (recs.length === 0) {
    recs.push('Keep your profile up-to-date to get the most accurate chancing results.');
  }
  return (
    <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--color-surface-subtle)', borderRadius: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-secondary)', marginBottom: 8 }}>💡 Recommendations</div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {recs.map((r, i) => (
          <li key={i} style={{ fontSize: 12, color: 'var(--color-text-primary)', paddingLeft: 14, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0, color: ACCENT }}>›</span>
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── College chancing card ───────────────────────────────────────── */
function ChancingCard({ result, index }: { result: ChancingResult; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const tier = result.chancing.tier || 'Unknown';
  const meta = TIER_META[tier] ?? TIER_META['Unknown'];
  const pct = result.chancing.probability != null
    ? Math.round(result.chancing.probability * 100)
    : null;

  return (
    <div style={{
      background: S.surface, border: `1px solid ${S.border}`,
      borderLeft: `3px solid ${meta.color}`, borderRadius: 16, padding: '20px 22px',
      animation: 'fadeUp 0.3s ease both', animationDelay: `${index * 0.06}s`,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font, marginBottom: 3 }}>
            {result.college.name}
          </h3>
          {result.college.location && (
            <p style={{ fontSize: 12, color: S.muted, marginBottom: 2 }}>{result.college.location}</p>
          )}
          {result.college.acceptanceRate != null && (
            <p style={{ fontSize: 12, color: S.dim }}>
              Overall acceptance rate: {Math.round(result.college.acceptanceRate * 100)}%
            </p>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <span style={{
            fontSize: 12, fontWeight: 800, padding: '5px 12px', borderRadius: 100,
            background: meta.bg, color: meta.color, border: `1px solid ${meta.color}33`,
            whiteSpace: 'nowrap',
          }}>
            {tier}
          </span>
          <span style={{ fontSize: 11, color: S.dim }}>
            Confidence: {result.chancing.confidence}
          </span>
        </div>
      </div>

      {/* Probability bar */}
      {pct != null && <ProbBar pct={pct} color={meta.bar} />}

      {/* Probability range when available */}
      {result.chancing.probabilityRange != null && (
        <p style={{ fontSize: 11, color: S.dim, marginTop: 2 }}>
          Range: {Math.round(result.chancing.probabilityRange.low * 100)}%–{Math.round(result.chancing.probabilityRange.high * 100)}%
        </p>
      )}

      {/* Tier description */}
      <p style={{ fontSize: 12, color: S.muted, marginTop: 8, fontStyle: 'italic' }}>{meta.label}</p>

      {/* Explanation */}
      <p style={{ fontSize: 13, color: 'var(--color-text-primary)', marginTop: 10, lineHeight: 1.6 }}>
        {typeof result.chancing.explanation === 'object'
          ? result.chancing.explanation?.summary
          : result.chancing.explanation}
      </p>

      {/* Stat comparisons */}
      {(result.chancing.studentSAT != null || result.chancing.studentGPA != null) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <StatComp
            label="SAT"
            yours={result.chancing.studentSAT}
            theirs={result.chancing.collegeSAT}
          />
          <StatComp
            label="GPA"
            yours={result.chancing.studentGPA}
            theirs={result.chancing.collegeGPA}
          />
        </div>
      )}

      {/* Expand/collapse recommendations */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{ marginTop: 14, padding: '6px 0', background: 'transparent', border: 'none', color: ACCENT, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: S.font, display: 'flex', alignItems: 'center', gap: 5 }}
      >
        {expanded ? '▲' : '▼'} {expanded ? 'Hide' : 'Show'} recommendations
      </button>
      {expanded && <Recommendations result={result} />}

      <p style={{ fontSize: 11, color: S.dim, marginTop: 12 }}>
        ⚠️ International applicant pools are typically more selective than domestic figures. Use as a guide only.
      </p>
    </div>
  );
}

/* ─── Summary banner ──────────────────────────────────────────────── */
function SummaryBanner({ summary }: { summary: CollegeSummary }) {
  if (summary.total === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
      {[
        { label: 'Total', value: summary.total, color: ACCENT },
        { label: 'Safety', value: summary.safetyCount, color: '#10B981' },
        { label: 'Match', value: summary.targetCount, color: ACCENT },
        { label: 'Reach/Long Shot', value: summary.reachCount, color: '#F59E0B' },
      ].map(item => (
        <div key={item.label} style={{ flex: 1, minWidth: 100, background: S.surface, border: `1px solid ${S.border}`, borderRadius: 14, padding: '14px 18px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: item.color, lineHeight: 1 }}>{item.value}</div>
          <div style={{ fontSize: 12, color: S.muted, marginTop: 4 }}>{item.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────── */
export default function Chancing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [results, setResults] = useState<ChancingResult[]>([]);
  const [summary, setSummary] = useState<CollegeSummary>({ total: 0, safetyCount: 0, targetCount: 0, reachCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadSeqRef = React.useRef(0);
  const mountedRef = React.useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const load = async () => {
    const seq = ++loadSeqRef.current;
    try {
      setLoading(true);
      setError('');
      const res = await api.chancing.getForStudent();
      const data = res.data ?? res;
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      setResults(data?.results || []);
      if (data?.summary) setSummary(data.summary);
    } catch (err: any) {
      if (mountedRef.current && seq === loadSeqRef.current) {
        setError(err?.message || 'Failed to load chancing data');
      }
    } finally {
      if (mountedRef.current && seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <>
      <style>{GLOBAL}</style>
      <div style={{ minHeight: '100vh', background: S.bg, color: 'var(--color-text-primary)', fontFamily: S.font, padding: '32px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <ProfileCompleteness />

          <div style={{ marginBottom: 28, marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 6 }}>
                  Admission Chancing
                </h1>
                <p style={{ fontSize: 14, color: S.muted, maxWidth: 560 }}>
                  Probability estimates based on your academic profile vs. each college's reported median stats.
                  International pools are factored in. Results are a guide — not a guarantee.
                </p>
              </div>
              <button
                onClick={load}
                style={{ padding: '9px 18px', background: h2r(ACCENT, 0.12), border: `1px solid ${h2r(ACCENT, 0.3)}`, borderRadius: 10, color: ACCENT, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: S.font }}
              >
                ↺ Refresh
              </button>
            </div>
          </div>

          {/* How it works info box */}
          <div style={{ marginBottom: 28, padding: '14px 18px', background: h2r(ACCENT, 0.06), border: `1px solid ${h2r(ACCENT, 0.2)}`, borderRadius: 12, fontSize: 12, color: S.muted, lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--color-text-primary)' }}>How it works: </strong>
            We use a 7-factor probabilistic model: academic fit (SAT/GPA vs admitted band), school selectivity, holistic profile (ECs, awards), international pool competitiveness, application strategy (ED/EA/RD), institutional fit, and financial signal.
            Each factor is weighted and combined into a composite probability anchored to the college's real acceptance rate.
            Thresholds: Safety ≥ 68%, Match 42–67%, Reach 20–41%, Long Shot 8–19%, Extreme Reach {'<'} 8%.
          </div>

          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ height: 180, borderRadius: 16, background: S.surface, border: `1px solid ${S.border}`, opacity: 0.5 }} />
              ))}
            </div>
          )}

          {!loading && error && (
            <div style={{ padding: '16px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, color: '#EF4444', fontSize: 13 }}>
              {error}
            </div>
          )}

          {!loading && !error && results.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
              <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>No colleges in your list yet</h3>
              <p style={{ fontSize: 14, color: S.muted, marginBottom: 20 }}>Add colleges on the Colleges page to see your personalised admission probabilities.</p>
              <button
                onClick={() => navigate('/colleges')}
                style={{ padding: '10px 22px', background: ACCENT, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: S.font }}
              >
                Browse Colleges →
              </button>
            </div>
          )}

          {!loading && !error && results.length > 0 && (
            <>
              <SummaryBanner summary={summary} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {results.map((result, i) => (
                  <ChancingCard key={result.college.id} result={result} index={i} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

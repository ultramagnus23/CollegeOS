// src/pages/MastersDashboard.tsx — Dark Editorial Redesign, real insights.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Search, School, Clock, Calendar, DollarSign, FileText, ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import { api } from '../services/api';
import { isMastersTrackEnabled } from '../config/featureFlags';
import MastersDisclosure from '../components/masters/MastersDisclosure';
import MastersChancingCard, { ChancingAssessment } from '../components/masters/MastersChancingCard';

/* ─── Design tokens (matches MastersPrograms/Deadlines/Funding) ──────────── */
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
  text: 'var(--color-text-primary)',
  font: "'Inter', system-ui, sans-serif",
};
const GLOBAL = `
  *{box-sizing:border-box;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  input::placeholder{color:var(--color-text-disabled)!important;}
  select option{background:var(--color-bg-surface);color:var(--color-text-primary);}
`;

interface ProgramCard {
  id: string;
  institution_name: string;
  country: string;
  program_name: string;
  degree_type: string;
  specialization: string | null;
  is_stem_designated: boolean | null;
  funding_availability: string | null;
  tuition_total: number | null;
  tuition_currency: string | null;
  pathway_count: number | null;
  datapoint_count: number | null;
}

interface ReadinessItem { key: string; done: boolean; detail: string }
interface ReadinessData { completion: number; ready: boolean; items: ReadinessItem[]; message?: string }

interface DeadlineRow {
  program_id: string; program_name: string; institution_name: string;
  deadline_type: string; deadline_date: string | null; is_rolling: boolean;
}

interface FundingRow {
  program_id: string; program_name: string; institution_name: string;
  funding_availability: string | null; tuition_total: number | null; tuition_currency: string | null;
}

const COUNTRIES = ['', 'US', 'UK', 'CA', 'DE', 'NL', 'AU', 'SG'];
const DEGREES = ['', 'MS', 'MA', 'MBA'];

const QUICK_LINKS = [
  { label: 'Programs', icon: School, path: '/masters/programs' },
  { label: 'Timeline', icon: Clock, path: '/masters/timeline' },
  { label: 'Deadlines', icon: Calendar, path: '/masters/deadlines' },
  { label: 'Funding', icon: DollarSign, path: '/masters/funding' },
  { label: 'Applications', icon: FileText, path: '/masters/applications' },
];

const ReadinessRing: React.FC<{ pct: number }> = ({ pct }) => {
  const r = 36, c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <svg width={90} height={90}>
      <circle cx={45} cy={45} r={r} fill="none" stroke={S.border2} strokeWidth={7} />
      <circle
        cx={45} cy={45} r={r} fill="none" stroke={ACCENT} strokeWidth={7}
        strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: '45px 45px', transition: 'stroke-dasharray 0.4s ease' }}
      />
      <text x={45} y={50} textAnchor="middle" fill={S.text} fontSize={20} fontWeight={800} fontFamily={S.font}>{pct}%</text>
    </svg>
  );
};

const MastersDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [field, setField] = useState('');
  const [country, setCountry] = useState('');
  const [degreeType, setDegreeType] = useState('');
  const [programs, setPrograms] = useState<ProgramCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [chances, setChances] = useState<Record<string, ChancingAssessment>>({});

  const [readiness, setReadiness] = useState<ReadinessData | null>(null);
  const [deadlines, setDeadlines] = useState<DeadlineRow[]>([]);
  const [funding, setFunding] = useState<FundingRow[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(true);

  useEffect(() => {
    if (!isMastersTrackEnabled()) navigate('/dashboard', { replace: true });
  }, [navigate]);

  useEffect(() => {
    (async () => {
      try {
        const [readinessRes, deadlinesRes, fundingRes] = await Promise.all([
          api.masters.getReadiness(),
          api.masters.getDeadlines({ limit: 3 }),
          api.masters.getFunding({ limit: 3 }),
        ]);
        setReadiness((readinessRes?.data as ReadinessData) || null);
        setDeadlines(((deadlinesRes?.data as DeadlineRow[]) || []).slice(0, 3));
        setFunding(((fundingRes?.data as FundingRow[]) || []).slice(0, 3));
      } catch {
        /* dashboard insights are best-effort */
      } finally {
        setLoadingInsights(false);
      }
    })();
  }, []);

  const search = async () => {
    setSearching(true);
    try {
      const res = await api.masters.discover({
        field: field || undefined,
        countries: country ? [country] : undefined,
        degreeType: degreeType || undefined,
        limit: 25,
      });
      setPrograms((res?.data as ProgramCard[]) || []);
    } catch {
      setPrograms([]);
    } finally {
      setSearching(false);
    }
  };

  const loadChances = async (programId: string) => {
    try {
      const res = await api.masters.getChances(programId);
      if (res?.data) setChances((prev) => ({ ...prev, [programId]: res.data as ChancingAssessment }));
    } catch {
      /* surfaced as no card */
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: S.bg, padding: '32px 24px', fontFamily: S.font }}>
      <style>{GLOBAL}</style>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <GraduationCap size={24} style={{ color: ACCENT }} />
          <h1 style={{ fontSize: 28, fontWeight: 800, color: S.text, fontFamily: S.font, margin: 0 }}>Masters Dashboard</h1>
        </div>

        <MastersDisclosure variant="banner" />

        {/* Readiness + quick links */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, marginTop: 20 }}>
          <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, animation: 'fadeUp 0.25s ease both' }}>
            {loadingInsights ? (
              <div style={{ width: 28, height: 28, border: `3px solid ${S.border2}`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            ) : (
              <>
                <ReadinessRing pct={readiness?.completion ?? 0} />
                <span style={{ fontSize: 12, color: S.muted, textAlign: 'center' }}>Application readiness</span>
                {!readiness?.completion && (
                  <button
                    onClick={() => navigate('/masters/onboarding')}
                    style={{ fontSize: 12, color: ACCENT, background: 'none', border: 'none', cursor: 'pointer', fontFamily: S.font, fontWeight: 600 }}
                  >
                    Complete profile →
                  </button>
                )}
              </>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {QUICK_LINKS.map((link, i) => (
              <button
                key={link.label}
                onClick={() => navigate(link.path)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start',
                  background: S.surface, border: `1px solid ${S.border}`, borderRadius: 14,
                  padding: 16, cursor: 'pointer', textAlign: 'left', fontFamily: S.font,
                  animation: 'fadeUp 0.25s ease both', animationDelay: `${i * 0.04}s`,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = h2r(ACCENT, 0.4))}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = S.border)}
              >
                <link.icon size={18} style={{ color: ACCENT }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: S.text }}>{link.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Readiness checklist */}
        {readiness && readiness.items.length > 0 && (
          <div style={{ marginTop: 16, background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, padding: 18, animation: 'fadeUp 0.25s ease both' }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: S.dim, margin: '0 0 12px' }}>Readiness checklist</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {readiness.items.map((item) => (
                <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  {item.done ? <CheckCircle2 size={16} style={{ color: '#10B981', flexShrink: 0 }} /> : <Circle size={16} style={{ color: S.dim, flexShrink: 0 }} />}
                  <span style={{ color: S.text, fontWeight: 600 }}>{item.key}</span>
                  <span style={{ color: S.dim, fontSize: 12 }}>{item.detail}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Deadlines + funding preview */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
          <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: S.dim, margin: 0 }}>Upcoming deadlines</h3>
              <button onClick={() => navigate('/masters/deadlines')} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: S.font }}>
                All <ArrowRight size={12} />
              </button>
            </div>
            {deadlines.length === 0 ? (
              <p style={{ fontSize: 13, color: S.dim, margin: 0 }}>No saved programs with deadlines yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {deadlines.map((d, i) => (
                  <div key={`${d.program_id}-${i}`} style={{ fontSize: 13 }}>
                    <div style={{ color: S.text, fontWeight: 600 }}>{d.institution_name}</div>
                    <div style={{ color: S.dim, fontSize: 12 }}>
                      {d.deadline_type.replace(/_/g, ' ')} · {d.is_rolling ? 'rolling' : (d.deadline_date ? new Date(d.deadline_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: S.dim, margin: 0 }}>Funding snapshot</h3>
              <button onClick={() => navigate('/masters/funding')} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: S.font }}>
                All <ArrowRight size={12} />
              </button>
            </div>
            {funding.length === 0 ? (
              <p style={{ fontSize: 13, color: S.dim, margin: 0 }}>No funding data yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {funding.map((f, i) => (
                  <div key={`${f.program_id}-${i}`} style={{ fontSize: 13 }}>
                    <div style={{ color: S.text, fontWeight: 600 }}>{f.institution_name}</div>
                    <div style={{ color: S.dim, fontSize: 12 }}>
                      {f.funding_availability || 'Funding unknown'}
                      {f.tuition_total != null && ` · ${f.tuition_currency || ''} ${Number(f.tuition_total).toLocaleString()}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Program discovery */}
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: S.text, margin: '0 0 12px' }}>Discover programs</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <input
                style={{ gridColumn: 'span 2', padding: '10px 14px', background: S.surface2, border: `1px solid ${S.border2}`, borderRadius: 10, color: S.text, fontSize: 13, fontFamily: S.font }}
                placeholder="Field or specialization (e.g. machine learning)"
                value={field}
                onChange={(e) => setField(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
              />
              <select style={{ padding: '10px 14px', background: S.surface2, border: `1px solid ${S.border2}`, borderRadius: 10, color: S.text, fontSize: 13, fontFamily: S.font }} value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c || 'Any country'}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <select style={{ flex: 1, padding: '10px 14px', background: S.surface2, border: `1px solid ${S.border2}`, borderRadius: 10, color: S.text, fontSize: 13, fontFamily: S.font }} value={degreeType} onChange={(e) => setDegreeType(e.target.value)}>
                  {DEGREES.map((d) => <option key={d} value={d}>{d || 'Any degree'}</option>)}
                </select>
                <button onClick={search} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', background: ACCENT, border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: S.font }}>
                  <Search size={14} /> Find
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {searching && <p style={{ fontSize: 13, color: S.dim }}>Searching…</p>}
            {!searching && programs.length === 0 && (
              <div style={{ border: `1px dashed ${S.border2}`, borderRadius: 16, padding: 32, textAlign: 'center', color: S.dim, fontSize: 13 }}>
                Search above to find matching programs, or browse the full catalog from "Programs" on the left.
              </div>
            )}
            {programs.map((p) => (
              <div key={p.id} style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, padding: 18, animation: 'fadeUp 0.25s ease both' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <h3
                      onClick={() => navigate(`/masters/programs/${p.id}`)}
                      style={{ fontWeight: 700, color: S.text, margin: 0, cursor: 'pointer' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = ACCENT)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = S.text)}
                    >
                      {p.program_name}
                    </h3>
                    <p style={{ fontSize: 13, color: S.dim, margin: '4px 0 0' }}>{p.institution_name} · {p.country} · {p.degree_type}</p>
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11 }}>
                      {p.is_stem_designated && <span style={{ borderRadius: 100, padding: '2px 8px', background: 'rgba(16,185,129,0.12)', color: '#10B981', fontWeight: 600 }}>STEM</span>}
                      {p.funding_availability && <span style={{ borderRadius: 100, padding: '2px 8px', background: h2r(ACCENT, 0.12), color: ACCENT, fontWeight: 600 }}>{p.funding_availability}</span>}
                      {p.tuition_total != null && (
                        <span style={{ borderRadius: 100, padding: '2px 8px', background: S.surface2, color: S.muted }}>
                          {p.tuition_currency || ''} {Number(p.tuition_total).toLocaleString()}
                        </span>
                      )}
                      <span style={{ borderRadius: 100, padding: '2px 8px', background: S.surface2, color: S.dim }}>{p.datapoint_count || 0} self-reports</span>
                    </div>
                  </div>
                  <button
                    onClick={() => loadChances(p.id)}
                    style={{ borderRadius: 10, border: `1px solid ${h2r(ACCENT, 0.4)}`, padding: '8px 14px', fontSize: 12, fontWeight: 600, color: ACCENT, background: 'transparent', cursor: 'pointer', fontFamily: S.font }}
                  >
                    Check my competitiveness
                  </button>
                </div>
                {chances[p.id] && (
                  <div style={{ marginTop: 16 }}>
                    <MastersChancingCard assessment={chances[p.id]} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MastersDashboard;

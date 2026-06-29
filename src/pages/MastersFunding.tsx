// src/pages/MastersFunding.tsx — Dark Editorial Redesign
import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { DollarSign, GraduationCap, Filter, Search } from 'lucide-react';
import { toast } from 'sonner';

/* ─── Design tokens ──────────────────────────────────────────────── */
const ACCENT = '#3B9EFF';
const h2r = (hex: string, a: number) => {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
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
const GLOBAL = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
  *{box-sizing:border-box;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  input::placeholder{color:var(--color-text-disabled)!important;}
  select option{background:var(--color-bg-surface);color:var(--color-text-primary);}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}
`;

/* ─── Types ───────────────────────────────────────────────────────── */
interface Funding {
  program_id: string;
  program_name: string;
  institution_name: string;
  country: string | null;
  degree_type: string;
  funding_availability: string | null;
  assistantship_types: string[];
  tuition_waiver_available: boolean | null;
  tuition_total: number | null;
  tuition_currency: string | null;
  data_quality_score: number | null;
}

/* ─── Component ───────────────────────────────────────────────────── */
const MastersFunding: React.FC = () => {
  const [funding, setFunding] = useState<Funding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFunding, setFilterFunding] = useState('');
  const [filterDegree, setFilterDegree] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = {};
      if (filterFunding) params.fundingAvailability = filterFunding;
      if (filterDegree) params.degreeType = filterDegree;
      const res = await api.masters.getFunding(params);
      const data: Funding[] = res?.data || [];
      setFunding(data);
    } catch {
      toast.error('Failed to load funding data');
      setError('Failed to load funding data');
    } finally {
      setLoading(false);
    }
  };

  const filtered = funding.filter(f => {
    if (searchTerm && !f.institution_name.toLowerCase().includes(searchTerm.toLowerCase()) && !f.program_name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterFunding && f.funding_availability !== filterFunding) return false;
    if (filterDegree && f.degree_type !== filterDegree) return false;
    return true;
  });

  const fundingTypes = [...new Set(funding.map(f => f.funding_availability).filter(Boolean))].sort();
  const degreeTypes = [...new Set(funding.map(f => f.degree_type).filter(Boolean))].sort();

  const totalTuition = funding.reduce((sum, f) => sum + (f.tuition_total || 0), 0);
  const withAssistantship = funding.filter(f => (f.assistantship_types?.length || 0) > 0).length;
  const withWaiver = funding.filter(f => f.tuition_waiver_available).length;

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: S.bg }}>
        <style>{GLOBAL}</style>
        <div style={{ width: 40, height: 40, border: `3px solid ${S.border2}`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  return (
    <>
      <style>{GLOBAL}</style>
      <div style={{ minHeight: '100vh', background: S.bg, color: 'var(--color-text-primary)', fontFamily: S.font }}>
        {/* Hero */}
        <div style={{
          padding: '44px 48px 0',
          background: `linear-gradient(180deg,${h2r(ACCENT,0.08)} 0%,transparent 100%)`,
          borderBottom: `1px solid ${S.border}`,
        }}>
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 28, flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: h2r(ACCENT,0.9), textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10, fontWeight: 600 }}>Graduate Funding</div>
                <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 6 }}>
                  <span style={{ color: ACCENT }}>Funding</span> & Scholarships
                </h1>
                <p style={{ color: S.muted, fontSize: 14 }}>
                  {loading ? 'Loading…' : `${filtered.length} programs with funding data`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ padding: '10px 18px', background: h2r(ACCENT,0.1), border: `1px solid ${h2r(ACCENT,0.25)}`, borderRadius: 12, textAlign: 'center' as const, minWidth: 80 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: ACCENT, fontFamily: S.font }}>{withAssistantship}</div>
                  <div style={{ fontSize: 11, color: S.muted, fontFamily: S.font }}>Assistantships</div>
                </div>
                <div style={{ padding: '10px 18px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 12, textAlign: 'center' as const, minWidth: 80 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#10B981', fontFamily: S.font }}>{withWaiver}</div>
                  <div style={{ fontSize: 11, color: S.muted, fontFamily: S.font }}>Waivers</div>
                </div>
              </div>
            </div>

            {/* Summary row */}
            <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
              {(() => {
                const avgTuition = funding.length > 0 ? totalTuition / funding.length : 0;
                return (
                  <div style={{ fontSize: 13, color: S.muted, fontFamily: S.font }}>
                    Avg tuition: <strong style={{ color: 'var(--color-text-primary)' }}>${avgTuition.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                  </div>
                );
              })()}
              <div style={{ fontSize: 13, color: S.muted, fontFamily: S.font }}>
                <strong style={{ color: 'var(--color-text-primary)' }}>{funding.filter(f => f.funding_availability === 'fully_funded').length}</strong> programs with full funding
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 48px' }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: S.muted, pointerEvents: 'none' }} />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search programs…"
                style={{
                  width: '100%', padding: '10px 14px 10px 40px',
                  background: S.surface2, border: `1px solid ${S.border2}`,
                  borderRadius: 10, color: 'var(--color-text-primary)', fontSize: 14, fontFamily: S.font,
                  outline: 'none',
                }}
              />
            </div>
            <select
              value={filterFunding}
              onChange={(e) => { setFilterFunding(e.target.value); loadData(); }}
              style={{
                padding: '10px 14px', background: S.surface2, border: `1px solid ${S.border2}`,
                borderRadius: 10, color: 'var(--color-text-primary)', fontSize: 13, fontFamily: S.font, width: 200,
              }}
            >
              <option value="">All Funding Types</option>
              {fundingTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
            <select
              value={filterDegree}
              onChange={(e) => { setFilterDegree(e.target.value); loadData(); }}
              style={{
                padding: '10px 14px', background: S.surface2, border: `1px solid ${S.border2}`,
                borderRadius: 10, color: 'var(--color-text-primary)', fontSize: 13, fontFamily: S.font, width: 180,
              }}
            >
              <option value="">All Degrees</option>
              {degreeTypes.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Results */}
          {error && (
            <div style={{ textAlign: 'center', padding: '64px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8 }}>Couldn't load funding data</div>
              <button onClick={loadData} style={{ padding: '9px 22px', background: ACCENT, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: S.font, cursor: 'pointer' }}>Retry</button>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '64px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>💰</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8 }}>No funding data matches your filters</div>
              <div style={{ color: S.muted, fontSize: 14, fontFamily: S.font, marginBottom: 20 }}>Try broadening your search.</div>
              <button onClick={() => { setSearchTerm(''); setFilterFunding(''); setFilterDegree(''); }} style={{ padding: '9px 22px', background: 'transparent', border: `1px solid ${S.border2}`, borderRadius: 10, color: S.muted, fontSize: 13, fontWeight: 600, fontFamily: S.font, cursor: 'pointer' }}>Reset Filters</button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 20 }}>
            {filtered.map((f, idx) => (
              <FundingCard key={f.program_id} funding={f} index={idx} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

/* ─── Funding Card ──────────────────────────────────────────────────── */
const FundingCard: React.FC<{ funding: Funding; index: number }> = ({ funding, index }) => {
  const h2r = (hex: string, a: number) => {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
  };
  const accent = funding.country === 'US' ? '#3B9EFF' : funding.country === 'UK' ? '#A855F7' : funding.country === 'CA' ? '#EF4444' : '#10B981';

  const fundingColor = funding.funding_availability === 'fully_funded' ? '#10B981' : funding.funding_availability === 'partial' ? '#FBBF24' : funding.funding_availability === 'unfunded' ? '#F87171' : ACCENT;

  return (
    <div
      style={{
        background: S.surface, border: `1px solid ${S.border}`, borderRadius: 18, overflow: 'hidden',
        animation: 'fadeUp 0.35s ease both', animationDelay: `${index * 0.04}s`,
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = h2r(accent, 0.4)}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)'}
    >
      <div style={{ height: 3, background: `linear-gradient(90deg, ${fundingColor} 0%, ${h2r(fundingColor, 0.3)} 100%)` }} />
      <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${S.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font, marginBottom: 4 }}>{funding.institution_name}</div>
            <div style={{ fontSize: 13, color: S.muted, fontFamily: S.font }}>{funding.program_name}</div>
          </div>
          {funding.funding_availability && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: h2r(fundingColor, 0.12), color: fundingColor, fontWeight: 600, fontFamily: S.font, flexShrink: 0 }}>
              {funding.funding_availability.replace(/_/g, ' ')}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: h2r(accent, 0.12), color: accent, fontWeight: 600, fontFamily: S.font }}>{funding.degree_type}</span>
          {funding.country && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: 'rgba(255,255,255,0.06)', color: S.muted, fontWeight: 500, fontFamily: S.font }}>{funding.country}</span>
          )}
          {funding.tuition_waiver_available && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: 'rgba(16,185,129,0.18)', color: '#10B981', fontWeight: 600, fontFamily: S.font }}>Tuition Waiver</span>
          )}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: S.border }}>
        <div style={{ padding: '12px 16px', background: S.surface }}>
          <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font, marginBottom: 3 }}>Tuition</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: funding.tuition_total != null ? 'var(--color-text-primary)' : S.dim, fontFamily: S.font }}>
            {funding.tuition_total != null ? `$${funding.tuition_total.toLocaleString()} ${funding.tuition_currency || ''}` : 'N/A'}
          </div>
        </div>
        <div style={{ padding: '12px 16px', background: S.surface }}>
          <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font, marginBottom: 3 }}>Data quality</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: funding.data_quality_score != null ? 'var(--color-text-primary)' : S.dim, fontFamily: S.font }}>
            {funding.data_quality_score != null ? `${Math.round(funding.data_quality_score)}%` : 'N/A'}
          </div>
        </div>
        {funding.assistantship_types?.length > 0 && (
          <div style={{ padding: '12px 18px', borderTop: `1px solid ${S.border}`, gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {funding.assistantship_types.map((t, i) => (
                <span key={i} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 100, background: h2r(accent, 0.1), color: accent, fontFamily: S.font, fontWeight: 500 }}>{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MastersFunding;

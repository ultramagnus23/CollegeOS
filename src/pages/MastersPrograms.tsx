// src/pages/MastersPrograms.tsx — Dark Editorial Redesign
import React, { useEffect, useState, useRef, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Globe, GraduationCap, DollarSign, Filter, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../services/api';
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
  input::placeholder,textarea::placeholder{color:var(--color-text-disabled)!important;}
  select option{background:var(--color-bg-surface);color:var(--color-text-primary);}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}
`;

/* ==================== TYPES ==================== */
interface MastersProgram {
  id: string;
  institution_name: string;
  program_name: string;
  degree_type: string;
  specialization?: string;
  country?: string;
  tuition_total?: number;
  tuition_currency?: string;
  funding_availability?: string;
  is_stem_designated?: boolean;
  data_quality_score?: number;
  start_date?: string;
  duration_months?: number;
  delivery_mode?: string;
}

/* ==================== MAIN ==================== */
const MastersPrograms: React.FC = () => {
  const navigate = useNavigate();

  const [programs, setPrograms] = useState<MastersProgram[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [degreeTypes, setDegreeTypes] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedDegreeType, setSelectedDegreeType] = useState('');
  const [sortBy, setSortBy] = useState('data_quality_score');
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    (async () => {
      try {
        const all = await api.masters.listPrograms({ limit: 1000 });
        const data: MastersProgram[] = all?.data || [];
        const countrySet = new Set<string>();
        const degreeSet = new Set<string>();
        data.forEach(p => {
          if (p.country) countrySet.add(p.country);
          if (p.degree_type) degreeSet.add(p.degree_type);
        });
        setCountries([...countrySet].sort());
        setDegreeTypes([...degreeSet].sort());
      } catch {
        /* country/degree filter options are best-effort */
      }
    })();
  }, []);

  useEffect(() => {
    loadPrograms();
  }, [debouncedSearchTerm, selectedCountry, selectedDegreeType, sortBy, currentPage]);

  const loadPrograms = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = { page: currentPage };
      if (debouncedSearchTerm) params.q = debouncedSearchTerm;
      if (selectedCountry) params.country = selectedCountry;
      if (selectedDegreeType) params.degreeType = selectedDegreeType;
      if (sortBy) params.sortBy = sortBy;

      const res = await api.masters.listPrograms(params);
      const data: MastersProgram[] = res?.data || [];
      setPrograms(data);
      setTotalCount(res?.count || data.length);
      setTotalPages(res?.totalPages || 1);
    } catch (err) {
      console.error('Error loading masters programs:', err);
      setError('Failed to load programs');
    } finally {
      setLoading(false);
    }
  };

  const sel: React.CSSProperties = {
    padding: '10px 14px', background: S.surface2,
    border: `1px solid ${S.border2}`, borderRadius: 10,
    color: 'var(--color-text-primary)', fontSize: 13, fontFamily: S.font,
    width: '100%', appearance: 'none' as const,
  };

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
                <div style={{ fontSize: 12, color: h2r(ACCENT,0.9), textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10, fontWeight: 600 }}>Graduate Programs</div>
                <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 6 }}>
                  <span style={{ color: ACCENT }}>Explore</span> Masters Programs
                </h1>
                <p style={{ color: S.muted, fontSize: 14 }}>
                  {loading ? 'Loading…' : `${totalCount?.toLocaleString() ?? '0'} graduate programs`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ padding: '10px 18px', background: h2r(ACCENT,0.1), border: `1px solid ${h2r(ACCENT,0.25)}`, borderRadius: 12, textAlign: 'center' as const, minWidth: 80 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: ACCENT, fontFamily: S.font }}>{totalCount}</div>
                  <div style={{ fontSize: 11, color: S.muted, fontFamily: S.font }}>Programs</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Search + Filters */}
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 48px' }}>
          <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 18, padding: '20px 24px', marginBottom: 28 }}>
            <div style={{ position: 'relative', marginBottom: showFilters ? 16 : 0 }}>
              <Search style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, color: S.muted, pointerEvents: 'none' }} />
              <input
                ref={searchRef}
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                placeholder="Search programs by name, institution, or specialization…"
                style={{
                  width: '100%', padding: '12px 14px 12px 44px',
                  background: S.surface2, border: `1px solid ${S.border2}`,
                  borderRadius: 12, color: 'var(--color-text-primary)', fontSize: 15, fontFamily: S.font,
                  outline: 'none',
                }}
              />
              <button
                onClick={() => setShowFilters(!showFilters)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', background: showFilters ? h2r(ACCENT,0.15) : S.surface,
                  border: `1px solid ${showFilters ? h2r(ACCENT,0.4) : S.border2}`,
                  borderRadius: 8, color: showFilters ? ACCENT : S.muted,
                  fontSize: 13, fontWeight: 600, fontFamily: S.font, cursor: 'pointer',
                }}
              >
                <Filter style={{ width: 15, height: 15 }} />
                Filters
                <ChevronDown style={{ width: 14, height: 14, transform: showFilters ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>
            </div>

            {showFilters && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14, paddingTop: 16, borderTop: `1px solid ${S.border}` }}>
                <div>
                  <label style={{ fontSize: 11, color: S.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 600, display: 'block', fontFamily: S.font }}>Country</label>
                  <select value={selectedCountry} onChange={(e) => { setSelectedCountry(e.target.value); setCurrentPage(1); }} style={sel}>
                    <option value="">All Countries</option>
                    {countries.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: S.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 600, display: 'block', fontFamily: S.font }}>Degree Type</label>
                  <select value={selectedDegreeType} onChange={(e) => { setSelectedDegreeType(e.target.value); setCurrentPage(1); }} style={sel}>
                    <option value="">All Degrees</option>
                    {degreeTypes.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: S.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 600, display: 'block', fontFamily: S.font }}>Sort By</label>
                  <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setCurrentPage(1); }} style={sel}>
                    <option value="data_quality_score">Data Quality</option>
                    <option value="name">Name (A-Z)</option>
                    <option value="tuition">Tuition (Lowest)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    onClick={() => { setSearchTerm(''); setSelectedCountry(''); setSelectedDegreeType(''); setSortBy('data_quality_score'); setCurrentPage(1); }}
                    style={{ width: '100%', padding: '10px 14px', background: 'transparent', border: `1px solid ${S.border2}`, borderRadius: 10, color: S.muted, fontSize: 13, fontFamily: S.font, cursor: 'pointer' }}
                  >
                    Clear All
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Results */}
          {loading && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 20 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 18, overflow: 'hidden', height: 220, animation: 'fadeUp 0.35s ease both', animationDelay: `${i * 0.06}s` }}>
                  <div style={{ height: 3, background: h2r(ACCENT, 0.15) }} />
                  <div style={{ padding: '18px 20px 14px' }}>
                    <div style={{ height: 18, width: '70%', background: 'rgba(255,255,255,0.07)', borderRadius: 8, marginBottom: 10 }} />
                    <div style={{ height: 12, width: '45%', background: 'rgba(255,255,255,0.04)', borderRadius: 6 }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: S.border }}>
                    {[0,1,2,3].map(j => (
                      <div key={j} style={{ padding: '12px 16px', background: S.surface }}>
                        <div style={{ height: 10, width: '50%', background: 'rgba(255,255,255,0.04)', borderRadius: 4, marginBottom: 6 }} />
                        <div style={{ height: 14, width: '70%', background: 'rgba(255,255,255,0.06)', borderRadius: 4 }} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div style={{ textAlign: 'center', padding: '64px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8, fontFamily: S.font }}>Couldn't load programs</div>
              <div style={{ color: S.muted, fontSize: 14, fontFamily: S.font, marginBottom: 20 }}>Check your connection and try again.</div>
              <button onClick={loadPrograms} style={{ padding: '9px 22px', background: ACCENT, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: S.font, cursor: 'pointer' }}>Retry</button>
            </div>
          )}

          {!loading && !error && programs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '64px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎓</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8, fontFamily: S.font }}>No programs match your filters</div>
              <div style={{ color: S.muted, fontSize: 14, fontFamily: S.font, marginBottom: 20 }}>Try broadening your search.</div>
              <button onClick={() => { setSearchTerm(''); setSelectedCountry(''); setSelectedDegreeType(''); setSortBy('data_quality_score'); setCurrentPage(1); }} style={{ padding: '9px 22px', background: 'transparent', border: `1px solid ${S.border2}`, borderRadius: 10, color: S.muted, fontSize: 13, fontWeight: 600, fontFamily: S.font, cursor: 'pointer' }}>Reset Filters</button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 20 }}>
            {programs.map((program, idx) => (
              <ProgramCard key={program.id} program={program} index={idx} onClick={() => navigate(`/masters/programs/${program.id}`)} />
            ))}
          </div>

          {totalPages > 1 && !loading && !error && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 32 }}>
              <button disabled={currentPage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: S.surface, border: `1px solid ${S.border2}`, borderRadius: 10, color: currentPage <= 1 ? S.dim : S.muted, fontSize: 13, fontWeight: 600, fontFamily: S.font, cursor: currentPage <= 1 ? 'not-allowed' : 'pointer', opacity: currentPage <= 1 ? 0.4 : 1 }}>
                <ChevronLeft style={{ width: 16, height: 16 }} /> Prev
              </button>
              <span style={{ fontSize: 13, color: S.muted, fontFamily: S.font }}>Page {currentPage} of {totalPages}</span>
              <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: S.surface, border: `1px solid ${S.border2}`, borderRadius: 10, color: currentPage >= totalPages ? S.dim : S.muted, fontSize: 13, fontWeight: 600, fontFamily: S.font, cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer', opacity: currentPage >= totalPages ? 0.4 : 1 }}>
                Next <ChevronRight style={{ width: 16, height: 16 }} />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

/* ==================== PROGRAM CARD ==================== */
const ProgramCard: React.FC<{ program: MastersProgram; index: number; onClick: () => void }> = ({ program, index, onClick }) => {
  const h2r = (hex: string, a: number) => {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
  };
  const country = program.country || 'Unknown';
  const accent = country === 'United States' ? '#3B9EFF' : country === 'UK' ? '#A855F7' : country === 'Canada' ? '#EF4444' : '#10B981';

  return (
    <div
      style={{
        background: S.surface, border: `1px solid ${S.border}`, borderRadius: 18, overflow: 'hidden',
        animation: 'fadeUp 0.35s ease both', animationDelay: `${index * 0.04}s`,
        transition: 'border-color 0.2s, box-shadow 0.2s', cursor: 'pointer',
      }}
      onClick={onClick}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = h2r(accent, 0.4); (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 24px ${h2r(accent, 0.1)}`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
    >
      <div style={{ height: 3, background: `linear-gradient(90deg, ${accent} 0%, ${h2r(accent, 0.3)} 100%)` }} />
      <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${S.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font, marginBottom: 4, lineHeight: 1.3 }}>{program.institution_name}</div>
            <div style={{ fontSize: 13, color: S.muted, fontFamily: S.font, lineHeight: 1.4 }}>{program.program_name}</div>
          </div>
          {program.data_quality_score != null && (
            <div style={{ padding: '3px 10px', background: h2r(accent, 0.12), border: `1px solid ${h2r(accent, 0.3)}`, borderRadius: 8, fontSize: 12, fontWeight: 700, color: accent, fontFamily: S.font, flexShrink: 0 }}>
              Q: {Math.round(program.data_quality_score)}%
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: h2r(accent, 0.12), color: accent, fontWeight: 600, fontFamily: S.font }}>{program.degree_type}</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: 'rgba(255,255,255,0.06)', color: S.muted, fontWeight: 500, fontFamily: S.font }}>{country}</span>
          {program.is_stem_designated && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: 'rgba(16,185,129,0.18)', color: '#10B981', fontWeight: 600, fontFamily: S.font }}>STEM</span>
          )}
          {program.funding_availability && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: 'rgba(251,191,36,0.12)', color: '#FBBF24', fontWeight: 600, fontFamily: S.font }}>{program.funding_availability}</span>
          )}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: S.border }}>
        <div style={{ padding: '12px 16px', background: S.surface }}>
          <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font, marginBottom: 3 }}>Tuition</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: program.tuition_total != null ? 'var(--color-text-primary)' : S.dim, fontFamily: S.font }}>
            {program.tuition_total != null ? `$${program.tuition_total.toLocaleString()} ${program.tuition_currency || ''}` : 'N/A'}
          </div>
        </div>
        <div style={{ padding: '12px 16px', background: S.surface }}>
          <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font, marginBottom: 3 }}>Duration</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: program.duration_months != null ? 'var(--color-text-primary)' : S.dim, fontFamily: S.font }}>
            {program.duration_months ? `${program.duration_months}mo` : 'N/A'}
          </div>
        </div>
        {program.specialization && (
          <div style={{ padding: '10px 18px', borderTop: `1px solid ${S.border}`, gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 100, background: h2r(accent, 0.1), color: accent, fontFamily: S.font, fontWeight: 500 }}>{program.specialization}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MastersPrograms;

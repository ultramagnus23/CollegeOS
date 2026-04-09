// src/pages/Colleges.tsx — Dark Editorial Redesign
import React, { useEffect, useState, useRef, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Globe, MapPin, GraduationCap, DollarSign, Users, TrendingUp, ChevronDown, SlidersHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../services/api';
import { normalizeCountryData, College, TestScores, GraduationRates } from '../types';
import FitBadge from '../components/FitBadge';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import {
  searchColleges,
  getDistinctCountries,
  isSupabaseConfigured,
  normalizeToCard,
} from '../lib/collegeService';

/* ─── Design tokens ──────────────────────────────────────────────── */
const h2r = (hex: string, a: number) => {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
};
const ACCENT = '#3B9EFF';
const S = {
  bg: 'var(--color-bg-primary)',
  surface: 'var(--color-bg-surface)',
  surface2: 'var(--color-surface-subtle)',
  border: 'var(--color-border)',
  border2: 'var(--color-border-strong)',
  muted: 'var(--color-text-secondary)',
  dim: 'var(--color-text-disabled)',
  font: "'DM Sans',sans-serif",
};
const GLOBAL_COLLEGES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
  *{box-sizing:border-box;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  input::placeholder,textarea::placeholder{color:var(--color-text-disabled)!important;}
  select option{background:var(--color-bg-surface);color:var(--color-text-primary);}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}
`;

/* ==================== TYPES ==================== */

interface CollegeCardProps {
  college: College;
  index: number;
  onAdd: () => void;
  onViewDetails: () => void;
  isAdding: boolean;
  fit?: string | null;
}

/* ==================== MAIN ==================== */

const Colleges: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [colleges, setColleges] = useState<College[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [programs, setPrograms] = useState<string[]>([]);
  // Map of collegeId → fit category, populated by a single batch call after colleges load
  const [fitMap, setFitMap] = useState<Record<number, string | null>>({});

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [showFilters, setShowFilters] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingCollegeId, setAddingCollegeId] = useState<number | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  // Guard: prevents duplicate or concurrent batch fit calls (React StrictMode double-invoke safe)
  const fitBatchInFlight = useRef(false);

  /* ==================== LOAD FILTERS ==================== */

  useEffect(() => {
    (async () => {
      try {
        if (isSupabaseConfigured) {
          // Fetch countries from Supabase (avoids PostgREST 1,000-row cap)
          const countryList = await getDistinctCountries();
          setCountries(countryList);
        } else {
          // Fallback to backend API when Supabase is not configured
          const countriesRes = await api.colleges.getCountries();
          setCountries(normalizeCountryData(countriesRes.data || []));
        }
        const programsRes = await api.colleges.getPrograms();
        setPrograms(programsRes.data || []);
      } catch (err) {
        console.error('Failed to load filters', err);
      }
    })();
  }, []);

  /* ==================== DEBOUNCE SEARCH ==================== */

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  /* ==================== LOAD COLLEGES ==================== */

  useEffect(() => {
    loadColleges();
  }, [debouncedSearchTerm, selectedCountry, selectedProgram, sortBy, currentPage, user]);

  /**
   * Fetch fit classifications for all college IDs using the batch endpoint.
   * Splits into chunks of 50 to stay well under the server's 100-ID limit.
   * The in-flight guard prevents duplicate calls from React StrictMode double-invoke
   * and from rapid filter changes that each call loadColleges in quick succession.
   */
  const loadFitData = async (collegeIds: number[]) => {
    if (!user) return;
    if (collegeIds.length === 0) return;
    // JS is single-threaded: the check and set below execute atomically (no await
    // between them), so two concurrent calls cannot both pass this guard.
    if (fitBatchInFlight.current) return;
    fitBatchInFlight.current = true;
    const CHUNK_SIZE = 50;
    const merged: Record<number, string | null> = {};
    try {
      for (let i = 0; i < collegeIds.length; i += CHUNK_SIZE) {
        const chunk = collegeIds.slice(i, i + CHUNK_SIZE);
        const res = await api.fit.batchGet(chunk);
        if (res?.success && res.data) {
          const batchData: Record<string, any> = res.data;
          for (const [idStr, fitData] of Object.entries(batchData)) {
            // Backend returns fitCategory as the canonical property name
            const cat = fitData?.fitCategory ?? null;
            merged[parseInt(idStr)] = cat;
          }
        }
      }
      setFitMap(merged);
    } catch (err) {
      // Fit data is optional — log and continue without it
      console.warn('Batch fit fetch failed, fit badges will not be shown:', err);
    } finally {
      fitBatchInFlight.current = false;
    }
  };

  const loadColleges = async () => {
    try {
      setLoading(true);
      setError(null);

      if (isSupabaseConfigured) {
        // ── Supabase path: server-side filtering + correct pagination ────────
        const result = await searchColleges({
          query:   debouncedSearchTerm   || undefined,
          country: selectedCountry || undefined,
          sortBy:  sortBy !== 'ranking' ? sortBy : 'name', // ranking handled client-side below
          page:    currentPage,
        });

        const normalized: any[] = result.data.map(normalizeToCard);

        // Client-side ranking sort (ranking data is in list payload)
        const sorted =
          sortBy === 'ranking'
            ? [...normalized].sort((a, b) => (a.ranking || 999) - (b.ranking || 999))
            : normalized;

        setTotalCount(result.count);
        setTotalPages(result.totalPages);
        setColleges(sorted);
        setFitMap({});
        loadFitData(sorted.map((c: any) => c.id));
      } else {
        // ── Legacy backend path (used when VITE_SUPABASE_* vars are absent) ──
        const params: any = {};
        if (selectedCountry) params.country = selectedCountry;

        let res;
        if (debouncedSearchTerm) {
          res = await api.colleges.search({ q: debouncedSearchTerm, country: selectedCountry });
        } else {
          res = await api.colleges.get(params);
        }

        const raw = res?.data ?? res ?? [];

        if (!Array.isArray(raw)) {
          console.error('Expected array but got:', typeof raw, raw);
          setError('Invalid response format from server');
          setColleges([]);
          return;
        }

        // Normalize backend payload to UI shape
        const normalized: College[] = raw.map((c: any) => {
          let majorCategories: string[] = [];
          let programs: string[] = [];
          let academicStrengths: string[] = [];

          try {
            if (Array.isArray(c.majorCategories)) {
              majorCategories = c.majorCategories;
            } else if (typeof c.majorCategories === 'string') {
              majorCategories = JSON.parse(c.majorCategories || '[]');
            }
            if (Array.isArray(c.programs)) {
              programs = c.programs;
            } else if (typeof c.programs === 'string') {
              programs = JSON.parse(c.programs || '[]');
            }
            if (Array.isArray(c.academicStrengths)) {
              academicStrengths = c.academicStrengths;
            }
          } catch (e) {
            console.warn('Failed to parse fields for', c.name, e);
          }

          return {
            id: c.id,
            name: c.name,
            location: c.location || '',
            country: c.country,
            type: c.type || c.trust_tier || 'Unknown',
            acceptance_rate: c.acceptanceRate ?? c.acceptance_rate ?? null,
            acceptanceRate: c.acceptanceRate ?? c.acceptance_rate ?? null,
            programs,
            majorCategories,
            academicStrengths,
            description: c.description || null,
            tuition_cost: c.tuition_cost || null,
            enrollment: c.enrollment || null,
            ranking: c.ranking || null,
            averageGPA: c.averageGPA || null,
            testScores: c.testScores || null,
            graduationRates: c.graduationRates || null,
            studentFacultyRatio: c.studentFacultyRatio || null
          };
        });

        const sorted = [...normalized].sort((a, b) => {
          switch (sortBy) {
            case 'ranking':
              return (a.ranking || 999) - (b.ranking || 999);
            case 'acceptance_rate':
              return (a.acceptanceRate || 999) - (b.acceptanceRate || 999);
            case 'tuition':
              return (a.tuition_cost || 999999) - (b.tuition_cost || 999999);
            case 'name':
            default:
              return a.name.localeCompare(b.name);
          }
        });

        setTotalCount(sorted.length);
        setTotalPages(1);
        setColleges(sorted);
        setFitMap({});
        loadFitData(sorted.map(c => c.id));
      }
    } catch (err) {
      setError('Failed to load colleges');
      console.error('Error loading colleges:', err);
    } finally {
      setLoading(false);
    }
  };

  /* ==================== ACTIONS ==================== */

  const handleAddCollege = async (collegeId: number) => {
    if (!user) {
      toast.info('Create a free account to save colleges.');
      navigate('/auth');
      return;
    }
    try {
      setAddingCollegeId(collegeId);

      await api.applications.create({
        college_id: collegeId,
        application_type: 'regular'
      });

      toast.success('Added to your list!');
      navigate('/applications');
    } catch (err: any) {
      console.error('Add college error:', err);
      
      // Check for duplicate error
      if (err.message && err.message.includes('already added')) {
        toast.info('Already in your list');
      } else {
        toast.error('Failed to add college');
      }
    } finally {
      setAddingCollegeId(null);
    }
  };

  /* ==================== RENDER ==================== */

  const sel: React.CSSProperties = {
    padding: '10px 14px',
    background: S.surface2,
    border: `1px solid ${S.border2}`,
    borderRadius: 10,
    color: 'var(--color-text-primary)',
    fontSize: 13,
    fontFamily: S.font,
    width: '100%',
    appearance: 'none' as const,
  };

  return (
    <>
      <style>{GLOBAL_COLLEGES}</style>
      <div style={{ minHeight: '100vh', background: S.bg, color: 'var(--color-text-primary)', fontFamily: S.font }}>
        {!user && (
          <div style={{ background: h2r(ACCENT, 0.12), borderBottom: `1px solid ${h2r(ACCENT, 0.25)}`, position: 'sticky', top: 0, zIndex: 40 }}>
            <div style={{ maxWidth: 1280, margin: '0 auto', padding: '12px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
                💡 You&apos;re browsing as a guest. Create a free account to save colleges, see your chances, and track applications.
              </span>
              <button
                onClick={() => navigate('/auth')}
                style={{ padding: '6px 14px', borderRadius: 999, background: ACCENT, color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Sign Up →
              </button>
            </div>
          </div>
        )}

        {/* ── HERO ── */}
        <div style={{
          padding: '44px 48px 0',
          background: `linear-gradient(180deg,${h2r(ACCENT,0.08)} 0%,transparent 100%)`,
          borderBottom: `1px solid ${S.border}`,
        }}>
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 28, flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: h2r(ACCENT,0.9), textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10, fontWeight: 600 }}>College Explorer</div>
                <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 6 }}>
                  <span style={{ color: ACCENT }}>Discover</span> Colleges
                </h1>
                <p style={{ color: S.muted, fontSize: 14 }}>
                  {loading ? 'Loading…' : `${totalCount.toLocaleString()} colleges${totalPages > 1 ? ` (page ${currentPage} of ${totalPages})` : ''}`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { label: 'Total', value: totalCount, color: ACCENT },
                ].map(s => (
                  <div key={s.label} style={{ padding: '10px 18px', background: h2r(s.color,0.1), border: `1px solid ${h2r(s.color,0.25)}`, borderRadius: 12, textAlign: 'center' as const, minWidth: 80 }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: S.font }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: S.muted, fontFamily: S.font }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── SEARCH + FILTERS ── */}
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 48px' }}>
          <div data-tutorial="college-search" style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 18, padding: '20px 24px', marginBottom: 28 }}>
            {/* Search row */}
            <div style={{ position: 'relative', marginBottom: showFilters ? 16 : 0 }}>
              <Search style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, color: S.muted, pointerEvents: 'none' }} />
              <input
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                placeholder="Search colleges by name, location or major…"
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
                <SlidersHorizontal style={{ width: 15, height: 15 }} />
                Filters
                <ChevronDown style={{ width: 14, height: 14, transform: showFilters ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>
            </div>

            {/* Filter row */}
            {showFilters && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14, paddingTop: 16, borderTop: `1px solid ${S.border}` }}>
                <div>
                  <label style={{ fontSize: 11, color: S.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 600, display: 'block', fontFamily: S.font }}>Country</label>
                  <select value={selectedCountry} onChange={(e) => { setSelectedCountry(e.target.value); setCurrentPage(1); }} style={sel}>
                    <option value="">All Countries</option>
                    {countries.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: S.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 600, display: 'block', fontFamily: S.font }}>Program</label>
                  <select value={selectedProgram} onChange={(e) => { setSelectedProgram(e.target.value); setCurrentPage(1); }} style={sel}>
                    <option value="">All Programs</option>
                    {programs.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: S.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 600, display: 'block', fontFamily: S.font }}>Sort By</label>
                  <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setCurrentPage(1); }} style={sel}>
                    <option value="name">Name (A–Z)</option>
                    <option value="ranking">Ranking (Best First)</option>
                    <option value="acceptance_rate">Acceptance Rate</option>
                    <option value="tuition">Tuition (Lowest)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    onClick={() => { setSearchTerm(''); setSelectedCountry(''); setSelectedProgram(''); setSortBy('name'); setCurrentPage(1); }}
                    style={{ width: '100%', padding: '10px 14px', background: 'transparent', border: `1px solid ${S.border2}`, borderRadius: 10, color: S.muted, fontSize: 13, fontFamily: S.font, cursor: 'pointer' }}
                  >
                    Clear All
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Results ── */}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${h2r(ACCENT,0.2)}`, borderTopColor: ACCENT, animation: 'spin 0.8s linear infinite' }} />
            </div>
          )}
          {error && <div style={{ textAlign: 'center', padding: '64px 0', color: '#F87171', fontFamily: S.font }}>{error}</div>}
          {!loading && !error && colleges.length === 0 && (
            <div style={{ textAlign: 'center', padding: '64px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🌍</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8, fontFamily: S.font }}>No colleges found</div>
              <div style={{ color: S.muted, fontSize: 14, fontFamily: S.font }}>Try adjusting your search or filters</div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 20 }}>
            {colleges.map((college, idx) => (
              <CollegeCard
                key={college.id}
                college={college}
                index={idx}
                onAdd={() => handleAddCollege(college.id)}
                onViewDetails={() => navigate(`/colleges/${college.id}`)}
                isAdding={addingCollegeId === college.id}
                fit={fitMap[college.id]}
              />
            ))}
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && !loading && !error && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 32 }}>
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 18px', background: S.surface, border: `1px solid ${S.border2}`,
                  borderRadius: 10, color: currentPage <= 1 ? S.dim : S.muted,
                  fontSize: 13, fontWeight: 600, fontFamily: S.font,
                  cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                  opacity: currentPage <= 1 ? 0.4 : 1,
                }}
              >
                <ChevronLeft style={{ width: 16, height: 16 }} /> Prev
              </button>
              <span style={{ fontSize: 13, color: S.muted, fontFamily: S.font }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 18px', background: S.surface, border: `1px solid ${S.border2}`,
                  borderRadius: 10, color: currentPage >= totalPages ? S.dim : S.muted,
                  fontSize: 13, fontWeight: 600, fontFamily: S.font,
                  cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                  opacity: currentPage >= totalPages ? 0.4 : 1,
                }}
              >
                Next <ChevronRight style={{ width: 16, height: 16 }} />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

/* ==================== DARK COLLEGE CARD ==================== */

const CollegeCard: React.FC<CollegeCardProps> = ({ college, index, onAdd, onViewDetails, isAdding, fit }) => {
  if (!college) return null;

  const h2r = (hex: string, a: number) => {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
  };

  const formatAcceptanceRate = (rate: number | null | undefined): string => {
    if (rate === null || rate === undefined) return 'N/A';
    const pct = rate <= 1 ? rate * 100 : rate;
    return `${pct.toFixed(1)}%`;
  };

  const formatCurrency = (amount: number | null | undefined, country: string): string => {
    if (amount === null || amount === undefined) return 'N/A';
    if (country === 'India') return `₹${(amount / 100000).toFixed(1)}L`;
    if (country === 'United Kingdom') return `£${(amount / 1000).toFixed(0)}K`;
    if (country === 'Germany') return amount === 0 ? 'Free' : `€${amount.toLocaleString()}`;
    return `$${(amount / 1000).toFixed(0)}K`;
  };

  const formatEnrollment = (num: number | null | undefined): string => {
    if (!num) return 'N/A';
    return num >= 1000 ? `${(num / 1000).toFixed(1)}K` : num.toString();
  };

  const acceptanceRate = college?.acceptanceRate ?? college?.acceptance_rate;
  const accent = '#3B9EFF';
  const S = {
    surface: 'var(--color-bg-surface)',
    surface2: 'var(--color-surface-subtle)',
    border: 'var(--color-border)',
    muted: 'var(--color-text-secondary)',
    dim: 'var(--color-text-disabled)',
    font: "'DM Sans',sans-serif",
  };

  return (
    <div
      style={{
        background: S.surface, border: `1px solid ${S.border}`,
        borderRadius: 18, overflow: 'hidden',
        animation: 'fadeUp 0.35s ease both', animationDelay: `${index * 0.04}s`,
        transition: 'border-color 0.2s, box-shadow 0.2s',
        display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = h2r(accent,0.4); (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 24px ${h2r(accent,0.1)}`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
    >
      {/* Accent top bar */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${accent} 0%, ${h2r(accent,0.3)} 100%)` }} />

      {/* Header */}
      <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${S.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font, marginBottom: 4, lineHeight: 1.3 }}>{college.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: S.muted, fontSize: 12, fontFamily: S.font }}>
              <MapPin style={{ width: 12, height: 12, flexShrink: 0 }} />
              {college?.location || college?.country}
            </div>
          </div>
          {college?.ranking && (
            <div style={{ padding: '3px 10px', background: h2r(accent,0.12), border: `1px solid ${h2r(accent,0.3)}`, borderRadius: 8, fontSize: 12, fontWeight: 700, color: accent, fontFamily: S.font, flexShrink: 0 }}>
              #{college.ranking}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: h2r(accent,0.12), color: accent, fontWeight: 600, fontFamily: S.font }}>{college?.type}</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: 'rgba(255,255,255,0.07)', color: S.muted, fontFamily: S.font }}>{college?.country}</span>
          <FitBadge fitData={fit} className="ml-auto" />
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: S.border, padding: 0 }}>
        {[
          { icon: '📈', label: 'Acceptance', value: formatAcceptanceRate(acceptanceRate), color: '#10B981' },
          { icon: '💰', label: 'Tuition', value: formatCurrency(college?.tuition_cost, college?.country ?? ''), color: '#3B9EFF' },
          { icon: '🎓', label: 'Avg GPA', value: college?.averageGPA != null ? college.averageGPA.toFixed(2) : 'N/A', color: '#A855F7' },
          { icon: '👥', label: 'Students', value: formatEnrollment(college?.enrollment), color: '#F59E0B' },
        ].map((stat, i) => (
          <div key={i} style={{ padding: '12px 16px', background: S.surface }}>
            <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font, marginBottom: 3 }}>{stat.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: S.font }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Programs */}
      {(college.majorCategories?.length || college.programs?.length) ? (
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${S.border}` }}>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
            {(college.majorCategories || college.programs || []).slice(0, 4).map((p, idx) => (
              <span key={`${p}-${idx}`} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 100, background: h2r(accent,0.1), color: accent, fontFamily: S.font, fontWeight: 500 }}>{p}</span>
            ))}
            {((college.majorCategories?.length || college.programs?.length || 0) > 4) && (
              <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 100, background: 'rgba(255,255,255,0.07)', color: S.muted, fontFamily: S.font }}>
                +{(college.majorCategories?.length || college.programs?.length || 0) - 4} more
              </span>
            )}
          </div>
        </div>
      ) : null}

      {/* Test scores */}
      {college.testScores?.satRange && (
        <div style={{ padding: '0 18px 10px', fontSize: 11, color: S.dim, fontFamily: S.font }}>
          SAT range: {college.testScores.satRange.percentile25}–{college.testScores.satRange.percentile75}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, padding: '14px 18px', borderTop: `1px solid ${S.border}`, marginTop: 'auto' }}>
        <button
          onClick={onViewDetails}
          style={{ flex: 1, padding: '9px 0', background: 'transparent', border: `1px solid ${S.border}`, borderRadius: 10, color: S.muted, fontSize: 13, fontWeight: 600, fontFamily: S.font, cursor: 'pointer' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = h2r(accent,0.4); (e.currentTarget as HTMLElement).style.color = accent; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)'; (e.currentTarget as HTMLElement).style.color = 'var(--color-text-secondary)'; }}
        >
          View Details
        </button>
        <button
          onClick={onAdd}
          disabled={isAdding}
          style={{
            flex: 1, padding: '9px 0', background: accent, border: 'none',
            borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700,
            fontFamily: S.font, cursor: isAdding ? 'not-allowed' : 'pointer',
            opacity: isAdding ? 0.6 : 1,
          }}
        >
          {isAdding ? 'Adding…' : '+ Add to List'}
        </button>
      </div>
    </div>
  );
};

export default Colleges;

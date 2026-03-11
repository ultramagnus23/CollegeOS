// src/pages/Research.tsx — Dark Editorial Redesign
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/api';
import { toast } from 'sonner';
import { Search, GraduationCap, Globe, ExternalLink, Loader2, X, Plus, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { College, normalizeCountryData } from '@/types';

/* ─── Design ─────────────────────────────────────────────────────────── */
import { h2r, S, GLOBAL, inp, lbl } from '../styles/designTokens';

const ACCENT = '#3B9EFF'; // blue — research/academics theme

/* ─── Constants ──────────────────────────────────────────────────────── */
const SEARCH_TABS = [
  { key: 'major' as const, label: 'By Major', icon: '🎓' },
  { key: 'name' as const, label: 'By Name / Keyword', icon: '🔍' },
];

/* ─── Helpers ────────────────────────────────────────────────────────── */
const pillColors = ['#6C63FF', '#3B9EFF', '#A855F7', '#F97316', '#10B981', '#F59E0B'];

/* ─── Stat Card ──────────────────────────────────────────────────────── */
const StatCard: React.FC<{ emoji: string; value: number | string; label: string; accent: string }> = ({ emoji, value, label, accent }) => (
  <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
    <div style={{ width: 44, height: 44, borderRadius: 12, background: h2r(accent, 0.15), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{emoji}</div>
    <div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1, fontFamily: S.font }}>{value}</div>
      <div style={{ fontSize: 12, color: S.muted, marginTop: 3, fontFamily: S.font }}>{label}</div>
    </div>
  </div>
);

/* ─── College Card ───────────────────────────────────────────────────── */
const CollegeCard: React.FC<{
  college: College;
  index: number;
  onView: (id: number) => void;
  onAdd: (college: College) => void;
  addedIds: Set<number>;
}> = ({ college, index, onView, onAdd, addedIds }) => {
  const added = addedIds.has(college.id);
  return (
    <div style={{
      background: S.surface, border: `1px solid ${S.border}`,
      borderLeft: `3px solid ${ACCENT}`,
      borderRadius: 16, overflow: 'hidden',
      animation: 'fadeUp 0.35s ease both', animationDelay: `${index * 0.05}s`,
    }}>
      <div style={{ padding: '20px 22px' }}>
        {/* Header */}
        <div style={{ marginBottom: 10 }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font, marginBottom: 4 }}>{college.name}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: S.dim, fontFamily: S.font }}>
            <span>🌍 {college.country}</span>
            {college.location && <span style={{ color: S.dim }}>· {college.location}</span>}
          </div>
        </div>

        {/* Major categories pills */}
        {college.majorCategories && college.majorCategories.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {college.majorCategories.slice(0, 4).map((major, i) => (
              <span key={i} style={{
                fontSize: 10, padding: '3px 10px', borderRadius: 100,
                background: h2r(pillColors[i % pillColors.length], 0.12),
                color: pillColors[i % pillColors.length],
                fontWeight: 600, fontFamily: S.font,
              }}>🎓 {major}</span>
            ))}
          </div>
        )}

        {/* Academic strengths */}
        {college.academicStrengths && college.academicStrengths.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {college.academicStrengths.slice(0, 3).map((strength, i) => (
              <span key={i} style={{
                fontSize: 10, padding: '3px 10px', borderRadius: 100,
                background: h2r('#10B981', 0.1), color: '#10B981',
                fontWeight: 600, fontFamily: S.font,
              }}>✓ {strength}</span>
            ))}
          </div>
        )}

        {/* Action row */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {college.official_website && (
            <a href={college.official_website} target="_blank" rel="noopener noreferrer" style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${S.border}`,
              color: S.muted, fontFamily: S.font, textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <Globe size={12} /> Website <ExternalLink size={10} />
            </a>
          )}
          <button onClick={() => onView(college.id)} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: h2r(ACCENT, 0.15), border: `1px solid ${h2r(ACCENT, 0.3)}`,
            color: ACCENT, fontFamily: S.font, display: 'flex', alignItems: 'center', gap: 4,
          }}
            onMouseEnter={e => (e.currentTarget.style.background = h2r(ACCENT, 0.25))}
            onMouseLeave={e => (e.currentTarget.style.background = h2r(ACCENT, 0.15))}
          >View Details →</button>
          <button
            onClick={() => !added && onAdd(college)}
            disabled={added}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: added ? 'default' : 'pointer',
              background: added ? 'rgba(255,255,255,0.04)' : h2r('#10B981', 0.15),
              border: added ? `1px solid ${S.border}` : `1px solid ${h2r('#10B981', 0.3)}`,
              color: added ? S.dim : '#10B981', fontFamily: S.font,
              display: 'flex', alignItems: 'center', gap: 4,
              opacity: added ? 0.7 : 1,
            }}
            onMouseEnter={e => { if (!added) e.currentTarget.style.background = h2r('#10B981', 0.25); }}
            onMouseLeave={e => { if (!added) e.currentTarget.style.background = h2r('#10B981', 0.15); }}
          >{added ? '✓ Added' : <><Plus size={12} /> Add to List</>}</button>
        </div>
      </div>
    </div>
  );
};

/* ─── Main ────────────────────────────────────────────────────────────── */
const Research = () => {
  const navigate = useNavigate();

  /* ── State ──── */
  const [searchMode, setSearchMode] = useState<'major' | 'name'>('major');
  const [majorQuery, setMajorQuery] = useState('');
  const [nameQuery, setNameQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [colleges, setColleges] = useState<College[]>([]);
  const [availableMajors, setAvailableMajors] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    loadFilters();
    loadInstantRecommendations();
  }, []);

  const loadFilters = async () => {
    try {
      const [majorsRes, countriesRes] = await Promise.all([
        api.research.getAvailableMajors(),
        api.colleges.getCountries(),
      ]);
      setAvailableMajors(majorsRes.data || []);
      setCountries(normalizeCountryData(countriesRes.data || []));
    } catch {
      /* ignore filter load failures */
    }
  };

  const loadInstantRecommendations = () => {
    try {
      const raw = localStorage.getItem('instant_recommendations');
      if (raw) {
        const parsed = JSON.parse(raw);
        const recs = parsed.recommendations || parsed;
        if (Array.isArray(recs) && recs.length > 0) {
          setColleges(recs);
          setShowBanner(true);
        }
      }
    } catch { /* ignore */ }
  };

  /* ── Searches ──── */
  const handleMajorSearch = async () => {
    if (!majorQuery.trim()) { toast.error('Please enter a major or program name'); return; }
    try {
      setLoading(true); setError(null); setShowBanner(false); setHasSearched(true);
      try { localStorage.removeItem('instant_recommendations'); } catch {}
      const res = await api.research.searchByMajor(majorQuery.trim(), selectedCountry || undefined, 20);
      const data = res?.data || res || [];
      setColleges(Array.isArray(data) ? data : []);
    } catch {
      setError('Search failed. Please try again.');
      setColleges([]);
    } finally {
      setLoading(false);
    }
  };

  const handleNameSearch = async () => {
    if (!nameQuery.trim()) { toast.error('Please enter a search query'); return; }
    try {
      setLoading(true); setError(null); setShowBanner(false); setHasSearched(true);
      try { localStorage.removeItem('instant_recommendations'); } catch {}
      const res = await api.research.search(nameQuery.trim(), selectedCountry || undefined, 'all');
      const data = res?.data || res || [];
      setColleges(Array.isArray(data) ? data : []);
    } catch {
      setError('Search failed. Please try again.');
      setColleges([]);
    } finally {
      setLoading(false);
    }
  };

  /* ── Add to list ──── */
  const handleAddToList = async (college: College) => {
    try {
      await api.applications.create({
        college_id: college.id,
        college_name: college.name,
        status: 'researching',
      });
      setAddedIds(prev => new Set(prev).add(college.id));
      toast.success(`${college.name} added to your applications`);
    } catch {
      toast.error('Failed to add college');
    }
  };

  const handleViewDetails = (id: number) => {
    navigate(`/colleges/${id}`);
  };

  return (
    <>
      <style>{GLOBAL}</style>
      <div style={{ minHeight: '100vh', background: S.bg, color: 'var(--color-text-primary)', fontFamily: S.font }}>

        {/* ── Header ──────────────────────────────────────────────── */}
        <div style={{ padding: '44px 48px 0', background: `linear-gradient(180deg,${h2r(ACCENT, 0.07)} 0%,transparent 100%)`, borderBottom: `1px solid ${S.border}` }}>
          <div style={{ maxWidth: 1080, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 28, flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: h2r(ACCENT, 0.8), textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10, fontWeight: 600 }}>College Research</div>
                <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 6 }}>
                  Rese<span style={{ color: ACCENT }}>arch.</span>
                </h1>
                <p style={{ color: S.muted, fontSize: 14 }}>
                  Search colleges by major, program, or name. All results link to official university sources.
                </p>
              </div>
            </div>

            {/* Search mode tabs */}
            <div style={{ display: 'flex', gap: 8, paddingBottom: 24 }}>
              {SEARCH_TABS.map(tab => {
                const active = searchMode === tab.key;
                return (
                  <button key={tab.key} onClick={() => setSearchMode(tab.key)} style={{
                    padding: '7px 16px', borderRadius: 100, fontSize: 12, fontWeight: active ? 700 : 400,
                    background: active ? h2r(ACCENT, 0.18) : 'transparent',
                    border: `1px solid ${active ? h2r(ACCENT, 0.5) : S.border}`,
                    color: active ? ACCENT : S.dim, cursor: 'pointer', fontFamily: S.font,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>{tab.icon} {tab.label}</button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 48px 80px' }}>

          {/* ── Search form ─────────────────────────────────────────── */}
          <div style={{
            background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16,
            padding: 24, marginBottom: 28,
          }}>
            {searchMode === 'major' ? (
              <div>
                <span style={lbl}>Major / Program Name</span>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: S.dim }}>
                      <GraduationCap size={14} />
                    </div>
                    <input
                      value={majorQuery}
                      onChange={e => setMajorQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleMajorSearch()}
                      placeholder="e.g., Computer Science, Engineering, Medicine"
                      list="majors-datalist"
                      style={{ ...inp, paddingLeft: 34 }}
                    />
                    <datalist id="majors-datalist">
                      {availableMajors.slice(0, 50).map(m => <option key={m} value={m} />)}
                    </datalist>
                  </div>
                  <button onClick={handleMajorSearch} disabled={loading} style={{
                    padding: '10px 22px', background: loading ? S.dim : ACCENT,
                    border: 'none', borderRadius: 10,
                    color: '#000', fontWeight: 700, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
                    fontFamily: S.font, display: 'flex', alignItems: 'center', gap: 8,
                    boxShadow: !loading ? `0 0 16px ${h2r(ACCENT, 0.25)}` : 'none',
                  }}>
                    {loading ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Search size={14} />}
                    {loading ? 'Searching…' : 'Search'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <span style={lbl}>Search Query</span>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: S.dim }}>
                      <Search size={14} />
                    </div>
                    <input
                      value={nameQuery}
                      onChange={e => setNameQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleNameSearch()}
                      placeholder="Search by college name, location, or keyword"
                      style={{ ...inp, paddingLeft: 34 }}
                    />
                  </div>
                  <button onClick={handleNameSearch} disabled={loading} style={{
                    padding: '10px 22px', background: loading ? S.dim : ACCENT,
                    border: 'none', borderRadius: 10,
                    color: '#000', fontWeight: 700, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
                    fontFamily: S.font, display: 'flex', alignItems: 'center', gap: 8,
                    boxShadow: !loading ? `0 0 16px ${h2r(ACCENT, 0.25)}` : 'none',
                  }}>
                    {loading ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Search size={14} />}
                    {loading ? 'Searching…' : 'Search'}
                  </button>
                </div>
              </div>
            )}

            {/* Country filter */}
            <div style={{ marginTop: 14 }}>
              <span style={lbl}>Country Filter (optional)</span>
              <select value={selectedCountry} onChange={e => setSelectedCountry(e.target.value)} style={{ ...inp, maxWidth: 280 }}>
                <option value="">All Countries</option>
                {countries.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* ── Instant recommendations banner ──────────────────────── */}
          {showBanner && (
            <div style={{
              background: h2r(ACCENT, 0.08), border: `1px solid ${h2r(ACCENT, 0.25)}`,
              borderRadius: 12, padding: '12px 18px', marginBottom: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              animation: 'fadeUp 0.3s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>✨</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: ACCENT, fontFamily: S.font }}>Showing your onboarding recommendations</div>
                  <div style={{ fontSize: 12, color: S.muted, fontFamily: S.font }}>Search above to explore more colleges</div>
                </div>
              </div>
              <button onClick={() => { setShowBanner(false); setColleges([]); try { localStorage.removeItem('instant_recommendations'); } catch {} }} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: S.dim, padding: 4,
              }}><X size={16} /></button>
            </div>
          )}

          {/* ── Error state ──────────────────────────────────────────── */}
          {error && (
            <div style={{
              background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
              borderRadius: 12, padding: '14px 18px', marginBottom: 20,
              display: 'flex', alignItems: 'center', gap: 10,
              color: '#F87171', fontSize: 14, fontFamily: S.font,
            }}>
              <span>⚠️</span> {error}
            </div>
          )}

          {/* ── Loading state ──────────────────────────────────────── */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.08)', borderTopColor: ACCENT, animation: 'spin 0.8s linear infinite' }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: S.muted, fontFamily: S.font }}>Searching colleges…</div>
            </div>
          )}

          {/* ── Results count ──────────────────────────────────────── */}
          {!loading && colleges.length > 0 && (
            <div style={{ marginBottom: 20, fontSize: 14, color: S.muted, fontFamily: S.font, fontWeight: 600 }}>
              Showing {colleges.length} college{colleges.length !== 1 ? 's' : ''}
            </div>
          )}

          {/* ── Empty / no results ─────────────────────────────────── */}
          {!loading && colleges.length === 0 && !error && (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>{hasSearched ? '🔍' : '🎓'}</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                {hasSearched
                  ? `No colleges found for "${searchMode === 'major' ? majorQuery : nameQuery}"`
                  : 'Start Your Research'}
              </div>
              <div style={{ color: S.muted, fontSize: 14 }}>
                {hasSearched
                  ? 'Try adjusting your search terms or removing the country filter'
                  : searchMode === 'major'
                    ? 'Enter a major or program name to search'
                    : 'Enter a college name or keyword to search'}
              </div>
            </div>
          )}

          {/* ── College cards ──────────────────────────────────────── */}
          {!loading && colleges.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {colleges.map((college, i) => (
                <CollegeCard
                  key={college.id}
                  college={college}
                  index={i}
                  onView={handleViewDetails}
                  onAdd={handleAddToList}
                  addedIds={addedIds}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Research;

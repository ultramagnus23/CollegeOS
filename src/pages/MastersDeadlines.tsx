// src/pages/MastersDeadlines.tsx — Dark Editorial Redesign
import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { List, CalendarDays, Calendar, ExternalLink, Globe } from 'lucide-react';
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
  *{box-sizing:border-box;margin:0;padding:0;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}
`;

/* ─── Urgency helpers ─────────────────────────────────────────────── */
const getDaysUntil = (dateStr: string) => {
  const days = Math.ceil((new Date(dateStr + 'T00:00:00').getTime() - new Date().getTime()) / 86400000);
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
};

const getUrgencyStyle = (dateStr: string): React.CSSProperties => {
  const days = Math.ceil((new Date(dateStr + 'T00:00:00').getTime() - new Date().getTime()) / 86400000);
  if (days < 0)  return { color: '#F87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', padding: '2px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700 };
  if (days <= 7) return { color: '#FB923C', background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.25)', padding: '2px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700 };
  if (days <= 30)return { color: '#FBBF24', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', padding: '2px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700 };
  return           { color: '#10B981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', padding: '2px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700 };
};

/* ─── Types ───────────────────────────────────────────────────────── */
interface MastersDeadline {
  id: string;
  program_id: string;
  program_name: string;
  institution_name: string;
  country: string;
  degree_type: string;
  deadline_type: string;
  deadline_date: string | null;
  is_rolling: boolean;
  intake_term: string | null;
  intake_year: number | null;
  notes: string | null;
  source_url: string | null;
}

/* ─── Component ───────────────────────────────────────────────────── */
const MastersDeadlines: React.FC = () => {
  const [deadlines, setDeadlines] = useState<MastersDeadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterType, setFilterType] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (filterCountry) params.country = filterCountry;
      if (filterType) params.type = filterType;
      const res = await api.masters.getDeadlines(params);
      const data: MastersDeadline[] = res?.data || [];
      data.sort((a, b) => {
        if (!a.deadline_date) return 1;
        if (!b.deadline_date) return -1;
        return new Date(a.deadline_date).getTime() - new Date(b.deadline_date).getTime();
      });
      setDeadlines(data);
    } catch {
      toast.error('Failed to load deadlines');
    } finally {
      setLoading(false);
    }
  };

  const countries = [...new Set(deadlines.map(d => d.country).filter(Boolean))].sort();
  const types = [...new Set(deadlines.map(d => d.deadline_type).filter(Boolean))].sort();

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: S.bg }}>
        <style>{GLOBAL}</style>
        <div style={{ width: 40, height: 40, border: `3px solid ${S.border2}`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: S.bg, padding: '32px 24px', fontFamily: S.font }}>
      <style>{GLOBAL}</style>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font, marginBottom: 6 }}>Masters Deadlines</h1>
            <p style={{ fontSize: 14, color: S.muted, fontFamily: S.font }}>{deadlines.length} upcoming deadlines</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', border: `1px solid ${S.border2}`, borderRadius: 10, overflow: 'hidden' }}>
              <button
                onClick={() => setViewMode('list')}
                style={{
                  padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
                  background: viewMode === 'list' ? ACCENT : 'transparent',
                  color: viewMode === 'list' ? '#fff' : S.muted,
                  border: 'none', cursor: 'pointer', fontFamily: S.font, transition: 'all 0.15s',
                }}
              >
                <List size={15} /> List
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                style={{
                  padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
                  background: viewMode === 'calendar' ? ACCENT : 'transparent',
                  color: viewMode === 'calendar' ? '#fff' : S.muted,
                  border: 'none', borderLeft: `1px solid ${S.border2}`, cursor: 'pointer', fontFamily: S.font, transition: 'all 0.15s',
                }}
              >
                <CalendarDays size={15} /> Calendar
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <select
            value={filterCountry}
            onChange={(e) => { setFilterCountry(e.target.value); loadData(); }}
            style={{
              padding: '10px 14px', background: S.surface2, border: `1px solid ${S.border2}`,
              borderRadius: 10, color: 'var(--color-text-primary)', fontSize: 13, fontFamily: S.font, width: 180,
            }}
          >
            <option value="">All Countries</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); loadData(); }}
            style={{
              padding: '10px 14px', background: S.surface2, border: `1px solid ${S.border2}`,
              borderRadius: 10, color: 'var(--color-text-primary)', fontSize: 13, fontFamily: S.font, width: 200,
            }}
          >
            <option value="">All Types</option>
            {types.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </div>

        {/* List View */}
        {deadlines.length === 0 ? (
          <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 20, padding: '64px 24px', textAlign: 'center', animation: 'fadeUp 0.3s ease both' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font, marginBottom: 8 }}>No deadlines found</h3>
            <p style={{ fontSize: 14, color: S.muted, fontFamily: S.font }}>Masters deadlines will appear here once available.</p>
          </div>
        ) : viewMode === 'calendar' ? (
          <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 20, padding: '48px 24px', textAlign: 'center', animation: 'fadeUp 0.3s ease both' }}>
            <CalendarDays style={{ width: 48, height: 48, color: S.dim, margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: S.font, marginBottom: 8 }}>Calendar View</h3>
            <p style={{ fontSize: 14, color: S.muted, fontFamily: S.font }}>Calendar view coming soon. Use list view in the meantime.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {deadlines.map((dl, index) => (
              <div key={dl.id} style={{
                background: S.surface, border: `1px solid ${S.border}`,
                borderLeft: `3px solid ${dl.is_rolling ? '#10B981' : ACCENT}`,
                borderRadius: 16, padding: '18px 22px',
                animation: 'fadeUp 0.3s ease both', animationDelay: `${index * 0.04}s`,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: S.font, color: 'var(--color-text-primary)', margin: 0 }}>
                        {dl.institution_name}
                      </h3>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 100,
                        background: 'rgba(59,158,255,0.15)', color: ACCENT, fontWeight: 600, fontFamily: S.font,
                      }}>
                        {dl.deadline_type.replace(/_/g, ' ')}
                      </span>
                      {dl.is_rolling && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: 'rgba(16,185,129,0.15)', color: '#10B981', fontWeight: 600, fontFamily: S.font }}>
                          Rolling
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: S.muted, fontFamily: S.font, marginBottom: 8 }}>{dl.program_name}{dl.degree_type ? ` · ${dl.degree_type}` : ''}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                      {dl.deadline_date ? (
                        <>
                          <span style={{ fontSize: 13, color: S.dim, fontFamily: S.font, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Calendar size={13} />
                            {new Date(dl.deadline_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          <span style={getUrgencyStyle(dl.deadline_date)}>
                            {getDaysUntil(dl.deadline_date)}
                          </span>
                        </>
                      ) : (
                        <span style={{ fontSize: 13, color: S.dim, fontFamily: S.font, fontStyle: 'italic' }}>
                          {dl.is_rolling ? 'Rolling — no fixed date' : 'Date not yet available'}
                        </span>
                      )}
                      {dl.country && (
                        <span style={{ fontSize: 11, color: S.dim, fontFamily: S.font, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Globe size={11} /> {dl.country}
                        </span>
                      )}
                    </div>
                    {(dl.notes || dl.source_url) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                        {dl.notes && (
                          <span style={{ fontSize: 11, color: S.dim, fontFamily: S.font }}>{dl.notes}</span>
                        )}
                        {dl.source_url && (
                          <a href={dl.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: ACCENT, fontFamily: S.font, display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
                            Source <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MastersDeadlines;

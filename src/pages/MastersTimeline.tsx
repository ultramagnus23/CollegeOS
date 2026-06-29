// src/pages/MastersTimeline.tsx — Dark Editorial Redesign
import React, { useEffect, useState } from 'react';
import { Calendar, Clock } from 'lucide-react';
import { api } from '../services/api';

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

interface TimelineDeadline {
  id: string;
  program_id: string;
  institution_name: string;
  program_name: string;
  deadline_type: string;
  deadline_date: string | null;
  is_rolling: boolean;
  country?: string;
  degree_type?: string;
}

export default function MastersTimeline() {
  const [deadlines, setDeadlines] = useState<TimelineDeadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTimeline();
  }, []);

  const loadTimeline = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.masters.listAllDeadlines({ limit: 500 });
      const rows: TimelineDeadline[] = res?.data || [];
      setDeadlines(rows);
    } catch (err) {
      console.error('Error loading timeline:', err);
      setError('Failed to load timeline');
    } finally {
      setLoading(false);
    }
  };

  const dated = deadlines.filter((dl) => dl.deadline_date);
  const rolling = deadlines.filter((dl) => !dl.deadline_date && dl.is_rolling);

  // Group by month
  const grouped = dated.reduce<Record<string, TimelineDeadline[]>>((acc, dl) => {
    const month = new Date(dl.deadline_date as string).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    acc[month] = acc[month] || [];
    acc[month].push(dl);
    return acc;
  }, {});

  const monthKeys = Object.keys(grouped).sort();

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: S.bg }}>
        <style>{GLOBAL}</style>
        <div style={{ width: 40, height: 40, border: `3px solid ${S.border2}`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '64px 24px', textAlign: 'center', background: S.bg, fontFamily: S.font }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8 }}>{error}</div>
      </div>
    );
  }

  return (
    <>
      <style>{GLOBAL}</style>
      <div style={{ minHeight: '100vh', background: S.bg, color: 'var(--color-text-primary)', fontFamily: S.font, padding: '32px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font, marginBottom: 6 }}>Masters Timeline</h1>
            <p style={{ fontSize: 14, color: S.muted, fontFamily: S.font }}>
              {deadlines.length} deadlines across all programs
            </p>
          </div>

          {deadlines.length === 0 ? (
            <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 20, padding: '64px 24px', textAlign: 'center', animation: 'fadeUp 0.3s ease both' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font, marginBottom: 8 }}>No deadlines yet</h3>
              <p style={{ fontSize: 14, color: S.muted, fontFamily: S.font }}>Program deadlines will appear here once available.</p>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: 11, top: 0, bottom: 0, width: 2, background: S.border }} />
              {monthKeys.map((month, mi) => {
                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                const monthIdx = new Date(month + ' 1').getMonth();
                const accentColor = ['#3B9EFF','#A855F7','#10B981','#F97316','#FBBF24','#EF4444'][mi % 6];
                return (
                  <div key={month} style={{ position: 'relative', paddingLeft: 36, marginBottom: 24 }}>
                    <div style={{ position: 'absolute', left: 0, top: 2, width: 24, height: 24, borderRadius: '50%', background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${S.bg}` }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#fff' }}>{months[monthIdx]}</span>
                    </div>
                    <h2 style={{ fontSize: 16, fontWeight: 800, color: accentColor, fontFamily: S.font, marginBottom: 12 }}>{month}</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {grouped[month].map((dl, i) => {
                        const dateStr = dl.deadline_date as string;
                        return (
                          <div key={dl.id} style={{
                            background: S.surface, border: `1px solid ${S.border}`,
                            borderLeft: '3px solid', borderLeftColor: getUrgencyStyle(dateStr).color,
                            borderRadius: 12, padding: '14px 18px',
                            animation: 'fadeUp 0.3s ease both', animationDelay: `${i * 0.04}s`,
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                              <div style={{ flex: 1, minWidth: 200 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: S.font, marginBottom: 2 }}>{dl.institution_name}</div>
                                <div style={{ fontSize: 12, color: S.muted, fontFamily: S.font, marginBottom: 4 }}>{dl.program_name} · {dl.degree_type}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: 'rgba(108,99,255,0.15)', color: ACCENT, fontWeight: 600, fontFamily: S.font }}>{dl.deadline_type.replace(/_/g, ' ')}</span>
                                  {dl.country && <span style={{ fontSize: 11, color: S.dim, fontFamily: S.font }}>{dl.country}</span>}
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                                <span style={{ fontSize: 12, color: S.dim, fontFamily: S.font, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <Calendar style={{ width: 13, height: 13 }} />
                                  {new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                                <span style={getUrgencyStyle(dateStr)}>
                                  {getDaysUntil(dateStr)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {rolling.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font, marginBottom: 12 }}>Rolling admission</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {rolling.map((dl) => (
                  <div key={dl.id} style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12, padding: '14px 18px' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, fontFamily: S.font, marginBottom: 2 }}>{dl.institution_name}</div>
                    <div style={{ fontSize: 12, color: S.muted, fontFamily: S.font }}>{dl.program_name} · {dl.degree_type}{dl.country ? ` · ${dl.country}` : ''}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

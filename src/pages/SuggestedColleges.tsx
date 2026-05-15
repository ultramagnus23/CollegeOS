// src/pages/SuggestedColleges.tsx
// First screen shown after onboarding completes.
// Shows a tier-balanced list of colleges matched to the student's profile.
// Admission chance percentages are NOT shown here — they appear only on college detail pages.

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { toast } from 'sonner';

/* ── Types ────────────────────────────────────────────────────────────────── */
interface SuggestedCollege {
  id: number;
  name: string;
  location?: string;
  acceptanceRate: number;
  tier: 'Safety' | 'Match' | 'Reach' | 'Extreme Reach';
  matchScore: number;
}

/* ── Design constants ─────────────────────────────────────────────────────── */
const TIER_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  Safety:         { color: '#10B981', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.35)' },
  Match:          { color: '#3B9EFF', bg: 'rgba(59,158,255,0.12)',  border: 'rgba(59,158,255,0.35)' },
  Reach:          { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.35)' },
  'Extreme Reach':{ color: '#EF4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)'  },
};

function TierBadge({ tier }: { tier: string }) {
  const s = TIER_STYLE[tier] ?? { color: '#888', bg: 'rgba(136,136,136,0.1)', border: 'rgba(136,136,136,0.3)' };
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
    }}>
      {tier}
    </span>
  );
}

function CollegeCard({
  college,
  onAdd,
  added,
}: {
  college: SuggestedCollege;
  onAdd: (id: number) => Promise<void>;
  added: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const arPct = Math.round(college.acceptanceRate * 100);

  const handleAdd = async () => {
    if (added || saving) return;
    setSaving(true);
    await onAdd(college.id);
    setSaving(false);
  };

  return (
    <div style={{
      background: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 16,
      padding: '20px 22px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 16,
      transition: 'box-shadow 0.15s ease',
    }}>
      {/* College icon placeholder */}
      <div style={{
        flexShrink: 0, width: 44, height: 44, borderRadius: 10,
        background: 'var(--color-surface-subtle)',
        border: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20,
      }}>
        🎓
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{
              fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)',
              fontFamily: "'Inter', system-ui, sans-serif", margin: 0,
            }}>
              {college.name}
            </h3>
            {college.location && (
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '2px 0 0', fontFamily: "'Inter', system-ui, sans-serif" }}>
                📍 {college.location}
              </p>
            )}
          </div>
          <TierBadge tier={college.tier} />
        </div>

        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: "'Inter', system-ui, sans-serif" }}>
            Acceptance rate: <strong style={{ color: 'var(--color-text-primary)' }}>{arPct}%</strong>
          </span>

          <button
            onClick={handleAdd}
            disabled={added || saving}
            style={{
              padding: '7px 16px', borderRadius: 8,
              background: added ? 'rgba(16,185,129,0.1)' : 'var(--color-bg-primary)',
              border: added ? '1px solid rgba(16,185,129,0.4)' : '1px solid var(--color-border)',
              color: added ? '#10B981' : 'var(--color-text-primary)',
              fontSize: 12, fontWeight: 600,
              cursor: added || saving ? 'default' : 'pointer',
              fontFamily: "'Inter', system-ui, sans-serif",
              transition: 'all 0.15s ease',
            }}
          >
            {added ? '✓ Added' : saving ? 'Adding…' : '+ Add to List'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */
export default function SuggestedColleges() {
  const navigate = useNavigate();
  const [colleges, setColleges] = useState<SuggestedCollege[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const loadSeqRef = React.useRef(0);
  const mountedRef = React.useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const seq = ++loadSeqRef.current;
    (async () => {
      try {
        const res = await api.getSuggestedColleges();
        const data = (res as any)?.data ?? res ?? [];
        if (!mountedRef.current || seq !== loadSeqRef.current) return;
        setColleges(Array.isArray(data) ? data : []);
      } catch (err: any) {
        if (!mountedRef.current || seq !== loadSeqRef.current) return;
        setError(err?.message || 'Failed to load suggestions');
      } finally {
        if (mountedRef.current && seq === loadSeqRef.current) {
          setLoading(false);
        }
      }
    })();
  }, []);

  const handleAdd = useCallback(async (collegeId: number) => {
    try {
      await api.createApplication({ college_id: collegeId, status: 'Considering', application_type: 'Regular Decision' });
      setAddedIds(prev => new Set([...prev, collegeId]));
      toast.success('Added to your college list');
    } catch (err: any) {
      const message = err?.message || '';
      if (message.toLowerCase().includes('already')) {
        setAddedIds(prev => new Set([...prev, collegeId]));
        toast.error('Already in your college list');
        return;
      }
      toast.error('Failed to add college — please try again');
    }
  }, []);

  // Group colleges by tier for section headers
  const safeties = colleges.filter(c => c.tier === 'Safety');
  const matches  = colleges.filter(c => c.tier === 'Match');
  const reaches  = colleges.filter(c => c.tier === 'Reach' || c.tier === 'Extreme Reach');

  const TierSection = ({ title, items }: { title: string; items: SuggestedCollege[] }) => {
    if (items.length === 0) return null;
    return (
      <div style={{ marginBottom: 36 }}>
        <div style={{
          fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.1em', color: 'var(--color-text-secondary)',
          marginBottom: 14, fontFamily: "'Inter', system-ui, sans-serif",
        }}>
          {title} ({items.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map(c => (
            <CollegeCard
              key={c.id}
              college={c}
              onAdd={handleAdd}
              added={addedIds.has(c.id)}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-bg-primary)',
      color: 'var(--color-text-primary)',
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: '40px 24px 80px',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 36, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎓</div>
          <h1 style={{
            fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em',
            marginBottom: 10, fontFamily: "'Inter', system-ui, sans-serif",
          }}>
            Colleges we think could be a great fit for you
          </h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', maxWidth: 480, margin: '0 auto' }}>
            Based on your academic profile and preferences, we've curated a balanced list of reach, match, and safety schools.
            Tap any college to see your personalised admission chance.
          </p>
        </div>

        {/* Summary bar */}
        {!loading && colleges.length > 0 && (
          <div style={{
            display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap', justifyContent: 'center',
          }}>
            {[
              { label: 'Safety',  count: safeties.length, color: '#10B981' },
              { label: 'Match',   count: matches.length,  color: '#3B9EFF' },
              { label: 'Reach',   count: reaches.length,  color: '#F59E0B' },
            ].map(t => (
              <div key={t.label} style={{
                flex: '1 1 100px', minWidth: 100, maxWidth: 160,
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 14, padding: '14px 18px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: t.color }}>{t.count}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{
                height: 96, borderRadius: 16,
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border)',
                opacity: 0.5,
              }} />
            ))}
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div style={{
            padding: 20, borderRadius: 12,
            background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
            color: '#EF4444', fontSize: 14, textAlign: 'center',
          }}>
            {error}
            <div style={{ marginTop: 12 }}>
              <button
                onClick={() => navigate('/dashboard')}
                style={{
                  padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)',
                  fontSize: 13, cursor: 'pointer', fontFamily: "'Inter', system-ui, sans-serif",
                }}
              >
                Continue to Dashboard →
              </button>
            </div>
          </div>
        )}

        {/* College list by tier */}
        {!loading && !error && colleges.length > 0 && (
          <>
            <TierSection title="Safety Schools" items={safeties} />
            <TierSection title="Match Schools"  items={matches} />
            <TierSection title="Reach Schools"  items={reaches} />
          </>
        )}

        {/* Empty state */}
        {!loading && !error && colleges.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No suggestions yet</h3>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 24 }}>
              Complete your academic profile to get personalised college suggestions.
            </p>
          </div>
        )}

        {/* CTA */}
        {!loading && (
          <div style={{ textAlign: 'center', marginTop: 40 }}>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                padding: '14px 36px', borderRadius: 12,
                background: '#3B9EFF', border: 'none',
                color: '#fff', fontSize: 15, fontWeight: 700,
                cursor: 'pointer', fontFamily: "'Inter', system-ui, sans-serif",
              }}
            >
              Continue to Dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

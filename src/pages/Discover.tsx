import { useEffect, useState } from 'react';
import { api } from '../services/api';
import FitBadge from '@/components/FitBadge';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

/* ---------- Types ---------- */

type Classification = 'REACH' | 'TARGET' | 'SAFETY';

interface College {
  id: number;
  name: string;
  country?: string;
  location?: string;
  acceptance_rate?: number;
}

interface Recommendation {
  college: College;
  classification: Classification;
  overall_fit_score: number;
  why_recommended: string[];
  concerns: string[];
}

/* ---------- Design tokens ---------- */

const S = {
  bg: 'var(--color-bg-primary)',
  surface: 'var(--color-bg-surface)',
  border: 'var(--color-border)',
  muted: 'var(--color-text-secondary)',
  font: "'DM Sans', sans-serif",
  accent: '#6C63FF',
} as const;

const GLOBAL_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse {
  0%,100% { opacity:1; }
  50%      { opacity:.4; }
}
.discover-fade-up { animation: fadeUp .45s ease both; }
.discover-pulse   { animation: pulse 1.6s ease-in-out infinite; }
`;

const SKELETON_COUNT = 6;

/* ---------- Skeleton card ---------- */

const SkeletonCard = () => (
  <div
    className="discover-pulse rounded-2xl p-5"
    style={{ background: S.surface, border: `1px solid ${S.border}` }}
  >
    <div style={{ height: 16, width: '55%', borderRadius: 8, background: S.border, marginBottom: 10 }} />
    <div style={{ height: 12, width: '35%', borderRadius: 8, background: S.border, marginBottom: 18 }} />
    <div style={{ height: 22, width: 70, borderRadius: 12, background: S.border, marginBottom: 18 }} />
    <div style={{ height: 11, width: '80%', borderRadius: 6, background: S.border, marginBottom: 8 }} />
    <div style={{ height: 11, width: '65%', borderRadius: 6, background: S.border, marginBottom: 20 }} />
    <div style={{ height: 34, borderRadius: 10, background: S.border }} />
  </div>
);

/* ---------- College card ---------- */

const CollegeCard = ({ rec, idx }: { rec: Recommendation; idx: number }) => {
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    setAdding(true);
    try {
      await api.applications.create({
        college_id: rec.college.id,
        college_name: rec.college.name,
        status: 'researching',
      });
      toast.success('Added!');
    } catch {
      toast.error('Failed to add college');
    } finally {
      setAdding(false);
    }
  };

  const reasons = rec.why_recommended.slice(0, 2);
  const location = [rec.college.location, rec.college.country].filter(Boolean).join(', ');

  return (
    <div
      className="discover-fade-up rounded-2xl p-5 flex flex-col"
      style={{
        background: S.surface,
        border: `1px solid ${S.border}`,
        animationDelay: `${idx * 60}ms`,
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 6 }}>
        <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-text-primary)', marginBottom: 2 }}>
          {rec.college.name}
        </p>
        {location && (
          <p style={{ fontSize: 12, color: S.muted }}>{location}</p>
        )}
      </div>

      {/* Badges row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <FitBadge fitData={rec.classification.toLowerCase()} />
        {rec.college.acceptance_rate != null && (
          <span
            style={{
              fontSize: 11,
              color: S.muted,
              background: S.bg,
              border: `1px solid ${S.border}`,
              borderRadius: 20,
              padding: '2px 10px',
            }}
          >
            {(rec.college.acceptance_rate * 100).toFixed(0)}% acceptance
          </span>
        )}
      </div>

      {/* Why recommended */}
      {reasons.length > 0 && (
        <ul style={{ marginBottom: 16, paddingLeft: 0, listStyle: 'none', flex: 1 }}>
          {reasons.map((r, i) => (
            <li key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 4 }}>
              <span style={{ color: '#22c55e', marginTop: 3, flexShrink: 0 }}>●</span>
              <span style={{ fontSize: 12, color: S.muted, lineHeight: 1.5 }}>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Add to List button */}
      <button
        onClick={handleAdd}
        disabled={adding}
        style={{
          marginTop: 'auto',
          background: adding ? 'rgba(108,99,255,0.5)' : S.accent,
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          padding: '8px 0',
          fontSize: 13,
          fontWeight: 600,
          cursor: adding ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          transition: 'opacity .15s',
          fontFamily: S.font,
        }}
      >
        {adding && <Loader2 size={14} style={{ animation: 'spin .8s linear infinite' }} />}
        {adding ? 'Adding…' : 'Add to List'}
      </button>
    </div>
  );
};

/* ---------- Page ---------- */

const Discover = () => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.recommendations.get();
        let recs: Recommendation[] = res.data || [];

        if (recs.length === 0) {
          await api.recommendations.generate();
          const res2 = await api.recommendations.get();
          recs = res2.data || [];
        }

        setRecommendations(recs);
      } catch {
        toast.error('Failed to load recommendations');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const reachCount  = recommendations.filter(r => r.classification === 'REACH').length;
  const safetyCount = recommendations.filter(r => r.classification === 'SAFETY').length;

  return (
    <div style={{ minHeight: '100vh', background: S.bg, fontFamily: S.font, padding: '32px 32px 64px' }}>
      <style>{GLOBAL_STYLE}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>
          Discover
        </h1>
        <p style={{ fontSize: 14, color: S.muted }}>Colleges matched to your profile</p>
      </div>

      {/* Stat pills */}
      {!loading && recommendations.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
          {[
            { label: 'Total matches', value: recommendations.length },
            { label: 'Reach',         value: reachCount },
            { label: 'Safety',        value: safetyCount },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                background: S.surface,
                border: `1px solid ${S.border}`,
                borderRadius: 24,
                padding: '6px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 700, color: S.accent }}>{value}</span>
              <span style={{ fontSize: 12, color: S.muted }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Empty state */}
      {!loading && recommendations.length === 0 && (
        <div
          style={{
            background: S.surface,
            border: `1px solid ${S.border}`,
            borderRadius: 20,
            padding: '56px 32px',
            textAlign: 'center',
          }}
        >
          <p style={{ color: S.muted, fontSize: 15 }}>
            No recommendations yet — complete your profile for matches
          </p>
        </div>
      )}

      {/* Cards grid */}
      {!loading && recommendations.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 20,
          }}
        >
          {recommendations.map((rec, idx) => (
            <CollegeCard key={rec.college.id} rec={rec} idx={idx} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Discover;


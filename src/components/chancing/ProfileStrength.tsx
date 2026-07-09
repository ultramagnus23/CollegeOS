// src/components/chancing/ProfileStrength.tsx
// Shows student profile strength analysis. Styled to match Dashboard.tsx's dark
// editorial design system (only consumer of this component) instead of generic
// shadcn/Tailwind defaults, which read poorly against the dark background.

import React, { useEffect, useState } from 'react';
import { TrendingUp, AlertTriangle, Target } from 'lucide-react';
import { api } from '@/services/api';

const h2r = (hex: string, a: number) => {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
};
const S = {
  surface: 'var(--color-bg-surface)',
  surface2: 'var(--color-surface-subtle)',
  border: 'var(--color-border)',
  text: 'var(--color-text-primary)',
  muted: 'var(--color-text-secondary)',
  dim: 'var(--color-text-disabled)',
  font: "'Inter', system-ui, sans-serif",
};

interface Section {
  name: string;
  score: number;
  maxScore: number;
  percentage: number;
}

interface ProfileStrengthData {
  overallStrength: number;
  sections: Section[];
  recommendations: (string | { category?: string; priority?: string; action?: string; impact?: string; details?: string })[];
  profile: {
    gpa?: number;
    sat?: number;
    act?: number;
    activitiesCount: number;
    tier1Count: number;
    courseworkCount: number;
  };
}

function strengthColor(percentage: number) {
  if (percentage >= 75) return '#10B981';
  if (percentage >= 50) return '#FBBF24';
  return '#F87171';
}

export default function ProfileStrength() {
  const [data, setData] = useState<ProfileStrengthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStrength();
  }, []);

  const fetchStrength = async () => {
    try {
      setLoading(true);
      // GET /chancing/profile-strength returns exactly the shape this component
      // renders (overallStrength/sections/recommendations/profile). There used to
      // be a first attempt at POST /analytics/profile-strength ("the new API"), but
      // that endpoint returns a differently-shaped payload (overallScore +
      // componentScores, not overallStrength + sections) that this component never
      // actually read correctly -- it always silently fell through to 0/empty
      // instead of erroring, which is why this card looked permanently stuck at 0%.
      const response = await api.getProfileStrength();
      if (response.success) {
        setData(response.data);
      }
    } catch (err: any) {
      console.error('Error fetching profile strength:', err);
      setError(err.message || 'Failed to load profile strength');
    } finally {
      setLoading(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: S.surface, border: `1px solid ${S.border}`, borderRadius: 18, padding: '22px 24px',
  };

  if (loading) {
    return (
      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <div style={{ width: 32, height: 32, border: `3px solid ${S.border}`, borderTopColor: '#6C63FF', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', color: '#F87171', fontFamily: S.font, fontSize: 13 }}>
        {error}
      </div>
    );
  }

  if (!data) return null;

  const strengthPct = data.overallStrength;
  const color = strengthColor(strengthPct);

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Target size={18} color={S.text} />
        <h3 style={{ fontSize: 17, fontWeight: 800, color: S.text, fontFamily: S.font }}>Profile Strength</h3>
      </div>

      {/* Overall Strength */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 44, fontWeight: 900, color, fontFamily: S.font, lineHeight: 1 }}>{strengthPct}%</div>
        <p style={{ color: S.muted, fontSize: 13, fontFamily: S.font, marginTop: 6 }}>Overall Profile Strength</p>
      </div>

      {/* Sections */}
      {data.sections.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          {data.sections.map((section, index) => (
            <div key={index}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: S.text, fontFamily: S.font }}>{section.name}</span>
                <span style={{ fontSize: 12, color: S.dim, fontFamily: S.font }}>
                  {section.score}/{section.maxScore} ({section.percentage}%)
                </span>
              </div>
              <div style={{ height: 6, background: S.surface2, borderRadius: 6, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(section.percentage, 100)}%`, height: '100%',
                  background: strengthColor(section.percentage), borderRadius: 6, transition: 'width 0.8s ease',
                }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Stats */}
      {data.profile && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, paddingTop: 18, borderTop: `1px solid ${S.border}`, marginBottom: data.recommendations?.length ? 20 : 0 }}>
          {data.profile.gpa != null && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: S.text, fontFamily: S.font }}>{data.profile.gpa.toFixed(2)}</div>
              <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font }}>GPA</div>
            </div>
          )}
          {data.profile.sat != null && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: S.text, fontFamily: S.font }}>{data.profile.sat}</div>
              <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font }}>SAT</div>
            </div>
          )}
          {data.profile.act != null && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: S.text, fontFamily: S.font }}>{data.profile.act}</div>
              <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font }}>ACT</div>
            </div>
          )}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: S.text, fontFamily: S.font }}>{data.profile.activitiesCount}</div>
            <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font }}>Activities</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#FBBF24', fontFamily: S.font }}>{data.profile.tier1Count}</div>
            <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font }}>Tier 1</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: S.text, fontFamily: S.font }}>{data.profile.courseworkCount}</div>
            <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font }}>AP/IB</div>
          </div>
        </div>
      )}

      {/* Recommendations */}
      {data.recommendations && data.recommendations.length > 0 && (
        <div style={{ paddingTop: 18, borderTop: `1px solid ${S.border}` }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: S.text, fontFamily: S.font, marginBottom: 10 }}>
            <AlertTriangle size={14} color="#FBBF24" />
            Recommendations to Improve
          </h4>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none' }}>
            {data.recommendations.map((rec, index) => (
              <li key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: S.muted, fontFamily: S.font }}>
                <TrendingUp size={13} color="#FBBF24" style={{ marginTop: 2, flexShrink: 0 }} />
                {typeof rec === 'string' ? rec : (rec as any).action || (rec as any).details || ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

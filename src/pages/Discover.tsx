// src/pages/Discover.tsx — Dark Editorial Redesign
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/api';
import { toast } from 'sonner';

/* ─── Types ──────────────────────────────────────────────────────────── */
type Classification = 'REACH' | 'TARGET' | 'SAFETY';

interface Recommendation {
  college: {
    id: number;
    name: string;
    country: string;
    location: string;
    acceptance_rate?: number;
  };
  classification: Classification;
  eligibility: { status: 'eligible' | 'conditional' | 'not_eligible' };
  financial_fit: { total_per_year: number; within_budget: boolean; aid_available: boolean };
  overall_fit_score: number;
  why_recommended: string[];
  concerns: string[];
}

interface Profile {
  academic_board?: string;
  percentage?: number;
  max_budget_per_year?: number;
  intended_major?: string;
  target_countries?: string[];
}

/* ─── Design ─────────────────────────────────────────────────────────── */
import { h2r, S, GLOBAL } from '../styles/designTokens';

const ACCENT = '#6C63FF';
const REACH_COLOR = '#F87171';
const TARGET_COLOR = '#F59E0B';
const SAFETY_COLOR = '#10B981';

const CLASS_CFG: Record<Classification, { label: string; color: string; bg: string; emoji: string }> = {
  REACH:  { label: 'Reach',  color: REACH_COLOR,  bg: h2r(REACH_COLOR, 0.12),  emoji: '🎯' },
  TARGET: { label: 'Target', color: TARGET_COLOR, bg: h2r(TARGET_COLOR, 0.12), emoji: '🎯' },
  SAFETY: { label: 'Safety', color: SAFETY_COLOR, bg: h2r(SAFETY_COLOR, 0.12), emoji: '🛡️' },
};

/* ─── Helpers ────────────────────────────────────────────────────────── */
const fmtCost = (n: number) => {
  if (n >= 100000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
};

const fmtPct = (v?: number) => {
  if (v == null) return '—';
  if (v <= 1) return `${(v * 100).toFixed(0)}%`;
  return `${v.toFixed(0)}%`;
};

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

/* ─── Fit Score Ring ─────────────────────────────────────────────────── */
const FitRing: React.FC<{ score: number; size?: number }> = ({ score, size = 56 }) => {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(score, 100)) / 100);
  const color = score >= 75 ? SAFETY_COLOR : score >= 50 ? TARGET_COLOR : REACH_COLOR;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={4} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 800, color, fontFamily: S.font,
      }}>{score}</div>
    </div>
  );
};

/* ─── Recommendation Card ────────────────────────────────────────────── */
const RecCard: React.FC<{
  rec: Recommendation; index: number;
  onView: (id: number) => void;
  onAdd: (rec: Recommendation) => void;
  addedIds: Set<number>;
}> = ({ rec, index, onView, onAdd, addedIds }) => {
  const cls = CLASS_CFG[rec.classification] || CLASS_CFG.TARGET;
  const added = addedIds.has(rec.college.id);

  return (
    <div style={{
      background: S.surface, border: `1px solid ${S.border}`,
      borderLeft: `3px solid ${cls.color}`,
      borderRadius: 16, overflow: 'hidden',
      animation: 'fadeUp 0.35s ease both', animationDelay: `${index * 0.06}s`,
    }}>
      <div style={{ padding: '20px 22px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font }}>{rec.college.name}</h3>
              <span style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 100,
                background: cls.bg, border: `1px solid ${h2r(cls.color, 0.4)}`,
                color: cls.color, fontWeight: 600, fontFamily: S.font, whiteSpace: 'nowrap',
              }}>{cls.emoji} {cls.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: S.muted, fontFamily: S.font }}>
              <span>🌍 {rec.college.country}</span>
              {rec.college.location && <span style={{ color: S.dim }}>· {rec.college.location}</span>}
            </div>
          </div>
          <FitRing score={rec.overall_fit_score} />
        </div>

        {/* Why recommended */}
        {rec.why_recommended?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
            {rec.why_recommended.slice(0, 3).map((reason, i) => (
              <span key={i} style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 8,
                background: h2r(ACCENT, 0.12), color: ACCENT,
                fontWeight: 500, fontFamily: S.font, lineHeight: 1.3,
              }}>✓ {reason}</span>
            ))}
          </div>
        )}

        {/* Concerns */}
        {rec.concerns?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {rec.concerns.slice(0, 2).map((concern, i) => (
              <span key={i} style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 8,
                background: h2r(REACH_COLOR, 0.08), color: h2r(REACH_COLOR, 0.9),
                fontWeight: 500, fontFamily: S.font, lineHeight: 1.3,
              }}>⚠ {concern}</span>
            ))}
          </div>
        )}

        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginTop: 14, fontSize: 12, color: S.dim, fontFamily: S.font }}>
          {rec.college.acceptance_rate != null && (
            <span>📊 Acceptance: <span style={{ fontWeight: 700, color: S.muted }}>{fmtPct(rec.college.acceptance_rate)}</span></span>
          )}
          <span>💰 {fmtCost(rec.financial_fit.total_per_year)}/yr</span>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 100, fontWeight: 600,
            background: rec.financial_fit.within_budget ? h2r(SAFETY_COLOR, 0.12) : h2r(REACH_COLOR, 0.12),
            color: rec.financial_fit.within_budget ? SAFETY_COLOR : REACH_COLOR,
            border: `1px solid ${h2r(rec.financial_fit.within_budget ? SAFETY_COLOR : REACH_COLOR, 0.3)}`,
          }}>{rec.financial_fit.within_budget ? '✓ Within Budget' : '$ Over Budget'}</span>
          {rec.financial_fit.aid_available && (
            <span style={{ fontSize: 11, color: ACCENT, fontWeight: 500 }}>🎓 Aid Available</span>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={() => onView(rec.college.id)} style={{
            padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: h2r(ACCENT, 0.15), border: `1px solid ${h2r(ACCENT, 0.3)}`,
            color: ACCENT, fontFamily: S.font,
          }}
            onMouseEnter={e => (e.currentTarget.style.background = h2r(ACCENT, 0.25))}
            onMouseLeave={e => (e.currentTarget.style.background = h2r(ACCENT, 0.15))}
          >View Details →</button>
          <button
            onClick={() => !added && onAdd(rec)}
            disabled={added}
            style={{
              padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: added ? 'default' : 'pointer',
              background: added ? 'rgba(255,255,255,0.04)' : ACCENT,
              border: added ? `1px solid ${S.border}` : 'none',
              color: added ? S.dim : '#000',
              fontFamily: S.font,
              opacity: added ? 0.7 : 1,
            }}
            onMouseEnter={e => { if (!added) e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={e => { if (!added) e.currentTarget.style.opacity = '1'; }}
          >{added ? '✓ Added to List' : '+ Add to My List'}</button>
        </div>
      </div>
    </div>
  );
};

/* ─── Main ────────────────────────────────────────────────────────────── */
const Discover = () => {
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [filterClass, setFilterClass] = useState<Classification | null>(null);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load profile
      let prof: Profile | null = null;
      try {
        const profileRes = await api.profile.get();
        prof = profileRes.data ?? null;
        setProfile(prof);
      } catch {
        /* profile may not exist yet */
      }

      // Check localStorage for instant_recommendations from onboarding
      let recs: Recommendation[] = [];
      try {
        const cached = localStorage.getItem('instant_recommendations');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            recs = parsed;
          }
        }
      } catch {
        /* ignore parse errors */
      }

      // If no cached recs, fetch from API
      if (recs.length === 0) {
        try {
          const recRes = await api.recommendations.get();
          recs = recRes.data || [];
        } catch {
          /* recommendations endpoint may fail */
        }
      }

      // If still empty, auto-generate
      if (recs.length === 0) {
        setGenerating(true);
        try {
          const genRes = await api.recommendations.generate();
          recs = genRes.data || [];
        } catch {
          /* generation may fail */
        } finally {
          setGenerating(false);
        }
      }

      setRecommendations(recs);
    } catch {
      toast.error('Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    try {
      setRegenerating(true);
      const res = await api.recommendations.generate();
      const recs = res.data || [];
      setRecommendations(recs);
      toast.success(`Generated ${recs.length} recommendation${recs.length !== 1 ? 's' : ''}`);
    } catch {
      toast.error('Failed to generate recommendations');
    } finally {
      setRegenerating(false);
    }
  };

  const handleAddToList = async (rec: Recommendation) => {
    try {
      await api.applications.create({
        college_id: rec.college.id,
        college_name: rec.college.name,
        status: 'researching',
      });
      setAddedIds(prev => new Set(prev).add(rec.college.id));
      toast.success(`${rec.college.name} added to your list`);
    } catch {
      toast.error('Failed to add college');
    }
  };

  const handleViewDetails = (id: number) => {
    navigate(`/colleges/${id}`);
  };

  /* ── Filtered list ────────────────────────────────────────────────── */
  const filtered = filterClass ? recommendations.filter(r => r.classification === filterClass) : recommendations;

  /* ── Counts ───────────────────────────────────────────────────────── */
  const reachCount = recommendations.filter(r => r.classification === 'REACH').length;
  const targetCount = recommendations.filter(r => r.classification === 'TARGET').length;
  const safetyCount = recommendations.filter(r => r.classification === 'SAFETY').length;

  /* ── Profile completeness check ───────────────────────────────────── */
  const profileIncomplete = profile && (
    !profile.intended_major || !profile.target_countries || profile.target_countries.length === 0
  );

  return (
    <>
      <style>{GLOBAL}</style>
      <div style={{ minHeight: '100vh', background: S.bg, color: 'var(--color-text-primary)', fontFamily: S.font }}>

        {/* ── Header ──────────────────────────────────────────────── */}
        <div style={{ padding: '44px 48px 0', background: `linear-gradient(180deg,${h2r(ACCENT, 0.07)} 0%,transparent 100%)`, borderBottom: `1px solid ${S.border}` }}>
          <div style={{ maxWidth: 1080, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 28, flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: h2r(ACCENT, 0.8), textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10, fontWeight: 600 }}>AI-Powered</div>
                <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 6 }}>
                  Disc<span style={{ color: ACCENT }}>over.</span>
                </h1>
                <p style={{ color: S.muted, fontSize: 14 }}>
                  {recommendations.length} matches · {reachCount} reach · {targetCount} target · {safetyCount} safety
                </p>
              </div>
              <button onClick={handleRegenerate} disabled={regenerating || loading} style={{
                padding: '10px 22px', background: regenerating ? S.dim : ACCENT, border: 'none', borderRadius: 10,
                color: '#000', fontSize: 13, fontWeight: 700, cursor: regenerating ? 'not-allowed' : 'pointer', fontFamily: S.font,
                boxShadow: !regenerating ? `0 0 16px ${h2r(ACCENT, 0.35)}` : 'none',
                opacity: regenerating ? 0.5 : 1,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {regenerating ? (
                  <><span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000', animation: 'spin 0.8s linear infinite' }} /> Regenerating…</>
                ) : (
                  <>🔄 Regenerate Matches</>
                )}
              </button>
            </div>

            {/* Classification filter pills */}
            <div style={{ display: 'flex', gap: 8, paddingBottom: 24, flexWrap: 'wrap' }}>
              <button onClick={() => setFilterClass(null)} style={{
                padding: '7px 16px', borderRadius: 100, fontSize: 12, fontWeight: !filterClass ? 700 : 400,
                background: !filterClass ? h2r(ACCENT, 0.18) : 'transparent',
                border: `1px solid ${!filterClass ? h2r(ACCENT, 0.5) : S.border}`,
                color: !filterClass ? ACCENT : S.dim, cursor: 'pointer', fontFamily: S.font,
              }}>All ({recommendations.length})</button>
              {(['REACH', 'TARGET', 'SAFETY'] as const).map(c => {
                const cfg = CLASS_CFG[c];
                const count = recommendations.filter(r => r.classification === c).length;
                const active = filterClass === c;
                return (
                  <button key={c} onClick={() => setFilterClass(active ? null : c)} style={{
                    padding: '7px 14px', borderRadius: 100, fontSize: 12, fontWeight: active ? 700 : 400,
                    background: active ? cfg.bg : 'transparent',
                    border: `1px solid ${active ? h2r(cfg.color, 0.5) : S.border}`,
                    color: active ? cfg.color : S.dim, cursor: 'pointer', fontFamily: S.font,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <span>{cfg.emoji}</span> {cfg.label} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 48px 80px' }}>

          {/* ── Profile completeness banner ─────────────────────────── */}
          {profileIncomplete && !loading && (
            <div style={{
              background: h2r(TARGET_COLOR, 0.08), border: `1px solid ${h2r(TARGET_COLOR, 0.25)}`,
              borderRadius: 14, padding: '16px 20px', marginBottom: 24,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
              animation: 'fadeUp 0.3s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: TARGET_COLOR, fontFamily: S.font }}>Complete Your Profile</div>
                  <div style={{ fontSize: 12, color: S.muted, fontFamily: S.font }}>Add your intended majors and target countries for better matches</div>
                </div>
              </div>
              <button onClick={() => navigate('/settings')} style={{
                padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: h2r(TARGET_COLOR, 0.15), border: `1px solid ${h2r(TARGET_COLOR, 0.3)}`,
                color: TARGET_COLOR, fontFamily: S.font,
              }}>Go to Settings →</button>
            </div>
          )}

          {/* ── Summary stats ──────────────────────────────────────── */}
          {!loading && recommendations.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 28 }}>
              <StatCard emoji="🎯" value={recommendations.length} label="Total Matches" accent={ACCENT} />
              <StatCard emoji="🔴" value={reachCount} label="Reach" accent={REACH_COLOR} />
              <StatCard emoji="🟡" value={targetCount} label="Target" accent={TARGET_COLOR} />
              <StatCard emoji="🟢" value={safetyCount} label="Safety" accent={SAFETY_COLOR} />
            </div>
          )}

          {/* ── Loading state ──────────────────────────────────────── */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 0', gap: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.08)', borderTopColor: ACCENT, animation: 'spin 0.8s linear infinite' }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: S.muted, fontFamily: S.font }}>
                {generating ? '✨ Generating your personalized matches…' : 'Loading your personalized matches…'}
              </div>
              {generating && (
                <div style={{ fontSize: 12, color: S.dim, fontFamily: S.font }}>This may take a moment as we analyze your profile</div>
              )}
            </div>
          )}

          {/* ── Empty state ────────────────────────────────────────── */}
          {!loading && recommendations.length === 0 && (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔮</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No recommendations yet</div>
              <div style={{ color: S.muted, fontSize: 14, marginBottom: 24 }}>Generate personalized college matches based on your profile</div>
              <button onClick={handleRegenerate} disabled={regenerating} style={{
                padding: '12px 28px', background: ACCENT, border: 'none', borderRadius: 10,
                color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: S.font,
                boxShadow: `0 0 20px ${h2r(ACCENT, 0.3)}`,
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}>
                {regenerating ? (
                  <><span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000', animation: 'spin 0.8s linear infinite' }} /> Generating…</>
                ) : (
                  <>✨ Generate Matches</>
                )}
              </button>
            </div>
          )}

          {/* ── No filter results ──────────────────────────────────── */}
          {!loading && recommendations.length > 0 && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: S.muted }}>No {filterClass?.toLowerCase()} schools found</div>
            </div>
          )}

          {/* ── Recommendation cards ───────────────────────────────── */}
          {!loading && filtered.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {filtered.map((rec, i) => (
                <RecCard
                  key={rec.college.id}
                  rec={rec}
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

export default Discover;

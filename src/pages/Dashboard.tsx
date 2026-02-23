// src/pages/Dashboard.tsx — Strategic Portfolio OS
import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Link, useNavigate } from 'react-router-dom';
import AIChatbot from '../components/AIChatbot';
import ProfileStrength from '../components/chancing/ProfileStrength';
import ProfileCompletionWidget from '../components/common/ProfileCompletionWidget';
import { CompactDecisionCountdown } from '@/components/DecisionCountdown';

/* ─── Design tokens (CSS-variable-backed for light/dark) ────────────── */
const S = {
  bg:       'var(--color-bg-primary)',
  surface:  'var(--color-bg-surface)',
  surface2: 'var(--color-surface-subtle)',
  border:   'var(--color-border)',
  border2:  'var(--color-border-strong)',
  accent:   'var(--color-accent-primary)',
  text:     'var(--color-text-primary)',
  muted:    'var(--color-text-secondary)',
  dim:      'var(--color-text-disabled)',
  font:     "'DM Sans',sans-serif",
};

const GLOBAL = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
  *{box-sizing:border-box;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{opacity:.7}50%{opacity:1}}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:var(--color-border-strong);border-radius:4px;}
`;

/* ─── Readiness calculation ──────────────────────────────────────────── */
const calcReadiness = (app: any, essays: any[], deadlines: any[]): number => {
  let score = 20; // baseline: in the list
  if (app.status === 'submitted' || app.status === 'accepted') return 100;
  if (app.status === 'preparing') score += 20;
  // essays
  const collegeEssays = essays.filter(e => e.application_id === app.id || e.college_name === app.college_name);
  if (collegeEssays.length > 0) {
    const done = collegeEssays.filter(e => e.status === 'final' || e.status === 'draft_complete').length;
    score += Math.round((done / collegeEssays.length) * 40);
  }
  // deadline has been set
  const hasDeadline = deadlines.some(d => d.college_name === app.college_name);
  if (hasDeadline) score += 10;
  return Math.min(score, 99);
};

const readinessColor = (score: number, daysLeft: number | null): string => {
  if (score >= 80) return '#10B981';
  if (score >= 50) return '#FBBF24';
  if (daysLeft !== null && daysLeft <= 30) return '#F87171';
  return '#F97316';
};

const readinessLabel = (score: number, daysLeft: number | null): string => {
  if (score >= 80) return 'On Track';
  if (score >= 50) return 'Medium Risk';
  if (daysLeft !== null && daysLeft <= 30) return 'Critical';
  return 'Needs Work';
};

/* ─── Small components ───────────────────────────────────────────────── */
const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, padding: '20px 22px', ...style }}>
    {children}
  </div>
);

const SectionHead: React.FC<{ title: string; href?: string; linkLabel?: string; subtitle?: string }> = ({ title, href, linkLabel, subtitle }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
    <div>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: S.text, fontFamily: S.font, letterSpacing: '-0.01em', textTransform: 'uppercase', opacity: 0.7 }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 12, color: S.muted, fontFamily: S.font, marginTop: 2 }}>{subtitle}</p>}
    </div>
    {href && linkLabel && (
      <Link to={href} style={{ fontSize: 12, color: S.accent, fontFamily: S.font, textDecoration: 'none', fontWeight: 600, opacity: 0.85 }}>
        {linkLabel} →
      </Link>
    )}
  </div>
);

const ProgressBar: React.FC<{ value: number; accent: string; height?: number }> = ({ value, accent, height = 6 }) => (
  <div style={{ height, background: S.surface2, borderRadius: height, overflow: 'hidden' }}>
    <div style={{ width: `${Math.min(value, 100)}%`, height: '100%', background: accent, borderRadius: height, transition: 'width 0.8s ease' }} />
  </div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const cfg: Record<string, { bg: string; color: string }> = {
    submitted:  { bg: 'rgba(16,185,129,0.15)',  color: '#10B981' },
    accepted:   { bg: 'rgba(59,158,255,0.15)',  color: '#3B9EFF' },
    preparing:  { bg: 'rgba(251,191,36,0.15)',  color: '#FBBF24' },
    researching:{ bg: 'rgba(168,85,247,0.15)', color: '#A855F7' },
    rejected:   { bg: 'rgba(248,113,113,0.15)', color: '#F87171' },
    waitlisted: { bg: 'rgba(251,191,36,0.15)',  color: '#FBBF24' },
  };
  const s = cfg[status] || { bg: S.surface2, color: S.muted };
  return (
    <span style={{ padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, fontFamily: S.font, textTransform: 'capitalize' }}>{status || '—'}</span>
  );
};

/* ─── Main Dashboard ─────────────────────────────────────────────────── */
const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [applications, setApplications]   = useState<any[]>([]);
  const [deadlines, setDeadlines]         = useState<any[]>([]);
  const [essays, setEssays]               = useState<any[]>([]);
  const [decisionDates, setDecisionDates] = useState<any[]>([]);
  const [recommendedActions, setRecommendedActions] = useState<any[]>([]);
  const [profileStrength, setProfileStrength] = useState(0);
  const [loading, setLoading] = useState(true);

  const targetCountries: string[] = (() => { try { return user?.target_countries ? JSON.parse(user.target_countries) : []; } catch { return []; } })();

  useEffect(() => { loadDashboardData(); }, []);

  const loadDashboardData = async () => {
    try {
      const [applicationsRes, deadlinesRes, essaysRes] = await Promise.all([
        api.getApplications(),
        api.getDeadlines(60),
        api.getEssays(),
      ]);
      const apps     = applicationsRes.data || [];
      const ddls     = (deadlinesRes.data || []).filter((d: any) => !d.is_completed);
      const ess      = essaysRes.data || [];

      setApplications(apps);
      setDeadlines(ddls);
      setEssays(ess);

      const decisions = apps
        .filter((a: any) => a.status === 'submitted' && a.notification_date)
        .map((a: any) => ({
          collegeName:     a.college_name,
          deadlineType:    a.deadline_type || 'Regular Decision',
          notificationDate: a.notification_date,
          applicationDate: a.application_date || a.created_at,
          collegeId:       a.college_id,
        }));
      setDecisionDates(decisions);

      // Recommended actions
      try {
        const profile = { gpa: user?.gpa || 3.5, satScore: user?.sat_score, actScore: user?.act_score, grade: user?.grade || 'Grade 12', curriculum: user?.curriculum || 'CBSE' };
        const [str, act] = await Promise.all([
          api.automation.getProfileStrength(profile),
          api.automation.getRecommendedActions(profile),
        ]);
        if (str.success && str.data) setProfileStrength(str.data.percentage || 0);
        if (act.success && act.data) {
          setRecommendedActions(act.data.map((a: any, i: number) => ({
            id: `action-${i}`, ...a,
            impactScore: a.impact?.toLowerCase().includes('personalized') ? 20 : a.impact?.toLowerCase().includes('classification') ? 15 : 10,
          })));
        }
      } catch {
        setRecommendedActions([
          { id: 'a1', priority: 'high', category: 'profile', action: 'Complete your profile', reason: 'Unlocks personalized recommendations', impact: 'Unlocks college matching', impactScore: 20 },
          { id: 'a2', priority: 'medium', category: 'applications', action: 'Add colleges to your list', reason: 'Build a balanced reach/target/safety list', impact: 'Better application strategy', impactScore: 15 },
        ]);
        setProfileStrength(45);
      }
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const getDaysUntil = (d: string): number => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  const getDaysLabel = (n: number): string => n < 0 ? 'Overdue' : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${n}d`;

  /* ─── Derived metrics ─── */
  const firstName  = user?.full_name?.split(' ')[0] || 'there';
  const totalApps  = applications.length;
  const portfolioGoal = Math.max(totalApps, 8); // default goal: 8
  const progressPct   = portfolioGoal === 0 ? 0 : Math.round((totalApps / portfolioGoal) * 100);

  // Fit breakdown (from application priority field or category)
  const reach   = applications.filter(a => a.priority === 'reach'  || a.category === 'reach').length;
  const target  = applications.filter(a => a.priority === 'target' || a.category === 'target').length;
  const safety  = applications.filter(a => a.priority === 'safety' || a.category === 'safety').length;

  // Readiness per college
  const collegeReadiness = applications.map(app => {
    const nextDdl = deadlines
      .filter(d => d.college_name === app.college_name)
      .sort((a, b) => new Date(a.deadline_date).getTime() - new Date(b.deadline_date).getTime())[0];
    const daysLeft = nextDdl ? getDaysUntil(nextDdl.deadline_date) : null;
    const score = calcReadiness(app, essays, deadlines);
    return {
      id:         app.id,
      name:       app.college_name,
      score,
      daysLeft,
      deadlineDate: nextDdl?.deadline_date,
      status:     app.status,
      color:      readinessColor(score, daysLeft),
      label:      readinessLabel(score, daysLeft),
    };
  }).sort((a, b) => a.score - b.score); // worst first

  // Risk radar: deadlines in next 14 days
  const riskItems = deadlines
    .map(d => ({ ...d, days: getDaysUntil(d.deadline_date) }))
    .filter(d => d.days >= 0 && d.days <= 14)
    .sort((a, b) => a.days - b.days)
    .slice(0, 5);

  // Strategic metrics
  const avgReadiness  = collegeReadiness.length === 0 ? 0 : Math.round(collegeReadiness.reduce((s, c) => s + c.score, 0) / collegeReadiness.length);
  const mostMissing   = essays.filter(e => e.status === 'not_started' || !e.status).length > 0 ? 'Essays not started' : essays.length === 0 ? 'No essays tracked' : 'Requirements logged';

  // Next strategic move (top recommended action)
  const topAction = recommendedActions[0];

  // Overall status line
  const statusLine = totalApps === 0
    ? 'No applications added. Start by defining your portfolio goal.'
    : riskItems.length === 0
    ? `Portfolio risk low. No urgent deadlines in the next 14 days.`
    : `${riskItems.length} deadline${riskItems.length > 1 ? 's' : ''} require attention in the next 14 days.`;

  if (loading) return (
    <>
      <style>{GLOBAL}</style>
      <div style={{ minHeight: '100vh', background: S.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${S.border2}`, borderTopColor: '#6C63FF', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 13, color: S.muted, fontFamily: S.font }}>Loading portfolio data…</div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <style>{GLOBAL}</style>
      <div style={{ minHeight: '100vh', background: S.bg, fontFamily: S.font }}>

        {/* ── HEADER ── */}
        <div style={{
          padding: '32px 44px 28px',
          borderBottom: `1px solid ${S.border}`,
          background: S.surface,
        }}>
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <h1 style={{ fontSize: 26, fontWeight: 800, color: S.text, letterSpacing: '-0.02em', marginBottom: 4, fontFamily: S.font }}>
                  {firstName}'s Application Portfolio
                </h1>
                <p style={{ fontSize: 13, color: S.muted, fontFamily: S.font }}>{statusLine}</p>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { label: 'Add College',  href: '/discover',     bg: '#6C63FF' },
                  { label: 'Log Deadline', href: '/deadlines',    bg: S.surface },
                ].map(btn => (
                  <Link key={btn.href} to={btn.href} style={{ textDecoration: 'none' }}>
                    <div style={{
                      padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      background: btn.bg, color: btn.bg === S.surface ? S.text : '#fff',
                      border: `1px solid ${btn.bg === S.surface ? S.border : 'transparent'}`,
                      fontFamily: S.font,
                    }}>
                      {btn.label}
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Portfolio progress band */}
            <div style={{ marginTop: 24, padding: '18px 20px', background: S.surface2, border: `1px solid ${S.border}`, borderRadius: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: S.text, fontFamily: S.font }}>Portfolio Goal</span>
                  <span style={{ fontSize: 13, color: S.muted }}>
                    {totalApps} / {portfolioGoal} colleges · <strong style={{ color: '#6C63FF' }}>{progressPct}% complete</strong>
                  </span>
                </div>
                {/* Fit breakdown */}
                <div style={{ display: 'flex', gap: 14 }}>
                  {[
                    { label: 'Reach',  n: reach,  color: '#F87171' },
                    { label: 'Target', n: target, color: '#FBBF24' },
                    { label: 'Safety', n: safety, color: '#10B981' },
                  ].map(f => (
                    <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 18, fontWeight: 900, color: f.color, fontFamily: S.font }}>{f.n}</span>
                      <span style={{ fontSize: 11, color: S.muted, fontFamily: S.font }}>{f.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <ProgressBar value={progressPct} accent="#6C63FF" height={7} />
              {totalApps === 0 && (
                <p style={{ fontSize: 12, color: S.muted, marginTop: 8, fontFamily: S.font }}>
                  Start by searching for colleges and adding them to your list. A balanced portfolio has 2–3 reach, 3–4 target, and 2 safety schools.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── MAIN GRID ── */}
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 44px 80px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, marginBottom: 20 }}>

            {/* ── LEFT: Readiness by College ── */}
            <Card>
              <SectionHead
                title="Readiness by College"
                subtitle={totalApps === 0 ? undefined : `Avg readiness: ${avgReadiness}%`}
                href="/applications"
                linkLabel={totalApps > 0 ? 'View all' : undefined}
              />
              {totalApps === 0 ? (
                <div style={{ textAlign: 'center', padding: '28px 0' }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🏫</div>
                  <p style={{ color: S.muted, fontSize: 13, fontFamily: S.font, maxWidth: 280, margin: '0 auto', lineHeight: 1.6 }}>
                    No colleges added yet. Your readiness score is 0% because no requirements are logged.
                  </p>
                  <Link to="/discover">
                    <button style={{ marginTop: 14, padding: '8px 20px', background: '#6C63FF', border: 'none', borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: S.font }}>
                      Browse Colleges
                    </button>
                  </Link>
                </div>
              ) : (
                <div>
                  {collegeReadiness.slice(0, 8).map(c => (
                    <div key={c.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                      background: S.surface2, border: `1px solid ${S.border}`, borderLeft: `3px solid ${c.color}`,
                      borderRadius: 10, marginBottom: 8,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: S.text, fontFamily: S.font, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <ProgressBar value={c.score} accent={c.color} height={4} />
                          <span style={{ fontSize: 11, color: S.muted, fontFamily: S.font, whiteSpace: 'nowrap', minWidth: 30 }}>{c.score}%</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: c.color, fontFamily: S.font }}>{c.label}</span>
                        {c.daysLeft !== null && (
                          <span style={{ fontSize: 10, color: S.dim, fontFamily: S.font }}>
                            Deadline {c.daysLeft <= 0 ? 'past due' : `in ${c.daysLeft}d`}
                          </span>
                        )}
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                  ))}
                  {collegeReadiness.length > 8 && (
                    <Link to="/applications" style={{ fontSize: 12, color: S.accent, textDecoration: 'none', fontFamily: S.font }}>
                      + {collegeReadiness.length - 8} more colleges →
                    </Link>
                  )}
                </div>
              )}
            </Card>

            {/* ── RIGHT COLUMN ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Risk Radar */}
              <Card>
                <SectionHead title="Risk Radar" subtitle="Deadlines — next 14 days" href="/deadlines" linkLabel="All" />
                {riskItems.length === 0 ? (
                  <p style={{ fontSize: 13, color: S.muted, fontFamily: S.font, textAlign: 'center', padding: '16px 0' }}>
                    Portfolio risk low. No urgent deadlines in the next 14 days.
                  </p>
                ) : riskItems.map(d => {
                  const isUrgent = d.days <= 3;
                  const color = d.days === 0 ? '#F87171' : d.days <= 3 ? '#F97316' : '#FBBF24';
                  return (
                    <div key={d.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '9px 12px', background: S.surface2,
                      border: `1px solid ${isUrgent ? `${color}40` : S.border}`,
                      borderLeft: `3px solid ${color}`, borderRadius: 8, marginBottom: 6,
                    }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: S.text, fontFamily: S.font }}>{d.college_name}</div>
                        <div style={{ fontSize: 11, color: S.muted, fontFamily: S.font }}>{d.deadline_type}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}20`, padding: '3px 8px', borderRadius: 100, fontFamily: S.font }}>
                        {getDaysLabel(d.days)}
                      </span>
                    </div>
                  );
                })}
              </Card>

              {/* Next Strategic Move */}
              <Card style={{ border: `1px solid rgba(108,99,255,0.3)`, background: 'rgba(108,99,255,0.06)' }}>
                <SectionHead title="Next Strategic Move" />
                {topAction ? (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: S.text, fontFamily: S.font, marginBottom: 6, lineHeight: 1.4 }}>
                      {topAction.action}
                    </div>
                    <div style={{ fontSize: 12, color: S.muted, fontFamily: S.font, marginBottom: 12, lineHeight: 1.5 }}>
                      {topAction.reason}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                      <span style={{ fontSize: 11, background: 'rgba(108,99,255,0.15)', color: '#6C63FF', padding: '3px 10px', borderRadius: 100, fontWeight: 600, fontFamily: S.font }}>
                        Impact: +{topAction.impactScore}% readiness
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const routes: Record<string, string> = { profile: '/settings', essays: '/essays', applications: '/discover', deadlines: '/deadlines', recommendations: '/recommendations' };
                        navigate(routes[topAction.category] || '/');
                      }}
                      style={{ width: '100%', padding: '9px 0', background: '#6C63FF', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: S.font }}
                    >
                      Take Action →
                    </button>
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: S.muted, fontFamily: S.font }}>Complete your profile to get personalised recommendations.</p>
                )}
              </Card>

              {/* Strategic Metrics */}
              <Card>
                <SectionHead title="Strategic Metrics" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Avg readiness', value: avgReadiness === 0 ? '—' : `${avgReadiness}%`, color: avgReadiness >= 70 ? '#10B981' : avgReadiness >= 40 ? '#FBBF24' : '#F87171' },
                    { label: 'Essays tracked', value: essays.length || '—', color: essays.length > 0 ? '#3B9EFF' : S.dim },
                    { label: 'At risk', value: riskItems.length || '—', color: riskItems.length > 0 ? '#F87171' : '#10B981' },
                    { label: 'Most incomplete', value: mostMissing, color: S.muted },
                  ].map(m => (
                    <div key={m.label} style={{ padding: '10px 12px', background: S.surface2, borderRadius: 10, border: `1px solid ${S.border}` }}>
                      <div style={{ fontSize: 12, color: S.dim, fontFamily: S.font, marginBottom: 4 }}>{m.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: m.color, fontFamily: S.font, wordBreak: 'break-word' }}>{m.value}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>

          {/* ── LOWER GRID: Profile + Decisions + Deadlines ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18, marginBottom: 20 }}>

            {/* Profile strength */}
            <ProfileStrength />

            {/* Decision countdown or quick actions */}
            {decisionDates.length > 0 ? (
              <CompactDecisionCountdown decisions={decisionDates} />
            ) : (
              <Card>
                <SectionHead title="Quick Actions" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {[
                    { label: 'Explore Colleges',  href: '/discover',      color: '#6C63FF' },
                    { label: 'Manage Essays',      href: '/essays',        color: '#A855F7' },
                    { label: 'Check Deadlines',    href: '/deadlines',     color: '#F97316' },
                    { label: 'Track Documents',    href: '/documents',     color: '#10B981' },
                  ].map(a => (
                    <Link key={a.href} to={a.href} style={{ textDecoration: 'none' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                        background: S.surface2, border: `1px solid ${S.border}`, borderRadius: 9,
                        cursor: 'pointer', transition: 'border-color 0.15s',
                      }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.color, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: S.text, fontWeight: 500, fontFamily: S.font }}>{a.label}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            )}

            {/* Upcoming deadlines */}
            <Card>
              <SectionHead title="Upcoming Deadlines" href="/deadlines" linkLabel="View all" />
              {deadlines.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <p style={{ fontSize: 13, color: S.muted, fontFamily: S.font }}>No upcoming deadlines. Add one to stay on track.</p>
                  <Link to="/deadlines">
                    <button style={{ marginTop: 10, padding: '7px 16px', background: '#F97316', border: 'none', borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: S.font }}>
                      Add Deadline
                    </button>
                  </Link>
                </div>
              ) : deadlines.slice(0, 4).map((d: any) => {
                const days = getDaysUntil(d.deadline_date);
                const color = days <= 0 ? '#F87171' : days <= 3 ? '#F97316' : days <= 7 ? '#FBBF24' : S.dim;
                return (
                  <div key={d.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 10px', background: S.surface2, border: `1px solid ${S.border}`,
                    borderLeft: `3px solid ${color}`, borderRadius: 8, marginBottom: 6,
                  }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: S.text, fontFamily: S.font }}>{d.college_name}</div>
                      <div style={{ fontSize: 11, color: S.muted }}>{d.deadline_type}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: S.font }}>{getDaysLabel(days)}</span>
                  </div>
                );
              })}
            </Card>
          </div>

          {/* ── Profile completion ── */}
          <ProfileCompletionWidget variant="full" showMissingFields={true} />

          {/* ── Target countries + AI ── */}
          {targetCountries.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <Card>
                <SectionHead title="Target Countries" />
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {targetCountries.map((c: string, i: number) => (
                    <span key={i} style={{ padding: '5px 14px', background: 'rgba(59,158,255,0.12)', border: '1px solid rgba(59,158,255,0.2)', borderRadius: 100, fontSize: 13, color: '#3B9EFF', fontWeight: 600, fontFamily: S.font }}>
                      {c}
                    </span>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>

        <AIChatbot />
      </div>
    </>
  );
};

export default Dashboard;

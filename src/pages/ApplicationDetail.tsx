// src/pages/ApplicationDetail.tsx — single-page "everything about this
// application" view: college info, fees, requirements, deadlines, tasks,
// essays, and recommendation status all in one place. Previously this data
// was scattered across five separate pages (Applications, Requirements,
// Deadlines, Essays, Recommendations) with no per-application assembly.
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { toast } from 'sonner';
import {
  ArrowLeft, ExternalLink, Loader2, CheckCircle2, Circle, DollarSign,
  ClipboardCheck, PenTool, Users, StickyNote, Save,
} from 'lucide-react';
import { daysUntilDateOnly } from '@/utils/dateOnly';

/* ─── Design tokens (matches Applications.tsx) ────────────────────────── */
const h2r = (hex: string, a: number) => {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
};
const S = {
  bg: 'var(--color-bg-primary)',
  surface: 'var(--color-bg-surface)',
  surface2: 'var(--color-surface-subtle)',
  border: 'var(--color-border)',
  border2: 'var(--color-border-strong)',
  text: 'var(--color-text-primary)',
  muted: 'var(--color-text-secondary)',
  dim: 'var(--color-text-disabled)',
  font: "'Inter', system-ui, sans-serif",
  accent: '#6C63FF',
};
const GLOBAL = `
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
`;

const TIER_CFG: Record<string, { label: string; color: string; bg: string }> = {
  reach: { label: 'Reach', color: '#F87171', bg: 'rgba(248,113,113,0.12)' },
  target: { label: 'Target', color: '#FBBF24', bg: 'rgba(251,191,36,0.12)' },
  safety: { label: 'Safety', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  default: { label: 'College', color: '#A855F7', bg: 'rgba(168,85,247,0.12)' },
};

interface ApplicationFull {
  id: number; college_id: number; canonical_institution_id?: string | null;
  college_name: string; country?: string; official_website?: string;
  status: string; application_type?: string; priority?: string; notes?: string; deadline?: string;
}
interface Deadline { id: number; deadline_type: string; deadline_date?: string; completed: boolean; }
interface Task { id: number; task_type: string; title: string; completed: boolean; due_date?: string; }
interface EssayRow { id: number; application_id: number; title?: string; prompt?: string; word_count?: number; word_limit?: number; status: string; }
interface RecommendationRequest { id: number; recommender_id: number; status: string; deadline?: string; recommender_name?: string; }
interface Financials { tuition_in_state?: number; tuition_out_state?: number; tuition_international?: number; cost_of_attendance?: number; avg_financial_aid?: number; merit_scholarship_flag?: boolean; need_blind_flag?: boolean; }
interface Requirement {
  sat_required?: boolean; act_required?: boolean; sat_optional?: boolean; test_blind?: boolean;
  toefl_required?: boolean; ielts_required?: boolean; toefl_min_score?: number; ielts_min_score?: number;
  essays_required?: boolean; supplemental_essays_required?: boolean; supplemental_essay_count?: number;
  teacher_recommendations_required?: boolean; counselor_recommendation_required?: boolean;
  interview_required?: boolean; interview_optional?: boolean;
  application_platform?: string; financial_documents_required?: boolean;
}

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A');
const fmtMoney = (n?: number) => (n == null ? 'N/A' : `$${Number(n).toLocaleString()}`);
const daysUntil = (dateStr?: string) => (dateStr ? daysUntilDateOnly(dateStr) : null);
const deadlineColor = (days: number | null) => {
  if (days === null) return S.dim;
  if (days <= 7) return '#F87171';
  if (days <= 30) return '#F97316';
  return '#10B981';
};

const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode; action?: React.ReactNode }> = ({ icon, title, children, action }) => (
  <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, padding: 22, marginBottom: 18, animation: 'fadeUp 0.3s ease both' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: S.accent }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: S.text, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: S.font }}>{title}</span>
      </div>
      {action}
    </div>
    {children}
  </div>
);

const Fact: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 10, color: S.dim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4, fontFamily: S.font, fontWeight: 700 }}>{label}</div>
    <div style={{ fontSize: 14, color: S.text, fontFamily: S.font, fontWeight: 600 }}>{value}</div>
  </div>
);

const ReqChip: React.FC<{ label: string; on: boolean | undefined }> = ({ label, on }) => (
  <span style={{
    fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 100, fontFamily: S.font,
    background: on ? h2r('#10B981', 0.12) : h2r('#94A3B8', 0.1),
    color: on ? '#10B981' : S.dim,
  }}>
    {on ? '✓' : '–'} {label}
  </span>
);

const ApplicationDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [app, setApp] = useState<ApplicationFull | null>(null);
  const [financials, setFinancials] = useState<Financials | null>(null);
  const [requirement, setRequirement] = useState<Requirement | null>(null);
  const [institution, setInstitution] = useState<{ acceptance_rate?: number } | null>(null);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [essays, setEssays] = useState<EssayRow[]>([]);
  const [recRequests, setRecRequests] = useState<RecommendationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      try {
        const appsRes = await api.applications.get();
        const rows = Array.isArray(appsRes?.data) ? appsRes.data : [];
        const found = rows.find((r: any) => String(r.id) === String(id));
        if (!found) {
          toast.error('Application not found');
          navigate('/applications');
          return;
        }
        if (!mountedRef.current) return;
        setApp(found);
        setNotes(found.notes || '');

        const [dlRes, tskRes, essaysRes, recRes] = await Promise.allSettled([
          (api as any).applications.getDeadlines(found.id),
          (api as any).applications.getTasks(found.id),
          api.essays.getAll(),
          api.recommenders.requests.getAll({ collegeId: found.college_id }),
        ]);
        if (!mountedRef.current) return;
        if (dlRes.status === 'fulfilled') setDeadlines(dlRes.value?.data || []);
        if (tskRes.status === 'fulfilled') setTasks(tskRes.value?.data || []);
        if (essaysRes.status === 'fulfilled') {
          const all = essaysRes.value?.data || [];
          setEssays(all.filter((e: EssayRow) => String(e.application_id) === String(found.id)));
        }
        if (recRes.status === 'fulfilled') setRecRequests(recRes.value?.data || []);

        // College comprehensive detail (fees + requirements) — only available
        // for applications anchored to a canonical institution. Applications
        // that predate the dual-model cutover or point at a user-added
        // college outside canonical simply won't have this section.
        if (found.canonical_institution_id) {
          try {
            const collegeRes = await api.colleges.getComprehensive(found.canonical_institution_id);
            const data = collegeRes?.data || collegeRes;
            if (mountedRef.current && data) {
              setFinancials(data.financials || null);
              setInstitution(data.admissions || null);
              const reqRows = Array.isArray(data.requirements) ? data.requirements : [];
              setRequirement(reqRows[0] || null);
            }
          } catch {
            // Non-fatal — the rest of the page still renders.
          }
        }
      } catch {
        if (mountedRef.current) toast.error('Failed to load application');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };
    load();
  }, [id, navigate]);

  const toggleDeadline = async (dl: Deadline) => {
    if (!app) return;
    const prev = deadlines;
    setDeadlines(prev.map((d) => (d.id === dl.id ? { ...d, completed: !d.completed } : d)));
    try {
      await (api as any).applications.toggleDeadline(app.id, dl.id, !dl.completed);
    } catch {
      setDeadlines(prev);
      toast.error('Failed to update deadline');
    }
  };

  const toggleTask = async (task: Task) => {
    if (!app) return;
    const prev = tasks;
    setTasks(prev.map((t) => (t.id === task.id ? { ...t, completed: !t.completed } : t)));
    try {
      await (api as any).applications.toggleTask(app.id, task.id, !task.completed);
    } catch {
      setTasks(prev);
      toast.error('Failed to update task');
    }
  };

  const saveNotes = async () => {
    if (!app) return;
    setSavingNotes(true);
    try {
      await api.applications.update(app.id, { notes });
      toast.success('Notes saved');
    } catch {
      toast.error('Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  if (loading || !app) {
    return (
      <>
        <style>{GLOBAL}</style>
        <div style={{ minHeight: '100vh', background: S.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid var(--color-border)`, borderTopColor: S.accent, animation: 'spin 0.8s linear infinite' }} />
        </div>
      </>
    );
  }

  const tierKey = app.priority && ['reach', 'target', 'safety'].includes(app.priority) ? app.priority : 'default';
  const tier = TIER_CFG[tierKey];
  const nextDeadline = deadlines.filter((d) => !d.completed && d.deadline_date).sort((a, b) => new Date(a.deadline_date!).getTime() - new Date(b.deadline_date!).getTime())[0];
  const daysLeft = nextDeadline ? daysUntil(nextDeadline.deadline_date) : null;
  const completedTasks = tasks.filter((t) => t.completed).length;
  const completedEssays = essays.filter((e) => ['complete', 'completed', 'submitted'].includes(e.status)).length;

  return (
    <>
      <style>{GLOBAL}</style>
      <div style={{ minHeight: '100vh', background: S.bg, color: S.text, fontFamily: S.font }}>
        {/* Header */}
        <div style={{ padding: '32px 48px 24px', background: `linear-gradient(180deg,${h2r(S.accent, 0.07)} 0%,transparent 100%)`, borderBottom: `1px solid ${S.border}` }}>
          <div style={{ maxWidth: 1000, margin: '0 auto' }}>
            <button onClick={() => navigate('/applications')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: S.muted, fontSize: 13, cursor: 'pointer', fontFamily: S.font, marginBottom: 16 }}>
              <ArrowLeft size={14} /> Back to applications
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em', margin: 0 }}>{app.college_name}</h1>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: tier.bg, color: tier.color, fontFamily: S.font }}>{tier.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: S.muted, fontSize: 13 }}>
                  <span>{app.country || 'USA'}</span>
                  {app.official_website && (
                    <a href={app.official_website} target="_blank" rel="noreferrer" style={{ color: S.accent, display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                      Official site <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <Fact label="Status" value={app.status.replace(/_/g, ' ')} />
                <Fact label="Type" value={(app.application_type || 'regular').replace(/_/g, ' ')} />
                <Fact label="Acceptance rate" value={institution?.acceptance_rate != null ? `${(Number(institution.acceptance_rate) * 100).toFixed(0)}%` : 'N/A'} />
                <Fact label="Next deadline" value={nextDeadline ? <span style={{ color: deadlineColor(daysLeft) }}>{fmtDate(nextDeadline.deadline_date)} · {daysLeft! < 0 ? 'Overdue' : `${daysLeft}d`}</span> : 'N/A'} />
              </div>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 48px 80px' }}>
          {/* Fees & Cost */}
          <Section icon={<DollarSign size={16} />} title="Fees & Cost">
            {financials ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
                <Fact label="Tuition (international)" value={fmtMoney(financials.tuition_international)} />
                <Fact label="Tuition (out-of-state)" value={fmtMoney(financials.tuition_out_state)} />
                <Fact label="Total cost of attendance" value={fmtMoney(financials.cost_of_attendance)} />
                <Fact label="Avg. financial aid" value={fmtMoney(financials.avg_financial_aid)} />
                <Fact label="Merit scholarships" value={financials.merit_scholarship_flag ? 'Available' : 'N/A'} />
                <Fact label="Need-blind admission" value={financials.need_blind_flag ? 'Yes' : 'No / Unknown'} />
              </div>
            ) : (
              <div style={{ fontSize: 13, color: S.dim, fontFamily: S.font }}>No cost data available for this college yet.</div>
            )}
          </Section>

          {/* Requirements */}
          <Section icon={<ClipboardCheck size={16} />} title="What They're Asking For">
            {requirement ? (
              <div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  <ReqChip label="SAT/ACT required" on={requirement.sat_required || requirement.act_required} />
                  <ReqChip label="Test-optional" on={requirement.sat_optional} />
                  <ReqChip label="Test-blind" on={requirement.test_blind} />
                  <ReqChip label="Essays required" on={requirement.essays_required} />
                  <ReqChip label="Supplemental essays" on={requirement.supplemental_essays_required} />
                  <ReqChip label="Teacher rec" on={requirement.teacher_recommendations_required} />
                  <ReqChip label="Counselor rec" on={requirement.counselor_recommendation_required} />
                  <ReqChip label="Interview" on={requirement.interview_required || requirement.interview_optional} />
                  <ReqChip label="TOEFL/IELTS" on={requirement.toefl_required || requirement.ielts_required} />
                  <ReqChip label="Financial documents" on={requirement.financial_documents_required} />
                </div>
                {requirement.supplemental_essay_count ? (
                  <div style={{ fontSize: 12, color: S.muted, fontFamily: S.font }}>{requirement.supplemental_essay_count} supplemental essay(s) required</div>
                ) : null}
                {requirement.application_platform && (
                  <div style={{ fontSize: 12, color: S.muted, fontFamily: S.font, marginTop: 4 }}>Apply via: {requirement.application_platform}</div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: S.dim, fontFamily: S.font }}>No requirements data available for this college yet.</div>
            )}
          </Section>

          {/* Deadlines */}
          <Section icon={<span style={{ fontSize: 15 }}>⏰</span>} title={`Deadlines (${deadlines.filter((d) => d.completed).length}/${deadlines.length})`}>
            {deadlines.length === 0 ? (
              <div style={{ fontSize: 13, color: S.dim, fontFamily: S.font }}>No deadlines tracked yet.</div>
            ) : (
              deadlines.map((dl) => {
                const d = daysUntil(dl.deadline_date);
                return (
                  <div key={dl.id} onClick={() => toggleDeadline(dl)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid ${S.border}`, cursor: 'pointer' }}>
                    {dl.completed ? <CheckCircle2 size={16} color="#10B981" /> : <Circle size={16} color={S.dim} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: dl.completed ? S.dim : S.text, fontFamily: S.font, textDecoration: dl.completed ? 'line-through' : 'none' }}>{dl.deadline_type.replace(/_/g, ' ')}</div>
                    </div>
                    {dl.deadline_date && <div style={{ fontSize: 11, color: deadlineColor(d), fontFamily: S.font }}>{fmtDate(dl.deadline_date)}</div>}
                  </div>
                );
              })
            )}
          </Section>

          {/* Tasks */}
          <Section icon={<CheckCircle2 size={16} />} title={`Tasks (${completedTasks}/${tasks.length})`}>
            {tasks.length === 0 ? (
              <div style={{ fontSize: 13, color: S.dim, fontFamily: S.font }}>No tasks tracked yet.</div>
            ) : (
              tasks.map((task) => (
                <div key={task.id} onClick={() => toggleTask(task)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: `1px solid ${S.border}`, cursor: 'pointer' }}>
                  {task.completed ? <CheckCircle2 size={16} color="#10B981" style={{ flexShrink: 0, marginTop: 1 }} /> : <Circle size={16} color={S.dim} style={{ flexShrink: 0, marginTop: 1 }} />}
                  <div style={{ fontSize: 13, color: task.completed ? S.dim : S.text, fontFamily: S.font, textDecoration: task.completed ? 'line-through' : 'none', flex: 1 }}>{task.title}</div>
                  {task.due_date && <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font }}>{fmtDate(task.due_date)}</div>}
                </div>
              ))
            )}
          </Section>

          {/* Essays */}
          <Section icon={<PenTool size={16} />} title={`Essays (${completedEssays}/${essays.length})`}>
            {essays.length === 0 ? (
              <div style={{ fontSize: 13, color: S.dim, fontFamily: S.font }}>No essays linked to this application yet.</div>
            ) : (
              essays.map((e) => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${S.border}` }}>
                  <div>
                    <div style={{ fontSize: 13, color: S.text, fontFamily: S.font, fontWeight: 600 }}>{e.title || e.prompt || `Essay ${e.id}`}</div>
                    {(e.word_count != null || e.word_limit != null) && (
                      <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font }}>{e.word_count ?? 0}{e.word_limit ? ` / ${e.word_limit}` : ''} words</div>
                    )}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 100, fontFamily: S.font, background: h2r(S.accent, 0.12), color: S.accent, textTransform: 'capitalize' }}>{e.status.replace(/_/g, ' ')}</span>
                </div>
              ))
            )}
          </Section>

          {/* Recommendations */}
          <Section icon={<Users size={16} />} title={`Recommendations (${recRequests.filter((r) => r.status === 'received' || r.status === 'submitted').length}/${recRequests.length})`} action={<Link to="/recommenders" style={{ fontSize: 12, color: S.accent, textDecoration: 'none', fontFamily: S.font }}>Manage recommenders →</Link>}>
            {recRequests.length === 0 ? (
              <div style={{ fontSize: 13, color: S.dim, fontFamily: S.font }}>No recommendation requests linked to this college yet.</div>
            ) : (
              recRequests.map((r) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${S.border}` }}>
                  <div style={{ fontSize: 13, color: S.text, fontFamily: S.font, fontWeight: 600 }}>{r.recommender_name || `Recommender #${r.recommender_id}`}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {r.deadline && <span style={{ fontSize: 11, color: S.dim, fontFamily: S.font }}>{fmtDate(r.deadline)}</span>}
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 100, fontFamily: S.font, background: h2r(S.accent, 0.12), color: S.accent, textTransform: 'capitalize' }}>{r.status.replace(/_/g, ' ')}</span>
                  </div>
                </div>
              ))
            )}
          </Section>

          {/* Notes */}
          <Section icon={<StickyNote size={16} />} title="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4}
              placeholder="Why this college? Anything else you want to remember."
              style={{ width: '100%', padding: '10px 14px', background: S.surface2, border: `1px solid ${S.border2}`, borderRadius: 10, color: S.text, fontSize: 13, fontFamily: S.font, outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 10 }} />
            <button onClick={saveNotes} disabled={savingNotes} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: S.accent, border: 'none', borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 700, cursor: savingNotes ? 'default' : 'pointer', fontFamily: S.font, opacity: savingNotes ? 0.6 : 1 }}>
              {savingNotes ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Save size={13} />} Save notes
            </button>
          </Section>
        </div>
      </div>
    </>
  );
};

export default ApplicationDetail;

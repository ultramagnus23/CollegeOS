import React, { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../services/api';
import { Loader2, X, Search, ExternalLink, Trash2, ChevronDown, ChevronUp, Plus, CheckCircle2, Circle } from 'lucide-react';
import { toast } from 'sonner';
import ConfirmModal from '@/components/common/ConfirmModal';

/* ─── Design tokens ──────────────────────────────────────────────── */
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
  text: 'var(--color-text-primary)',
  muted: 'var(--color-text-secondary)',
  dim: 'var(--color-text-disabled)',
  font: "'Inter', system-ui, sans-serif",
  accent: '#6C63FF',
};
const GLOBAL = `
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  input::placeholder,textarea::placeholder{color:var(--color-text-disabled)!important;}
  select option{background:var(--color-bg-surface);color:var(--color-text-primary);}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:var(--color-border-strong);border-radius:4px;}
`;

/* ─── Types ──────────────────────────────────────────────────────── */
interface Application {
  id: number;
  college_id: number;
  college_name: string;
  country?: string;
  official_website?: string;
  status: string;
  application_type?: string;
  priority?: string;
  notes?: string;
  created_at: string;
}
interface CollegeResult { id: number; name: string; country?: string; location?: string; }
interface Deadline { id: number; deadline_type: string; deadline_date?: string; completed: boolean; notes?: string; }
interface Task { id: number; task_type: string; title: string; completed: boolean; due_date?: string; }

/* ─── Kanban column config ───────────────────────────────────────── */
const COLUMNS: { key: string; label: string; statuses: string[]; accent: string; emoji: string }[] = [
  { key: 'planning',    label: 'Planning',    statuses: ['researching'],             accent: '#A855F7', emoji: '🔍' },
  { key: 'in_progress', label: 'In Progress', statuses: ['preparing'],               accent: '#3B9EFF', emoji: '✍️'  },
  { key: 'submitted',   label: 'Submitted',   statuses: ['submitted'],               accent: '#10B981', emoji: '📨' },
  { key: 'decision',    label: 'Decision',    statuses: ['accepted','rejected','waitlisted'], accent: '#F59E0B', emoji: '🎓' },
];

/* ─── Tier badge config ──────────────────────────────────────────── */
const TIER_CFG: Record<string, { label: string; color: string; bg: string }> = {
  reach:   { label: 'Reach',   color: '#F87171', bg: 'rgba(248,113,113,0.12)' },
  target:  { label: 'Target',  color: '#FBBF24', bg: 'rgba(251,191,36,0.12)'  },
  safety:  { label: 'Safety',  color: '#10B981', bg: 'rgba(16,185,129,0.12)'  },
  default: { label: 'College', color: '#A855F7', bg: 'rgba(168,85,247,0.12)'  },
};

/* ─── Helpers ────────────────────────────────────────────────────── */
const daysUntil = (dateStr?: string) => {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
};
const deadlineColor = (days: number | null) => {
  if (days === null) return S.dim;
  if (days < 0) return '#F87171';
  if (days <= 7) return '#F87171';
  if (days <= 30) return '#F97316';
  return '#10B981';
};
const fmtDate = (d?: string) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const inp: React.CSSProperties = { width:'100%', padding:'10px 14px', background:'var(--color-surface-subtle)', border:`1px solid var(--color-border-strong)`, borderRadius:10, color:S.text, fontSize:14, fontFamily:S.font, outline:'none', boxSizing:'border-box' };
const lbl: React.CSSProperties = { fontSize:11, color:S.dim, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, fontWeight:600, display:'block', fontFamily:S.font };

/* ─── Application Card ───────────────────────────────────────────── */
const AppCard: React.FC<{
  app: Application; onDelete: (id: number) => void;
  onStatusChange: (id: number, s: string) => void;
  accentColor: string; index: number;
}> = ({ app, onDelete, onStatusChange, accentColor, index }) => {
  const [expanded, setExpanded] = useState(false);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsLoaded, setDetailsLoaded] = useState(false);

  const tierKey = app.priority && ['reach','target','safety'].includes(app.priority) ? app.priority : 'default';
  const tier = TIER_CFG[tierKey];

  const nearestDeadline = deadlines
    .filter(d => !d.completed && d.deadline_date)
    .sort((a, b) => new Date(a.deadline_date!).getTime() - new Date(b.deadline_date!).getTime())[0];

  const completedTasks = tasks.filter(t => t.completed).length;

  const loadDetails = async () => {
    if (detailsLoaded) { setExpanded(e => !e); return; }
    setExpanded(true);
    setLoadingDetails(true);
    try {
      const [dlRes, tskRes] = await Promise.all([
        (api as any).applications.getDeadlines(app.id),
        (api as any).applications.getTasks(app.id),
      ]);
      setDeadlines(dlRes?.data || []);
      setTasks(tskRes?.data || []);
      setDetailsLoaded(true);
    } catch {
      toast.error('Failed to load details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const toggleDeadline = async (dl: Deadline) => {
    const optimistic = deadlines.map(d => d.id === dl.id ? { ...d, completed: !d.completed } : d);
    setDeadlines(optimistic);
    try {
      await (api as any).applications.toggleDeadline(app.id, dl.id, !dl.completed);
    } catch {
      setDeadlines(deadlines); // revert
    }
  };

  const toggleTask = async (task: Task) => {
    const optimistic = tasks.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t);
    setTasks(optimistic);
    try {
      await (api as any).applications.toggleTask(app.id, task.id, !task.completed);
    } catch {
      setTasks(tasks); // revert
    }
  };

  const days = nearestDeadline ? daysUntil(nearestDeadline.deadline_date) : null;

  return (
    <div style={{
      background: S.surface, border: `1px solid ${S.border}`,
      borderTop: `2px solid ${accentColor}`,
      borderRadius: 14, padding: '16px 18px', marginBottom: 12,
      animation: `fadeUp 0.3s ease both`, animationDelay: `${index * 0.04}s`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: S.text, fontFamily: S.font, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {app.college_name}
          </div>
          <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font }}>{app.country || 'USA'}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 100, background: tier.bg, color: tier.color, fontFamily: S.font }}>
            {tier.label}
          </span>
          {app.official_website && (
            <button onClick={() => window.open(app.official_website, '_blank')} style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: `1px solid ${S.border2}`, color: S.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ExternalLink size={12} />
            </button>
          )}
          <button onClick={() => onDelete(app.id)} style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#F87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        {nearestDeadline && (
          <div style={{ fontSize: 11, color: deadlineColor(days), fontFamily: S.font, display: 'flex', alignItems: 'center', gap: 3 }}>
            ⏰ {nearestDeadline.deadline_type}
            {days !== null && ` · ${days < 0 ? 'Overdue' : days === 0 ? 'Today' : `${days}d`}`}
          </div>
        )}
        {tasks.length > 0 && (
          <div style={{ fontSize: 11, color: S.muted, fontFamily: S.font }}>
            ✅ {completedTasks}/{tasks.length} tasks
          </div>
        )}
      </div>

      {/* Status change */}
      <div style={{ marginBottom: 10 }}>
        <select value={app.status} onChange={e => onStatusChange(app.id, e.target.value)} style={{
          padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
          background: 'rgba(255,255,255,0.06)', border: `1px solid ${S.border2}`,
          color: S.muted, cursor: 'pointer', fontFamily: S.font,
        }}>
          <option value="researching">Researching</option>
          <option value="preparing">Preparing</option>
          <option value="submitted">Submitted</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="waitlisted">Waitlisted</option>
        </select>
      </div>

      {/* Expand/collapse */}
      <button onClick={loadDetails} style={{
        width: '100%', padding: '6px', background: 'transparent', border: `1px solid ${S.border}`,
        borderRadius: 8, cursor: 'pointer', color: S.muted, fontFamily: S.font, fontSize: 11,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
      }}>
        {loadingDetails ? <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {expanded ? 'Hide details' : 'View deadlines & tasks'}
      </button>

      {/* Expanded details */}
      {expanded && !loadingDetails && (
        <div style={{ marginTop: 12 }}>
          {/* Deadlines */}
          {deadlines.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: S.dim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, fontFamily: S.font, fontWeight: 700 }}>Deadlines</div>
              {deadlines.map(dl => {
                const d = daysUntil(dl.deadline_date);
                return (
                  <div key={dl.id} onClick={() => toggleDeadline(dl)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${S.border}`, cursor: 'pointer' }}>
                    {dl.completed ? <CheckCircle2 size={14} color="#10B981" /> : <Circle size={14} color={S.dim} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: dl.completed ? S.dim : S.text, fontFamily: S.font, textDecoration: dl.completed ? 'line-through' : 'none' }}>{dl.deadline_type}</div>
                      {dl.deadline_date && <div style={{ fontSize: 10, color: deadlineColor(d), fontFamily: S.font }}>{fmtDate(dl.deadline_date)}{d !== null && ` · ${d < 0 ? 'Overdue' : d === 0 ? 'Today' : `${d}d left`}`}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tasks */}
          {tasks.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: S.dim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, fontFamily: S.font, fontWeight: 700 }}>Tasks</div>
              {tasks.map(task => (
                <div key={task.id} onClick={() => toggleTask(task)} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: `1px solid ${S.border}`, cursor: 'pointer' }}>
                  {task.completed ? <CheckCircle2 size={14} color="#10B981" style={{ flexShrink: 0, marginTop: 1 }} /> : <Circle size={14} color={S.dim} style={{ flexShrink: 0, marginTop: 1 }} />}
                  <div style={{ fontSize: 12, color: task.completed ? S.dim : S.text, fontFamily: S.font, textDecoration: task.completed ? 'line-through' : 'none', flex: 1 }}>{task.title}</div>
                </div>
              ))}
            </div>
          )}

          {deadlines.length === 0 && tasks.length === 0 && (
            <div style={{ fontSize: 12, color: S.dim, fontFamily: S.font, textAlign: 'center', padding: '8px 0' }}>No details available</div>
          )}
        </div>
      )}
    </div>
  );
};

/* ─── Main ────────────────────────────────────────────────────────── */
const Applications = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  // Add modal state
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ collegeSearch: '', appType: 'regular', priority: 'medium', notes: '' });
  const [searchResults, setSearchResults] = useState<CollegeResult[]>([]);
  const [selectedCollege, setSelectedCollege] = useState<CollegeResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { loadApplications(); }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!form.collegeSearch.trim() || selectedCollege) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.colleges.search({ q: form.collegeSearch });
        setSearchResults((res.data || []).slice(0, 6));
      } catch { /* ignore */ } finally { setSearching(false); }
    }, 300);
  }, [form.collegeSearch, selectedCollege]);

  const loadApplications = async () => {
    try {
      const res = await api.applications.get();
      setApplications(res.data || []);
    } catch { toast.error('Failed to load applications'); } finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id); setDeleteId(null);
    try {
      await api.applications.delete(id);
      toast.success('Application removed');
      loadApplications();
    } catch { toast.error('Failed to delete'); } finally { setDeleting(null); }
  };

  const handleSubmitAdd = async () => {
    if (!selectedCollege) { toast.error('Please select a college'); return; }
    setSubmitting(true);
    try {
      await api.applications.create({ college_id: selectedCollege.id, college_name: selectedCollege.name, application_type: form.appType, priority: form.priority, notes: form.notes || undefined });
      toast.success('Application added! Deadlines and tasks auto-generated.');
      closeModal(); loadApplications();
    } catch { toast.error('Failed to add application'); } finally { setSubmitting(false); }
  };

  const closeModal = useCallback(() => {
    setShowAdd(false);
    setForm({ collegeSearch: '', appType: 'regular', priority: 'medium', notes: '' });
    setSelectedCollege(null); setSearchResults([]);
  }, []);

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await api.applications.update(id, { status });
      setApplications(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    } catch { toast.error('Failed to update status'); }
  };

  // Stats
  const reach   = applications.filter(a => a.priority === 'reach').length;
  const target  = applications.filter(a => a.priority === 'target').length;
  const safety  = applications.filter(a => a.priority === 'safety').length;

  if (loading) {
    return (
      <>
        <style>{GLOBAL}</style>
        <div style={{ minHeight: '100vh', background: S.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid var(--color-border)`, borderTopColor: S.accent, animation: 'spin 0.8s linear infinite' }} />
        </div>
      </>
    );
  }

  return (
    <>
      <style>{GLOBAL}</style>
      <ConfirmModal
        isOpen={!!deleteId}
        title="Remove Application"
        message="Remove this college from your list?"
        confirmLabel="Remove"
        onConfirm={() => handleDelete(deleteId!)}
        onCancel={() => setDeleteId(null)}
      />

      {/* Add modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: S.surface, border: `1px solid var(--color-border-strong)`, borderRadius: 18, padding: 28, width: '100%', maxWidth: 460, position: 'relative', animation: 'fadeUp 0.25s ease' }}>
            <button onClick={closeModal} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: S.muted, cursor: 'pointer' }}><X size={18} /></button>
            <div style={{ fontSize: 18, fontWeight: 800, color: S.text, fontFamily: S.font, marginBottom: 20 }}>Add College to List</div>

            {/* College search */}
            <div style={{ marginBottom: 16 }}>
              <span style={lbl}>College *</span>
              {selectedCollege ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: h2r(S.accent, 0.1), border: `1px solid ${h2r(S.accent, 0.3)}`, borderRadius: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: S.text, fontFamily: S.font }}>{selectedCollege.name}</span>
                  <button onClick={() => { setSelectedCollege(null); setForm(f => ({ ...f, collegeSearch: '' })); }} style={{ background: 'none', border: 'none', color: S.muted, cursor: 'pointer' }}><X size={14} /></button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: S.dim, pointerEvents: 'none' }} />
                  <input value={form.collegeSearch} onChange={e => setForm(f => ({ ...f, collegeSearch: e.target.value }))} placeholder="Search colleges..." style={{ ...inp, paddingLeft: 36 }} />
                  {searching && <Loader2 size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', animation: 'spin 0.8s linear infinite', color: S.dim }} />}
                  {searchResults.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: S.surface, border: `1px solid var(--color-border-strong)`, borderRadius: 10, overflow: 'hidden', zIndex: 200 }}>
                      {searchResults.map(c => (
                        <button key={c.id} onClick={() => { setSelectedCollege(c); setSearchResults([]); }} style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderBottom: `1px solid ${S.border}`, cursor: 'pointer', fontFamily: S.font }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{c.name}</div>
                          {(c.location || c.country) && <div style={{ fontSize: 11, color: S.dim }}>{c.location || c.country}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <span style={lbl}>Application Type</span>
                <select value={form.appType} onChange={e => setForm(f => ({ ...f, appType: e.target.value }))} style={inp}>
                  <option value="early_decision">Early Decision</option>
                  <option value="early_action">Early Action</option>
                  <option value="regular">Regular Decision</option>
                  <option value="rolling">Rolling</option>
                </select>
              </div>
              <div>
                <span style={lbl}>Tier</span>
                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={inp}>
                  <option value="reach">Reach</option>
                  <option value="target">Target</option>
                  <option value="safety">Safety</option>
                  <option value="medium">Unsure</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <span style={lbl}>Notes (optional)</span>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inp, resize: 'none', lineHeight: 1.5 }} placeholder="Why this college?" />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={closeModal} style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${S.border2}`, borderRadius: 10, color: S.muted, fontSize: 13, cursor: 'pointer', fontFamily: S.font }}>Cancel</button>
              <button onClick={handleSubmitAdd} disabled={submitting || !selectedCollege} style={{ padding: '10px 24px', background: S.accent, border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 13, cursor: submitting || !selectedCollege ? 'not-allowed' : 'pointer', fontFamily: S.font, opacity: !selectedCollege ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                {submitting && <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />}
                Add Application
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ minHeight: '100vh', background: S.bg, color: S.text, fontFamily: S.font }}>
        {/* Header */}
        <div style={{ padding: '44px 48px 0', background: `linear-gradient(180deg,${h2r(S.accent,0.07)} 0%,transparent 100%)`, borderBottom: `1px solid ${S.border}` }}>
          <div style={{ maxWidth: 1400, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 28, flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: h2r(S.accent, 0.8), textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10, fontWeight: 600 }}>Application Tracker</div>
                <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 6 }}>
                  My <span style={{ color: S.accent }}>Applications.</span>
                </h1>
                {/* Summary bar */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
                  <span style={{ fontSize: 13, color: S.muted }}>{applications.length} total</span>
                  {reach > 0 && <span style={{ fontSize: 13, color: '#F87171' }}>🔴 {reach} reach</span>}
                  {target > 0 && <span style={{ fontSize: 13, color: '#FBBF24' }}>🟡 {target} target</span>}
                  {safety > 0 && <span style={{ fontSize: 13, color: '#10B981' }}>🟢 {safety} safety</span>}
                </div>
              </div>
              <button onClick={() => setShowAdd(true)} style={{ padding: '12px 24px', background: S.accent, border: 'none', borderRadius: 12, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: S.font, display: 'flex', alignItems: 'center', gap: 8, boxShadow: `0 0 20px ${h2r(S.accent,0.3)}` }}>
                <Plus size={18} /> Add College
              </button>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 48px 80px' }}>
          {applications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎓</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No applications yet</div>
              <div style={{ color: S.muted, fontSize: 14, marginBottom: 24 }}>Add colleges to start tracking your applications</div>
              <button onClick={() => setShowAdd(true)} style={{ padding: '12px 28px', background: S.accent, border: 'none', borderRadius: 12, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: S.font }}>
                + Add Your First College
              </button>
            </div>
          ) : (
            /* Kanban board */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
              {COLUMNS.map(col => {
                const colApps = applications.filter(a => col.statuses.includes(a.status));
                return (
                  <div key={col.key}>
                    {/* Column header */}
                    <div style={{ marginBottom: 16, padding: '10px 14px', background: h2r(col.accent, 0.1), border: `1px solid ${h2r(col.accent, 0.25)}`, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{col.emoji}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: col.accent, fontFamily: S.font }}>{col.label}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, background: h2r(col.accent, 0.2), color: col.accent, padding: '2px 8px', borderRadius: 100 }}>{colApps.length}</span>
                    </div>

                    {/* Cards */}
                    {colApps.length === 0 ? (
                      <div style={{ padding: '24px 16px', textAlign: 'center', border: `1px dashed ${S.border}`, borderRadius: 12, color: S.dim, fontSize: 12, fontFamily: S.font }}>
                        No colleges here yet
                      </div>
                    ) : (
                      colApps.map((app, i) => (
                        <AppCard key={app.id} app={app} index={i} accentColor={col.accent}
                          onDelete={id => setDeleteId(id)}
                          onStatusChange={handleStatusChange}
                        />
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Applications;


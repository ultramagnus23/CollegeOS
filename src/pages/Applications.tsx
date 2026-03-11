// src/pages/Applications.tsx — Dark Editorial Redesign
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/api';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, ExternalLink, Search, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ConfirmModal from '@/components/common/ConfirmModal';

/* ─── Types ──────────────────────────────────────────────────────────── */
interface Application {
  id: number;
  college_id: number;
  college_name: string;
  status: string;
  application_type?: string;
  priority?: string;
  notes?: string;
  submitted_at?: string;
  decision_received_at?: string;
  created_at: string;
  updated_at: string;
}

interface CollegeResult {
  id: number;
  name: string;
  country?: string;
  location?: string;
}

/* ─── Design ─────────────────────────────────────────────────────────── */
import { h2r, S, GLOBAL, inp, lbl } from '../styles/designTokens';

const ACCENT = '#6C63FF';

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  researching:      { label: 'Researching',      color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' },
  preparing:        { label: 'Preparing',         color: '#3B9EFF', bg: 'rgba(59,158,255,0.12)' },
  in_progress:      { label: 'In Progress',       color: '#A855F7', bg: 'rgba(168,85,247,0.12)' },
  submitted:        { label: 'Submitted',         color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  interview:        { label: 'Interview',         color: '#6C63FF', bg: 'rgba(108,99,255,0.12)' },
  decision_pending: { label: 'Decision Pending',  color: '#F97316', bg: 'rgba(249,115,22,0.12)' },
  accepted:         { label: 'Accepted',          color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  rejected:         { label: 'Rejected',          color: '#F87171', bg: 'rgba(248,113,113,0.12)' },
  waitlisted:       { label: 'Waitlisted',        color: '#FBBF24', bg: 'rgba(251,191,36,0.12)' },
  withdrawn:        { label: 'Withdrawn',         color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
};

const PRIORITY_CFG: Record<string, { label: string; color: string; bg: string }> = {
  high:   { label: 'High',   color: '#F87171', bg: 'rgba(248,113,113,0.12)' },
  medium: { label: 'Medium', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  low:    { label: 'Low',    color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' },
};

const STATUS_OPTIONS = Object.keys(STATUS_CFG);

const TYPE_OPTIONS = [
  { value: 'regular', label: 'Regular Decision' },
  { value: 'early_decision_1', label: 'Early Decision I' },
  { value: 'early_decision_2', label: 'Early Decision II' },
  { value: 'early_action', label: 'Early Action' },
  { value: 'rolling', label: 'Rolling' },
];

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'researching', label: 'Researching' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'decision', label: 'Decision' },
];

const DECISION_STATUSES = ['accepted', 'rejected', 'waitlisted', 'decision_pending'];

/* ─── Helpers ────────────────────────────────────────────────────────── */
const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
};

const fmtType = (t?: string) => {
  const found = TYPE_OPTIONS.find(o => o.value === t);
  return found ? found.label : t || '—';
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

/* ─── Application Card ───────────────────────────────────────────────── */
const AppCard: React.FC<{
  app: Application; index: number;
  onView: (id: number) => void;
  onStatusChange: (id: number, status: string) => void;
  onDelete: (id: number) => void;
}> = ({ app, index, onView, onStatusChange, onDelete }) => {
  const st = STATUS_CFG[app.status] || STATUS_CFG.researching;
  const pr = app.priority ? PRIORITY_CFG[app.priority.toLowerCase()] : null;

  return (
    <div style={{
      background: S.surface, border: `1px solid ${S.border}`,
      borderLeft: `3px solid ${st.color}`,
      borderRadius: 16, overflow: 'hidden',
      animation: 'fadeUp 0.35s ease both', animationDelay: `${index * 0.05}s`,
    }}>
      <div style={{ padding: '20px 22px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font }}>{app.college_name}</h3>
              {/* Status badge */}
              <span style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 100,
                background: st.bg, border: `1px solid ${h2r(st.color, 0.4)}`,
                color: st.color, fontWeight: 600, fontFamily: S.font, whiteSpace: 'nowrap',
              }}>{st.label}</span>
              {/* Priority badge */}
              {pr && (
                <span style={{
                  fontSize: 11, padding: '2px 10px', borderRadius: 100,
                  background: pr.bg, border: `1px solid ${h2r(pr.color, 0.4)}`,
                  color: pr.color, fontWeight: 600, fontFamily: S.font, whiteSpace: 'nowrap',
                }}>⚡ {pr.label}</span>
              )}
            </div>
            {/* Type + Date */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: S.dim, fontFamily: S.font }}>
              <span>📝 {fmtType(app.application_type)}</span>
              <span>📅 {fmtDate(app.created_at)}</span>
            </div>
          </div>
          {/* Actions */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
            <button onClick={() => onView(app.college_id)} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: h2r(ACCENT, 0.15), border: `1px solid ${h2r(ACCENT, 0.3)}`,
              color: ACCENT, fontFamily: S.font, display: 'flex', alignItems: 'center', gap: 4,
            }}
              onMouseEnter={e => (e.currentTarget.style.background = h2r(ACCENT, 0.25))}
              onMouseLeave={e => (e.currentTarget.style.background = h2r(ACCENT, 0.15))}
            ><ExternalLink size={13} /> View</button>
            <button onClick={() => onDelete(app.id)} style={{
              width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
              background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)',
              color: '#F87171', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.1)')}
            ><Trash2 size={14} /></button>
          </div>
        </div>

        {/* Notes */}
        {app.notes && (
          <div style={{
            marginTop: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10,
            borderLeft: `2px solid ${h2r(ACCENT, 0.4)}`,
          }}>
            <p style={{ fontSize: 13, color: S.muted, fontFamily: S.font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.notes}</p>
          </div>
        )}

        {/* Status change row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: S.dim, fontFamily: S.font, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Status:</span>
          <div style={{ position: 'relative' }}>
            <select
              value={app.status}
              onChange={e => onStatusChange(app.id, e.target.value)}
              style={{
                padding: '5px 28px 5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: S.surface2, border: `1px solid ${S.border2}`,
                color: 'var(--color-text-primary)', fontFamily: S.font,
                cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none',
              }}
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{STATUS_CFG[s]?.label || s}</option>
              ))}
            </select>
            <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: S.dim }} />
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── Main ────────────────────────────────────────────────────────────── */
const Applications = () => {
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState('all');

  /* Add modal state */
  const [showAddModal, setShowAddModal] = useState(false);
  const [collegeSearch, setCollegeSearch] = useState('');
  const [collegeResults, setCollegeResults] = useState<CollegeResult[]>([]);
  const [selectedCollege, setSelectedCollege] = useState<CollegeResult | null>(null);
  const [formType, setFormType] = useState('regular');
  const [formPriority, setFormPriority] = useState('medium');
  const [formNotes, setFormNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Delete state */
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    loadApplications();
    return () => { if (searchRef.current) clearTimeout(searchRef.current); };
  }, []);

  const loadApplications = async () => {
    try {
      setLoading(true);
      const response = await api.applications.get();
      setApplications(response.data || []);
    } catch {
      toast.error('Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  /* ── College search (debounced) ──────────────────────────────────── */
  const handleSearchInput = (value: string) => {
    setCollegeSearch(value);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      if (value.trim().length < 2) { setCollegeResults([]); setSearching(false); return; }
      try {
        setSearching(true);
        const res = await api.colleges.search({ q: value.trim() });
        setCollegeResults(res.data || []);
      } catch {
        setCollegeResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const selectCollege = (c: CollegeResult) => {
    setSelectedCollege(c);
    setCollegeSearch(c.name);
    setCollegeResults([]);
  };

  /* ── Add application ─────────────────────────────────────────────── */
  const handleAddSubmit = async () => {
    if (!selectedCollege) { toast.error('Please select a college'); return; }
    try {
      setSubmitting(true);
      await api.applications.create({
        college_id: selectedCollege.id,
        college_name: selectedCollege.name,
        status: 'researching',
        application_type: formType,
        priority: formPriority,
        notes: formNotes || undefined,
      });
      toast.success(`${selectedCollege.name} added to your applications`);
      resetModal();
      loadApplications();
    } catch {
      toast.error('Failed to create application');
    } finally {
      setSubmitting(false);
    }
  };

  const resetModal = () => {
    setShowAddModal(false);
    setCollegeSearch('');
    setCollegeResults([]);
    setSelectedCollege(null);
    setFormType('regular');
    setFormPriority('medium');
    setFormNotes('');
  };

  /* ── Status change ───────────────────────────────────────────────── */
  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await api.applications.update(id, { status: newStatus });
      setApplications(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
      toast.success('Status updated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  /* ── Delete ──────────────────────────────────────────────────────── */
  const handleDelete = async () => {
    if (confirmDeleteId == null) return;
    try {
      await api.applications.delete(confirmDeleteId);
      toast.success('Application deleted');
      setConfirmDeleteId(null);
      loadApplications();
    } catch {
      toast.error('Failed to delete application');
    }
  };

  /* ── Filtered list ────────────────────────────────────────────────── */
  const filtered = (() => {
    if (filterTab === 'all') return applications;
    if (filterTab === 'in_progress') return applications.filter(a => ['preparing', 'in_progress'].includes(a.status));
    if (filterTab === 'decision') return applications.filter(a => DECISION_STATUSES.includes(a.status));
    return applications.filter(a => a.status === filterTab);
  })();

  /* ── Stats ────────────────────────────────────────────────────────── */
  const total = applications.length;
  const submittedCount = applications.filter(a => ['submitted', 'interview', 'decision_pending'].includes(a.status)).length;
  const acceptedCount = applications.filter(a => a.status === 'accepted').length;
  const inProgressCount = applications.filter(a => ['preparing', 'in_progress', 'researching'].includes(a.status)).length;

  return (
    <>
      <style>{GLOBAL}</style>
      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="Delete Application"
        message="Are you sure you want to delete this application? This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <div style={{ minHeight: '100vh', background: S.bg, color: 'var(--color-text-primary)', fontFamily: S.font }}>

        {/* ── Header ──────────────────────────────────────────────── */}
        <div style={{ padding: '44px 48px 0', background: `linear-gradient(180deg,${h2r(ACCENT, 0.07)} 0%,transparent 100%)`, borderBottom: `1px solid ${S.border}` }}>
          <div style={{ maxWidth: 1080, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 28, flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: h2r(ACCENT, 0.8), textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10, fontWeight: 600 }}>Application Tracker</div>
                <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 6 }}>
                  Applica<span style={{ color: ACCENT }}>tions.</span>
                </h1>
                <p style={{ color: S.muted, fontSize: 14 }}>
                  {total} total · {submittedCount} submitted · {acceptedCount} accepted · {inProgressCount} in progress
                </p>
              </div>
              <button onClick={() => setShowAddModal(true)} style={{
                padding: '10px 22px', background: ACCENT, border: 'none', borderRadius: 10,
                color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: S.font,
                boxShadow: `0 0 16px ${h2r(ACCENT, 0.35)}`,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Plus size={16} /> Add Application
              </button>
            </div>

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 8, paddingBottom: 24, flexWrap: 'wrap' }}>
              {FILTER_TABS.map(tab => {
                const active = filterTab === tab.key;
                const count = tab.key === 'all' ? total
                  : tab.key === 'in_progress' ? applications.filter(a => ['preparing', 'in_progress'].includes(a.status)).length
                  : tab.key === 'decision' ? applications.filter(a => DECISION_STATUSES.includes(a.status)).length
                  : applications.filter(a => a.status === tab.key).length;
                return (
                  <button key={tab.key} onClick={() => setFilterTab(tab.key)} style={{
                    padding: '7px 16px', borderRadius: 100, fontSize: 12, fontWeight: active ? 700 : 400,
                    background: active ? h2r(ACCENT, 0.18) : 'transparent',
                    border: `1px solid ${active ? h2r(ACCENT, 0.5) : S.border}`,
                    color: active ? ACCENT : S.dim, cursor: 'pointer', fontFamily: S.font,
                  }}>{tab.label} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}</button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 48px 80px' }}>

          {/* ── Summary stats ──────────────────────────────────────── */}
          {!loading && total > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 28 }}>
              <StatCard emoji="📋" value={total} label="Total" accent={ACCENT} />
              <StatCard emoji="📤" value={submittedCount} label="Submitted" accent="#F59E0B" />
              <StatCard emoji="✅" value={acceptedCount} label="Accepted" accent="#10B981" />
              <StatCard emoji="📝" value={inProgressCount} label="In Progress" accent="#3B9EFF" />
            </div>
          )}

          {/* ── Loading state ──────────────────────────────────────── */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 0', gap: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.08)', borderTopColor: ACCENT, animation: 'spin 0.8s linear infinite' }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: S.muted, fontFamily: S.font }}>Loading your applications…</div>
            </div>
          )}

          {/* ── Empty state ────────────────────────────────────────── */}
          {!loading && total === 0 && (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No applications yet</div>
              <div style={{ color: S.muted, fontSize: 14, marginBottom: 24 }}>Add your first college application to start tracking</div>
              <button onClick={() => setShowAddModal(true)} style={{
                padding: '12px 28px', background: ACCENT, border: 'none', borderRadius: 10,
                color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: S.font,
                boxShadow: `0 0 20px ${h2r(ACCENT, 0.3)}`,
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}><Plus size={16} /> Add Your First Application</button>
            </div>
          )}

          {/* ── No filter results ──────────────────────────────────── */}
          {!loading && total > 0 && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: S.muted }}>No applications in this category</div>
            </div>
          )}

          {/* ── Application cards ──────────────────────────────────── */}
          {!loading && filtered.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {filtered.map((app, i) => (
                <AppCard
                  key={app.id}
                  app={app}
                  index={i}
                  onView={(id) => navigate(`/colleges/${id}`)}
                  onStatusChange={handleStatusChange}
                  onDelete={(id) => setConfirmDeleteId(id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Add Application Modal ────────────────────────────────── */}
        {showAddModal && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, animation: 'fadeUp 0.2s ease',
          }} onClick={(e) => { if (e.target === e.currentTarget) resetModal(); }}>
            <div style={{
              background: S.surface, border: `1px solid ${S.border2}`,
              borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '90vh',
              overflow: 'auto', padding: 28,
            }} onClick={e => e.stopPropagation()}>
              {/* Modal header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: S.font }}>Add Application</div>
                  <div style={{ fontSize: 12, color: S.muted, fontFamily: S.font, marginTop: 4 }}>Search for a college and add it to your tracker</div>
                </div>
                <button onClick={resetModal} style={{
                  width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.06)', border: `1px solid ${S.border}`,
                  color: S.dim, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><X size={16} /></button>
              </div>

              {/* College search */}
              <div style={{ marginBottom: 18 }}>
                <span style={lbl}>College *</span>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: S.dim }}>
                    {searching ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Search size={14} />}
                  </div>
                  <input
                    value={collegeSearch}
                    onChange={e => handleSearchInput(e.target.value)}
                    placeholder="Search for a college..."
                    style={{ ...inp, paddingLeft: 34 }}
                  />
                  {selectedCollege && (
                    <button onClick={() => { setSelectedCollege(null); setCollegeSearch(''); }} style={{
                      position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', color: S.dim,
                    }}><X size={14} /></button>
                  )}
                </div>
                {/* Search results dropdown */}
                {collegeResults.length > 0 && !selectedCollege && (
                  <div style={{
                    marginTop: 4, background: S.surface, border: `1px solid ${S.border2}`,
                    borderRadius: 10, overflow: 'hidden', maxHeight: 200, overflowY: 'auto',
                  }}>
                    {collegeResults.map(c => (
                      <button key={c.id} onClick={() => selectCollege(c)} style={{
                        width: '100%', padding: '10px 14px', textAlign: 'left', cursor: 'pointer',
                        background: 'transparent', border: 'none', borderBottom: `1px solid ${S.border}`,
                        fontFamily: S.font, fontSize: 13, color: 'var(--color-text-primary)',
                        display: 'flex', flexDirection: 'column', gap: 2,
                      }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                        {c.country && <span style={{ fontSize: 11, color: S.dim }}>{c.country}{c.location ? ` · ${c.location}` : ''}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {selectedCollege && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#10B981', fontWeight: 600, fontFamily: S.font }}>
                    ✓ Selected: {selectedCollege.name}
                  </div>
                )}
              </div>

              {/* Type + Priority row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
                <div>
                  <span style={lbl}>Application Type</span>
                  <select value={formType} onChange={e => setFormType(e.target.value)} style={inp}>
                    {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <span style={lbl}>Priority</span>
                  <select value={formPriority} onChange={e => setFormPriority(e.target.value)} style={inp}>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 24 }}>
                <span style={lbl}>Notes (optional)</span>
                <textarea
                  rows={3}
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder="Any notes about this application…"
                  style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }}
                />
              </div>

              {/* Submit buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={handleAddSubmit} disabled={submitting || !selectedCollege} style={{
                  flex: 1, padding: '10px 22px', background: !selectedCollege ? S.dim : ACCENT,
                  border: 'none', borderRadius: 10,
                  color: '#000', fontWeight: 700, fontSize: 13, cursor: !selectedCollege ? 'not-allowed' : 'pointer',
                  fontFamily: S.font, opacity: submitting ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  {submitting ? (
                    <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Adding…</>
                  ) : (
                    <><Plus size={14} /> Add Application</>
                  )}
                </button>
                <button onClick={resetModal} style={{
                  padding: '10px 20px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${S.border2}`,
                  borderRadius: 10, color: S.muted, fontSize: 13, cursor: 'pointer', fontFamily: S.font,
                }}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Applications;
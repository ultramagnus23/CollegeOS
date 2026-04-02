// src/pages/Deadlines.tsx — Dark Editorial Redesign
import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Plus, CheckCircle, Circle, Calendar, List, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { DeadlineCalendar } from '@/components/DeadlineCalendar';
import ConfirmModal from '@/components/common/ConfirmModal';

/* ─── Types ──────────────────────────────────────────────────────────── */
interface Application {
  id: number;
  college_name: string;
  status: string;
}

interface Deadline {
  id: number;
  application_id: number;
  college_name: string;
  deadline_type: string;
  deadline_date: string;
  description?: string;
  is_completed: number;
}

interface DeadlineFormData {
  applicationId: string;
  deadlineType: string;
  deadlineDate: string;
  description: string;
}

/* ─── Design ─────────────────────────────────────────────────────────── */
const ACCENT = '#6C63FF';
const S = {
  bg: 'var(--color-bg-primary)',
  surface: 'var(--color-bg-surface)',
  surface2: 'var(--color-surface-subtle)',
  border: 'var(--color-border)',
  border2: 'var(--color-border-strong)',
  muted: 'var(--color-text-secondary)',
  dim: 'var(--color-text-disabled)',
  font: "'DM Sans',sans-serif",
};
const inp: React.CSSProperties = {
  width: '100%', padding: '10px 14px', background: S.surface2,
  border: `1px solid ${S.border2}`, borderRadius: 10,
  color: 'var(--color-text-primary)', fontSize: 14, fontFamily: S.font,
};
const lbl: React.CSSProperties = {
  fontSize: 11, color: S.dim, textTransform: 'uppercase', letterSpacing: '0.08em',
  marginBottom: 6, fontWeight: 600, display: 'block', fontFamily: S.font,
};

const GLOBAL = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(0.7);}
  input::placeholder,textarea::placeholder{color:var(--color-text-disabled)!important;}
  select option,option{background:var(--color-bg-surface);color:var(--color-text-primary);}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}
`;

/* ─── Urgency helpers ─────────────────────────────────────────────────── */
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
  if (days <= 7) return { color: '#FB923C', background: 'rgba(251,146,60,0.1)',  border: '1px solid rgba(251,146,60,0.25)',  padding: '2px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700 };
  if (days <= 30)return { color: '#FBBF24', background: 'rgba(251,191,36,0.1)',  border: '1px solid rgba(251,191,36,0.25)',  padding: '2px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700 };
  return           { color: '#10B981', background: 'rgba(16,185,129,0.1)',  border: '1px solid rgba(16,185,129,0.25)',  padding: '2px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700 };
};

/* ─── Component ──────────────────────────────────────────────────────── */
const Deadlines: React.FC = () => {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [formData, setFormData] = useState<DeadlineFormData>({
    applicationId: '',
    deadlineType: 'application',
    deadlineDate: '',
    description: '',
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [deadlinesRes, appsRes] = await Promise.all([
        api.getDeadlines(365),
        api.getApplications(),
      ]);
      setDeadlines(deadlinesRes.data || []);
      setApplications(appsRes.data || []);
    } catch {
      toast.error('Failed to load deadlines');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!formData.applicationId || !formData.deadlineDate) {
      toast.error('Please fill required fields');
      return;
    }
    try {
      await api.createDeadline({ ...formData, applicationId: Number(formData.applicationId) });
      toast.success('Deadline added');
      setShowAddForm(false);
      setFormData({ applicationId: '', deadlineType: 'application', deadlineDate: '', description: '' });
      loadData();
    } catch {
      toast.error('Failed to add deadline');
    }
  };

  const handleToggleComplete = async (id: number, isCompleted: number) => {
    try {
      await api.updateDeadline(id, { isCompleted: isCompleted === 1 ? 0 : 1 });
      loadData();
    } catch {
      toast.error('Failed to update deadline');
    }
  };

  const doDelete = async (id: number) => {
    try {
      await api.deleteDeadline(id);
      toast.success('Deadline deleted');
      loadData();
    } catch {
      toast.error('Failed to delete deadline');
    }
  };

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
      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="Delete Deadline"
        message="Delete this deadline?"
        confirmLabel="Delete"
        onConfirm={() => { const id = confirmDeleteId!; setConfirmDeleteId(null); doDelete(id); }}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {/* Header */}
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font, marginBottom: 6 }}>Deadlines</h1>
            <p style={{ fontSize: 14, color: S.muted, fontFamily: S.font }}>Stay on top of your application timeline</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {/* View toggle */}
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
            <button
              onClick={() => setShowAddForm(f => !f)}
              style={{
                padding: '9px 18px', background: ACCENT, border: 'none', borderRadius: 10,
                color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: S.font,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Plus size={16} /> Add Deadline
            </button>
          </div>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div style={{
            background: S.surface, border: `1px solid ${S.border}`, borderTop: `3px solid ${ACCENT}`,
            borderRadius: 16, padding: '24px', marginBottom: 24, animation: 'fadeUp 0.25s ease both',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font, marginBottom: 20 }}>Add New Deadline</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <div>
                <label style={lbl}>Application *</label>
                <select value={formData.applicationId} onChange={e => setFormData({ ...formData, applicationId: e.target.value })} style={inp}>
                  <option value="">Select application</option>
                  {applications.map(app => (
                    <option key={app.id} value={app.id}>{app.college_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Type</label>
                <select value={formData.deadlineType} onChange={e => setFormData({ ...formData, deadlineType: e.target.value })} style={inp}>
                  <option value="application">Application</option>
                  <option value="essay">Essay</option>
                  <option value="recommendation">Recommendation</option>
                  <option value="transcript">Transcript</option>
                  <option value="test_scores">Test Scores</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Date *</label>
                <input type="date" value={formData.deadlineDate} onChange={e => setFormData({ ...formData, deadlineDate: e.target.value })} style={inp} />
              </div>
              <div>
                <label style={lbl}>Description</label>
                <input placeholder="Optional notes" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} style={inp} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={handleAdd} style={{ padding: '9px 20px', background: ACCENT, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: S.font }}>
                Add Deadline
              </button>
              <button onClick={() => setShowAddForm(false)} style={{ padding: '9px 20px', background: S.surface2, border: `1px solid ${S.border2}`, borderRadius: 10, color: S.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: S.font }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Deadlines Display */}
        {deadlines.length === 0 ? (
          <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 20, padding: '64px 24px', textAlign: 'center', animation: 'fadeUp 0.3s ease both' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font, marginBottom: 8 }}>No deadlines yet</h3>
            <p style={{ fontSize: 14, color: S.muted, fontFamily: S.font }}>Add a deadline to start tracking your application timeline.</p>
          </div>
        ) : viewMode === 'calendar' ? (
          <DeadlineCalendar deadlines={deadlines} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {deadlines.map((deadline, index) => (
              <div key={deadline.id} style={{
                background: deadline.is_completed === 1 ? 'rgba(16,185,129,0.04)' : S.surface,
                border: `1px solid ${deadline.is_completed === 1 ? 'rgba(16,185,129,0.25)' : S.border}`,
                borderLeft: `3px solid ${deadline.is_completed === 1 ? '#10B981' : ACCENT}`,
                borderRadius: 16, padding: '18px 22px',
                animation: 'fadeUp 0.3s ease both', animationDelay: `${index * 0.05}s`,
                transition: 'border-color 0.2s',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flex: 1 }}>
                    {/* Complete toggle */}
                    <button
                      onClick={() => handleToggleComplete(deadline.id, deadline.is_completed)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2, flexShrink: 0 }}
                    >
                      {deadline.is_completed === 1
                        ? <CheckCircle size={22} color="#10B981" />
                        : <Circle size={22} color={S.muted} />
                      }
                    </button>

                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                        <h3 style={{
                          fontSize: 16, fontWeight: 800, fontFamily: S.font,
                          color: deadline.is_completed === 1 ? S.muted : 'var(--color-text-primary)',
                          textDecoration: deadline.is_completed === 1 ? 'line-through' : 'none',
                        }}>
                          {deadline.college_name}
                        </h3>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 100,
                          background: 'rgba(108,99,255,0.15)', color: ACCENT, fontWeight: 600, fontFamily: S.font,
                        }}>
                          {deadline.deadline_type.replace(/_/g, ' ')}
                        </span>
                      </div>

                      {deadline.description && (
                        <p style={{ fontSize: 13, color: S.muted, fontFamily: S.font, marginBottom: 8 }}>{deadline.description}</p>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, color: S.dim, fontFamily: S.font, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Calendar size={13} /> {new Date(deadline.deadline_date + 'T00:00:00').toLocaleDateString()}
                        </span>
                        {deadline.is_completed !== 1 && (
                          <span style={getUrgencyStyle(deadline.deadline_date)}>
                            {getDaysUntil(deadline.deadline_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => setConfirmDeleteId(deadline.id)}
                    style={{
                      width: 32, height: 32, borderRadius: 8, cursor: 'pointer', flexShrink: 0,
                      background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)',
                      color: '#F87171', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.1)')}
                  >🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Deadlines;

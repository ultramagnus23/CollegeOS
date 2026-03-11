// src/pages/Activities.tsx — Dark Editorial Redesign
import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { toast } from 'sonner';
import ConfirmModal from '@/components/common/ConfirmModal';

/* ─── Types ──────────────────────────────────────────────────────────── */
interface Activity {
  id?: number;
  activity_name: string;
  activity_type: string;
  position_title: string;
  organization_name: string;
  description: string;
  grade_9: boolean;
  grade_10: boolean;
  grade_11: boolean;
  grade_12: boolean;
  hours_per_week: number;
  weeks_per_year: number;
  total_hours?: number;
  awards_recognition: string;
  tier_rating: number;
  display_order?: number;
}

interface ActivityForm {
  activity_name: string;
  activity_type: string;
  position_title: string;
  organization_name: string;
  description: string;
  grade_9: boolean;
  grade_10: boolean;
  grade_11: boolean;
  grade_12: boolean;
  hours_per_week: string;
  weeks_per_year: string;
  awards_recognition: string;
  tier_rating: string;
}

/* ─── Design ─────────────────────────────────────────────────────────── */
import { h2r, S, GLOBAL, ACCENT_COLORS, inp, lbl } from '../styles/designTokens';
const ACCENT = ACCENT_COLORS.activities;

const ACTIVITY_TYPES = [
  'Academic', 'Art', 'Athletics: Club', 'Athletics: JV/Varsity',
  'Career-Oriented', 'Community Service (Volunteer)', 'Computer/Technology',
  'Cultural', 'Dance', 'Debate/Speech', 'Environmental',
  'Family Responsibilities', 'Foreign Exchange', 'Internship',
  'Journalism/Publication', 'Junior ROTC', 'Music: Instrumental',
  'Music: Vocal', 'Religious', 'Research', 'Robotics', 'School Spirit',
  'Science/Math', 'Social Justice', 'Student Government', 'Theater/Drama',
  'Work (Paid)', 'Other',
];

const TIER_CFG: Record<number, { label: string; color: string; bg: string; emoji: string }> = {
  1: { label: 'National / International', color: '#FBBF24', bg: h2r('#FBBF24', 0.12), emoji: '🏆' },
  2: { label: 'State / Regional',         color: '#94A3B8', bg: h2r('#94A3B8', 0.12), emoji: '🥈' },
  3: { label: 'School Leadership',        color: '#F59E0B', bg: h2r('#F59E0B', 0.12), emoji: '⭐' },
  4: { label: 'Participation',            color: S.dim,     bg: 'rgba(255,255,255,0.06)', emoji: '📋' },
};

const EMPTY_FORM: ActivityForm = {
  activity_name: '', activity_type: '', position_title: '', organization_name: '',
  description: '', grade_9: false, grade_10: false, grade_11: false, grade_12: false,
  hours_per_week: '', weeks_per_year: '', awards_recognition: '', tier_rating: '4',
};

/* ─── Helpers ────────────────────────────────────────────────────────── */
const gradesLabel = (a: Activity) => {
  const g: string[] = [];
  if (a.grade_9)  g.push('9');
  if (a.grade_10) g.push('10');
  if (a.grade_11) g.push('11');
  if (a.grade_12) g.push('12');
  return g.length ? g.join(', ') : '—';
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

/* ─── Activity Card ──────────────────────────────────────────────────── */
const ActivityCard: React.FC<{
  activity: Activity; index: number;
  onEdit: (a: Activity) => void;
  onDelete: (id: number) => void;
}> = ({ activity, index, onEdit, onDelete }) => {
  const tier = TIER_CFG[activity.tier_rating] || TIER_CFG[4];

  return (
    <div style={{
      background: S.surface, border: `1px solid ${S.border}`,
      borderLeft: `3px solid ${tier.color}`,
      borderRadius: 16, overflow: 'hidden',
      animation: 'fadeUp 0.35s ease both', animationDelay: `${index * 0.06}s`,
    }}>
      <div style={{ padding: '20px 22px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font }}>{activity.activity_name}</h3>
              <span style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 100,
                background: tier.bg, border: `1px solid ${h2r(tier.color, 0.4)}`,
                color: tier.color, fontWeight: 600, fontFamily: S.font, whiteSpace: 'nowrap',
              }}>{tier.emoji} Tier {activity.tier_rating}</span>
              {activity.activity_type && (
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: h2r(ACCENT, 0.15), color: ACCENT, fontWeight: 600, fontFamily: S.font }}>
                  {activity.activity_type}
                </span>
              )}
            </div>
            {activity.position_title && (
              <div style={{ fontSize: 13, color: S.muted, fontFamily: S.font }}>{activity.position_title}</div>
            )}
            {activity.organization_name && (
              <div style={{ fontSize: 12, color: S.dim, fontFamily: S.font }}>🏛 {activity.organization_name}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
            <button onClick={() => onEdit(activity)} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)', border: `1px solid ${S.border2}`, color: S.muted, fontFamily: S.font,
            }}>✏️ Edit</button>
            <button onClick={() => activity.id && onDelete(activity.id)} style={{
              width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
              background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)',
              color: '#F87171', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.1)')}
            >🗑</button>
          </div>
        </div>

        {/* Description */}
        {activity.description && (
          <div style={{
            padding: '12px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10,
            marginBottom: 12, borderLeft: `2px solid ${h2r(ACCENT, 0.4)}`,
          }}>
            <p style={{ fontSize: 13, color: S.muted, lineHeight: 1.6, fontFamily: S.font }}>{activity.description}</p>
            <div style={{ fontSize: 11, color: S.dim, marginTop: 4, fontFamily: S.font }}>{activity.description.length}/150 characters</div>
          </div>
        )}

        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 16, fontSize: 12, color: S.dim, fontFamily: S.font }}>
          <span>📅 Grades {gradesLabel(activity)}</span>
          <span>⏱ {activity.hours_per_week} hrs/wk · {activity.weeks_per_year} wks/yr</span>
          {(activity.total_hours != null && activity.total_hours > 0) && (
            <span style={{ fontWeight: 700, color: S.muted }}>= {activity.total_hours} total hrs</span>
          )}
        </div>

        {/* Awards */}
        {activity.awards_recognition && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 10, fontSize: 12, color: 'rgba(251,191,36,0.9)', fontFamily: S.font }}>
            🏅 {activity.awards_recognition}
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Main ────────────────────────────────────────────────────────────── */
const Activities = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [summary, setSummary] = useState<{ tier1?: { count: number }; tier2?: { count: number }; tier3?: { count: number }; tier4?: { count: number }; totalHours?: number }>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ActivityForm>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [filterTier, setFilterTier] = useState<number | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const response = await api.getActivities();
      if (response.success) {
        setActivities(response.data || []);
        setSummary(response.summary || {});
      }
    } catch {
      toast.error('Failed to load activities');
    } finally {
      setLoading(false);
    }
  };

  /* ── Form helpers ─────────────────────────────────────────────────── */
  const openAdd = () => {
    if (activities.length >= 10) { toast.error('Maximum 10 activities allowed (Common App limit)'); return; }
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  };

  const openEdit = (a: Activity) => {
    setEditingId(a.id ?? null);
    setForm({
      activity_name: a.activity_name,
      activity_type: a.activity_type,
      position_title: a.position_title,
      organization_name: a.organization_name,
      description: a.description,
      grade_9: a.grade_9,
      grade_10: a.grade_10,
      grade_11: a.grade_11,
      grade_12: a.grade_12,
      hours_per_week: String(a.hours_per_week || ''),
      weeks_per_year: String(a.weeks_per_year || ''),
      awards_recognition: a.awards_recognition,
      tier_rating: String(a.tier_rating),
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.activity_name.trim()) { toast.error('Activity name is required'); return; }
    const payload = {
      activity_name: form.activity_name,
      activity_type: form.activity_type,
      position_title: form.position_title,
      organization_name: form.organization_name,
      description: form.description,
      grade_9: form.grade_9,
      grade_10: form.grade_10,
      grade_11: form.grade_11,
      grade_12: form.grade_12,
      hours_per_week: parseFloat(form.hours_per_week) || 0,
      weeks_per_year: parseInt(form.weeks_per_year) || 0,
      awards_recognition: form.awards_recognition,
      tier_rating: parseInt(form.tier_rating) || 4,
    };
    try {
      setSaving(true);
      if (editingId) {
        await api.updateActivity(editingId, payload);
        toast.success('Activity updated');
      } else {
        await api.addActivity(payload);
        toast.success('Activity added');
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
      loadData();
    } catch {
      toast.error('Failed to save activity');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirmDeleteId == null) return;
    try {
      await api.deleteActivity(confirmDeleteId);
      toast.success('Activity deleted');
      setConfirmDeleteId(null);
      loadData();
    } catch {
      toast.error('Failed to delete activity');
    }
  };

  /* ── Filtered list ────────────────────────────────────────────────── */
  const filtered = filterTier ? activities.filter(a => a.tier_rating === filterTier) : activities;

  /* ── Checkbox toggle helper ───────────────────────────────────────── */
  const gradeCheckbox = (grade: 9 | 10 | 11 | 12) => {
    const key = `grade_${grade}` as keyof ActivityForm;
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: S.muted, fontFamily: S.font }}>
        <input
          type="checkbox"
          checked={!!form[key]}
          onChange={e => setForm({ ...form, [key]: e.target.checked })}
          style={{ accentColor: ACCENT, width: 16, height: 16 }}
        />
        Grade {grade}
      </label>
    );
  };

  return (
    <>
      <style>{GLOBAL}</style>
      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="Delete Activity"
        message="Are you sure you want to delete this activity? This action cannot be undone."
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
                <div style={{ fontSize: 12, color: h2r(ACCENT, 0.8), textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10, fontWeight: 600 }}>Common App Tracker</div>
                <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 6 }}>
                  Activi<span style={{ color: ACCENT }}>ties.</span>
                </h1>
                <p style={{ color: S.muted, fontSize: 14 }}>
                  {activities.length}/10 activities · {summary.tier1?.count || 0} national · {summary.totalHours || 0} total hours
                </p>
              </div>
              <button onClick={openAdd} disabled={activities.length >= 10} style={{
                padding: '10px 22px', background: activities.length >= 10 ? S.dim : ACCENT, border: 'none', borderRadius: 10,
                color: '#000', fontSize: 13, fontWeight: 700, cursor: activities.length >= 10 ? 'not-allowed' : 'pointer', fontFamily: S.font,
                boxShadow: activities.length < 10 ? `0 0 16px ${h2r(ACCENT, 0.35)}` : 'none',
                opacity: activities.length >= 10 ? 0.5 : 1,
              }}>+ Add Activity</button>
            </div>

            {/* Tier filter pills */}
            <div style={{ display: 'flex', gap: 8, paddingBottom: 24, flexWrap: 'wrap' }}>
              <button onClick={() => setFilterTier(null)} style={{
                padding: '7px 16px', borderRadius: 100, fontSize: 12, fontWeight: !filterTier ? 700 : 400,
                background: !filterTier ? h2r(ACCENT, 0.18) : 'transparent',
                border: `1px solid ${!filterTier ? h2r(ACCENT, 0.5) : S.border}`,
                color: !filterTier ? ACCENT : S.dim, cursor: 'pointer', fontFamily: S.font,
              }}>All ({activities.length})</button>
              {([1, 2, 3, 4] as const).map(t => {
                const cfg = TIER_CFG[t];
                const count = activities.filter(a => a.tier_rating === t).length;
                const active = filterTier === t;
                return (
                  <button key={t} onClick={() => setFilterTier(active ? null : t)} style={{
                    padding: '7px 14px', borderRadius: 100, fontSize: 12, fontWeight: active ? 700 : 400,
                    background: active ? cfg.bg : 'transparent',
                    border: `1px solid ${active ? h2r(cfg.color, 0.5) : S.border}`,
                    color: active ? cfg.color : S.dim, cursor: 'pointer', fontFamily: S.font,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <span>{cfg.emoji}</span> Tier {t} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 48px 80px' }}>

          {/* ── Summary stats ──────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 28 }}>
            <StatCard emoji="📋" value={`${activities.length}/10`} label="Activities" accent={ACCENT} />
            <StatCard emoji="🏆" value={summary.tier1?.count || 0} label="Tier 1 (National)" accent="#FBBF24" />
            <StatCard emoji="🥈" value={summary.tier2?.count || 0} label="Tier 2 (State)" accent="#94A3B8" />
            <StatCard emoji="⏱" value={summary.totalHours || 0} label="Total Hours" accent="#3B9EFF" />
          </div>

          {/* ── Add / Edit form ────────────────────────────────────── */}
          {showForm && (
            <div style={{ background: S.surface, border: `1px solid ${h2r(ACCENT, 0.3)}`, borderRadius: 16, padding: 24, marginBottom: 24, animation: 'fadeUp 0.25s ease' }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 18, fontFamily: S.font }}>
                {editingId ? 'Edit Activity' : 'Add Activity'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <span style={lbl}>Activity Name *</span>
                  <input value={form.activity_name} onChange={e => setForm({ ...form, activity_name: e.target.value })} placeholder="e.g., Model United Nations" style={inp} />
                </div>
                <div>
                  <span style={lbl}>Activity Type</span>
                  <select value={form.activity_type} onChange={e => setForm({ ...form, activity_type: e.target.value })} style={inp}>
                    <option value="">Select type</option>
                    {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <span style={lbl}>Position / Role</span>
                  <input value={form.position_title} onChange={e => setForm({ ...form, position_title: e.target.value })} placeholder="e.g., President, Captain" style={inp} />
                </div>
                <div>
                  <span style={lbl}>Organization</span>
                  <input value={form.organization_name} onChange={e => setForm({ ...form, organization_name: e.target.value })} placeholder="e.g., School MUN Club" style={inp} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <span style={lbl}>Description (max 150 chars)</span>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value.slice(0, 150) })}
                    placeholder="Describe your role and accomplishments…"
                    style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }}
                  />
                  <div style={{ fontSize: 11, color: S.dim, marginTop: 4, fontFamily: S.font }}>{form.description.length}/150</div>
                </div>

                {/* Grades */}
                <div style={{ gridColumn: '1/-1' }}>
                  <span style={lbl}>Grade Levels</span>
                  <div style={{ display: 'flex', gap: 20, marginTop: 4 }}>
                    {gradeCheckbox(9)}{gradeCheckbox(10)}{gradeCheckbox(11)}{gradeCheckbox(12)}
                  </div>
                </div>

                <div>
                  <span style={lbl}>Hours / Week</span>
                  <input type="number" min="0" max="40" value={form.hours_per_week} onChange={e => setForm({ ...form, hours_per_week: e.target.value })} placeholder="0" style={inp} />
                </div>
                <div>
                  <span style={lbl}>Weeks / Year</span>
                  <input type="number" min="0" max="52" value={form.weeks_per_year} onChange={e => setForm({ ...form, weeks_per_year: e.target.value })} placeholder="0" style={inp} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <span style={lbl}>Awards / Recognition</span>
                  <textarea
                    rows={2}
                    value={form.awards_recognition}
                    onChange={e => setForm({ ...form, awards_recognition: e.target.value })}
                    placeholder="List any awards, honors, or recognition…"
                    style={{ ...inp, resize: 'none', lineHeight: 1.6 }}
                  />
                </div>
                <div>
                  <span style={lbl}>Tier Rating</span>
                  <select value={form.tier_rating} onChange={e => setForm({ ...form, tier_rating: e.target.value })} style={inp}>
                    {([1, 2, 3, 4] as const).map(t => (
                      <option key={t} value={t}>Tier {t} — {TIER_CFG[t].label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button onClick={handleSave} disabled={saving} style={{
                  padding: '10px 24px', background: ACCENT, border: 'none', borderRadius: 10,
                  color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: S.font,
                  opacity: saving ? 0.6 : 1,
                }}>{saving ? 'Saving…' : (editingId ? 'Update Activity' : 'Add Activity')}</button>
                <button onClick={() => { setShowForm(false); setEditingId(null); }} style={{
                  padding: '10px 20px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${S.border2}`,
                  borderRadius: 10, color: S.muted, fontSize: 13, cursor: 'pointer', fontFamily: S.font,
                }}>Cancel</button>
              </div>
            </div>
          )}

          {/* ── Loading ────────────────────────────────────────────── */}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.08)', borderTopColor: ACCENT, animation: 'spin 0.8s linear infinite' }} />
            </div>
          )}

          {/* ── Empty state ────────────────────────────────────────── */}
          {!loading && activities.length === 0 && (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No activities yet</div>
              <div style={{ color: S.muted, fontSize: 14, marginBottom: 20 }}>Add your extracurricular activities to strengthen your college applications</div>
              <button onClick={openAdd} style={{
                padding: '10px 22px', background: ACCENT, border: 'none', borderRadius: 10,
                color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: S.font,
              }}>+ Add Your First Activity</button>
            </div>
          )}

          {/* ── No filter results ──────────────────────────────────── */}
          {!loading && activities.length > 0 && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: S.muted }}>No Tier {filterTier} activities found</div>
            </div>
          )}

          {/* ── Activity cards ─────────────────────────────────────── */}
          {!loading && filtered.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {filtered.map((activity, i) => (
                <ActivityCard
                  key={activity.id ?? i}
                  activity={activity}
                  index={i}
                  onEdit={openEdit}
                  onDelete={id => setConfirmDeleteId(id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Activities;

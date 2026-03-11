// src/pages/Timeline.tsx — Dark Editorial Redesign
import React, { useEffect, useState, useRef } from 'react';
import { api } from '@/services/api';
import { toast } from 'sonner';
import { Loader2, ChevronDown, ChevronRight, CheckCircle, Circle, Calendar, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ─── Design ─────────────────────────────────────────────────────────── */
import { h2r, S, GLOBAL } from '../styles/designTokens';

const MONTH_ACCENTS = ['#6C63FF', '#3B9EFF', '#A855F7', '#F97316', '#10B981', '#F59E0B', '#F87171', '#06B6D4'];

/* ─── Types ──────────────────────────────────────────────────────────── */
interface DeadlineItem {
  id: number;
  college_name: string;
  deadline_type: string;
  deadline_date: string;
  is_completed: number;
}

interface TaskItem {
  id: number;
  title: string;
  category: string;
  due_date?: string;
  status: string;
}

interface MonthlyData {
  month: string;        // "2026-03"
  month_label: string;  // "March 2026"
  deadlines: DeadlineItem[];
  tasks: TaskItem[];
}

/* ─── Helpers ────────────────────────────────────────────────────────── */
const isOverdue = (dateStr: string, isComplete: boolean): boolean => {
  if (isComplete) return false;
  try {
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  } catch { return false; }
};

const fmtDate = (d?: string) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return d; }
};

const fmtDeadlineType = (t: string) => {
  const map: Record<string, string> = {
    early_decision: 'Early Decision', early_action: 'Early Action',
    regular: 'Regular', rolling: 'Rolling', priority: 'Priority', scholarship: 'Scholarship',
  };
  return map[t] || t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const getCurrentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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

/* ─── Month Block ────────────────────────────────────────────────────── */
const MonthBlock: React.FC<{
  data: MonthlyData;
  accent: string;
  isCurrentMonth: boolean;
  expanded: boolean;
  onToggle: () => void;
  onDeadlineCheck: (id: number, complete: boolean) => void;
  onTaskCheck: (id: number, complete: boolean) => void;
  index: number;
}> = ({ data, accent, isCurrentMonth, expanded, onToggle, onDeadlineCheck, onTaskCheck, index }) => {
  const totalItems = data.deadlines.length + data.tasks.length;
  const completedItems = data.deadlines.filter(d => d.is_completed === 1).length +
    data.tasks.filter(t => t.status === 'completed').length;
  const overdueCount = data.deadlines.filter(d => isOverdue(d.deadline_date, d.is_completed === 1)).length +
    data.tasks.filter(t => t.due_date && isOverdue(t.due_date, t.status === 'completed')).length;

  return (
    <div style={{
      animation: 'fadeUp 0.35s ease both', animationDelay: `${index * 0.06}s`,
    }}>
      {/* Month header */}
      <button onClick={onToggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
        background: isCurrentMonth ? h2r(accent, 0.08) : S.surface,
        border: `1px solid ${isCurrentMonth ? h2r(accent, 0.35) : S.border}`,
        borderLeft: `4px solid ${accent}`,
        borderRadius: 14, cursor: 'pointer', fontFamily: S.font,
        boxShadow: isCurrentMonth ? `0 0 24px ${h2r(accent, 0.12)}` : 'none',
      }}>
        <div style={{ color: accent, flexShrink: 0 }}>
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)' }}>
            {data.month_label}
            {isCurrentMonth && (
              <span style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 100, marginLeft: 10,
                background: h2r(accent, 0.2), color: accent, fontWeight: 700,
                verticalAlign: 'middle',
              }}>NOW</span>
            )}
          </div>
          {!expanded && totalItems > 0 && (
            <div style={{ fontSize: 12, color: S.muted, marginTop: 2 }}>
              {totalItems} item{totalItems !== 1 ? 's' : ''} · {completedItems} done
              {overdueCount > 0 && <span style={{ color: '#F87171', fontWeight: 600 }}> · {overdueCount} overdue</span>}
            </div>
          )}
        </div>
        {/* Count badge */}
        <div style={{
          fontSize: 11, padding: '3px 10px', borderRadius: 100, fontWeight: 700,
          background: totalItems > 0 ? h2r(accent, 0.15) : 'rgba(255,255,255,0.04)',
          color: totalItems > 0 ? accent : S.dim, fontFamily: S.font,
        }}>{totalItems}</div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{
          marginLeft: 20, borderLeft: `2px solid ${h2r(accent, 0.2)}`,
          paddingLeft: 20, paddingTop: 12, paddingBottom: 4,
        }}>
          {totalItems === 0 && (
            <div style={{ padding: '20px 0', textAlign: 'center', color: S.dim, fontSize: 14, fontFamily: S.font }}>
              All clear this month ✓
            </div>
          )}

          {/* Deadlines */}
          {data.deadlines.length > 0 && (
            <div style={{ marginBottom: data.tasks.length > 0 ? 16 : 0 }}>
              <div style={{ fontSize: 11, color: S.dim, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8, fontFamily: S.font }}>
                Deadlines
              </div>
              {data.deadlines.map(dl => {
                const done = dl.is_completed === 1;
                const overdue = isOverdue(dl.deadline_date, done);
                return (
                  <div key={`dl-${dl.id}`} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    background: overdue ? 'rgba(248,113,113,0.06)' : S.surface,
                    border: `1px solid ${overdue ? 'rgba(248,113,113,0.2)' : S.border}`,
                    borderLeft: overdue ? '3px solid #F87171' : `3px solid ${h2r(accent, 0.3)}`,
                    borderRadius: 10, marginBottom: 8,
                  }}>
                    <button onClick={() => onDeadlineCheck(dl.id, !done)} style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      color: done ? '#10B981' : overdue ? '#F87171' : S.dim, flexShrink: 0,
                    }}>
                      {done ? <CheckCircle size={18} /> : <Circle size={18} />}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 600, color: done ? S.dim : 'var(--color-text-primary)',
                        fontFamily: S.font, textDecoration: done ? 'line-through' : 'none',
                      }}>{dl.college_name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                        <span style={{ fontSize: 11, color: S.dim, fontFamily: S.font }}>{fmtDeadlineType(dl.deadline_type)}</span>
                        <span style={{ fontSize: 11, color: overdue ? '#F87171' : S.dim, fontWeight: overdue ? 700 : 400, fontFamily: S.font }}>
                          📅 {fmtDate(dl.deadline_date)}
                        </span>
                      </div>
                    </div>
                    {overdue && (
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 100,
                        background: 'rgba(248,113,113,0.12)', color: '#F87171',
                        fontWeight: 700, fontFamily: S.font, flexShrink: 0,
                      }}>OVERDUE</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Tasks */}
          {data.tasks.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: S.dim, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8, fontFamily: S.font }}>
                Tasks
              </div>
              {data.tasks.map(task => {
                const done = task.status === 'completed';
                const overdue = task.due_date ? isOverdue(task.due_date, done) : false;
                return (
                  <div key={`task-${task.id}`} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    background: overdue ? 'rgba(248,113,113,0.06)' : S.surface,
                    border: `1px solid ${overdue ? 'rgba(248,113,113,0.2)' : S.border}`,
                    borderLeft: overdue ? '3px solid #F87171' : `3px solid ${h2r(accent, 0.3)}`,
                    borderRadius: 10, marginBottom: 8,
                  }}>
                    <button onClick={() => onTaskCheck(task.id, !done)} style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      color: done ? '#10B981' : overdue ? '#F87171' : S.dim, flexShrink: 0,
                    }}>
                      {done ? <CheckCircle size={18} /> : <Circle size={18} />}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 600, color: done ? S.dim : 'var(--color-text-primary)',
                        fontFamily: S.font, textDecoration: done ? 'line-through' : 'none',
                      }}>{task.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                        <span style={{
                          fontSize: 10, padding: '1px 8px', borderRadius: 100,
                          background: h2r(accent, 0.1), color: accent, fontWeight: 600, fontFamily: S.font,
                        }}>{task.category}</span>
                        {task.due_date && (
                          <span style={{ fontSize: 11, color: overdue ? '#F87171' : S.dim, fontWeight: overdue ? 700 : 400, fontFamily: S.font }}>
                            📅 {fmtDate(task.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                    {overdue && (
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 100,
                        background: 'rgba(248,113,113,0.12)', color: '#F87171',
                        fontWeight: 700, fontFamily: S.font, flexShrink: 0,
                      }}>OVERDUE</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ─── Main ────────────────────────────────────────────────────────────── */
const Timeline = () => {
  const [months, setMonths] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const todayRef = useRef<HTMLDivElement | null>(null);

  const currentMonthKey = getCurrentMonthKey();

  useEffect(() => { loadTimeline(); }, []);

  const loadTimeline = async () => {
    try {
      setLoading(true);
      const response = await api.timeline.getMonthly();
      const data: MonthlyData[] = response.data || [];
      setMonths(data);

      // Auto-expand current month and next month
      const expanded = new Set<string>();
      expanded.add(currentMonthKey);
      const currentIdx = data.findIndex(m => m.month === currentMonthKey);
      if (currentIdx >= 0 && currentIdx + 1 < data.length) {
        expanded.add(data[currentIdx + 1].month);
      }
      setExpandedMonths(expanded);
    } catch {
      toast.error('Failed to load timeline');
    } finally {
      setLoading(false);
    }
  };

  const toggleMonth = (month: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  };

  const handleDeadlineCheck = async (id: number, complete: boolean) => {
    try {
      await api.deadlines.update(id, { is_completed: complete ? 1 : 0 });
      setMonths(prev => prev.map(m => ({
        ...m,
        deadlines: m.deadlines.map(d => d.id === id ? { ...d, is_completed: complete ? 1 : 0 } : d),
      })));
      toast.success(complete ? 'Deadline completed ✓' : 'Deadline unchecked');
    } catch {
      toast.error('Failed to update deadline');
    }
  };

  const handleTaskCheck = async (id: number, complete: boolean) => {
    try {
      await api.tasks.update(id, { status: complete ? 'completed' : 'pending' });
      setMonths(prev => prev.map(m => ({
        ...m,
        tasks: m.tasks.map(t => t.id === id ? { ...t, status: complete ? 'completed' : 'pending' } : t),
      })));
      toast.success(complete ? 'Task completed ✓' : 'Task re-opened');
    } catch {
      toast.error('Failed to update task');
    }
  };

  const jumpToToday = () => {
    if (!expandedMonths.has(currentMonthKey)) {
      setExpandedMonths(prev => new Set(prev).add(currentMonthKey));
    }
    setTimeout(() => {
      todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  /* ── Stats ────────────────────────────────────────────────────────── */
  const allDeadlines = months.flatMap(m => m.deadlines);
  const allTasks = months.flatMap(m => m.tasks);
  const totalItems = allDeadlines.length + allTasks.length;
  const completedItems = allDeadlines.filter(d => d.is_completed === 1).length +
    allTasks.filter(t => t.status === 'completed').length;
  const overdueItems = allDeadlines.filter(d => isOverdue(d.deadline_date, d.is_completed === 1)).length +
    allTasks.filter(t => t.due_date && isOverdue(t.due_date, t.status === 'completed')).length;

  const ACCENT = '#6C63FF';

  return (
    <>
      <style>{GLOBAL}</style>
      <div style={{ minHeight: '100vh', background: S.bg, color: 'var(--color-text-primary)', fontFamily: S.font }}>

        {/* ── Header ──────────────────────────────────────────────── */}
        <div style={{ padding: '44px 48px 0', background: `linear-gradient(180deg,${h2r(ACCENT, 0.07)} 0%,transparent 100%)`, borderBottom: `1px solid ${S.border}` }}>
          <div style={{ maxWidth: 1080, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 28, flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: h2r(ACCENT, 0.8), textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10, fontWeight: 600 }}>Monthly Overview</div>
                <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 6 }}>
                  Time<span style={{ color: ACCENT }}>line.</span>
                </h1>
                <p style={{ color: S.muted, fontSize: 14 }}>
                  {totalItems} items · {completedItems} completed · {overdueItems > 0 ? `${overdueItems} overdue` : 'all on track'}
                </p>
              </div>
              <button onClick={jumpToToday} style={{
                padding: '10px 22px', background: ACCENT, border: 'none', borderRadius: 10,
                color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: S.font,
                boxShadow: `0 0 16px ${h2r(ACCENT, 0.35)}`,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Calendar size={16} /> Jump to Today
              </button>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 48px 80px' }}>

          {/* ── Summary stats ──────────────────────────────────────── */}
          {!loading && totalItems > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 28 }}>
              <StatCard emoji="📋" value={totalItems} label="Total Items" accent={ACCENT} />
              <StatCard emoji="✅" value={completedItems} label="Completed" accent="#10B981" />
              <StatCard emoji="⏰" value={overdueItems} label="Overdue" accent="#F87171" />
              <StatCard emoji="📅" value={months.length} label="Months" accent="#3B9EFF" />
            </div>
          )}

          {/* ── Loading state ──────────────────────────────────────── */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 0', gap: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.08)', borderTopColor: ACCENT, animation: 'spin 0.8s linear infinite' }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: S.muted, fontFamily: S.font }}>Loading your timeline…</div>
            </div>
          )}

          {/* ── Empty state ────────────────────────────────────────── */}
          {!loading && months.length === 0 && (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No timeline data yet</div>
              <div style={{ color: S.muted, fontSize: 14, marginBottom: 24 }}>
                Add applications and deadlines to see your timeline here
              </div>
            </div>
          )}

          {/* ── Timeline ───────────────────────────────────────────── */}
          {!loading && months.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {months.map((month, i) => {
                const isCurrent = month.month === currentMonthKey;
                return (
                  <div key={month.month} ref={isCurrent ? todayRef : undefined}>
                    <MonthBlock
                      data={month}
                      accent={MONTH_ACCENTS[i % MONTH_ACCENTS.length]}
                      isCurrentMonth={isCurrent}
                      expanded={expandedMonths.has(month.month)}
                      onToggle={() => toggleMonth(month.month)}
                      onDeadlineCheck={handleDeadlineCheck}
                      onTaskCheck={handleTaskCheck}
                      index={i}
                    />
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

export { Timeline };
export default Timeline;

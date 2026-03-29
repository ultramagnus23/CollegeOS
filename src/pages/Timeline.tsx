import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { Loader2, CheckCircle2, Circle, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const ACCENT_COLORS = ['#6C63FF', '#3B9EFF', '#A855F7', '#F97316', '#10B981', '#F59E0B'];

interface TimelineTask {
  id: number;
  title: string;
  type: string;
  due_date: string;
  status: string;
  college_name: string;
}

interface TimelineDeadline {
  id: number;
  college_name: string;
  deadline_type: string;
  deadline_date: string;
  is_completed: number;
}

interface TimelineMonth {
  month: string;
  tasks: TimelineTask[];
  deadlines: TimelineDeadline[];
}

export function Timeline() {
  const [months, setMonths] = useState<TimelineMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const response = await api.timeline.getMonthly();
      setMonths(response.data || []);
    } catch {
      toast.error('Failed to load timeline');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleDeadline = async (id: number, isCompleted: number) => {
    const key = `deadline-${id}`;
    setToggling(key);
    try {
      await api.deadlines.update(id, { isCompleted: isCompleted === 1 ? 0 : 1 });
      await loadData();
    } catch {
      toast.error('Failed to update deadline');
    } finally {
      setToggling(null);
    }
  };

  const handleToggleTask = async (id: number, status: string) => {
    const key = `task-${id}`;
    setToggling(key);
    try {
      await api.tasks.update(id, { status: status === 'completed' ? 'pending' : 'completed' });
      await loadData();
    } catch {
      toast.error('Failed to update task');
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-primary" size={40} />
      </div>
    );
  }

  const hasItems = months.some(m => m.tasks.length > 0 || m.deadlines.length > 0);

  if (!hasItems) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Timeline</h1>
        <p className="text-muted-foreground mb-8">View all your deadlines and milestones</p>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Calendar className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground text-lg">No timeline events yet</p>
          <p className="text-muted-foreground/60 text-sm mt-1">Add applications and deadlines to see your timeline</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-foreground mb-2">Timeline</h1>
      <p className="text-muted-foreground mb-8">View all your deadlines and milestones</p>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[11px] top-0 bottom-0 w-0.5 bg-border" />

        <div className="space-y-10">
          {months.map((month, monthIndex) => {
            const accentColor = ACCENT_COLORS[monthIndex % ACCENT_COLORS.length];
            if (month.tasks.length === 0 && month.deadlines.length === 0) return null;

            return (
              <div key={month.month} className="relative pl-8">
                {/* Month dot */}
                <div
                  className="absolute left-0 top-1 w-6 h-6 rounded-full border-2 border-background flex items-center justify-center"
                  style={{ backgroundColor: accentColor }}
                />

                {/* Month label */}
                <h2 className="text-lg font-bold mb-4" style={{ color: accentColor }}>
                  {month.month}
                </h2>

                {/* Items */}
                <div className="space-y-3">
                  {month.tasks.map(task => {
                    const isCompleted = task.status === 'completed';
                    const key = `task-${task.id}`;
                    const isToggling = toggling === key;
                    return (
                      <div
                        key={key}
                        className="flex items-start gap-3 bg-card rounded-lg border border-border p-4"
                      >
                        <button
                          onClick={() => handleToggleTask(task.id, task.status)}
                          disabled={isToggling}
                          className="mt-0.5 flex-shrink-0 transition-opacity disabled:opacity-50"
                          aria-label={isCompleted ? 'Mark incomplete' : 'Mark complete'}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                          ) : (
                            <Circle className="w-5 h-5 text-muted-foreground" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className="font-bold text-foreground">{task.college_name}</span>
                          <span className="text-muted-foreground text-sm ml-2">{task.type}</span>
                          <p className="text-sm text-foreground/80 mt-0.5 truncate">{task.title}</p>
                        </div>
                        {task.due_date && (
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {format(new Date(task.due_date), 'MMM d')}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {month.deadlines.map(deadline => {
                    const isCompleted = deadline.is_completed === 1;
                    const key = `deadline-${deadline.id}`;
                    const isToggling = toggling === key;
                    return (
                      <div
                        key={key}
                        className="flex items-start gap-3 bg-card rounded-lg border border-border p-4"
                      >
                        <button
                          onClick={() => handleToggleDeadline(deadline.id, deadline.is_completed)}
                          disabled={isToggling}
                          className="mt-0.5 flex-shrink-0 transition-opacity disabled:opacity-50"
                          aria-label={isCompleted ? 'Mark incomplete' : 'Mark complete'}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                          ) : (
                            <Circle className="w-5 h-5 text-muted-foreground" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className="font-bold text-foreground">{deadline.college_name}</span>
                          <span className="text-muted-foreground text-sm ml-2">{deadline.deadline_type}</span>
                        </div>
                        {deadline.deadline_date && (
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {format(new Date(deadline.deadline_date), 'MMM d')}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * TodaysTasks - Magic automation component showing today's prioritized tasks
 * Part of the "Magic Dashboard" experience
 */
import React from 'react';
import { CheckCircle, AlertTriangle, Clock, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface Task {
  id: string;
  title: string;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  dueDate?: string;
  estimatedTime?: number; // in minutes
  college?: string;
  status: 'pending' | 'in_progress' | 'completed';
  impact?: string;
}

interface TodaysTasksProps {
  tasks?: Task[];
  onTaskClick?: (taskId: string) => void;
  onTaskComplete?: (taskId: string) => void;
  loading?: boolean;
}

const priorityConfig = {
  critical: {
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-700',
    icon: AlertTriangle
  },
  high: {
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    badge: 'bg-orange-100 text-orange-700',
    icon: Clock
  },
  medium: {
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    badge: 'bg-yellow-100 text-yellow-700',
    icon: Clock
  },
  low: {
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200',
    badge: 'bg-green-100 text-green-700',
    icon: CheckCircle
  }
};

const TodaysTasks: React.FC<TodaysTasksProps> = ({
  tasks = [],
  onTaskClick,
  onTaskComplete,
  loading = false
}) => {
  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  const completedToday = tasks.filter(t => t.status === 'completed').length;
  const progressPercent = tasks.length > 0 
    ? Math.round((completedToday / tasks.length) * 100) 
    : 0;

  // Sort tasks by priority
  const sortedTasks = [...pendingTasks].sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      {/* Header with progress */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          <h3 className="font-bold text-gray-900">Today's Tasks</h3>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>{completedToday}/{tasks.length} done</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <Progress value={progressPercent} className="h-2" />
        <p className="text-xs text-gray-500 mt-1">
          {progressPercent === 100 
            ? '🎉 All done for today!' 
            : `${100 - progressPercent}% remaining`}
        </p>
      </div>

      {/* Task list */}
      {sortedTasks.length === 0 ? (
        <div className="text-center py-8">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">All caught up!</p>
          <p className="text-sm text-gray-500">No pending tasks for today</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedTasks.slice(0, 5).map(task => {
            const config = priorityConfig[task.priority];
            const Icon = config.icon;

            return (
              <div
                key={task.id}
                className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all cursor-pointer hover:shadow-md ${config.bg} ${config.border}`}
                onClick={() => onTaskClick?.(task.id)}
              >
                {/* Priority indicator */}
                <div className={`flex-shrink-0 ${config.color}`}>
                  <Icon className="w-5 h-5" />
                </div>

                {/* Task content */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{task.title}</p>
                  <div className="flex items-center gap-2 text-sm">
                    {task.college && (
                      <span className="text-gray-600">{task.college}</span>
                    )}
                    {task.estimatedTime && (
                      <span className="text-gray-500">• {task.estimatedTime} min</span>
                    )}
                  </div>
                </div>

                {/* Priority badge */}
                <span className={`flex-shrink-0 px-2 py-1 rounded text-xs font-medium ${config.badge}`}>
                  {task.priority}
                </span>

                {/* Complete button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTaskComplete?.(task.id);
                  }}
                  className="flex-shrink-0"
                >
                  <CheckCircle className="w-4 h-4" />
                </Button>
              </div>
            );
          })}

          {/* Show more if there are more than 5 tasks */}
          {sortedTasks.length > 5 && (
            <Button variant="outline" className="w-full mt-2">
              View all {sortedTasks.length} tasks
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      )}

      {/* Smart suggestion */}
      {sortedTasks.length > 0 && sortedTasks[0].impact && (
        <div className="mt-4 p-3 bg-indigo-50 rounded-lg border border-indigo-200">
          <p className="text-sm text-indigo-800">
            <span className="font-medium">💡 Pro tip:</span> {sortedTasks[0].impact}
          </p>
        </div>
      )}
    </div>
  );
};

export default TodaysTasks;

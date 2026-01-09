import { TimelineEvent } from '@/types';
import { cn } from '@/lib/utils';
import { 
  Calendar, 
  Flag, 
  Bell, 
  ArrowRightLeft,
  CheckCircle2,
  Circle
} from 'lucide-react';
import { format, isToday, isTomorrow, isPast } from 'date-fns';

interface TimelineItemProps {
  event: TimelineEvent;
  isLast?: boolean;
  onToggle?: (id: string) => void;
}

const typeConfig = {
  deadline: { icon: Flag, color: 'text-destructive bg-destructive/10' },
  milestone: { icon: CheckCircle2, color: 'text-success bg-success/10' },
  reminder: { icon: Bell, color: 'text-warning bg-warning/10' },
  status_change: { icon: ArrowRightLeft, color: 'text-info bg-info/10' },
};

export function TimelineItem({ event, isLast, onToggle }: TimelineItemProps) {
  const config = typeConfig[event.type];
  const Icon = config.icon;
  
  const formatDate = (date: Date) => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'MMM d, yyyy');
  };

  const isOverdue = isPast(event.date) && !event.completed;

  return (
    <div className="flex gap-4 group">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <button
          onClick={() => onToggle?.(event.id)}
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center transition-all',
            'border-2',
            event.completed 
              ? 'bg-success/10 border-success text-success' 
              : isOverdue
                ? 'bg-destructive/10 border-destructive text-destructive'
                : 'bg-card border-border text-muted-foreground hover:border-primary hover:text-primary'
          )}
        >
          {event.completed ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <Circle className="w-4 h-4" />
          )}
        </button>
        {!isLast && (
          <div className={cn(
            'w-0.5 flex-1 min-h-[2rem]',
            event.completed ? 'bg-success/30' : 'bg-border'
          )} />
        )}
      </div>

      {/* Content */}
      <div className={cn(
        'flex-1 pb-6',
        event.completed && 'opacity-60'
      )}>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                config.color
              )}>
                <Icon className="w-3 h-3" />
                {event.type.replace('_', ' ')}
              </span>
              {event.urgent && !event.completed && (
                <span className="text-xs text-destructive font-medium">Urgent</span>
              )}
            </div>
            <h4 className={cn(
              'font-medium',
              event.completed && 'line-through'
            )}>
              {event.title}
            </h4>
            <p className="text-sm text-muted-foreground">{event.collegeName}</p>
          </div>

          <div className="text-right">
            <p className={cn(
              'text-sm font-medium',
              isOverdue ? 'text-destructive' : 'text-foreground'
            )}>
              {formatDate(event.date)}
            </p>
            <p className="text-xs text-muted-foreground">
              {format(event.date, 'h:mm a')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

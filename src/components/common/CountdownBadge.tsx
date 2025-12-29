import { cn } from '@/lib/utils';
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface CountdownBadgeProps {
  targetDate: Date | null;
  className?: string;
  showIcon?: boolean;
}

export function CountdownBadge({ targetDate, className, showIcon = true }: CountdownBadgeProps) {
  if (!targetDate) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        'bg-muted text-muted-foreground',
        className
      )}>
        {showIcon && <Clock className="w-3 h-3" />}
        No deadline set
      </span>
    );
  }

  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  // Past deadline
  if (diffDays < 0) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        'bg-destructive/10 text-destructive',
        className
      )}>
        {showIcon && <AlertTriangle className="w-3 h-3" />}
        {Math.abs(diffDays)} days overdue
      </span>
    );
  }

  // Today
  if (diffDays === 0) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium animate-pulse-gentle',
        'bg-destructive text-destructive-foreground',
        className
      )}>
        {showIcon && <AlertTriangle className="w-3 h-3" />}
        Due today!
      </span>
    );
  }

  // Urgent (within 7 days)
  if (diffDays <= 7) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        'bg-warning text-warning-foreground',
        className
      )}>
        {showIcon && <AlertTriangle className="w-3 h-3" />}
        {diffDays} day{diffDays !== 1 ? 's' : ''} left
      </span>
    );
  }

  // Soon (within 30 days)
  if (diffDays <= 30) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        'bg-info/10 text-info',
        className
      )}>
        {showIcon && <Clock className="w-3 h-3" />}
        {diffDays} days left
      </span>
    );
  }

  // Far out
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
      'bg-muted text-muted-foreground',
      className
    )}>
      {showIcon && <Clock className="w-3 h-3" />}
      {diffDays} days
    </span>
  );
}

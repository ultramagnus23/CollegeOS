import { ApplicationStatus } from '@/types';
import { cn } from '@/lib/utils';
import { 
  Search, 
  Clipboard, 
  Loader2, 
  Send, 
  MessageSquare, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Pause,
  LogOut
} from 'lucide-react';

interface StatusBadgeProps {
  status: ApplicationStatus;
  className?: string;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

const statusConfig: Record<ApplicationStatus, { 
  icon: typeof Search; 
  label: string; 
  className: string;
}> = {
  researching: {
    icon: Search,
    label: 'Researching',
    className: 'bg-muted text-muted-foreground',
  },
  planning: {
    icon: Clipboard,
    label: 'Planning',
    className: 'bg-secondary text-secondary-foreground',
  },
  in_progress: {
    icon: Loader2,
    label: 'In Progress',
    className: 'bg-info/10 text-info',
  },
  submitted: {
    icon: Send,
    label: 'Submitted',
    className: 'bg-primary/10 text-primary',
  },
  interview: {
    icon: MessageSquare,
    label: 'Interview',
    className: 'bg-accent text-accent-foreground',
  },
  decision_pending: {
    icon: Clock,
    label: 'Pending',
    className: 'bg-warning/10 text-warning-foreground',
  },
  accepted: {
    icon: CheckCircle2,
    label: 'Accepted',
    className: 'bg-success/10 text-success',
  },
  rejected: {
    icon: XCircle,
    label: 'Rejected',
    className: 'bg-destructive/10 text-destructive',
  },
  waitlisted: {
    icon: Pause,
    label: 'Waitlisted',
    className: 'bg-warning/10 text-warning-foreground',
  },
  withdrawn: {
    icon: LogOut,
    label: 'Withdrawn',
    className: 'bg-muted text-muted-foreground',
  },
};

export function StatusBadge({ status, className, showIcon = true, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full font-medium',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
      config.className,
      className
    )}>
      {showIcon && <Icon className={cn(
        size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5',
        status === 'in_progress' && 'animate-spin'
      )} />}
      {config.label}
    </span>
  );
}

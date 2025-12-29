import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  highlight?: boolean;
  className?: string;
}

export function StatsCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend,
  highlight,
  className 
}: StatsCardProps) {
  return (
    <div className={cn(
      'relative p-5 rounded-xl border bg-card transition-all duration-300',
      'hover:shadow-medium',
      highlight && 'border-primary/30 bg-primary/5',
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="flex items-baseline gap-2">
            <span className={cn(
              'text-3xl font-bold tracking-tight',
              highlight && 'text-primary'
            )}>
              {value}
            </span>
            {trend && (
              <span className={cn(
                'text-xs font-medium',
                trend === 'up' && 'text-success',
                trend === 'down' && 'text-destructive',
                trend === 'neutral' && 'text-muted-foreground'
              )}>
                {trend === 'up' && '↑'}
                {trend === 'down' && '↓'}
                {trend === 'neutral' && '—'}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className={cn(
          'p-2.5 rounded-lg',
          highlight ? 'bg-primary/10' : 'bg-muted'
        )}>
          <Icon className={cn(
            'w-5 h-5',
            highlight ? 'text-primary' : 'text-muted-foreground'
          )} />
        </div>
      </div>
    </div>
  );
}

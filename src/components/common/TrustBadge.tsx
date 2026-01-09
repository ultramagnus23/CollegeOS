import { TrustTier, DataSource } from '@/types';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertCircle, HelpCircle, ExternalLink, MessageCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TrustBadgeProps {
  source: DataSource | null;
  className?: string;
  showLink?: boolean;
}

const tierConfig: Record<TrustTier, { icon: typeof CheckCircle2; label: string; className: string }> = {
  official: {
    icon: CheckCircle2,
    label: 'Official Source',
    className: 'text-verified bg-verified/10',
  },
  secondary: {
    icon: AlertCircle,
    label: 'Secondary Source',
    className: 'text-unverified bg-unverified/10',
  },
  forum: {
    icon: MessageCircle,
    label: 'Community Source',
    className: 'text-muted-foreground bg-muted',
  },
  unverified: {
    icon: HelpCircle,
    label: 'Unverified',
    className: 'text-missing bg-muted',
  },
};

export function TrustBadge({ source, className, showLink = true }: TrustBadgeProps) {
  if (!source) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
            'text-missing bg-muted cursor-help',
            className
          )}>
            <HelpCircle className="w-3 h-3" />
            No Source
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-sm">Data source not available</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  const config = tierConfig[source.tier];
  const Icon = config.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-help',
          config.className,
          className
        )}>
          <Icon className="w-3 h-3" />
          {source.label || config.label}
          {showLink && (
            <ExternalLink className="w-3 h-3 opacity-60" />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-1">
          <p className="font-medium text-sm">{config.label}</p>
          {source.url && (
            <a 
              href={source.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              View source <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <p className="text-xs text-muted-foreground">
            Accessed: {source.accessedAt.toLocaleDateString()}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

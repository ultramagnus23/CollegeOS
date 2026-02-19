import { cn } from '@/lib/utils';
import { Palette, Video, Languages, FileText } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface RequirementFlagsProps {
  hasPortfolio?: boolean;
  hasInterview?: boolean;
  hasLanguage?: boolean;
  hasFinancial?: boolean;
  className?: string;
}

const flags = [
  { key: 'hasPortfolio', icon: Palette, label: 'Portfolio Required', color: 'text-purple-600' },
  { key: 'hasInterview', icon: Video, label: 'Interview Required', color: 'text-primary' },
  { key: 'hasLanguage', icon: Languages, label: 'Language Test Required', color: 'text-amber-600' },
  { key: 'hasFinancial', icon: FileText, label: 'Financial Documents Required', color: 'text-emerald-600' },
] as const;

export function RequirementFlags({ 
  hasPortfolio, 
  hasInterview, 
  hasLanguage, 
  hasFinancial,
  className 
}: RequirementFlagsProps) {
  const activeFlags = flags.filter(flag => {
    switch (flag.key) {
      case 'hasPortfolio': return hasPortfolio;
      case 'hasInterview': return hasInterview;
      case 'hasLanguage': return hasLanguage;
      case 'hasFinancial': return hasFinancial;
      default: return false;
    }
  });

  if (activeFlags.length === 0) return null;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {activeFlags.map(flag => {
        const Icon = flag.icon;
        return (
          <Tooltip key={flag.key}>
            <TooltipTrigger asChild>
              <span className={cn(
                'inline-flex items-center justify-center w-6 h-6 rounded-md bg-muted/50 cursor-help',
                flag.color
              )}>
                <Icon className="w-3.5 h-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-sm">{flag.label}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

import { ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DataNotAvailableProps {
  label?: string;
  officialUrl?: string;
  className?: string;
  compact?: boolean;
}

export function DataNotAvailable({ 
  label = 'Data not available', 
  officialUrl, 
  className,
  compact = false 
}: DataNotAvailableProps) {
  if (compact) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1.5 text-missing text-sm',
        className
      )}>
        <AlertTriangle className="w-3.5 h-3.5" />
        <span className="italic">{label}</span>
        {officialUrl && (
          <a 
            href={officialUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-0.5"
          >
            Check website <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </span>
    );
  }

  return (
    <div className={cn(
      'flex items-start gap-3 p-4 rounded-lg bg-muted/50 border border-dashed border-border',
      className
    )}>
      <AlertTriangle className="w-5 h-5 text-missing flex-shrink-0 mt-0.5" />
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{label}</span>
          <br />
          We couldn't verify this information from official sources.
        </p>
        {officialUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={officialUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />
              Visit Official Website
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

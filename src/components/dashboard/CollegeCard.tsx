import { College, Application } from '@/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/common/StatusBadge';
import { CountdownBadge } from '@/components/common/CountdownBadge';
import { RequirementFlags } from '@/components/common/RequirementFlags';
import FitBadge from '@/components/FitBadge';
import { cn } from '@/lib/utils';
import { ExternalLink, MapPin, ChevronRight, CheckCircle2 } from 'lucide-react';
import { countries } from '@/data/mockData';

interface CollegeCardProps {
  college: College;
  application?: Application;
  onClick?: () => void;
  className?: string;
}

export function CollegeCard({ college, application, onClick, className }: CollegeCardProps) {
  const country = countries.find(c => c.code === college.countryCode);
  const nextDeadline = college.deadlines
    .filter(d => d.date && d.date > new Date())
    .sort((a, b) => a.date!.getTime() - b.date!.getTime())[0];

  const completedTasks = application?.checklist.filter(c => c.completed).length || 0;
  const totalTasks = application?.checklist.length || 0;
  const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  return (
    <Card 
      className={cn(
        'group relative overflow-hidden transition-all duration-300',
        'hover:shadow-medium hover:border-primary/20 cursor-pointer',
        'animate-fade-in',
        className
      )}
      onClick={onClick}
    >
      {/* Progress indicator */}
      {application && totalTasks > 0 && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-muted">
          <div 
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {country && (
                <span className="text-lg" title={country.name}>{country.flag}</span>
              )}
              <h3 className="font-semibold text-base leading-tight truncate">
                {college.name}
              </h3>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{college.city}, {college.country}</span>
            </div>
          </div>

          <Button 
            variant="ghost" 
            size="icon-sm"
            asChild
            onClick={(e) => e.stopPropagation()}
          >
            <a href={college.officialWebsite} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status and deadline row */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {application ? (
              <StatusBadge status={application.status} size="sm" />
            ) : (
              <span className="text-xs text-muted-foreground">Not started</span>
            )}
            <FitBadge collegeId={college.id} />
          </div>
          <CountdownBadge 
            targetDate={application?.targetDeadline || nextDeadline?.date || null} 
          />
        </div>

        {/* Requirements flags */}
        <RequirementFlags
          hasPortfolio={college.hasPortfolioRequirement}
          hasInterview={college.hasInterviewRequirement}
          hasLanguage={college.hasLanguageRequirement}
          hasFinancial={college.requiresFinancialDocs}
        />

        {/* Progress summary */}
        {application && totalTasks > 0 && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <span>{completedTasks} of {totalTasks} tasks</span>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
          </div>
        )}

        {/* Deadline type indicator */}
        {application?.deadlineType && (
          <div className="pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground capitalize">
              {application.deadlineType.replace('_', ' ')} deadline
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

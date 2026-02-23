/**
 * RecommendedActions - Smart action recommendations based on profile analysis
 * Part of the "Magic Dashboard" experience - shows highest impact actions
 */
import React from 'react';
import { 
  Lightbulb, 
  ArrowRight, 
  TrendingUp, 
  FileText, 
  Users, 
  GraduationCap,
  Calendar,
  Target,
  PenTool,
  CheckCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface RecommendedAction {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: 'profile' | 'testing' | 'essays' | 'recommendations' | 'applications' | 'deadlines';
  action: string;
  reason: string;
  impact: string;
  impactScore?: number; // 0-100, how much this improves their profile
  timeEstimate?: number; // minutes
  href?: string;
}

interface RecommendedActionsProps {
  actions?: RecommendedAction[];
  profileStrength?: number;
  onActionClick?: (action: RecommendedAction) => void;
  loading?: boolean;
}

const categoryConfig = {
  profile: { 
    icon: Target, 
    color: 'text-primary', 
    bg: 'bg-primary/15',
    label: 'Profile'
  },
  testing: { 
    icon: TrendingUp, 
    color: 'text-purple-600', 
    bg: 'bg-purple-100',
    label: 'Testing'
  },
  essays: { 
    icon: PenTool, 
    color: 'text-indigo-600', 
    bg: 'bg-indigo-100',
    label: 'Essays'
  },
  recommendations: { 
    icon: Users, 
    color: 'text-green-600', 
    bg: 'bg-green-100',
    label: 'Recs'
  },
  applications: { 
    icon: FileText, 
    color: 'text-orange-600', 
    bg: 'bg-orange-100',
    label: 'Apps'
  },
  deadlines: { 
    icon: Calendar, 
    color: 'text-red-600', 
    bg: 'bg-red-100',
    label: 'Deadlines'
  }
};

const priorityBadge = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-green-100 text-green-700 border-green-200'
};

const RecommendedActions: React.FC<RecommendedActionsProps> = ({
  actions = [],
  profileStrength = 0,
  onActionClick,
  loading = false
}) => {
  // Sort actions by priority and impact
  const sortedActions = [...actions].sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return (b.impactScore || 0) - (a.impactScore || 0);
  });

  // Take top 3 most impactful actions
  const topActions = sortedActions.slice(0, 3);

  if (loading) {
    return (
      <div className="bg-card rounded-xl shadow-sm border border-border p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-muted rounded w-1/2 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6">
      {/* Header with profile strength */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-foreground">Recommended Actions</h3>
        </div>
        {profileStrength > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Profile:</span>
            <div className="flex items-center gap-1">
              <Progress value={profileStrength} className="w-16 h-2" />
              <span className="text-sm font-medium">{profileStrength}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Insight banner */}
      {topActions.length > 0 && topActions[0].impactScore && topActions[0].impactScore >= 10 && (
        <div className="mb-4 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-200">
          <p className="text-sm text-indigo-800">
            <span className="font-semibold">✨ Quick win:</span> Completing the top action could improve your profile by up to <span className="font-bold">{topActions[0].impactScore}%</span>
          </p>
        </div>
      )}

      {/* Action list */}
      {topActions.length === 0 ? (
        <div className="text-center py-8">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">You're all set!</p>
          <p className="text-sm text-muted-foreground">No recommended actions right now</p>
        </div>
      ) : (
        <div className="space-y-3">
          {topActions.map((action, index) => {
            const config = categoryConfig[action.category];
            const Icon = config.icon;

            return (
              <div
                key={action.id}
                className={`group relative p-4 rounded-lg border-2 transition-all cursor-pointer hover:shadow-md ${
                  index === 0 
                    ? 'border-indigo-300 bg-indigo-50' 
                    : 'border-border bg-muted/50 hover:border-indigo-200'
                }`}
                onClick={() => onActionClick?.(action)}
              >
                {/* Priority indicator */}
                {index === 0 && (
                  <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-indigo-600 text-white text-xs font-medium rounded-full">
                    #1 Priority
                  </div>
                )}

                <div className="flex items-start gap-3">
                  {/* Category icon */}
                  <div className={`flex-shrink-0 p-2 rounded-lg ${config.bg}`}>
                    <Icon className={`w-5 h-5 ${config.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-foreground">{action.action}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${priorityBadge[action.priority]}`}>
                        {action.priority}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{action.reason}</p>
                    
                    {/* Impact and time */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {action.impactScore && (
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          +{action.impactScore}% impact
                        </span>
                      )}
                      {action.timeEstimate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          ~{action.timeEstimate} min
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action button */}
                  <Button
                    variant={index === 0 ? 'default' : 'outline'}
                    size="sm"
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Start
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Show more link */}
      {sortedActions.length > 3 && (
        <Button variant="ghost" className="w-full mt-4 text-sm">
          View all {sortedActions.length} recommendations
          <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      )}
    </div>
  );
};

export default RecommendedActions;

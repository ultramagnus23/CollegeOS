/**
 * CollegeListOverview - Visual college list with reach/target/safety distribution
 * Part of the "Magic Dashboard" experience
 */
import React from 'react';
import { 
  GraduationCap, 
  Target, 
  Shield, 
  TrendingUp,
  ArrowRight,
  Plus,
  CheckCircle,
  Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface CollegeListItem {
  id: string;
  name: string;
  category: 'reach' | 'target' | 'safety';
  chance: number; // 0-100
  country: string;
  deadline?: string;
  status: 'researching' | 'preparing' | 'submitted' | 'accepted' | 'rejected';
  logoUrl?: string;
}

interface CollegeListOverviewProps {
  colleges?: CollegeListItem[];
  recommendedDistribution?: {
    reach: number;
    target: number;
    safety: number;
  };
  onCollegeClick?: (collegeId: string) => void;
  onAddCollege?: () => void;
  loading?: boolean;
}

const categoryConfig = {
  reach: {
    icon: TrendingUp,
    color: 'text-purple-600',
    bg: 'bg-purple-100',
    border: 'border-purple-200',
    label: 'Reach',
    description: 'Dream schools'
  },
  target: {
    icon: Target,
    color: 'text-primary',
    bg: 'bg-primary/15',
    border: 'border-blue-200',
    label: 'Target',
    description: 'Good fit'
  },
  safety: {
    icon: Shield,
    color: 'text-green-600',
    bg: 'bg-green-100',
    border: 'border-green-200',
    label: 'Safety',
    description: 'Strong chances'
  }
};

const statusConfig = {
  researching: { label: 'Researching', color: 'text-muted-foreground', bg: 'bg-muted' },
  preparing: { label: 'Preparing', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  submitted: { label: 'Submitted', color: 'text-primary', bg: 'bg-primary/15' },
  accepted: { label: 'Accepted! 🎉', color: 'text-green-600', bg: 'bg-green-100' },
  rejected: { label: 'Rejected', color: 'text-red-600', bg: 'bg-red-100' }
};

const CollegeListOverview: React.FC<CollegeListOverviewProps> = ({
  colleges = [],
  recommendedDistribution = { reach: 3, target: 5, safety: 2 },
  onCollegeClick,
  onAddCollege,
  loading = false
}) => {
  // Group colleges by category
  const grouped = {
    reach: colleges.filter(c => c.category === 'reach'),
    target: colleges.filter(c => c.category === 'target'),
    safety: colleges.filter(c => c.category === 'safety')
  };

  // Calculate distribution health
  const distributionScore = () => {
    const hasSafeties = grouped.safety.length >= 2;
    const hasTargets = grouped.target.length >= 3;
    const hasReaches = grouped.reach.length >= 1;
    const totalReasonable = colleges.length >= 6 && colleges.length <= 15;

    if (hasSafeties && hasTargets && hasReaches && totalReasonable) {
      return { status: 'healthy', message: 'Well-balanced list!' };
    } else if (!hasSafeties) {
      return { status: 'warning', message: 'Add more safety schools' };
    } else if (!hasTargets) {
      return { status: 'warning', message: 'Add more target schools' };
    } else if (colleges.length > 15) {
      return { status: 'info', message: 'Consider narrowing your list' };
    } else if (colleges.length < 5) {
      return { status: 'info', message: 'Consider adding more schools' };
    }
    return { status: 'ok', message: 'Good progress!' };
  };

  const health = distributionScore();

  if (loading) {
    return (
      <div className="bg-card rounded-xl shadow-sm border border-border p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-muted rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-indigo-600" />
          <h3 className="font-bold text-foreground">My College List</h3>
          <span className="text-sm text-muted-foreground">({colleges.length} schools)</span>
        </div>
        <Button variant="outline" size="sm" onClick={onAddCollege}>
          <Plus className="w-4 h-4 mr-1" />
          Add College
        </Button>
      </div>

      {/* Distribution overview */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {(['reach', 'target', 'safety'] as const).map(category => {
          const config = categoryConfig[category];
          const Icon = config.icon;
          const count = grouped[category].length;
          const recommended = recommendedDistribution[category];
          const progress = Math.min((count / recommended) * 100, 100);

          return (
            <div
              key={category}
              className={`p-4 rounded-lg border-2 ${config.border} ${config.bg}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-4 h-4 ${config.color}`} />
                <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <span className="text-2xl font-bold text-foreground">{count}</span>
                  <span className="text-sm text-muted-foreground">/{recommended} rec.</span>
                </div>
                {count >= recommended && (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                )}
              </div>
              <Progress value={progress} className="h-1.5 mt-2" />
            </div>
          );
        })}
      </div>

      {/* Health indicator */}
      <div className={`p-3 rounded-lg mb-4 ${
        health.status === 'healthy' ? 'bg-green-50 border border-green-200' :
        health.status === 'warning' ? 'bg-amber-50 border border-amber-200' :
        'bg-primary/10 border border-blue-200'
      }`}>
        <p className={`text-sm font-medium ${
          health.status === 'healthy' ? 'text-green-700' :
          health.status === 'warning' ? 'text-amber-700' :
          'text-primary'
        }`}>
          {health.status === 'healthy' && '✓ '}
          {health.status === 'warning' && '⚠ '}
          {health.message}
        </p>
      </div>

      {/* Recent colleges */}
      {colleges.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground mb-2">Recent additions:</p>
          {colleges.slice(0, 4).map(college => {
            const catConfig = categoryConfig[college.category];
            const statConfig = statusConfig[college.status];

            return (
              <div
                key={college.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-indigo-300 cursor-pointer transition-all"
                onClick={() => onCollegeClick?.(college.id)}
              >
                {/* College initial/logo */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold ${
                  college.category === 'reach' ? 'bg-purple-500' :
                  college.category === 'target' ? 'bg-primary' :
                  'bg-green-500'
                }`}>
                  {college.name.charAt(0)}
                </div>

                {/* College info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{college.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={`px-1.5 py-0.5 rounded ${catConfig.bg} ${catConfig.color}`}>
                      {catConfig.label}
                    </span>
                    <span>•</span>
                    <span>{college.chance}% chance</span>
                  </div>
                </div>

                {/* Status */}
                <span className={`text-xs px-2 py-1 rounded-full ${statConfig.bg} ${statConfig.color}`}>
                  {statConfig.label}
                </span>
              </div>
            );
          })}

          {colleges.length > 4 && (
            <Button variant="ghost" className="w-full text-sm">
              View all {colleges.length} colleges
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      ) : (
        <div className="text-center py-6">
          <GraduationCap className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground mb-2">No colleges added yet</p>
          <p className="text-sm text-muted-foreground mb-4">
            Start building your list with our smart recommendations
          </p>
          <Button onClick={onAddCollege}>
            <Plus className="w-4 h-4 mr-1" />
            Find Colleges
          </Button>
        </div>
      )}
    </div>
  );
};

export default CollegeListOverview;

/**
 * Decision Countdown Component
 * Shows countdown to college decision notification dates
 */

import React from 'react';
import { Calendar, Clock, CheckCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface DecisionDate {
  collegeName: string;
  deadlineType: string;
  notificationDate: string;
  applicationDate: string;
  collegeId?: number;
}

interface DecisionCountdownProps {
  decisions: DecisionDate[];
  showTimeline?: boolean;
}

export const DecisionCountdown: React.FC<DecisionCountdownProps> = ({ 
  decisions,
  showTimeline = true 
}) => {
  const calculateDaysUntil = (dateString: string): number => {
    const target = new Date(dateString);
    const now = new Date();
    const diffTime = target.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getUrgencyColor = (daysUntil: number): string => {
    if (daysUntil <= 0) return 'bg-green-500';
    if (daysUntil <= 7) return 'bg-red-500';
    if (daysUntil <= 30) return 'bg-yellow-500';
    return 'bg-primary';
  };

  const getUrgencyText = (daysUntil: number): string => {
    if (daysUntil < 0) return 'Past';
    if (daysUntil === 0) return 'Today!';
    if (daysUntil === 1) return 'Tomorrow!';
    if (daysUntil <= 7) return 'This Week';
    if (daysUntil <= 30) return 'This Month';
    return 'Upcoming';
  };

  // Sort decisions by notification date
  const sortedDecisions = [...decisions].sort((a, b) => 
    new Date(a.notificationDate).getTime() - new Date(b.notificationDate).getTime()
  );

  if (decisions.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          <Calendar className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
          <p>No decision dates to track yet</p>
          <p className="text-sm mt-1">Submit applications to see decision dates here</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Clock className="w-5 h-5" />
        Decision Dates
      </h3>
      
      <div className="space-y-3">
        {sortedDecisions.map((decision, index) => {
          const daysUntil = calculateDaysUntil(decision.notificationDate);
          const isPast = daysUntil < 0;
          
          return (
            <Card key={index} className={`p-4 ${isPast ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-start gap-3">
                    <div className={`w-1 h-full ${getUrgencyColor(daysUntil)} rounded-full`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-foreground">
                          {decision.collegeName}
                        </h4>
                        <Badge variant="outline" className="text-xs">
                          {decision.deadlineType}
                        </Badge>
                        {isPast && (
                          <Badge variant="secondary" className="text-xs">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Past
                          </Badge>
                        )}
                      </div>
                      
                      {showTimeline && (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <div className="w-2 h-2 rounded-full bg-blue-400" />
                            <span className="font-medium">Applied:</span>
                            <span>{formatDate(decision.applicationDate)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <div className={`w-2 h-2 rounded-full ${getUrgencyColor(daysUntil)}`} />
                            <span className="font-medium text-foreground">Decision:</span>
                            <span className={`font-semibold ${
                              daysUntil <= 7 && !isPast ? 'text-red-600' : 'text-foreground'
                            }`}>
                              {formatDate(decision.notificationDate)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <Badge 
                    className={`${getUrgencyColor(daysUntil)} text-white text-sm px-3 py-1`}
                  >
                    {getUrgencyText(daysUntil)}
                  </Badge>
                  {!isPast && (
                    <p className="text-2xl font-bold mt-2 text-foreground">
                      {daysUntil === 0 ? 'Today' : daysUntil === 1 ? '1 day' : `${daysUntil} days`}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Compact Decision Countdown for Dashboard
 */
export const CompactDecisionCountdown: React.FC<{ decisions: DecisionDate[] }> = ({ decisions }) => {
  const upcomingDecisions = decisions
    .filter(d => new Date(d.notificationDate) >= new Date())
    .sort((a, b) => 
      new Date(a.notificationDate).getTime() - new Date(b.notificationDate).getTime()
    )
    .slice(0, 3);

  if (upcomingDecisions.length === 0) {
    return null;
  }

  const calculateDaysUntil = (dateString: string): number => {
    const target = new Date(dateString);
    const now = new Date();
    const diffTime = target.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  return (
    <Card className="p-4">
      <h4 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
        <Clock className="w-4 h-4" />
        Upcoming Decisions
      </h4>
      <div className="space-y-2">
        {upcomingDecisions.map((decision, index) => {
          const daysUntil = calculateDaysUntil(decision.notificationDate);
          return (
            <div key={index} className="flex items-center justify-between text-sm">
              <span className="text-foreground truncate flex-1">
                {decision.collegeName}
              </span>
              <span className={`font-semibold ml-2 ${
                daysUntil <= 7 ? 'text-red-600' : 'text-primary'
              }`}>
                {daysUntil === 0 ? 'Today!' : daysUntil === 1 ? '1 day' : `${daysUntil} days`}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

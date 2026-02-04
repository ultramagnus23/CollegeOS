/**
 * UrgentAlerts - Color-coded warning system for deadlines and missing items
 * Part of the "Magic Dashboard" experience
 */
import React from 'react';
import { AlertTriangle, AlertCircle, Clock, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Alert {
  id: string;
  type: 'deadline' | 'missing_requirement' | 'action_needed' | 'exemption' | 'warning';
  severity: 'critical' | 'warning' | 'info' | 'success';
  title: string;
  description: string;
  college?: string;
  daysRemaining?: number;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

interface UrgentAlertsProps {
  alerts?: Alert[];
  onAlertClick?: (alertId: string) => void;
  onDismiss?: (alertId: string) => void;
  loading?: boolean;
}

const severityConfig = {
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-300',
    icon: XCircle,
    iconColor: 'text-red-600',
    titleColor: 'text-red-800',
    descColor: 'text-red-600',
    buttonVariant: 'destructive' as const
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    icon: AlertTriangle,
    iconColor: 'text-amber-600',
    titleColor: 'text-amber-800',
    descColor: 'text-amber-600',
    buttonVariant: 'outline' as const
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    icon: AlertCircle,
    iconColor: 'text-blue-600',
    titleColor: 'text-blue-800',
    descColor: 'text-blue-600',
    buttonVariant: 'outline' as const
  },
  success: {
    bg: 'bg-green-50',
    border: 'border-green-300',
    icon: CheckCircle2,
    iconColor: 'text-green-600',
    titleColor: 'text-green-800',
    descColor: 'text-green-600',
    buttonVariant: 'outline' as const
  }
};

const UrgentAlerts: React.FC<UrgentAlertsProps> = ({
  alerts = [],
  onAlertClick,
  onDismiss,
  loading = false
}) => {
  // Sort alerts by severity
  const sortedAlerts = [...alerts].sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2, success: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  // Show only critical and warning alerts prominently
  const urgentAlerts = sortedAlerts.filter(a => a.severity === 'critical' || a.severity === 'warning');
  const otherAlerts = sortedAlerts.filter(a => a.severity === 'info' || a.severity === 'success');

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2].map(i => (
          <div key={i} className="animate-pulse h-16 bg-gray-100 rounded-lg"></div>
        ))}
      </div>
    );
  }

  if (alerts.length === 0) {
    return null; // Don't show anything if no alerts
  }

  const formatDaysRemaining = (days?: number) => {
    if (days === undefined) return null;
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days < 0) return `${Math.abs(days)} days overdue`;
    return `${days} days left`;
  };

  return (
    <div className="space-y-3">
      {/* Urgent alerts banner */}
      {urgentAlerts.length > 0 && (
        <div className="space-y-2">
          {urgentAlerts.slice(0, 3).map(alert => {
            const config = severityConfig[alert.severity];
            const Icon = config.icon;

            return (
              <div
                key={alert.id}
                className={`flex items-center gap-3 p-4 rounded-lg border-2 ${config.bg} ${config.border} cursor-pointer transition-all hover:shadow-md`}
                onClick={() => onAlertClick?.(alert.id)}
              >
                {/* Icon */}
                <div className={`flex-shrink-0 ${config.iconColor}`}>
                  <Icon className="w-5 h-5" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`font-semibold ${config.titleColor}`}>
                      {alert.title}
                    </p>
                    {alert.daysRemaining !== undefined && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        alert.daysRemaining <= 1 
                          ? 'bg-red-200 text-red-800' 
                          : alert.daysRemaining <= 7 
                            ? 'bg-amber-200 text-amber-800'
                            : 'bg-gray-200 text-gray-800'
                      }`}>
                        {formatDaysRemaining(alert.daysRemaining)}
                      </span>
                    )}
                  </div>
                  <p className={`text-sm ${config.descColor}`}>
                    {alert.description}
                    {alert.college && <span className="font-medium"> - {alert.college}</span>}
                  </p>
                </div>

                {/* Action button */}
                {alert.action && (
                  <Button
                    variant={config.buttonVariant}
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (alert.action?.onClick) {
                        alert.action.onClick();
                      } else if (alert.action?.href) {
                        window.location.href = alert.action.href;
                      }
                    }}
                    className="flex-shrink-0"
                  >
                    {alert.action.label}
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
              </div>
            );
          })}

          {/* Show more if there are more alerts */}
          {urgentAlerts.length > 3 && (
            <p className="text-sm text-gray-600 text-center">
              +{urgentAlerts.length - 3} more urgent alerts
            </p>
          )}
        </div>
      )}

      {/* Info/success alerts (collapsed) */}
      {otherAlerts.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-900">
            <AlertCircle className="w-4 h-4" />
            {otherAlerts.length} other notification{otherAlerts.length > 1 ? 's' : ''}
          </summary>
          <div className="mt-2 space-y-2">
            {otherAlerts.map(alert => {
              const config = severityConfig[alert.severity];
              const Icon = config.icon;

              return (
                <div
                  key={alert.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${config.bg} ${config.border}`}
                >
                  <Icon className={`w-4 h-4 ${config.iconColor}`} />
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${config.titleColor}`}>{alert.title}</p>
                    <p className={`text-xs ${config.descColor}`}>{alert.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
};

export default UrgentAlerts;

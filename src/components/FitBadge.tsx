/**
 * FitBadge - Shows college fit classification (Reach/Target/Safety)
 * Requires pre-fetched fit data via `fitData` prop from the page-level batch call.
 * Does NOT make individual API calls — all fit data must come through the batch endpoint.
 */

import React from 'react';
import { Target, TrendingUp, Shield } from 'lucide-react';

interface FitBadgeProps {
  /** Fit category from the page-level batch call. Renders nothing when absent or unrecognised. */
  fitData?: string | null;
  className?: string;
}

const VALID_FIT_CATEGORIES = ['reach', 'target', 'safety'] as const;
type FitCategory = typeof VALID_FIT_CATEGORIES[number];

export const FitBadge: React.FC<FitBadgeProps> = ({ fitData, className = '' }) => {
  // Validate the provided fit category; render nothing if absent or unrecognised
  if (!fitData || !VALID_FIT_CATEGORIES.includes(fitData as FitCategory)) {
    return null;
  }

  const fit = fitData as FitCategory;

  const config: Record<FitCategory, { label: string; icon: React.ElementType; bgColor: string; textColor: string; borderColor: string }> = {
    reach: {
      label: 'Reach',
      icon: TrendingUp,
      bgColor: 'bg-red-100',
      textColor: 'text-red-700',
      borderColor: 'border-red-200'
    },
    target: {
      label: 'Target',
      icon: Target,
      bgColor: 'bg-yellow-100',
      textColor: 'text-yellow-700',
      borderColor: 'border-yellow-200'
    },
    safety: {
      label: 'Safety',
      icon: Shield,
      bgColor: 'bg-green-100',
      textColor: 'text-green-700',
      borderColor: 'border-green-200'
    }
  };

  const { label, icon: Icon, bgColor, textColor, borderColor } = config[fit];

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border ${bgColor} ${textColor} ${borderColor} ${className}`}>
      <Icon className="w-3 h-3" />
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
};

export default FitBadge;

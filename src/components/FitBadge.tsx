/**
 * FitBadge - Shows college fit classification (Reach/Target/Safety)
 * Fetches fit from API.fit.get() and displays with color coding
 */

import React, { useEffect, useState } from 'react';
import { Target, TrendingUp, Shield } from 'lucide-react';
import { api } from '@/services/api';

interface FitBadgeProps {
  collegeId: number;
  className?: string;
}

export const FitBadge: React.FC<FitBadgeProps> = ({ collegeId, className = '' }) => {
  const [fit, setFit] = useState<'reach' | 'target' | 'safety' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFit();
  }, [collegeId]);

  const fetchFit = async () => {
    try {
      const response = await api.fit.get(collegeId);
      if (response.success && response.data) {
        setFit(response.data.category || response.data.fit || null);
      }
    } catch (error) {
      console.error('Error fetching fit:', error);
      // Fail silently - fit is optional
    } finally {
      setLoading(false);
    }
  };

  if (loading || !fit) return null;

  const config = {
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

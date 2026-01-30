// src/components/chancing/ProfileStrength.tsx
// Shows student profile strength analysis

import React, { useEffect, useState } from 'react';
import { TrendingUp, AlertTriangle, CheckCircle, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { api } from '@/services/api';

interface Section {
  name: string;
  score: number;
  maxScore: number;
  percentage: number;
}

interface ProfileStrengthData {
  overallStrength: number;
  sections: Section[];
  recommendations: string[];
  profile: {
    gpa?: number;
    sat?: number;
    act?: number;
    activitiesCount: number;
    tier1Count: number;
    courseworkCount: number;
  };
}

export default function ProfileStrength() {
  const [data, setData] = useState<ProfileStrengthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStrength();
  }, []);

  const fetchStrength = async () => {
    try {
      setLoading(true);
      const response = await api.getProfileStrength();
      if (response.success) {
        setData(response.data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-red-500">
          {error}
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const getStrengthColor = (percentage: number) => {
    if (percentage >= 75) return 'text-green-600';
    if (percentage >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 75) return 'bg-green-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Profile Strength
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Strength */}
        <div className="text-center">
          <div className={`text-5xl font-bold ${getStrengthColor(data.overallStrength)}`}>
            {data.overallStrength}%
          </div>
          <p className="text-gray-500 mt-1">Overall Profile Strength</p>
        </div>

        {/* Sections */}
        <div className="space-y-4">
          {data.sections.map((section, index) => (
            <div key={index}>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium">{section.name}</span>
                <span className="text-sm text-gray-500">
                  {section.score}/{section.maxScore} ({section.percentage}%)
                </span>
              </div>
              <Progress 
                value={section.percentage} 
                className={`h-2 ${getProgressColor(section.percentage)}`}
              />
            </div>
          ))}
        </div>

        {/* Quick Stats */}
        {data.profile && (
          <div className="grid grid-cols-3 gap-4 text-center pt-4 border-t">
            {data.profile.gpa && (
              <div>
                <div className="text-2xl font-bold">{data.profile.gpa.toFixed(2)}</div>
                <div className="text-xs text-gray-500">GPA</div>
              </div>
            )}
            {data.profile.sat && (
              <div>
                <div className="text-2xl font-bold">{data.profile.sat}</div>
                <div className="text-xs text-gray-500">SAT</div>
              </div>
            )}
            {data.profile.act && (
              <div>
                <div className="text-2xl font-bold">{data.profile.act}</div>
                <div className="text-xs text-gray-500">ACT</div>
              </div>
            )}
            <div>
              <div className="text-2xl font-bold">{data.profile.activitiesCount}</div>
              <div className="text-xs text-gray-500">Activities</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">{data.profile.tier1Count}</div>
              <div className="text-xs text-gray-500">Tier 1</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{data.profile.courseworkCount}</div>
              <div className="text-xs text-gray-500">AP/IB</div>
            </div>
          </div>
        )}

        {/* Recommendations */}
        {data.recommendations && data.recommendations.length > 0 && (
          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Recommendations to Improve
            </h4>
            <ul className="space-y-2">
              {data.recommendations.map((rec, index) => (
                <li key={index} className="text-sm text-gray-600 flex items-start gap-2">
                  <span className="text-yellow-500">•</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

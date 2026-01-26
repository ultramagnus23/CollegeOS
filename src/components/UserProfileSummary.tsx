// src/components/UserProfileSummary.tsx
// Shows a summary of the user's academic profile on the college search page
// Displays GPA, SAT, ACT, subjects, activities in a compact format

import React from 'react';
import { User, BookOpen, Award, Activity, Target, DollarSign } from 'lucide-react';
import { StudentProfile } from '../types';

interface Props {
  profile: StudentProfile;
  compact?: boolean;
}

const UserProfileSummary: React.FC<Props> = ({ profile, compact = false }) => {
  // Extract scores
  const gpa = profile.currentGPA ? parseFloat(profile.currentGPA) : null;
  const sat = profile.satScore ? parseInt(profile.satScore) : null;
  const act = profile.actScore ? parseInt(profile.actScore) : null;
  const ib = profile.ibPredicted ? parseInt(profile.ibPredicted) : null;

  if (compact) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
        <div className="flex items-center gap-2 mb-3">
          <User className="w-5 h-5 text-blue-600" />
          <span className="font-semibold text-gray-900">{profile.name || 'Your Profile'}</span>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {gpa !== null && (
            <MetricBadge label="GPA" value={gpa.toFixed(2)} />
          )}
          {sat !== null && (
            <MetricBadge label="SAT" value={sat.toString()} />
          )}
          {act !== null && (
            <MetricBadge label="ACT" value={act.toString()} />
          )}
          {ib !== null && (
            <MetricBadge label="IB" value={ib.toString()} />
          )}
          {profile.preferredCountries && profile.preferredCountries.length > 0 && (
            <MetricBadge 
              label="Countries" 
              value={profile.preferredCountries.slice(0, 2).join(', ')} 
            />
          )}
          {profile.budgetRange && (
            <MetricBadge label="Budget" value={profile.budgetRange} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
            <User className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">{profile.name || 'Your Profile'}</h3>
            <p className="text-blue-100 text-sm">
              {profile.grade} • {profile.currentBoard}
            </p>
          </div>
        </div>
      </div>

      {/* Academic Metrics */}
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5 text-gray-600" />
          <h4 className="font-semibold text-gray-900">Academic Profile</h4>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {gpa !== null && (
            <MetricCard 
              label="GPA" 
              value={gpa.toFixed(2)} 
              subtext="/ 4.00"
              color="blue"
            />
          )}
          {sat !== null && (
            <MetricCard 
              label="SAT" 
              value={sat.toString()} 
              subtext="/ 1600"
              color="green"
            />
          )}
          {act !== null && (
            <MetricCard 
              label="ACT" 
              value={act.toString()} 
              subtext="/ 36"
              color="purple"
            />
          )}
          {ib !== null && (
            <MetricCard 
              label="IB Predicted" 
              value={ib.toString()} 
              subtext="/ 45"
              color="orange"
            />
          )}
        </div>

        {/* Subjects */}
        {profile.subjects && profile.subjects.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Subjects</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.subjects.map((subject, i) => (
                <span 
                  key={i}
                  className="px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-full"
                >
                  {subject}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Interests & Majors */}
        {profile.potentialMajors && profile.potentialMajors.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Intended Majors</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.potentialMajors.map((major, i) => (
                <span 
                  key={i}
                  className="px-3 py-1 bg-green-50 text-green-700 text-sm rounded-full"
                >
                  {major}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Activities */}
        {profile.activities && profile.activities.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Extracurriculars</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.activities.slice(0, 6).map((activity, i) => (
                <span 
                  key={i}
                  className="px-3 py-1 bg-purple-50 text-purple-700 text-sm rounded-full"
                >
                  {activity}
                </span>
              ))}
              {profile.activities.length > 6 && (
                <span className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded-full">
                  +{profile.activities.length - 6} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Awards */}
        {profile.awards && profile.awards.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Awards & Achievements</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.awards.slice(0, 4).map((award, i) => (
                <span 
                  key={i}
                  className="px-3 py-1 bg-amber-50 text-amber-700 text-sm rounded-full"
                >
                  {award}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Preferences */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
          {profile.preferredCountries && profile.preferredCountries.length > 0 && (
            <div>
              <span className="text-sm text-gray-500">Preferred Countries</span>
              <p className="font-medium text-gray-900">
                {profile.preferredCountries.join(', ')}
              </p>
            </div>
          )}
          {profile.budgetRange && (
            <div>
              <span className="text-sm text-gray-500">Budget Range</span>
              <p className="font-medium text-gray-900 flex items-center gap-1">
                <DollarSign className="w-4 h-4" />
                {profile.budgetRange}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper component for compact metric badges
const MetricBadge: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-white rounded-lg px-3 py-2 border border-blue-100">
    <span className="text-xs text-gray-500">{label}</span>
    <p className="font-semibold text-gray-900">{value}</p>
  </div>
);

// Helper component for full metric cards
const MetricCard: React.FC<{ 
  label: string; 
  value: string; 
  subtext?: string;
  color: 'blue' | 'green' | 'purple' | 'orange';
}> = ({ label, value, subtext, color }) => {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-100',
    green: 'bg-green-50 border-green-100',
    purple: 'bg-purple-50 border-purple-100',
    orange: 'bg-orange-50 border-orange-100'
  };

  return (
    <div className={`rounded-lg p-4 border ${colorClasses[color]}`}>
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
        {subtext && <span className="text-sm text-gray-500">{subtext}</span>}
      </div>
    </div>
  );
};

export default UserProfileSummary;

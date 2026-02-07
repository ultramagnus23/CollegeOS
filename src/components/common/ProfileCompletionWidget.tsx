/**
 * ProfileCompletionWidget
 * Displays profile completion status with progress bar and missing fields
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, CheckCircle, ChevronRight, Loader2 } from 'lucide-react';

interface CompletionStatus {
  percentage: number;
  missing_critical: string[];
  missing_optional: string[];
  has_subjects: boolean;
  has_activities: boolean;
  filled_critical: number;
  total_critical: number;
  filled_optional: number;
  total_optional: number;
}

// Mapping of field names to settings sections
const FIELD_TO_SECTION: { [key: string]: { section: string; hash: string } } = {
  'First Name': { section: 'basic', hash: '#basic' },
  'Last Name': { section: 'basic', hash: '#basic' },
  'Email': { section: 'basic', hash: '#basic' },
  'Phone Number': { section: 'basic', hash: '#basic' },
  'Country': { section: 'basic', hash: '#basic' },
  'Graduation Year': { section: 'basic', hash: '#basic' },
  'Curriculum Type': { section: 'academic', hash: '#academic' },
  'Subjects': { section: 'academic', hash: '#academic' },
  'GPA (Weighted)': { section: 'academic', hash: '#academic' },
  'GPA (Unweighted)': { section: 'academic', hash: '#academic' },
  'School Name': { section: 'academic', hash: '#academic' },
  'SAT Score': { section: 'testScores', hash: '#test-scores' },
  'ACT Score': { section: 'testScores', hash: '#test-scores' },
  'IELTS Score': { section: 'testScores', hash: '#test-scores' },
  'TOEFL Score': { section: 'testScores', hash: '#test-scores' },
  'Activities': { section: 'activities', hash: '#activities' },
  'College Size Preference': { section: 'preferences', hash: '#preferences' },
  'Campus Setting Preference': { section: 'preferences', hash: '#preferences' },
  'Date of Birth': { section: 'basic', hash: '#basic' }
};

interface ProfileCompletionWidgetProps {
  variant?: 'full' | 'compact' | 'mini';
  showMissingFields?: boolean;
  onRefresh?: () => void;
}

const ProfileCompletionWidget: React.FC<ProfileCompletionWidgetProps> = ({ 
  variant = 'full',
  showMissingFields = true,
  onRefresh
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<CompletionStatus | null>(null);

  useEffect(() => {
    if (user?.id) {
      loadCompletionStatus();
    }
  }, [user?.id]);

  const loadCompletionStatus = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      const response = await api.getCompletionStatus(user.id);
      setStatus(response.data);
    } catch (error) {
      console.error('Failed to load completion status:', error);
    }
    setLoading(false);
  };

  // Expose refresh function
  useEffect(() => {
    if (onRefresh) {
      // Allow parent to trigger refresh
    }
  }, [onRefresh]);

  const handleFieldClick = (fieldName: string) => {
    const mapping = FIELD_TO_SECTION[fieldName];
    if (mapping) {
      navigate(`/settings${mapping.hash}`);
    } else {
      navigate('/settings');
    }
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-green-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-orange-500';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!status) {
    return null;
  }

  // Mini variant - just the percentage and a small bar
  if (variant === 'mini') {
    return (
      <div className="flex items-center gap-2 w-full">
        <div className="flex-1">
          <Progress value={status.percentage} className="h-2" />
        </div>
        <span className="text-sm font-medium text-gray-600">{status.percentage}%</span>
      </div>
    );
  }

  // Compact variant - progress bar with brief info
  if (variant === 'compact') {
    return (
      <div 
        className="p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-blue-300 transition-colors"
        onClick={() => navigate('/settings')}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Profile Completion</span>
          <span className={`text-sm font-bold ${status.percentage >= 80 ? 'text-green-600' : status.percentage >= 50 ? 'text-yellow-600' : 'text-orange-600'}`}>
            {status.percentage}%
          </span>
        </div>
        <Progress value={status.percentage} className="h-2" />
        {status.missing_critical.length > 0 && (
          <div className="mt-2 text-xs text-orange-600 flex items-center gap-1">
            <AlertCircle size={12} />
            {status.missing_critical.length} critical field{status.missing_critical.length > 1 ? 's' : ''} missing
          </div>
        )}
      </div>
    );
  }

  // Full variant - complete widget with all details
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Profile Completion</h3>
        <span className={`text-2xl font-bold ${status.percentage >= 80 ? 'text-green-600' : status.percentage >= 50 ? 'text-yellow-600' : 'text-orange-600'}`}>
          {status.percentage}%
        </span>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${getProgressColor(status.percentage)}`}
            style={{ width: `${status.percentage}%` }}
          />
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Your profile is {status.percentage}% complete
        </p>
      </div>

      {/* Missing Fields */}
      {showMissingFields && (status.missing_critical.length > 0 || status.missing_optional.length > 0) && (
        <div className="border-t border-gray-100 pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">To improve your profile:</h4>
          
          {/* Critical Fields */}
          {status.missing_critical.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-medium text-orange-600 uppercase tracking-wider mb-2">
                Important
              </div>
              <div className="space-y-1">
                {status.missing_critical.slice(0, 5).map((field) => (
                  <button
                    key={field}
                    onClick={() => handleFieldClick(field)}
                    className="w-full flex items-center justify-between p-2 text-left text-sm text-gray-700 hover:bg-orange-50 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <AlertCircle size={14} className="text-orange-500" />
                      <span>{field}</span>
                    </div>
                    <ChevronRight size={14} className="text-gray-400 group-hover:text-orange-500" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Optional Fields */}
          {status.missing_optional.length > 0 && (
            <div>
              <div className="text-xs font-medium text-blue-600 uppercase tracking-wider mb-2">
                Good to have
              </div>
              <div className="space-y-1">
                {status.missing_optional.slice(0, 3).map((field) => (
                  <button
                    key={field}
                    onClick={() => handleFieldClick(field)}
                    className="w-full flex items-center justify-between p-2 text-left text-sm text-gray-600 hover:bg-blue-50 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300" />
                      <span>{field}</span>
                    </div>
                    <ChevronRight size={14} className="text-gray-400 group-hover:text-blue-500" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Completion Message */}
      {status.percentage >= 100 && (
        <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg text-green-700">
          <CheckCircle size={18} />
          <span className="text-sm font-medium">Your profile is complete!</span>
        </div>
      )}
    </div>
  );
};

export default ProfileCompletionWidget;

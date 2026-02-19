import { CheckCircle, AlertCircle, AlertTriangle, ExternalLink } from 'lucide-react';

interface DataFreshnessIndicatorProps {
  lastUpdated: string | Date;
  sourceUrl?: string;
  collegeName?: string;
}

/**
 * Component to display data freshness with color-coded indicators
 * Implements TASK 3 from problem statement
 */
export const DataFreshnessIndicator = ({ 
  lastUpdated, 
  sourceUrl, 
  collegeName 
}: DataFreshnessIndicatorProps) => {
  const lastUpdatedDate = new Date(lastUpdated);
  const now = new Date();
  const ageInDays = Math.floor((now.getTime() - lastUpdatedDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Determine color and icon based on age
  let color = '';
  let bgColor = '';
  let icon = null;
  let text = '';
  let showVerifyButton = false;
  
  if (ageInDays <= 7) {
    color = 'text-green-700';
    bgColor = 'bg-green-50 border-green-200';
    icon = <CheckCircle size={16} className="text-green-600" />;
    text = '✓ Information last verified: ' + formatDate(lastUpdatedDate) + ' - Data is current';
  } else if (ageInDays <= 30) {
    color = 'text-yellow-700';
    bgColor = 'bg-yellow-50 border-yellow-200';
    icon = <AlertTriangle size={16} className="text-yellow-600" />;
    text = '⚠ Information last verified: ' + formatDate(lastUpdatedDate) + ' - May need verification';
  } else {
    color = 'text-red-700';
    bgColor = 'bg-red-50 border-red-200';
    icon = <AlertCircle size={16} className="text-red-600" />;
    text = '⚠ Information last verified: ' + formatDate(lastUpdatedDate) + ' - Please verify on college website';
    showVerifyButton = true;
  }
  
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${bgColor}`}>
      <div className="flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${color} font-medium`}>
          {text}
        </p>
        {sourceUrl && (
          <div className="mt-2 flex items-center gap-4">
            <a 
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:text-blue-800 flex items-center gap-1"
            >
              <span>Source: {collegeName || 'College Official Page'}</span>
              <ExternalLink size={14} />
            </a>
          </div>
        )}
        {showVerifyButton && sourceUrl && (
          <div className="mt-2">
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-card border border-red-300 text-red-700 text-sm font-medium rounded hover:bg-red-50 transition-colors"
            >
              Verify Now
              <ExternalLink size={14} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  const options: Intl.DateTimeFormatOptions = { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  };
  return date.toLocaleDateString('en-US', options);
}

/**
 * Calculate relative time ago
 */
export function getRelativeTimeAgo(date: Date | string): string {
  const dateObj = new Date(date);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 604800)} weeks ago`;
  return formatDate(dateObj);
}

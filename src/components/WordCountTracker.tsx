import { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

interface WordCountTrackerProps {
  text: string;
  wordLimit?: number;
  characterLimit?: number;
  limitType?: 'words' | 'characters';
  onLimitExceeded?: (exceeded: boolean) => void;
  className?: string;
}

/**
 * Real-time word and character count tracker
 * Implements TASK 7 from problem statement
 */
export const WordCountTracker = ({
  text,
  wordLimit,
  characterLimit,
  limitType = 'words',
  onLimitExceeded,
  className = ''
}: WordCountTrackerProps) => {
  const [wordCount, setWordCount] = useState(0);
  const [characterCount, setCharacterCount] = useState(0);
  const [characterCountNoSpaces, setCharacterCountNoSpaces] = useState(0);
  
  useEffect(() => {
    // Calculate word count
    const words = text.split(/\s+/).filter(word => word.length > 0);
    setWordCount(words.length);
    
    // Calculate character counts
    setCharacterCount(text.length);
    setCharacterCountNoSpaces(text.replace(/\s/g, '').length);
  }, [text]);
  
  // Determine which limit to use
  const limit = limitType === 'words' ? wordLimit : characterLimit;
  const currentCount = limitType === 'words' ? wordCount : characterCount;
  
  if (!limit) {
    // No limit set, show basic counts
    return (
      <div className={`text-sm text-gray-600 ${className}`}>
        <span>{wordCount} words</span>
        <span className="mx-2">•</span>
        <span>{characterCount} characters</span>
      </div>
    );
  }
  
  // Calculate percentage
  const percentage = (currentCount / limit) * 100;
  
  // Determine color based on percentage
  let color = '';
  let bgColor = '';
  let textColor = '';
  let showWarning = false;
  
  if (percentage < 90) {
    color = 'text-green-600';
    bgColor = 'bg-green-50';
    textColor = 'text-green-700';
  } else if (percentage >= 90 && percentage <= 100) {
    color = 'text-yellow-600';
    bgColor = 'bg-yellow-50';
    textColor = 'text-yellow-700';
  } else {
    color = 'text-red-600';
    bgColor = 'bg-red-50';
    textColor = 'text-red-700';
    showWarning = true;
  }
  
  // Notify parent component if limit is exceeded
  useEffect(() => {
    if (onLimitExceeded) {
      onLimitExceeded(percentage > 100);
    }
  }, [percentage, onLimitExceeded]);
  
  const displayText = limitType === 'words' 
    ? `${wordCount}/${limit} words` 
    : `${characterCount}/${limit} characters`;
  
  return (
    <div className={`${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className={`flex items-center gap-2 text-sm font-medium ${color}`}>
          <span>{displayText}</span>
          <span className="text-gray-400">({percentage.toFixed(0)}%)</span>
        </div>
        
        {/* Progress bar */}
        <div className="flex-1 max-w-xs h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              percentage < 90 ? 'bg-green-500' :
              percentage <= 100 ? 'bg-yellow-500' :
              'bg-red-500'
            }`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </div>
      
      {/* Warning message */}
      {showWarning && (
        <div className={`mt-2 flex items-start gap-2 p-2 rounded ${bgColor}`}>
          <AlertCircle size={16} className={`flex-shrink-0 mt-0.5 ${color}`} />
          <p className={`text-sm ${textColor}`}>
            You have exceeded the {limitType === 'words' ? 'word' : 'character'} limit. 
            Please reduce your text to {limit} {limitType === 'words' ? 'words' : 'characters'} or less.
          </p>
        </div>
      )}
      
      {/* Additional counts for reference */}
      {limitType === 'words' && (
        <div className="mt-1 text-xs text-gray-500">
          {characterCount} characters ({characterCountNoSpaces} without spaces)
        </div>
      )}
      {limitType === 'characters' && (
        <div className="mt-1 text-xs text-gray-500">
          {wordCount} words • {characterCountNoSpaces} characters (no spaces)
        </div>
      )}
    </div>
  );
};

/**
 * Hook for managing essay input with word count
 */
export const useWordCount = (initialText: string = '') => {
  const [text, setText] = useState(initialText);
  const [isOverLimit, setIsOverLimit] = useState(false);
  
  const handleTextChange = (newText: string) => {
    setText(newText);
  };
  
  const handleLimitExceeded = (exceeded: boolean) => {
    setIsOverLimit(exceeded);
  };
  
  return {
    text,
    setText: handleTextChange,
    isOverLimit,
    handleLimitExceeded
  };
};

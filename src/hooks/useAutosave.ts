/**
 * useAutosave Hook
 * Automatically saves form data to localStorage to prevent data loss
 */
import { useState, useEffect, useCallback, useRef } from 'react';

interface AutosaveOptions {
  /** Key prefix for localStorage */
  key: string;
  /** Debounce delay in milliseconds (default: 3000) */
  debounceMs?: number;
  /** Auto-save interval in milliseconds (default: 30000) */
  intervalMs?: number;
  /** Enable autosave (default: true) */
  enabled?: boolean;
}

interface DraftData<T> {
  data: T;
  timestamp: number;
  version: number;
}

interface UseAutosaveReturn<T> {
  /** Whether a draft exists */
  hasDraft: boolean;
  /** The saved draft data */
  draftData: T | null;
  /** Timestamp of the saved draft */
  draftTimestamp: Date | null;
  /** Save current data to draft */
  saveDraft: (data: T) => void;
  /** Clear the saved draft */
  clearDraft: () => void;
  /** Restore draft data */
  restoreDraft: () => T | null;
  /** Whether autosave is active */
  isAutosaving: boolean;
  /** Last save time */
  lastSaved: Date | null;
}

const DRAFT_VERSION = 1;

/**
 * Hook for auto-saving form data to localStorage
 */
export function useAutosave<T>(
  formData: T,
  options: AutosaveOptions
): UseAutosaveReturn<T> {
  const { 
    key, 
    debounceMs = 3000, 
    intervalMs = 30000,
    enabled = true 
  } = options;

  const storageKey = `draft-${key}`;
  const [hasDraft, setHasDraft] = useState(false);
  const [draftData, setDraftData] = useState<T | null>(null);
  const [draftTimestamp, setDraftTimestamp] = useState<Date | null>(null);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastDataRef = useRef<T>(formData);

  // Load existing draft on mount
  useEffect(() => {
    const storedDraft = localStorage.getItem(storageKey);
    if (storedDraft) {
      try {
        const parsed: DraftData<T> = JSON.parse(storedDraft);
        if (parsed.version === DRAFT_VERSION) {
          setHasDraft(true);
          setDraftData(parsed.data);
          setDraftTimestamp(new Date(parsed.timestamp));
        }
      } catch (error) {
        console.error('Failed to parse draft:', error);
        localStorage.removeItem(storageKey);
      }
    }
  }, [storageKey]);

  // Save draft to localStorage
  const saveDraft = useCallback((data: T) => {
    if (!enabled) return;
    
    setIsAutosaving(true);
    const draftToSave: DraftData<T> = {
      data,
      timestamp: Date.now(),
      version: DRAFT_VERSION
    };
    
    try {
      localStorage.setItem(storageKey, JSON.stringify(draftToSave));
      setHasDraft(true);
      setDraftData(data);
      setDraftTimestamp(new Date(draftToSave.timestamp));
      setLastSaved(new Date());
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
    
    setIsAutosaving(false);
  }, [storageKey, enabled]);

  // Clear draft from localStorage
  const clearDraft = useCallback(() => {
    localStorage.removeItem(storageKey);
    setHasDraft(false);
    setDraftData(null);
    setDraftTimestamp(null);
    setLastSaved(null);
  }, [storageKey]);

  // Restore draft data
  const restoreDraft = useCallback((): T | null => {
    const storedDraft = localStorage.getItem(storageKey);
    if (storedDraft) {
      try {
        const parsed: DraftData<T> = JSON.parse(storedDraft);
        if (parsed.version === DRAFT_VERSION) {
          return parsed.data;
        }
      } catch (error) {
        console.error('Failed to restore draft:', error);
      }
    }
    return null;
  }, [storageKey]);

  // Debounced save on data change
  useEffect(() => {
    if (!enabled) return;

    // Check if data actually changed
    const dataChanged = JSON.stringify(formData) !== JSON.stringify(lastDataRef.current);
    if (!dataChanged) return;
    
    lastDataRef.current = formData;

    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set new timeout for debounced save
    debounceTimeoutRef.current = setTimeout(() => {
      saveDraft(formData);
    }, debounceMs);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [formData, debounceMs, enabled, saveDraft]);

  // Interval-based save
  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    intervalRef.current = setInterval(() => {
      if (lastDataRef.current) {
        saveDraft(lastDataRef.current);
      }
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [intervalMs, enabled, saveDraft]);

  return {
    hasDraft,
    draftData,
    draftTimestamp,
    saveDraft,
    clearDraft,
    restoreDraft,
    isAutosaving,
    lastSaved
  };
}

/**
 * DraftRestoreBanner Component
 * Shows a banner when a draft is available
 */
interface DraftRestoreBannerProps {
  timestamp: Date;
  onRestore: () => void;
  onDiscard: () => void;
}

export const DraftRestoreBanner: React.FC<DraftRestoreBannerProps> = ({
  timestamp,
  onRestore,
  onDiscard
}) => {
  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'just now';
  };

  return (
    <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
      <div className="flex items-center gap-2 text-amber-800">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="text-sm">
          You have unsaved changes from {formatTimestamp(timestamp)}.
        </span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onRestore}
          className="px-3 py-1 text-sm font-medium text-amber-700 hover:bg-amber-100 rounded transition-colors"
        >
          Restore
        </button>
        <button
          onClick={onDiscard}
          className="px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors"
        >
          Discard
        </button>
      </div>
    </div>
  );
};

import React from 'react';

export default useAutosave;

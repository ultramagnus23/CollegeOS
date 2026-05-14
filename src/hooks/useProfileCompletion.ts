import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

export interface ProfileCompletionResult {
  completionPercent: number;
  completedFields: string[];
  missingFields: string[];
  loading: boolean;
  refetch: () => void;
}

/**
 * Single source of truth for profile completion percentage.
 * Calls GET /api/profile/completion which reads from the DB and writes
 * the result back to student_profiles.profile_completion_percentage.
 */
export function useProfileCompletion(): ProfileCompletionResult {
  const [completionPercent, setCompletionPercent] = useState(0);
  const [completedFields, setCompletedFields] = useState<string[]>([]);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getProfileCompletion();
      if (res?.success && res?.data) {
        setCompletionPercent(res.data.completionPercent ?? 0);
        setCompletedFields(res.data.completedFields ?? []);
        setMissingFields(res.data.missingFields ?? []);
      }
    } catch {
      // Non-fatal: keep existing state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const onProfileUpdated = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        fetch();
      }, 250);
    };
    window.addEventListener('profile:updated', onProfileUpdated);
    return () => {
      if (timeout) clearTimeout(timeout);
      window.removeEventListener('profile:updated', onProfileUpdated);
    };
  }, [fetch]);

  return { completionPercent, completedFields, missingFields, loading, refetch: fetch };
}

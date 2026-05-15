import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  CanonicalProfile,
  canonicalPartialProfileSchema,
  normalizeApiProfileToCanonical,
} from '@/types/profile';
import {
  fetchCanonicalProfile,
  getCanonicalProfileCache,
  saveCanonicalProfile,
  setCanonicalProfileCache,
} from '@/services/profilePipeline';
import { clearRecommendationCache } from '@/services/recommendationService';
import { logProfileTelemetry } from '@/lib/profileTelemetry';

export type UserProfileData = CanonicalProfile;

interface UseUserProfileResult {
  profile: UserProfileData | null;
  loading: boolean;
  error: string | null;
  profileLastFetched: Date | null;
  fetchProfile: () => Promise<void>;
  saveProfile: (data: Partial<UserProfileData>) => Promise<UserProfileData | null>;
  refetch: () => Promise<void>;
  updateProfile: (data: Partial<UserProfileData>) => Promise<UserProfileData | null>;
}

export function useUserProfile(): UseUserProfileResult {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfileData | null>(getCanonicalProfileCache());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileLastFetched, setProfileLastFetched] = useState<Date | null>(null);
  const fetchSeqRef = useRef(0);
  const saveSeqRef = useRef(0);
  const mountedRef = useRef(true);
  const fetchControllerRef = useRef<AbortController | null>(null);
  const saveControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      fetchControllerRef.current?.abort();
      saveControllerRef.current?.abort();
    };
  }, []);

  const fetchProfile = useCallback(async () => {
    if (!user?.id) {
      if (mountedRef.current) {
        setLoading(false);
      }
      return;
    }

    const seq = ++fetchSeqRef.current;
    fetchControllerRef.current?.abort();
    fetchControllerRef.current = new AbortController();

    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      const canonical = await fetchCanonicalProfile({ signal: fetchControllerRef.current.signal });

      if (!mountedRef.current || seq !== fetchSeqRef.current) {
        logProfileTelemetry({
          event: 'profile_hydration_mismatch',
          userId: user.id,
          message: 'Discarded stale profile fetch response',
        });
        return;
      }

      setCanonicalProfileCache(canonical);
      setProfile(canonical);
      setProfileLastFetched(new Date());
      clearRecommendationCache();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to load profile';
      if (mountedRef.current && seq === fetchSeqRef.current) {
        setError(message);
      }
    } finally {
      if (mountedRef.current && seq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    const onProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ profile?: unknown }>).detail;
      if (!detail?.profile) return;
      try {
        const normalized = normalizeApiProfileToCanonical(detail.profile);
        setCanonicalProfileCache(normalized);
        setProfile(normalized);
        setProfileLastFetched(new Date());
        clearRecommendationCache();
      } catch (error) {
        logProfileTelemetry({
          event: 'profile_hydration_mismatch',
          userId: user?.id ?? null,
          message: error instanceof Error ? error.message : 'Failed to normalize profile:updated payload',
        });
      }
    };

    window.addEventListener('profile:updated', onProfileUpdated);
    return () => window.removeEventListener('profile:updated', onProfileUpdated);
  }, [user?.id]);

  const saveProfile = useCallback(async (data: Partial<UserProfileData>): Promise<UserProfileData | null> => {
    if (!user?.id) return null;

    const saveSeq = ++saveSeqRef.current;
    saveControllerRef.current?.abort();
    saveControllerRef.current = new AbortController();
    try {
      const validated = canonicalPartialProfileSchema.parse(data);
      const saved = await saveCanonicalProfile(validated, {
        userId: user.id,
        expectedVersion: profile?.version,
        signal: saveControllerRef.current.signal,
      });
      if (!mountedRef.current || saveSeq !== saveSeqRef.current) {
        return null;
      }
      setCanonicalProfileCache(saved);
      setProfile(saved);
      setProfileLastFetched(new Date());
      clearRecommendationCache();
      setError(null);
      return saved;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return null;
      }
      const message = err instanceof Error ? err.message : 'Failed to update profile';
      if (mountedRef.current && saveSeq === saveSeqRef.current) {
        setError(message);
      }
      return null;
    }
  }, [user?.id, profile?.version]);

  const updateProfile = saveProfile;

  return {
    profile,
    loading,
    error,
    profileLastFetched,
    fetchProfile,
    saveProfile,
    refetch: fetchProfile,
    updateProfile,
  };
}

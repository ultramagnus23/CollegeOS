// src/hooks/useUserProfile.ts
// Shared hook for fetching and updating the student profile from the DB.
// Used by both the onboarding flow and the chancing calculator to ensure
// a single source of truth: the `student_profiles` row in the backend.

import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export interface UserProfileData {
  id?: number;
  user_id?: number;
  first_name?: string;
  last_name?: string;
  country?: string;
  gpa_unweighted?: number | null;
  gpa_weighted?: number | null;
  board_exam_percentage?: number | null;
  sat_total?: number | null;
  act_composite?: number | null;
  ib_predicted_score?: number | null;
  intended_majors?: string[];
  preferred_countries?: string[];
  preferred_college_size?: string | null;
  preferred_setting?: string | null;
  career_goals?: string | null;
  why_college?: string | null;
  extracurriculars?: any[];
  preferred_majors?: string[];
  streams?: string[];
  target_countries?: string[];
  budget_inr?: number | null;
  budget_currency?: string;
  traits?: string[];
  sat_score?: number | null;
  gpa?: number | null;
  profile_completion_score?: number;
  onboarding_step?: number;
  profile_completion_percentage?: number;
  [key: string]: any;
}

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
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileLastFetched, setProfileLastFetched] = useState<Date | null>(null);

  const buildDefaultProfile = useCallback((): UserProfileData => ({
    user_id: user?.id,
    profile_completion_score: 0,
    budget_currency: 'INR',
    traits: [],
    activities: [],
    streams: [],
    preferred_majors: [],
    target_countries: [],
  }), [user?.id]);

  const isFilledField = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
    return true;
  };

  const computeProfileCompletionScore = (mergedProfile: Partial<UserProfileData>): number => {
    const required: Record<string, unknown> = {
      gpa: mergedProfile.gpa ?? mergedProfile.gpa_unweighted ?? mergedProfile.board_exam_percentage,
      sat_score: mergedProfile.sat_score ?? mergedProfile.sat_total,
      preferred_majors: mergedProfile.preferred_majors ?? mergedProfile.intended_majors,
      streams: mergedProfile.streams,
      target_countries: mergedProfile.target_countries ?? mergedProfile.preferred_countries,
      budget_inr: mergedProfile.budget_inr,
      traits: mergedProfile.traits,
      activities: mergedProfile.activities ?? mergedProfile.extracurriculars,
    };
    const filled = Object.values(required).filter(isFilledField).length;
    return Math.round((filled / Object.keys(required).length) * 100);
  };

  const fetchProfile = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      setLoading(true);
      setError(null);
      const res = await api.getExtendedProfile();
      const data = (res as any)?.data ?? res;
      if (!data || (Array.isArray(data) && data.length === 0)) {
        const defaultProfile = buildDefaultProfile();
        const inserted = await api.saveExtendedProfile(defaultProfile);
        const insertedData = (inserted as any)?.data ?? inserted ?? defaultProfile;
        setProfile(insertedData);
      } else {
        setProfile(data);
      }
      setProfileLastFetched(new Date());
    } catch (err: any) {
      const code = err?.code || err?.details?.code;
      const message = String(err?.message || err?.details?.message || '');
      const isZeroRowError = code === 'PGRST116' || message.includes('PGRST116');
      if (isZeroRowError) {
        try {
          const defaultProfile = buildDefaultProfile();
          const inserted = await api.saveExtendedProfile(defaultProfile);
          const insertedData = (inserted as any)?.data ?? inserted ?? defaultProfile;
          setProfile(insertedData);
          setProfileLastFetched(new Date());
          setError(null);
          return;
        } catch (insertErr: any) {
          setError(insertErr?.message || 'Failed to initialize default profile');
        }
      } else {
        setError(err?.message || 'Failed to load profile');
        setProfile(buildDefaultProfile());
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id, buildDefaultProfile]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const saveProfile = useCallback(async (data: Partial<UserProfileData>): Promise<UserProfileData | null> => {
    if (!user?.id) return null;
    try {
      const merged = { ...(profile || buildDefaultProfile()), ...data };
      const profileCompletionScore = computeProfileCompletionScore(merged);
      const payload = {
        ...data,
        profile_completion_score: profileCompletionScore,
      };
      const res = await api.saveExtendedProfile(payload);
      const updated = (res as any)?.data ?? res;
      setProfile(updated ?? null);
      setProfileLastFetched(new Date());
      return updated;
    } catch (err: any) {
      setError(err?.message || 'Failed to update profile');
      return null;
    }
  }, [user?.id, profile, buildDefaultProfile]);

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

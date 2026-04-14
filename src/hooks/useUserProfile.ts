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
  onboarding_step?: number;
  profile_completion_percentage?: number;
  [key: string]: any;
}

interface UseUserProfileResult {
  profile: UserProfileData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateProfile: (data: Partial<UserProfileData>) => Promise<UserProfileData | null>;
}

export function useUserProfile(): UseUserProfileResult {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      setLoading(true);
      setError(null);
      const res = await api.getExtendedProfile();
      const data = (res as any)?.data ?? res;
      setProfile(data ?? null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const updateProfile = useCallback(async (data: Partial<UserProfileData>): Promise<UserProfileData | null> => {
    if (!user?.id) return null;
    try {
      const res = await api.saveExtendedProfile(data);
      const updated = (res as any)?.data ?? res;
      setProfile(updated ?? null);
      return updated;
    } catch (err: any) {
      setError(err?.message || 'Failed to update profile');
      return null;
    }
  }, [user?.id]);

  return { profile, loading, error, refetch: fetchProfile, updateProfile };
}

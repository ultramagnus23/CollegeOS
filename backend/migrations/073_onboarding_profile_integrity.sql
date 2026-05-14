-- Migration: 073_onboarding_profile_integrity.sql
-- Adds onboarding/profile persistence columns required by the upgraded onboarding flow.

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS custom_majors JSON,
  ADD COLUMN IF NOT EXISTS custom_subjects JSON,
  ADD COLUMN IF NOT EXISTS trait_weights JSON,
  ADD COLUMN IF NOT EXISTS trait_profile JSON,
  ADD COLUMN IF NOT EXISTS curriculum_type_other TEXT;

CREATE INDEX IF NOT EXISTS idx_student_profiles_curriculum_other
  ON student_profiles(curriculum_type_other);

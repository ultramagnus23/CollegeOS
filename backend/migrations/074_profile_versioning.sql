-- Migration: 074_profile_versioning.sql
-- Adds profile versioning and request tracing columns for optimistic concurrency.

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS profile_version INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_profile_request_id TEXT;

CREATE INDEX IF NOT EXISTS idx_student_profiles_profile_version
  ON student_profiles(user_id, profile_version);

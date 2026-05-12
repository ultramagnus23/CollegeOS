-- Migration: 072_user_profiles_suggestions.sql
-- ---------------------------------------------------------------------------
-- Creates two tables for persisting student profiles and ML suggestions
-- so they survive Redis restarts and server cold starts.
-- ---------------------------------------------------------------------------

-- ── user_profiles ──────────────────────────────────────────────────────────
-- One row per user.  student_profile stores the ML feature fields as JSONB
-- (satScore, actScore, gpaUnweighted, gpaWeighted, essayQuality, etc.).

CREATE TABLE IF NOT EXISTS user_profiles (
  id              SERIAL PRIMARY KEY,
  user_id         VARCHAR(255) UNIQUE NOT NULL,
  student_profile JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id
  ON user_profiles (user_id);

-- Automatically update updated_at on every row change.
CREATE OR REPLACE FUNCTION update_user_profiles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_user_profiles_updated_at();

-- ── user_suggestions ───────────────────────────────────────────────────────
-- One row per user.  suggestions is the last ML response from HuggingFace
-- (or the DB fallback).  Survives Redis cache invalidation.

CREATE TABLE IF NOT EXISTS user_suggestions (
  id            SERIAL PRIMARY KEY,
  user_id       VARCHAR(255) UNIQUE NOT NULL,
  suggestions   JSONB,
  generated_at  TIMESTAMPTZ DEFAULT NOW(),
  is_fallback   BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_user_suggestions_user_id
  ON user_suggestions (user_id);

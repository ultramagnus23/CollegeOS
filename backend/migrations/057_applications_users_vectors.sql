-- Migration 057: Add missing columns to applications, users, and colleges tables
--
-- Run in Supabase SQL editor (or via psql) before deploying the updated backend.
-- All statements use IF NOT EXISTS so they are safe to re-run.

-- 1. Applications table — columns the backend already references
ALTER TABLE applications ADD COLUMN IF NOT EXISTS application_type VARCHAR(50) DEFAULT 'regular';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS status          VARCHAR(50) DEFAULT 'planning';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS notes           TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS deadline        DATE;

-- 2. Users table — onboarding / profile fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_data      JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_score        INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gpa                  DECIMAL(3,2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS sat_score            INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS act_score            INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS intended_major       VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS budget               INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_location   TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS extracurriculars     JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS essays_started       BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preference_vector    JSONB;

-- 3. Colleges table — feature vector for cosine-similarity recommendations
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS feature_vector    JSONB;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS vector_updated_at TIMESTAMPTZ;

-- Same columns on colleges_comprehensive (primary read table used by the app)
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS feature_vector    JSONB;
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS vector_updated_at TIMESTAMPTZ;

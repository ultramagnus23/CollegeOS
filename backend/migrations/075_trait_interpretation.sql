-- Migration: 075_trait_interpretation.sql
-- Stores computed semantic trait interpretation for downstream AI/analytics consumers.

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS trait_interpretation JSON;

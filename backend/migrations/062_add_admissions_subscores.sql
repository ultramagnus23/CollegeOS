-- Migration: 062_add_admissions_subscores.sql
-- Add SAT sub-scores and ACT sub-scores / mid-point to college_admissions.

ALTER TABLE college_admissions
  ADD COLUMN IF NOT EXISTS sat_verbal_25  SMALLINT,
  ADD COLUMN IF NOT EXISTS sat_verbal_75  SMALLINT,
  ADD COLUMN IF NOT EXISTS sat_math_25    SMALLINT,
  ADD COLUMN IF NOT EXISTS sat_math_75    SMALLINT,
  ADD COLUMN IF NOT EXISTS act_25         SMALLINT,
  ADD COLUMN IF NOT EXISTS act_75         SMALLINT,
  ADD COLUMN IF NOT EXISTS act_mid        SMALLINT;

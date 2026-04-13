-- Migration: 064_college_majors_completions_pct.sql
-- Add completions_pct (raw Scorecard PCIP value) to the college_majors junction table.
-- e.g. 0.1487 means 14.87 % of degrees awarded at this college are in this CIP.

ALTER TABLE college_majors
  ADD COLUMN IF NOT EXISTS completions_pct NUMERIC(6,4);
  -- Populated from Scorecard PCIP* fields by seed_majors.py.
  -- NULL = not yet loaded; 0 = major offered but no completions recorded.

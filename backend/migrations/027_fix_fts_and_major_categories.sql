-- Migration: Fix corrupted FTS tables and ensure major_categories populated
-- This migration cleans up any corrupted FTS tables/triggers and populates major_categories

-- Drop FTS tables if they exist (they may be corrupted)
DROP TABLE IF EXISTS colleges_fts;
DROP TABLE IF EXISTS colleges_comprehensive_fts;
DROP TABLE IF EXISTS majors_fts;

-- Drop FTS-related triggers
DROP TRIGGER IF EXISTS colleges_ai;
DROP TRIGGER IF EXISTS colleges_au;
DROP TRIGGER IF EXISTS colleges_ad;
DROP TRIGGER IF EXISTS colleges_comp_fts_ai;
DROP TRIGGER IF EXISTS colleges_comp_fts_au;
DROP TRIGGER IF EXISTS colleges_comp_fts_ad;
DROP TRIGGER IF EXISTS majors_fts_ai;
DROP TRIGGER IF EXISTS majors_fts_au;
DROP TRIGGER IF EXISTS majors_fts_ad;

-- Note: major_categories will be populated by the seed script from college_programs
-- This migration just ensures the FTS tables don't cause errors

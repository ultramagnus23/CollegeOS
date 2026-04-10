-- Migration 056a: Add missing columns to colleges_comprehensive
--
-- STEP 1 of 7 — run this first, alone.
--
-- These are schema-only changes (NULL column additions).
-- PostgreSQL applies them instantly via a catalog-only update;
-- no table rewrite and no row scan occurs.
--
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).

ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS state           TEXT;
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS type            TEXT;
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS setting         TEXT;
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS control         TEXT;
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS size_category   TEXT;
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS logo_url        TEXT;
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS description     TEXT;
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS website         TEXT;
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS founded_year    INTEGER;
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS latitude        DOUBLE PRECISION;
ALTER TABLE colleges_comprehensive ADD COLUMN IF NOT EXISTS longitude       DOUBLE PRECISION;

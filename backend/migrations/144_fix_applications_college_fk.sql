-- Migration 144: Fix applications.college_id FK pointing at the wrong table
--
-- `colleges` and `colleges_comprehensive` are two independent tables with
-- unrelated, coincidentally-overlapping SERIAL id ranges (verified live: of
-- 2,344 ids that exist in both tables, 0 refer to the same college by name).
-- Every read path (College.findById, the colleges_full view, dashboardService)
-- treats `colleges` as primary. But applications.college_id's FK constraint
-- checked ONLY colleges_comprehensive -- so an application could be saved
-- with a college_id that satisfied the FK (existed in colleges_comprehensive)
-- while every part of the app that *displays* that application read the
-- unrelated, wrong college's name/data out of `colleges`/`colleges_full` for
-- that same numeric id. This actually happened to real users' applications
-- (verified live before this migration: e.g. an application whose FK-checked
-- row was "Duke University" displayed as "EDP University of Puerto
-- Rico-Manati" on the dashboard, because the id existed in colleges_full for a
-- different Duke-adjacent numeric collision).
--
-- Fix: point the FK at `colleges` instead, matching every read path. One
-- existing row (college_id=26133) only existed in colleges_comprehensive and
-- would violate the new FK -- back it into `colleges` first (preserving its
-- real data) so that application keeps working instead of being deleted.

-- Drop the old (wrong-table) FK FIRST. Otherwise the remediation UPDATE below
-- (which points college_id at a newly-created `colleges` row) would itself
-- violate the still-active old constraint, since that new id was never going
-- to exist in colleges_comprehensive.
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_college_id_fkey;

DO $$
DECLARE
  new_id INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM applications WHERE college_id = 26133)
     AND NOT EXISTS (SELECT 1 FROM colleges WHERE id = 26133) THEN
    INSERT INTO colleges (name, country, city, official_website, acceptance_rate, created_at, updated_at)
    SELECT name, country, city, website_url, NULL, NOW(), NOW()
    FROM colleges_comprehensive WHERE id = 26133
    RETURNING id INTO new_id;

    IF new_id IS NOT NULL THEN
      UPDATE applications SET college_id = new_id WHERE college_id = 26133;
    END IF;
  END IF;
END $$;

ALTER TABLE applications
  ADD CONSTRAINT applications_college_id_fkey
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE;

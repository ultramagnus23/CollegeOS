-- Migration 060: Fix applications.college_id FK to reference colleges_comprehensive
-- The frontend fetches colleges from colleges_comprehensive (via Supabase).
-- The applications table had a FK pointing to the old `colleges` table,
-- causing FK violations (500 errors) and wrong-college lookups.

-- Drop the FK constraint that references the legacy `colleges` table.
-- NOTE: 'applications_college_id_fkey' is the auto-generated Postgres default constraint
-- name for an unnamed FOREIGN KEY on applications(college_id).  If the database used a
-- custom name you can identify it with:
--   SELECT conname FROM pg_constraint WHERE conrelid='applications'::regclass AND contype='f';
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_college_id_fkey;

-- Also drop the unique constraint that included college_id (it may reference the old FK).
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_user_id_college_id_application_type_key;

-- Add a new FK pointing at colleges_comprehensive.
ALTER TABLE applications
  ADD CONSTRAINT applications_college_id_fkey
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE;

-- Re-add the uniqueness constraint on (user_id, college_id, application_type).
ALTER TABLE applications
  ADD CONSTRAINT applications_user_id_college_id_application_type_key
  UNIQUE (user_id, college_id, application_type);

-- Migration 091: Fill schema gaps that cause runtime 500 errors
--
-- 1. Ensure unique constraint on institution_identity_map.canonical_institution_id exists.
--    CREATE TABLE IF NOT EXISTS skips the constraint if the table pre-existed,
--    leaving ON CONFLICT (canonical_institution_id) throwing 42P10.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'canonical.institution_identity_map'::regclass
      AND contype = 'u'
      AND conname = 'institution_identity_map_canonical_unique'
  ) THEN
    ALTER TABLE canonical.institution_identity_map
      ADD CONSTRAINT institution_identity_map_canonical_unique
      UNIQUE (canonical_institution_id);
  END IF;
END
$$;

-- 2. Add application_deadline to colleges.
--    Migration 058 added rd/ed/ea_deadline but missed application_deadline.
--    College.js queries SELECT c.application_deadline FROM colleges → 42703 crash.
ALTER TABLE colleges
  ADD COLUMN IF NOT EXISTS application_deadline DATE;

-- 3. Add rd/ed/ea/application_deadline to colleges_comprehensive.
--    College.js also selects these from colleges_comprehensive; that table never had them.
ALTER TABLE colleges_comprehensive
  ADD COLUMN IF NOT EXISTS application_deadline DATE,
  ADD COLUMN IF NOT EXISTS rd_deadline         DATE,
  ADD COLUMN IF NOT EXISTS ed_deadline         DATE,
  ADD COLUMN IF NOT EXISTS ea_deadline         DATE;

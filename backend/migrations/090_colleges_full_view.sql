-- Migration 090: Ensure public.colleges_full view exists
-- The view was created by migration_colleges_table_refactor.sql (already applied)
-- as a rich view.  CREATE OR REPLACE cannot drop columns, so check existence first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'colleges_full'
  ) THEN
    EXECUTE 'CREATE VIEW public.colleges_full AS SELECT * FROM public.colleges';
  END IF;
END
$$;

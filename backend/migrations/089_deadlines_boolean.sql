-- Convert deadlines.is_completed from INTEGER (0/1) to native BOOLEAN.
-- Idempotent: skip if the column is already BOOLEAN (Supabase canonical
-- schema created it as BOOLEAN directly from migration 079).
DO $$
BEGIN
  IF (
    SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deadlines' AND column_name = 'is_completed'
  ) = 'integer' THEN
    ALTER TABLE deadlines
      ALTER COLUMN is_completed TYPE BOOLEAN USING (is_completed <> 0),
      ALTER COLUMN is_completed SET DEFAULT FALSE;
  END IF;
END
$$;

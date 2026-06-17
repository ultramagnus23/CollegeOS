-- Migration 090: Create colleges_full view
-- colleges_full is referenced in 20+ source files but was never defined in any migration.
-- Define it as an alias view of the colleges table (INTEGER id) so all JOINs on college_id work.
CREATE OR REPLACE VIEW public.colleges_full AS
SELECT * FROM public.colleges;

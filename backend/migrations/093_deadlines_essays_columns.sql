-- Migration 093: Add missing columns to deadlines and essays tables
--
-- The canonical Supabase schema was created from migration 079 (canonical
-- rebuild) which defined deadlines/essays with fewer columns than the
-- SQLite-era schema in migrations 033/035. Backend services (Deadline.js,
-- deadlineAutoPopulationService.js, essayAutoLoadingService.js) reference
-- columns that do not exist yet → silent INSERT failures or 42703 crashes.

-- ─── deadlines ────────────────────────────────────────────────────────────────
ALTER TABLE public.deadlines
  ADD COLUMN IF NOT EXISTS user_id    INTEGER REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS college_id INTEGER,
  ADD COLUMN IF NOT EXISTS title      TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS source_url  TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Back-fill user_id from the parent application so existing rows have a value
UPDATE public.deadlines d
SET user_id = a.user_id
FROM public.applications a
WHERE d.application_id = a.id
  AND d.user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_deadlines_user_id ON public.deadlines (user_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_deadline_date ON public.deadlines (deadline_date);

-- ─── essays ───────────────────────────────────────────────────────────────────
ALTER TABLE public.essays
  ADD COLUMN IF NOT EXISTS user_id    INTEGER REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS college_id INTEGER,
  ADD COLUMN IF NOT EXISTS title      TEXT;

-- Back-fill user_id from parent application
UPDATE public.essays e
SET user_id = a.user_id
FROM public.applications a
WHERE e.application_id = a.id
  AND e.user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_essays_user_id ON public.essays (user_id);

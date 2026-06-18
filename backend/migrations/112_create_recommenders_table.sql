-- 112_create_recommenders_table.sql
-- AUDIT FIX: the Recommender model + /api/recommenders routes query a `recommenders`
-- table that does not exist (every call 500s with relation "recommenders" does not
-- exist), even though the companion `recommendation_requests` table is present.
-- Create it to match backend/src/models/Recommender.js exactly.

CREATE TABLE IF NOT EXISTS public.recommenders (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  type         TEXT,
  relationship TEXT,
  subject      TEXT,
  institution  TEXT,
  years_known  INTEGER,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recommenders_user ON public.recommenders(user_id);

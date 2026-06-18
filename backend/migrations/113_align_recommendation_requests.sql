-- 113_align_recommendation_requests.sql
-- AUDIT FIX: backend/src/models/Recommender.js expects recommendation_requests to
-- link to recommenders via `recommender_id` and to carry college/application fields,
-- but the existing table only has (user_id, recommender_name, recommender_email,
-- status, deadline, last_reminder_date). So GET /api/recommenders 500s on
-- "column rr.recommender_id does not exist" and the request CRUD paths are broken.
-- Add the missing columns the model uses (additive; existing rows get NULL).

ALTER TABLE public.recommendation_requests
  ADD COLUMN IF NOT EXISTS recommender_id     INTEGER REFERENCES public.recommenders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS college_id         INTEGER,
  ADD COLUMN IF NOT EXISTS college_name       TEXT,
  ADD COLUMN IF NOT EXISTS application_system TEXT,
  ADD COLUMN IF NOT EXISTS request_date       TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS notes              TEXT;

CREATE INDEX IF NOT EXISTS idx_rec_requests_recommender ON public.recommendation_requests(recommender_id);
CREATE INDEX IF NOT EXISTS idx_rec_requests_user ON public.recommendation_requests(user_id);

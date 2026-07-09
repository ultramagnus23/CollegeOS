-- Migration 143: Masters per-application document + recommender tracking
--
-- masters_applications (120_masters_track_foundation.sql) only has status/intake/
-- priority/notes/decision_outcome -- no way to track "which documents does Stanford
-- need and are they done", "who's writing my Cambridge LoR and have they submitted",
-- or the application portal link / fee. That's exactly what users were tracking by
-- hand in a spreadsheet (Application Tracker: Document 1-4 + status, Recommender 1-3
-- + LoR status, portal link, fee). This migration closes that gap so the app can
-- actually replace the spreadsheet instead of just tracking status.
--
-- Reuses the existing person-level `recommenders` table (109/112) so a recommender
-- entered once is reusable across undergrad AND masters applications -- only the
-- per-application *request* (has this person been asked, have they submitted) is
-- masters-specific here, same pattern as `recommendation_requests` for undergrad.

ALTER TABLE public.masters_applications
  ADD COLUMN IF NOT EXISTS application_portal_link TEXT,
  ADD COLUMN IF NOT EXISTS application_fee         NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS application_fee_currency TEXT;

CREATE TABLE IF NOT EXISTS public.masters_application_documents (
  id                    BIGSERIAL PRIMARY KEY,
  masters_application_id BIGINT NOT NULL REFERENCES public.masters_applications(id) ON DELETE CASCADE,
  document_type         TEXT NOT NULL,  -- e.g. 'SOP', 'Transcript', 'Resume', 'Writing Sample'
  status                TEXT NOT NULL DEFAULT 'not_started'
                          CHECK (status IN ('not_started','in_progress','completed','not_applicable')),
  document_id           INTEGER REFERENCES public.documents(id) ON DELETE SET NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_masters_app_docs_app ON public.masters_application_documents(masters_application_id);

CREATE TABLE IF NOT EXISTS public.masters_application_recommenders (
  id                     BIGSERIAL PRIMARY KEY,
  masters_application_id BIGINT NOT NULL REFERENCES public.masters_applications(id) ON DELETE CASCADE,
  recommender_id         INTEGER NOT NULL REFERENCES public.recommenders(id) ON DELETE CASCADE,
  status                 TEXT NOT NULL DEFAULT 'not_requested'
                           CHECK (status IN ('not_requested','requested','in_progress','completed','declined')),
  request_date           TIMESTAMPTZ,
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (masters_application_id, recommender_id)
);
CREATE INDEX IF NOT EXISTS idx_masters_app_recs_app ON public.masters_application_recommenders(masters_application_id);
CREATE INDEX IF NOT EXISTS idx_masters_app_recs_recommender ON public.masters_application_recommenders(recommender_id);

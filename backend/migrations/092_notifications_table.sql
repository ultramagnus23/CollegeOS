-- Migration 092: Create notifications table in PostgreSQL-compatible syntax
--
-- Migration 033 defined notifications with SQLite-only AUTOINCREMENT/DATETIME syntax,
-- so those CREATE TABLE statements fail silently in PostgreSQL. The notifications route
-- and service are fully wired (/api/notifications) but crash at runtime if this table
-- doesn't exist. This migration creates it idempotently.

CREATE TABLE IF NOT EXISTS public.notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type       TEXT,
  title      TEXT,
  message    TEXT,
  metadata   JSONB,
  read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id     ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id) WHERE read IS FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created     ON public.notifications (created_at DESC);

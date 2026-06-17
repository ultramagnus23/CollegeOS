-- Migration 092: Fix notifications table for PostgreSQL
--
-- The notifications table already exists in Supabase using is_read (BOOLEAN).
-- notificationService.js was updated to use is_read; this migration:
--   1. Adds missing metadata JSONB column (createNotification stores payload here)
--   2. Adds a covering partial index on unread notifications

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id) WHERE is_read IS FALSE;

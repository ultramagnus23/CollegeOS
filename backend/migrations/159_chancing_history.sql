-- Migration 159: chancing_history table
--
-- POST /api/chancing/save-history and GET /api/chancing/history
-- (backend/src/routes/chancing.js) have always referenced this table, but it
-- was never created — save-history threw "relation chancing_history does not
-- exist" for any caller, and history silently returned a hardcoded empty
-- array to avoid the same error. Nothing in the frontend calls either route
-- today, so this wasn't user-visible, but the endpoints are real and should
-- work honestly rather than lie or throw.

CREATE TABLE IF NOT EXISTS chancing_history (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  college_id        INTEGER REFERENCES colleges(id) ON DELETE SET NULL,
  chance_percentage NUMERIC(5,2),
  category          VARCHAR(20),
  profile_snapshot  JSONB,
  factors           JSONB,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chancing_history_user
  ON chancing_history(user_id, created_at DESC);

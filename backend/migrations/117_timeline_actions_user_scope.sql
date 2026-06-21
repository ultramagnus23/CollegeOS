-- timeline_actions had no user_id column despite every query in timelineService.js
-- (insert/select/delete) assuming one — so monthly timeline generation has never
-- worked for any user (every call threw "column user_id does not exist", caught
-- non-fatally by ApplicationBootstrapService and silently swallowed). Table is
-- currently empty (0 rows) so this is a safe, non-destructive NOT NULL add.
ALTER TABLE timeline_actions ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_timeline_actions_user ON timeline_actions(user_id, target_year, target_month);

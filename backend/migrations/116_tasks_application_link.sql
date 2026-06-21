-- Consolidates the application-task pipeline onto `tasks` (already the table
-- Dashboard.tsx "Today's Tasks" and Timeline.tsx completion-toggle read/write —
-- the higher-traffic, richer subsystem with critical-path/dependency/blocking
-- logic already built in RequirementService). The auto-generated tasks created
-- on application bootstrap previously targeted columns that didn't exist here,
-- so they silently failed for every application. Idempotent: safe to re-run.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC DEFAULT 1;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocking_reason TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_tasks_application_id ON tasks(application_id);

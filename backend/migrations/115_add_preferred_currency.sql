-- Adds the user's preferred display currency for the unified money system.
-- Idempotent: safe to re-run. Defaults to USD; UI lets the user change it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_currency TEXT DEFAULT 'USD';

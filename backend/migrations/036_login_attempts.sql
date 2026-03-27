-- Migration 036: Add login_attempts table for account lockout tracking
-- Replaces the in-memory Map in authService.js with a persistent SQLite table

CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  last_attempt INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_locked_until ON login_attempts(locked_until);

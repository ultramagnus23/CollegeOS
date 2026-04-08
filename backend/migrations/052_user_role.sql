-- Migration 052: Add role column to users table for admin access control
-- Safe to re-run (uses IF NOT EXISTS / DO NOTHING patterns)

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'student';

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

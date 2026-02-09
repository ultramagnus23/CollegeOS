-- Migration 028: Add phone column to users table
-- This fixes the "no such column: phone" error in /api/profile/:userId/basic

-- ==========================================
-- ADD PHONE COLUMN TO USERS TABLE
-- ==========================================
-- SQLite's ALTER TABLE ADD COLUMN will silently fail if column already exists
-- This is safe to run multiple times
ALTER TABLE users ADD COLUMN phone VARCHAR(20);

-- ==========================================
-- ADD INDEX FOR PHONE LOOKUPS (OPTIONAL)
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

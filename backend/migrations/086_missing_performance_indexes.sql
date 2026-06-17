-- Migration 086: Add missing performance indexes for authentication and search
-- Fixes slow queries on users.google_id, refresh_tokens, and college_programs

-- ==========================================
-- USERS TABLE INDEXES
-- ==========================================

-- Index on google_id for Google OAuth lookups
-- Fixes: SELECT * FROM users WHERE google_id = ? (~932ms without index)
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

-- ==========================================
-- REFRESH TOKENS TABLE INDEXES
-- ==========================================

-- Index on token for refresh token validation
-- Fixes: SELECT * FROM refresh_tokens WHERE token = ?
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);

-- Index on user_id for user-specific token lookups and revocation
-- Fixes: SELECT * FROM refresh_tokens WHERE user_id = ? AND token = ?
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- Composite index for the most common refresh query pattern
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_token ON refresh_tokens(user_id, token);

-- ==========================================
-- COLLEGE PROGRAMS TABLE INDEXES
-- ==========================================

-- Index on program_name for search and filtering
-- Fixes: SELECT DISTINCT program_name FROM college_programs (~1166ms without index)
CREATE INDEX IF NOT EXISTS idx_college_programs_program_name ON college_programs(program_name);

-- ==========================================
-- VERIFICATION
-- ==========================================
-- After running this migration, verify indexes exist:
-- SELECT indexname, tablename FROM pg_indexes
-- WHERE tablename IN ('users', 'refresh_tokens', 'college_programs')
-- AND indexname LIKE 'idx_%';

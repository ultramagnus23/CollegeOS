# Refresh Tokens Table Fix

## Problem Summary

The application was experiencing a critical error during user registration:
```
SqliteError: no such table: refresh_tokens
```

This error occurred because the `authService.js` attempted to store refresh tokens in a database table that didn't exist.

## Root Cause

The JWT authentication system in `authService.js` requires a `refresh_tokens` table to store refresh tokens for secure session management. However, no migration existed to create this table, causing the application to fail during:
- User registration
- User login
- Token refresh operations

## Solution Implemented

### 1. Created Migration 035: `035_auth_refresh_tokens.sql`

This migration creates four essential tables that were missing:

#### refresh_tokens table
Stores JWT refresh tokens with proper expiration tracking and foreign key constraints.

**Indexes**:
- `idx_refresh_tokens_user` - Fast lookups by user_id
- `idx_refresh_tokens_token` - Fast token validation
- `idx_refresh_tokens_expires` - Efficient expiration checking

#### applications table
Tracks user applications to colleges. Referenced by tasks and deadlines tables from migration 023.

#### essays table
Manages essay requirements and drafts for applications.

#### deadlines table
Tracks application deadlines and reminders.

### 2. Enhanced Database Initialization with Safety Checks

Added `verifyCriticalTables()` method to `src/config/database.js`:

**Benefits**:
- Verifies critical tables exist after migrations run
- Provides clear error messages if tables are missing
- Prevents runtime errors from missing tables
- Future-proofs against similar issues

### 3. Fixed Unrelated Syntax Error

Fixed duplicate error handling code in `src/routes/fit.js` that was preventing the backend from starting.

## How to Apply This Fix

### For Fresh Database
The migration will run automatically when the application starts:
```bash
cd backend
npm start
```

### For Existing Database
If you have an existing database, the migration will detect missing tables and create them automatically.

### To Reset Database (if needed)
```bash
cd backend
./fresh-start.sh
npm start
```

## Testing

### Unit Tests
```bash
cd backend
npm test -- tests/unit/authService.test.js
```

All auth tests pass:
- ✓ User registration with token generation
- ✓ Duplicate email detection
- ✓ User login with credentials
- ✓ Password validation

## Prevention of Similar Issues

This fix implements several safeguards:

1. **Migration System**: All database schema changes go through migration files
2. **Table Verification**: Critical tables are verified after migrations
3. **Clear Error Messages**: Missing tables trigger informative error messages
4. **Comprehensive Schema**: Migration 035 includes all referenced tables

## Related Files

- `backend/migrations/035_auth_refresh_tokens.sql` - New migration file
- `backend/src/config/database.js` - Enhanced with table verification
- `backend/src/services/authService.js` - Uses refresh_tokens table
- `backend/src/routes/fit.js` - Fixed syntax error
- `backend/tests/unit/authService.test.js` - Test coverage

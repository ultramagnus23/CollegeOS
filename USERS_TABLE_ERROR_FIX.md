# Users Table Schema Error Fix

## Error Message
```
error: Registration failed: table users has no column named full_name
SqliteError: table users has no column named full_name
```

## What This Means

Your `users` table has an outdated schema. The old migrations created a table with a `name` column, but the application code expects `full_name` and other columns.

**Why it happens:**
- Old database from before the overhaul
- Migration 004 created table with old schema (`name` instead of `full_name`)
- Migration 006 (which fixes this) never ran or database created before migration 006 existed

## Quick Fix

### Option 1: Run fresh-start.sh (Recommended)

```bash
cd backend
./fresh-start.sh
```

Answer "y" when prompted. This will:
1. Delete old database
2. Run ALL migrations (including 006 which fixes users table)
3. Seed 1100 colleges
4. Create correct users table schema

**Time:** < 1 minute

### Option 2: Manual Fix

```bash
cd backend

# Delete database
rm -f database/college_app.db
rm -f database/college_app.db-shm
rm -f database/college_app.db-wal

# Run all migrations (including 006)
node scripts/runMigrations.js

# Seed data
node scripts/seedCollegesNew.js

# Start backend
npm start
```

## What Migration 006 Does

Migration 006 (added to fix this issue) recreates the users table with the correct schema:

**Correct columns:**
- `full_name` (not `name`) - Required
- `country` - Required
- `target_countries` - JSON array
- `intended_majors` - JSON array
- `test_status` - JSON object
- `language_preferences` - JSON array
- `onboarding_complete` - Boolean flag
- And 15+ other profile fields

## Verification

After running fresh-start.sh or manual fix:

```bash
cd backend

# Check users table schema
sqlite3 database/college_app.db ".schema users"

# Should see: full_name TEXT NOT NULL (not just "name")
# Should see: country TEXT NOT NULL
# Should see: 25+ columns total
```

## Why This Error Occurred

**Timeline of the issue:**

1. **Original CollegeOS:** Had simple users table with `name` column
2. **Migration 004:** Tried to update users table but used old column name
3. **Your database:** Was created with migration 004's old schema
4. **Application code:** Expects `full_name` column (correct name)
5. **Result:** Mismatch → Error when trying to register

**Solution:** Migration 006 drops the old table and recreates it with the correct schema.

## Prevention

After running fresh-start.sh once with migration 006:
- All future runs will have correct schema
- Registration/login will work correctly
- No more column name mismatches

## Related Issues

This fix also resolves:
- ✅ "column name not found" errors during registration
- ✅ "no such column: country" errors
- ✅ Missing onboarding fields
- ✅ Any other users table schema mismatches

## Need Help?

If fresh-start.sh doesn't work:

1. Check you're in the `backend` directory
2. Make sure `npm install` was run
3. Check for error messages during migration
4. See `TROUBLESHOOTING_INDEX.md` for other common issues

## See Also

- `SCHEMA_ERROR_FIX.md` - For colleges table schema errors
- `DATABASE_CORRUPT_FIX.md` - For database corruption
- `TROUBLESHOOTING_INDEX.md` - For all common issues
- `START_HERE.md` - Complete setup guide

# Migration & Seeding Troubleshooting Guide

## Problem: "table colleges has no column named type"

This error means your database schema is out of date.

### Quick Fix

```bash
cd backend
./fresh-start.sh
```

This will delete the old database and create a fresh one with the correct schema.

## Problem: "Database path is ./database.sqlite"

The seed script is showing the wrong path. This shouldn't happen with the latest code, but if it does:

### Solution

```bash
cd backend

# Delete ALL old database files
rm -f database.sqlite*
rm -f database/college_app.db*

# Run fresh start
./fresh-start.sh
```

## Problem: Migration 004 fails with "grade_level" error

Migration 004 tries to add columns to the `users` table. If it fails:

### Option 1: Fresh Start (Recommended)

```bash
cd backend
./fresh-start.sh
```

### Option 2: Manual Fix

```bash
cd backend

# Delete the database
rm -f database/college_app.db

# Run migrations
node scripts/runMigrations.js

# Seed data
node scripts/seedCollegesNew.js
```

## Complete Fresh Setup

If nothing else works, here's the complete reset procedure:

```bash
# 1. Navigate to backend
cd backend

# 2. Delete ALL database files
rm -f database.sqlite*
rm -f database/college_app.db*
rm -f *.db*

# 3. Make sure dependencies are installed
npm install

# 4. Run fresh start script
chmod +x fresh-start.sh
./fresh-start.sh

# 5. Verify database
sqlite3 database/college_app.db "SELECT COUNT(*) FROM colleges;"
# Should show: 1100

# 6. Start backend
npm start
```

## Understanding the Migration System

The system uses 5 migrations:

1. **001_create_colleges.sql** - Creates basic colleges table
2. **002_recommendations.sql** - Creates recommendations table
3. **003_timeline.sql** - Creates timeline table
4. **004_user_profile.sql** - Adds user profile columns
5. **005_unified_colleges_schema.sql** - **IMPORTANT** - Drops and recreates colleges table with 30+ fields

### The Key Point

**Migration 005** is the most important - it creates the unified schema that the seed script expects. If you have an old database:
- Migrations 001-004 might have already run
- Migration 005 needs to run to get the correct schema
- If migrations fail, use `fresh-start.sh`

## What fresh-start.sh Does

```bash
1. Deletes all database files
2. Runs all 5 migrations from scratch
3. Seeds 1100 colleges
4. Verifies the setup
```

## Verifying Your Setup

After setup, check these:

```bash
cd backend

# 1. Check database exists
ls -lh database/college_app.db

# 2. Check colleges count
sqlite3 database/college_app.db "SELECT COUNT(*) FROM colleges;"
# Should show: 1100

# 3. Check schema has required columns
sqlite3 database/college_app.db "PRAGMA table_info(colleges);" | grep type
# Should show the type column

# 4. Start backend and test
npm start
# In another terminal:
curl http://localhost:5000/api/colleges?limit=3
# Should return 3 colleges as JSON
```

## Still Having Issues?

If you're still having problems:

1. **Check you're in the backend directory**:
   ```bash
   pwd
   # Should end with: /backend
   ```

2. **Check Node.js version**:
   ```bash
   node --version
   # Should be v14 or higher
   ```

3. **Check dependencies are installed**:
   ```bash
   ls node_modules/better-sqlite3
   # Should exist
   ```

4. **Try complete cleanup**:
   ```bash
   # Remove node_modules and reinstall
   rm -rf node_modules
   npm install
   
   # Remove all databases
   rm -f database/*.db*
   rm -f *.db*
   
   # Fresh start
   ./fresh-start.sh
   ```

## Why This Happens

The original CollegeOS had a simpler database schema. The overhaul introduced:
- 30+ fields instead of 14
- Board-specific requirements (CBSE, IB, IGCSE)
- Country-specific data (Studielink, UCAS)
- More comprehensive college information

If you have an old database file from before the overhaul, it doesn't have the new schema. Migration 005 handles this by dropping and recreating the colleges table, but you need to run it.

## Prevention

Going forward:
1. Always run `node scripts/runMigrations.js` before seeding
2. The seed script now validates the schema before running
3. If schema is wrong, it tells you exactly what to do
4. Use `fresh-start.sh` for a clean slate

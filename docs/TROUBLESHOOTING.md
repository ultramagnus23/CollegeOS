# CollegeOS Troubleshooting Guide

**Version:** 2.0  
**Last Updated:** February 2026

A comprehensive guide to resolving common issues in the CollegeOS application. This document consolidates solutions for database, migration, setup, authentication, and column-related issues.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Universal Fixes](#universal-fixes)
3. [Database Issues](#database-issues)
4. [Migration Issues](#migration-issues)
5. [Setup & Installation](#setup--installation)
6. [Authentication Issues](#authentication-issues)
7. [Frontend Issues](#frontend-issues)
8. [Column & SQL Errors](#column--sql-errors)
9. [Troubleshooting by Error Message](#troubleshooting-by-error-message)
10. [Diagnostic Tools](#diagnostic-tools)

---

## Quick Start

### For First-Time Setup

```bash
# 1. Navigate to project root
cd /path/to/CollegeOS

# 2. Install dependencies
npm install
cd backend && npm install && cd ..

# 3. Run database setup
npm run db:setup

# 4. Start backend (Terminal 1)
cd backend && npm start

# 5. Start frontend (Terminal 2)
npm run dev

# 6. Open browser
# Visit http://localhost:8080 (or 5173)
```

### For "I Just Pulled Changes"

```bash
# 1. Ensure you're on correct branch
git branch
git pull origin main

# 2. Install any new dependencies
npm install
cd backend && npm install && cd ..

# 3. If database schema changed
npm run db:setup

# 4. Restart servers
# Terminal 1: cd backend && npm start
# Terminal 2: npm run dev
```

### The Nuclear Option (Fresh Start)

**If nothing else works:**

```bash
cd backend
./fresh-start.sh
npm start
```

Then in a new terminal:
```bash
npm run dev
```

This script fixes ~90% of database-related issues in under 2 minutes.

---

## Universal Fixes

### Fix #1: Run fresh-start.sh

Solves most database issues:

```bash
cd backend
./fresh-start.sh
```

**What it does:**
- ✅ Detects database problems
- ✅ Deletes corrupted database
- ✅ Runs all migrations
- ✅ Populates with 1100+ colleges
- ✅ Verifies success

**Issues it fixes:**
- Database corruption
- Schema mismatches
- Migration errors
- Wrong database paths
- .env path problems

### Fix #2: Check Both Servers Running

The app needs both frontend AND backend running:

```bash
# Terminal 1: Check backend
curl http://localhost:5000/health
# Expected: {"success":true,"message":"College App Backend is running"...}

# Terminal 2: Frontend should be running
# Visit http://localhost:8080 (or 5173)

# If backend not running, start it:
cd backend && npm start
```

### Fix #3: Install Dependencies

New dependencies may be added frequently:

```bash
# Backend
cd backend && npm install

# Frontend
cd .. && npm install
```

### Fix #4: Clear Browser Cache

Modern browsers cache JavaScript aggressively:

**Hard Refresh:**
- Mac: `Cmd + Shift + R`
- Windows/Linux: `Ctrl + Shift + R`

Or open DevTools (F12) → Right-click refresh button → "Empty Cache and Hard Reload"

### Fix #5: Kill Old Server Processes

Port already in use? Kill old processes:

**macOS/Linux:**
```bash
# Kill backend (port 5000)
lsof -ti:5000 | xargs kill -9 2>/dev/null || true

# Kill frontend (ports 8080 or 5173)
lsof -ti:8080 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
```

**Windows (PowerShell):**
```powershell
Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | 
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

---

## Database Issues

### Issue: Database Corruption (SQLITE_CORRUPT)

**Error:**
```
SqliteError: database disk image is malformed
```

**Cause:** Database file became corrupted due to improper shutdown, system crash, or file system issues.

**Solutions:**

#### Option 1: Use fresh-start.sh (Recommended)

```bash
cd backend
./fresh-start.sh
npm start
```

Takes < 2 minutes. Fixes the issue 100% of the time.

#### Option 2: Manual Rebuild

```bash
cd backend

# Stop backend if running (Ctrl+C)

# Delete all database files
rm -f database/college_app.db
rm -f database/college_app.db-shm
rm -f database/college_app.db-wal

# Recreate database
node scripts/runMigrations.js
node scripts/seedCollegesNew.js

# Start backend
npm start
```

#### Option 3: SQLite Recovery (May Not Work)

```bash
cd backend

# Attempt to dump (may fail if severely corrupted)
sqlite3 database/college_app.db ".dump" > backup.sql

# If that succeeds, recreate:
rm database/college_app.db database/college_app.db-shm database/college_app.db-wal
sqlite3 database/college_app.db < backup.sql
npm start
```

**Prevention:**
- Always use **Ctrl+C** to stop servers (don't force-kill)
- Shut down properly before turning off computer
- Regular backups: `cp database/college_app.db database/college_app.db.backup`

---

### Issue: Wrong Database Path

**Error:**
```
Database path: ./database.sqlite
❌ ERROR: Database schema is outdated!
Missing columns: type, official_website, ...
```

**Cause:** `.env` file pointing to old database location from before the overhaul.

**Solution:**

#### Option 1: Remove .env File

```bash
cd backend
rm .env
# System will use defaults
npm start
```

#### Option 2: Update .env

```bash
cd backend

# View current .env
cat .env

# If you see: DATABASE_PATH=./database.sqlite
# Change to: DATABASE_PATH=./database/college_app.db

# Edit the file, then:
rm -f database.sqlite database/college_app.db
node scripts/runMigrations.js
node scripts/seedCollegesNew.js
```

#### Option 3: Copy .env.example

```bash
cd backend
rm .env
cp .env.example .env
npm start
```

**Verification:**
```bash
cd backend
node -e "console.log(require('./src/config/env').database.path)"
# Should output: /path/to/backend/database/college_app.db
# NOT: ./database.sqlite
```

---

### Issue: Schema Mismatch

**Errors:**
```
"table colleges has no column named type"
"table users has no column named full_name"
"no such table: admitted_student_stats"
```

**Cause:** Database created before latest migrations were added, or migrations didn't run properly.

**Solution:**

```bash
cd backend

# Delete old database
rm -f database/college_app.db

# Run all migrations (creates correct schema)
node scripts/runMigrations.js

# Seed data
node scripts/seedCollegesNew.js

# Start backend
npm start
```

Or use the one-command fix:

```bash
cd backend
./fresh-start.sh
npm start
```

---

### Issue: Zero Colleges in Database

**Symptom:** Application runs but shows no colleges.

**Cause:** Migrations ran but seeding didn't complete.

**Solution:**

#### Quick Check

```bash
cd backend
sqlite3 database/college_app.db "SELECT COUNT(*) FROM colleges;"
# Should show: 1100 or more
```

#### If Zero, Run Seed

```bash
cd backend
node scripts/seedCollegesNew.js

# Or use npm script
npm run seed
```

#### If Still Zero, Full Reset

```bash
npm run db:setup
```

---

## Migration Issues

### Issue: Migration 031 (Application Deadlines) Errors

**Error:**
```
❌ Error executing migration 031_application_deadlines.sql
no such column: offers_early_decision
```

**Root Cause:** Your local migration file differs from the repository version. Git doesn't overwrite modified files.

**Solution: One-Line Fix**

```bash
# Force checkout correct file from repo, delete DB, re-run migrations
git checkout origin/copilot/remove-duplicate-data-files -- backend/migrations/031_application_deadlines.sql && \
rm -f backend/database/college_app.db && \
cd backend && \
npm run migrate && \
npm run seed
```

**Step-by-Step Alternative:**

```bash
cd backend

# 1. Force update migration file from repo
git fetch origin copilot/remove-duplicate-data-files
git checkout origin/copilot/remove-duplicate-data-files -- backend/migrations/031_application_deadlines.sql

# 2. Verify it's correct (should return nothing)
grep "FROM colleges" backend/migrations/031_application_deadlines.sql

# 3. Delete old database
rm -f database/college_app.db

# 4. Run migrations
npm run migrate

# 5. Seed data
npm run seed
```

**Verify Success:**
```bash
# Should see:
# ✅ Executing 031_application_deadlines.sql...
# ✅ Migration 031 completed successfully
```

**About Lost Data:**

If you deleted the database before fixing migrations, you may have lost scraping data:

```bash
# Backup scraping data in future
sqlite3 database/college_app.db ".dump scrape_audit_log" > scrape_backup.sql

# After migrations, restore
sqlite3 database/college_app.db < scrape_backup.sql
```

---

### Issue: Foreign Key Constraint Failures

**Error:**
```
Error: FOREIGN KEY constraint failed
```

**Cause:** Migrations tried to insert data for colleges that don't exist yet, or data references missing foreign keys.

**Solution:**

```bash
cd backend

# Delete database
rm -f database/college_app.db

# Run migrations only (creates schema)
node scripts/runMigrations.js

# Run seeding AFTER migrations (creates colleges first)
node scripts/seedCollegesNew.js
```

**Key Principle:**
1. **Migrations:** Schema only (CREATE TABLE, CREATE INDEX)
2. **Seed scripts:** Base data (colleges, users)
3. **Populate scripts:** Optional/sample data

---

### Issue: Other Migration Errors

**For migration 004, 005, 006 errors:**

```bash
cd backend

# Check what migrations exist
ls -la migrations/

# Delete database to start fresh
rm -f database/college_app.db

# Run all migrations in order
node scripts/runMigrations.js

# Verify
npm start
```

---

## Setup & Installation

### Issue: "npm error Missing script: db:setup"

**Cause:** Running command from wrong directory.

**Solution:**

```bash
# ❌ WRONG: From backend directory
cd /path/to/CollegeOS/backend
npm run db:setup  # Error!

# ✅ CORRECT: From root directory
cd /path/to/CollegeOS
npm run db:setup  # Works!
```

**Important:** Most npm scripts run from **root directory**, except:
- `npm install` - Run in both root AND backend
- `npm start` - Run in backend directory
- Backend-specific scripts - Run in backend directory

---

### Issue: "Cannot find module 'better-sqlite3'"

**Cause:** Backend dependencies not installed.

**Solution:**

```bash
cd backend
npm install

# Then start backend
npm start
```

**Note:** `better-sqlite3` must be installed in `backend/node_modules`, not root.

---

### Issue: First-Time Setup Confusion

**Complete Setup Procedure:**

```bash
# 1. Navigate to project root
cd /path/to/CollegeOS

# 2. Install frontend dependencies
npm install

# 3. Install backend dependencies
cd backend
npm install
cd ..

# 4. Setup database (creates DB, runs migrations, seeds data)
npm run db:setup

# 5. Start backend (Terminal 1)
cd backend
npm start
# Should show: "Server running on port 5000"

# 6. Start frontend (Terminal 2 from root)
npm run dev
# Should show: "VITE ready in XXXms"

# 7. Open browser
# Visit http://localhost:8080 (or 5173 shown in output)
```

---

### Issue: Environment Variables Not Configured

**Cause:** Missing or incomplete `.env` file.

**Solution:**

```bash
cd backend

# Copy example to .env
cp .env.example .env

# Verify it has required variables
cat .env | grep -E "JWT_SECRET|DATABASE_PATH"

# Should show values (not blank)
```

**Required Variables:**
- `JWT_SECRET` - For access tokens
- `REFRESH_TOKEN_SECRET` - For refresh tokens
- `DATABASE_PATH` - Path to SQLite database
- `NODE_ENV` - Usually "development" for local

**For Production:**
```bash
# Generate secure secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Use generated values in .env
JWT_SECRET=<generated-value>
REFRESH_TOKEN_SECRET=<generated-value>
```

---

## Authentication Issues

### Issue: Login/Registration Fails with "Internal Server Error"

**Error:**
```
error: Registration failed: secretOrPrivateKey must have a value
```

**Cause:** Missing JWT secrets in `.env` file.

**Solution:**

```bash
cd backend

# Check if .env exists
ls -la .env

# If not found:
cp .env.example .env

# Verify it has JWT secrets
grep JWT_SECRET .env

# Should show non-empty value
# If empty, edit manually and add values
```

**Restart backend:**
```bash
npm start
```

**Test registration:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email":"test@example.com",
    "password":"Test123456",
    "fullName":"Test User",
    "country":"USA"
  }'
# Should return: {"success":true,...}
```

---

### Issue: Onboarding Endpoint Errors

**Cause:** Same as registration - missing JWT configuration.

**Solution:** Same as above - ensure `.env` has JWT secrets.

**Test onboarding:**
```bash
# 1. First register to get token
curl -X POST http://localhost:5000/api/auth/register ...

# 2. Copy the token from response

# 3. Complete onboarding with token
curl -X PUT http://localhost:5000/api/auth/onboarding \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "targetCountries":["USA"],
    "intendedMajors":["Computer Science"],
    "testStatus":{},
    "languagePreferences":["English"]
  }'
# Should return: {"success":true,...}
```

---

## Frontend Issues

### Issue: App is Blank (No Colleges Showing)

**Symptoms:**
- Frontend loads but page is empty
- No colleges visible
- Console shows network errors

**Root Causes & Solutions:**

#### 1. Backend Not Running

```bash
# Check if backend is running
curl http://localhost:5000/health

# If connection refused, start backend:
cd backend
npm start
```

**Verify:**
```bash
# Should return JSON with success:true
curl http://localhost:5000/health
```

#### 2. Database is Empty

```bash
cd backend

# Check college count
sqlite3 database/college_app.db "SELECT COUNT(*) FROM colleges;"

# If shows 0:
node scripts/seedCollegesNew.js

# Or use one-command setup
npm run db:setup
```

#### 3. Dependencies Not Installed

```bash
# Frontend
npm install

# Backend
cd backend && npm install

# Then restart both servers
```

#### 4. Browser Cache

**Hard refresh:**
- Mac: `Cmd + Shift + R`
- Windows/Linux: `Ctrl + Shift + R`

Or DevTools (F12) → Right-click refresh → "Empty Cache and Hard Reload"

---

### Issue: Search Not Working

**Error:** "ambiguous column name" error or search returns no results.

**Solution:**

Ensure you have latest code:
```bash
git pull origin main
```

All column names in WHERE and ORDER BY clauses should be qualified with table alias:
- ✅ `c.name LIKE ?` (correct)
- ❌ `name LIKE ?` (wrong when multiple tables joined)

This is already fixed in the current code. If you see the error, you need the latest pull.

---

### Issue: Network Errors in Browser Console

**Error:**
```
Failed to fetch
ECONNREFUSED 127.0.0.1:5000
net::ERR_CONNECTION_REFUSED
```

**Cause:** Backend not running or on wrong port.

**Solution:**

```bash
# 1. Check backend status
curl http://localhost:5000/health

# 2. If connection refused, start backend:
cd backend
npm start

# Should show: "Server running on port 5000 in development mode"

# 3. Hard refresh frontend
# Browser DevTools (F12) → Right-click refresh → "Empty Cache and Hard Reload"
```

---

## Column & SQL Errors

### Issue: "no such column" Errors

Several column name mismatches have been fixed. If you see these errors, ensure you have the latest code:

**Common Errors (All Fixed):**
- `no such column: cf.tuition_out_of_state` → Should be `tuition_out_state`
- `no such column: ass.sat_avg` → Should be `sat_50`
- `no such column: ass.act_avg` → Should be `act_50`
- `no such column: cc.college_id` → Should be `cc.id`

**Solution:**

```bash
# Pull latest code
git pull origin copilot/remove-duplicate-data-files

# Restart backend
cd backend
npm start
```

**What Was Fixed:**
- College model uses correct column names from database schema
- Column aliases maintain backward compatibility
- All references qualified with table prefix to avoid ambiguity

---

### Issue: "ambiguous column name" Error

**Error:**
```
SqliteError: ambiguous column name: name
```

**Cause:** Multiple tables joined with same column names; SQL can't determine which table to use.

**Solution:**

All columns are now qualified with table alias:
- `c.name` (from colleges table)
- `c.country`
- `c.ranking`
- `c.acceptance_rate`

Just pull latest code:

```bash
git pull origin copilot/remove-duplicate-data-files
cd backend && npm start
```

**Impact of This Fix:**
- ✅ Search works correctly
- ✅ Ranking evaluates ALL colleges (not just first 100)
- ✅ Sorting by any field works
- ✅ All filters work properly

---

### Issue: Duplicate Colleges

**Problem:** Colleges appear twice in results.

**Cause:** Multiple rows in joined tables without GROUP BY deduplication.

**Solution:**

Latest code uses `GROUP BY c.id` with `MAX()` aggregations:

```sql
SELECT 
  c.*,
  MAX(cc.total_enrollment) as total_enrollment,
  MAX(cf.tuition_in_state) as tuition_in_state,
  ...
FROM colleges c
LEFT JOIN colleges_comprehensive cc ON c.id = cc.id
LEFT JOIN college_financial_data cf ON c.id = cf.college_id
GROUP BY c.id              -- Deduplicates
ORDER BY c.ranking
LIMIT 100
```

**To get this fix:**
```bash
git pull origin copilot/remove-duplicate-data-files
cd backend && npm start
```

---

## Troubleshooting by Error Message

Quick lookup for specific error messages:

### "database disk image is malformed"
→ See [Database Corruption](#issue-database-corruption-sqlite_corrupt)

### "table colleges has no column named type"
→ See [Schema Mismatch](#issue-schema-mismatch)

### "table users has no column named full_name"
→ See [Schema Mismatch](#issue-schema-mismatch) or run `fresh-start.sh`

### "no such table: X"
→ Run `npm run db:setup` or `fresh-start.sh`

### "no such column: X"
→ Pull latest code: `git pull origin main` and restart backend

### "ambiguous column name"
→ Pull latest code (column names qualified with table alias)

### "FOREIGN KEY constraint failed"
→ See [Foreign Key Constraint Failures](#issue-foreign-key-constraint-failures)

### "Error executing migration XXX"
→ Delete database: `rm -f backend/database/college_app.db` and re-run: `npm run db:setup`

### "Cannot find module 'better-sqlite3'"
→ Run `cd backend && npm install`

### "Cannot find module 'express'"
→ Run `cd backend && npm install`

### "secretOrPrivateKey must have a value"
→ See [Authentication Issues](#authentication-issues)

### "EADDRINUSE: address already in use :::5000"
→ See [Kill Old Server Processes](#fix-5-kill-old-server-processes)

### "ECONNREFUSED" in browser console
→ Backend not running. Run `cd backend && npm start`

### "Failed to fetch" (frontend)
→ Backend not running or on wrong port. Check `http://localhost:5000/health`

### App shows blank page
→ See [Blank App Issue](#issue-app-is-blank-no-colleges-showing)

### Search returns no results
→ See [Search Not Working](#issue-search-not-working)

### Zero colleges in database
→ See [Zero Colleges](#issue-zero-colleges-in-database)

### Login/Registration fails
→ See [Authentication Issues](#authentication-issues)

---

## Diagnostic Tools

### Health Check Script

**Verify entire system:**

```bash
# Backend health
curl http://localhost:5000/health
# Expected: {"success":true,...}

# Database check
cd backend
sqlite3 database/college_app.db "SELECT COUNT(*) FROM colleges;"
# Expected: 1100+

# Colleges endpoint
curl http://localhost:5000/api/colleges?limit=3
# Expected: JSON array with 3 colleges

# Users table exists
sqlite3 database/college_app.db "SELECT COUNT(*) FROM users;"
# Expected: 0 or number of registered users
```

### Process Check

```bash
# See what's running on port 5000
lsof -i :5000

# See what's running on port 8080
lsof -i :8080

# See all Node processes
ps aux | grep node
```

### Database Check

```bash
cd backend

# Check database file size
ls -lh database/college_app.db

# Check table count
sqlite3 database/college_app.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table';"
# Expected: 28+ tables

# Check specific table schema
sqlite3 database/college_app.db ".schema colleges"

# Check data in table
sqlite3 database/college_app.db "SELECT COUNT(*) FROM colleges; SELECT COUNT(*) FROM users;"
```

### Git Status Check

```bash
# Check current branch
git branch

# Check for uncommitted changes
git status

# Check recent commits
git log --oneline -5

# Check if behind remote
git fetch origin
git log --oneline HEAD..origin/main
```

### Error Logs

**Backend logs:**
```bash
# Terminal running backend should show:
# - Server startup info
# - Error messages in red
# - Request logs
```

**Frontend logs:**
```bash
# Browser DevTools (F12)
# Console tab shows:
# - Console.log messages
# - Error messages in red
# - Network errors
```

### Complete System Reset

**If all else fails:**

```bash
cd /path/to/CollegeOS

# 1. Stash any local changes
git stash

# 2. Reset to remote
git fetch origin
git reset --hard origin/main

# 3. Clean install
rm -rf node_modules
rm -rf backend/node_modules
npm install
cd backend && npm install && cd ..

# 4. Fresh database
rm -f backend/database/college_app.db
npm run db:setup

# 5. Start servers
# Terminal 1:
cd backend && npm start

# Terminal 2:
npm run dev
```

---

## Performance Tips

### Database is Slow

```bash
# Clear old database and start fresh
cd backend
rm -f database/college_app.db
npm run db:setup

# This uses indexed queries for better performance
```

### Frontend is Slow

```bash
# Clear browser cache
# Mac: Cmd + Shift + R
# Windows/Linux: Ctrl + Shift + R

# Or in DevTools (F12):
# Right-click refresh button → "Empty Cache and Hard Reload"
```

### Network is Slow

```bash
# Test API response time
time curl http://localhost:5000/api/colleges?limit=10

# Test database query time
sqlite3 backend/database/college_app.db "SELECT COUNT(*) FROM colleges;"
```

---

## Getting Help

If none of these solutions work:

1. **Collect diagnostic info:**
   ```bash
   # Share output of:
   git log --oneline -1
   git status
   npm run db:check
   curl http://localhost:5000/health 2>&1
   ```

2. **Check error messages carefully** - They often tell you exactly what's wrong

3. **Read the specific guide** - Each issue has detailed documentation

4. **Try fresh-start.sh** - Solves 90% of issues:
   ```bash
   cd backend && ./fresh-start.sh
   ```

---

## Summary

### Most Common Issues & Quick Fixes

| Problem | Quick Fix | Time |
|---------|-----------|------|
| Database corrupt | `cd backend && ./fresh-start.sh` | 2 min |
| Blank app | Start backend: `cd backend && npm start` | 1 min |
| Zero colleges | `npm run db:setup` | 3 min |
| Column not found | `git pull origin main && npm start` | 2 min |
| Can't register | Check `.env` has JWT_SECRET | 1 min |
| Missing module | `cd backend && npm install` | 2 min |
| Port in use | Kill process: `lsof -ti:5000 \| xargs kill -9` | 1 min |
| Migration error | `rm database && npm run db:setup` | 3 min |

### Prevention

- ✅ Always use `Ctrl+C` to stop servers (don't force-kill)
- ✅ Run `npm install` in both root and backend after pulling
- ✅ Regular backups: `cp backend/database/college_app.db backup.db`
- ✅ Keep `.env` file safe (don't commit to Git)
- ✅ Check both servers are running before reporting issues

---

**Last Updated:** February 2026  
**Maintained By:** CollegeOS Development Team  
**For Latest Info:** Check `START_HERE.md` for current setup instructions

# CRITICAL: App Is Blank - Troubleshooting Guide

## The Problem

The frontend appears blank because **the backend is not running** or dependencies are not installed.

## Quick Fix (2 Steps)

### Step 1: Install Backend Dependencies

```bash
cd backend
npm install
```

**This installs:**
- `better-sqlite3` - Database driver (REQUIRED)
- `express` - Web server
- All other dependencies

### Step 2: Start Backend Server

```bash
# Still in backend directory
npm start
```

**You should see:**
```
info: Server running on port 5000 in development mode
info: Database: /path/to/backend/database/college_app.db
```

**Test it works:**
Open http://localhost:5000/health in your browser.
Should show: `{"success":true,"message":"College App Backend is running"...}`

### Step 3: Start Frontend (In New Terminal)

```bash
# From project root
npm install  # If not done
npm run dev
```

Open http://localhost:8080

## Why It's Blank

The frontend React app needs the backend API to fetch college data. Here's what happens:

1. **Frontend loads** → Shows empty page
2. **Frontend tries to fetch** → Calls `http://localhost:5000/api/colleges`
3. **Backend not running** → Request fails
4. **Result** → Blank page, no colleges

## Verification Steps

### 1. Check Backend Is Running

```bash
curl http://localhost:5000/health
```

**Expected:** JSON with `"success":true`
**If fails:** Backend is not running - go to Step 2 above

### 2. Check Colleges Endpoint

```bash
curl http://localhost:5000/api/colleges?limit=3
```

**Expected:** JSON array with 3 colleges
**If fails:** Database issue or model error

### 3. Check Frontend Can Connect

Open browser console (F12) when on http://localhost:8080
Look for:
- ✅ No network errors to `localhost:5000`
- ✅ API calls return data
- ❌ `net::ERR_CONNECTION_REFUSED` means backend not running

## Common Errors

### "Cannot find module 'better-sqlite3'"

**Cause:** Dependencies not installed
**Fix:** Run `cd backend && npm install`

### "ECONNREFUSED" in browser console

**Cause:** Backend not running
**Fix:** Run `cd backend && npm start` in separate terminal

### "No colleges found" (but backend is running)

**Cause:** Database is empty
**Fix:** 
```bash
cd backend
node scripts/seedCollegesNew.js
```

## Complete Startup Procedure

**Terminal 1 (Backend):**
```bash
cd backend
npm install          # One time
npm start            # Keep running
```

**Terminal 2 (Frontend):**
```bash
npm install          # One time (from root)
npm run dev          # Keep running
```

**Browser:**
- Visit http://localhost:8080
- Should see colleges loading
- If still blank, check browser console for errors

## Still Having Issues?

1. Check both terminals are running
2. Check `backend/database/college_app.db` file exists
3. Run `sqlite3 backend/database/college_app.db "SELECT COUNT(*) FROM colleges;"`
   - Should show `1100`
4. Check browser console (F12 → Console tab)
5. Check backend terminal for error messages

## The Root Cause

The issue is **NOT** with the code changes. The database schema is correct, routes are connected, and the College model works. The issue is:

1. Backend dependencies must be installed (`npm install`)
2. Backend must be running (`npm start`)  
3. Frontend must be running (`npm run dev`)

All three must be true for colleges to appear.

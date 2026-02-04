# 🔧 Local Development Sync Fix Guide

If you pulled the latest code from GitHub but changes aren't reflecting in your locally hosted application, follow this comprehensive guide.

## 📊 Quick Diagnosis Checklist

Run these commands to understand your current state:

```bash
# 1. Check which branch you're on
git branch

# 2. Check if you have uncommitted changes
git status

# 3. See last 5 commits
git log --oneline -5

# 4. Verify you're up to date
git fetch origin
git log --oneline HEAD..origin/main  # Shows commits on remote that you don't have
```

---

## 🛠️ Step-by-Step Fix

### Step 1: Ensure Correct Branch

```bash
# See all branches
git branch -a

# Switch to the correct branch (replace 'main' with your branch name)
git checkout main

# Pull latest changes
git pull origin main
```

**Expected output:** `Already up to date` or shows merged commits.

---

### Step 2: Install Dependencies (CRITICAL!)

**Many sync issues happen because new dependencies were added in the pulled code.**

```bash
# Install BACKEND dependencies
cd backend
npm install

# Install FRONTEND dependencies
cd ..
npm install
```

**Why this matters:** If the pulled code added new npm packages, your local `node_modules` won't have them until you run `npm install`.

---

### Step 3: Run Database Migrations

**If new database tables or columns were added, you need to run migrations:**

```bash
cd backend
node scripts/runMigrations.js
```

**Expected output:**
```
Migration completed successfully
✅ All migrations applied
```

**If you see errors about schema or corrupted database:**
```bash
cd backend
./fresh-start.sh
```

This deletes the old database and creates a fresh one with the correct schema.

---

### Step 4: Seed Database (If Needed)

```bash
cd backend
node scripts/seedCollegesNew.js
```

This populates the database with colleges data.

---

### Step 5: Restart Servers (IMPORTANT!)

**Kill any existing server processes first:**

**macOS/Linux:**
```bash
# Find and kill processes on port 5000 (backend)
lsof -ti:5000 | xargs kill -9 2>/dev/null || true

# Find and kill processes on port 8080 or 5173 (frontend)
lsof -ti:8080 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
```

**Windows (PowerShell):**
```powershell
# Find and kill process on port 5000
Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

# Find and kill process on port 8080 or 5173
Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
```

**Windows (Command Prompt):**
```cmd
netstat -ano | findstr :5000
:: Note the PID from the output, then:
taskkill /PID <PID_NUMBER> /F
```

**Start Backend (Terminal 1):**
```bash
cd backend
npm start
```

Wait for: `info: Server running on port 5000 in development mode`

**Start Frontend (Terminal 2):**
```bash
npm run dev
```

Wait for: `VITE ready in XXXms` and the localhost URL

---

### Step 6: Clear Browser Cache

**Even with server restart, your browser may cache old JavaScript:**

1. **Hard Refresh:**
   - Mac: `Cmd + Shift + R`
   - Windows/Linux: `Ctrl + Shift + R`

2. **Clear Cache:**
   - Open DevTools (F12)
   - Right-click the Refresh button
   - Select "Empty Cache and Hard Reload"

3. **Incognito/Private Mode:**
   - Try opening the app in an incognito window

---

### Step 7: Verify Changes Are Loaded

**Check Backend is Running:**
```bash
curl http://localhost:5000/health
```

**Expected response:**
```json
{"success":true,"message":"College App Backend is running","timestamp":"..."}
```

**Check Database has Data:**
```bash
cd backend
sqlite3 database/college_app.db "SELECT COUNT(*) FROM colleges;"
```

**Expected output:** `1100` or more (number of colleges)

**Check Frontend Console:**
1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for any error messages in red

---

## 🎯 Features That Should Be Working

After proper setup, these features should work:

| Feature | Location | Description |
|---------|----------|-------------|
| **Dashboard** | `/` | Main overview with stats |
| **College Search** | `/colleges` | Browse 1100+ colleges |
| **Research** | `/research` | Major-based college search |
| **Applications** | `/applications` | Track your applications |
| **Scholarships** | `/scholarships` | Search 10+ international scholarships |
| **Recommendations** | `/recommendations` | LOR management system |
| **Documents** | `/documents` | Document vault for uploads |
| **Essays** | `/essays` | Essay writing and tracking |
| **Deadlines** | `/deadlines` | Deadline calendar |
| **Requirements** | `/requirements` | Application requirements matrix |

### Automatic Deadline Addition Feature

When you add a college to your applications, the system automatically creates appropriate deadlines based on:
- **US Universities:** Early Action, Early Decision, Regular Decision, Financial Aid deadlines
- **UK Universities:** UCAS deadlines, Oxbridge special deadlines (Oct 15)
- **Canadian Universities:** Application and document submission deadlines

This is handled by `backend/services/deadlineGenerator.js`.

---

## ❌ Common Error Messages & Fixes

### "Cannot find module 'X'"
```bash
cd backend && npm install
cd .. && npm install
```

### "table X has no column named Y"
```bash
cd backend
./fresh-start.sh
```

### "EADDRINUSE: address already in use :::5000"

**macOS/Linux:**
```bash
lsof -ti:5000 | xargs kill -9 2>/dev/null || true
```

**Windows (PowerShell):**
```powershell
Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### "Failed to fetch" or "Network Error"
- Backend is not running
- Start it with: `cd backend && npm start`

### Blank Page / App Not Loading
1. Check if backend is running (must be on port 5000)
2. Check browser console for errors
3. Make sure both frontend and backend are running simultaneously

### "token" or "JWT" errors
```bash
cd backend
cp .env.example .env
npm start
```

---

## 🔄 Complete Reset Procedure

If nothing else works, do a complete reset:

```bash
# 1. Stash any local changes
git stash

# 2. Reset to remote state
git fetch origin
git reset --hard origin/main  # or your branch name

# 3. Delete node_modules
rm -rf node_modules
rm -rf backend/node_modules

# 4. Delete database
rm -f backend/database/college_app.db
rm -f backend/database/college_app.db-shm
rm -f backend/database/college_app.db-wal

# 5. Reinstall everything
npm install
cd backend && npm install

# 6. Setup database
node scripts/runMigrations.js
node scripts/seedCollegesNew.js

# 7. Start servers
npm start  # In backend directory
# In new terminal:
npm run dev  # In root directory
```

---

## 🆘 Still Having Issues?

1. **Check Git Status:**
   ```bash
   git status
   git diff
   ```
   
2. **Verify File Contents:**
   ```bash
   # Check if a specific file has the expected content
   head -20 backend/services/deadlineGenerator.js
   ```

3. **Check Process List:**
   ```bash
   ps aux | grep node
   ```

4. **Check Ports:**
   ```bash
   lsof -i :5000
   lsof -i :8080
   lsof -i :5173
   ```

---

## 📁 Key Files Reference

| File | Purpose |
|------|---------|
| `backend/src/app.js` | Main backend server |
| `backend/services/deadlineGenerator.js` | Automatic deadline generation |
| `src/App.tsx` | Frontend routing |
| `src/pages/*.tsx` | Frontend pages |
| `backend/database/college_app.db` | SQLite database |
| `backend/scripts/runMigrations.js` | Database schema setup |
| `backend/scripts/seedCollegesNew.js` | Data seeding |

---

**Tech Stack Reminder:**
- Frontend: React + Vite → `npm run dev` → `localhost:8080` or `localhost:5173`
- Backend: Express.js → `npm start` → `localhost:5000`
- Database: SQLite → `backend/database/college_app.db`

Both frontend and backend must be running simultaneously for the app to work!

# 🚀 START HERE - CollegeOS Setup

## Quick Start (4 Steps)

### 1️⃣ Install Dependencies

```bash
# Backend dependencies (REQUIRED)
cd backend
npm install

# Frontend dependencies (REQUIRED)
cd ..
npm install
```

**⚠️ IMPORTANT - Environment Variables:**
The backend requires a `.env` file with JWT secrets for authentication. This file should already exist. If you're setting up for the first time and it's missing:

```bash
cd backend
cp .env.example .env
```

The `.env` file contains development-safe secrets. **For production, generate strong secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2️⃣ Run Migrations (CRITICAL!)

```bash
cd backend
node scripts/runMigrations.js
```

**This creates the database schema with 30+ fields. MUST be done before seeding!**

### 3️⃣ Seed Database

```bash
# Still in backend directory
# Option A: Full dataset (997 colleges from 78 countries) - RECOMMENDED
node scripts/seedFromUnifiedData.js --force

# Option B: Basic dataset (41 colleges) - Minimal
node scripts/seedColleges.js --force
```

**Recommended: `seedFromUnifiedData.js`** populates the database with:
- 📊 **997 verified colleges** from 78 countries
- 🇺🇸 404 US colleges, 🇬🇧 91 UK, 🇮🇳 57 India, 🇨🇦 51 Canada, 🇦🇺 38 Australia
- 📖 **11,807 programs/majors**
- 🏆 **1,240 rankings** (QS, US News, etc.)
- 💰 Tuition data, acceptance rates, demographics, and more!

Uses the curated `unified_colleges.json` dataset.

### 4️⃣ Start Both Servers

**Terminal 1 - Backend:**
```bash
cd backend
npm start
```

Wait for: `info: Server running on port 5000`

**Terminal 2 - Frontend:**
```bash
npm run dev
```

Wait for: Frontend running on `http://localhost:8080`

**Test:** Open http://localhost:8080 in your browser

## ⚠️ Common Errors

### "table colleges has no column named type"

**Cause:** Database has old schema, migrations weren't run or failed.

**Quick Fix:**
```bash
cd backend
./fresh-start.sh
```

This deletes the old database and creates a fresh one.

**Manual Fix:**
```bash
cd backend
rm -f database/college_app.db  # Delete old database
rm -f database/college_app.db-shm  # Delete WAL files
rm -f database/college_app.db-wal
node scripts/runMigrations.js   # Create new schema
node scripts/seedCollegesNew.js  # Add data
```

### "database disk image is malformed" (Database Corruption)

**Cause:** Database file is corrupted (incomplete writes, crash, improper shutdown).

**Quick Fix:**
```bash
cd backend
./fresh-start.sh
```

This rebuilds the database from scratch.

See `DATABASE_CORRUPT_FIX.md` for detailed troubleshooting.

### "table users has no column named full_name" (Users Table Schema)

**Cause:** Users table has outdated schema (missing migration 006).

**Quick Fix:**
```bash
cd backend
./fresh-start.sh
```

This recreates the users table with correct schema.

See `USERS_TABLE_ERROR_FIX.md` for detailed troubleshooting.

### "Cannot find module 'better-sqlite3'"

**Cause:** Dependencies not installed.

**Solution:**
```bash
cd backend
npm install
```

### "Blank App"

**Cause:** Backend not running.

**Solution:**
1. Make sure migrations are run
2. Make sure database is seeded
3. Start backend: `cd backend && npm start`
4. Start frontend: `npm run dev`

## 🎯 What Should Work

Once both servers are running:

✅ **College Search** - Browse colleges
✅ **Search Bar** - Filter by name, program, country
✅ **Intelligent Search** - Ask questions
✅ **Chatbot** - Interactive assistance
✅ **Research** - Major-based college search

## 📝 Complete Setup Procedure

```bash
# Step 1: Install backend dependencies
cd backend
npm install

# Step 2: Run migrations (creates tables)
node scripts/runMigrations.js

# Step 3: Seed data (adds 41 world-class colleges)
node scripts/seedColleges.js --force

# Step 4: Start backend
npm start

# In another terminal...
# Step 5: Install frontend dependencies
npm install

# Step 6: Start frontend
npm run dev
```

## 🔍 Verify Setup

```bash
# Check database exists and has data
cd backend
sqlite3 database/college_app.db "SELECT COUNT(*) FROM colleges;"
# Should show: 41 (or more if additional seed scripts were run)

# Check backend is running
curl http://localhost:5000/health
# Should show JSON response
```

## 📁 Important

**Backend MUST run on port 5000**
**Frontend MUST run on port 8080**

Both must be running simultaneously for the app to work.

See `APP_BLANK_TROUBLESHOOTING.md` for detailed help.

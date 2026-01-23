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
node scripts/seedCollegesNew.js
```

This populates the database with 1100 colleges.

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
node scripts/runMigrations.js   # Create new schema
node scripts/seedCollegesNew.js  # Add data
```

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

✅ **College Search** - Browse 1100+ colleges
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

# Step 3: Seed data (adds 1100 colleges)
node scripts/seedCollegesNew.js

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
# Should show: 1100

# Check backend is running
curl http://localhost:5000/health
# Should show JSON response
```

## 📁 Important

**Backend MUST run on port 5000**
**Frontend MUST run on port 8080**

Both must be running simultaneously for the app to work.

See `APP_BLANK_TROUBLESHOOTING.md` for detailed help.

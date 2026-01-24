# Database Path Issues - Quick Fix Guide

## Problem: "Database path: ./database.sqlite" Error

If you see this in the seed script output:
```
📂 Database path: ./database.sqlite
❌ ERROR: Database schema is outdated!
Missing columns: type, official_website, ...
```

**The problem:** You have a `.env` file with the **OLD database path**.

---

## Quick Fix (Choose One)

### Option 1: Use fresh-start.sh (RECOMMENDED) ✅

```bash
cd backend
./fresh-start.sh
```

This script will:
- Detect your .env file issue
- Offer to fix it automatically
- Delete old database
- Create fresh database with correct schema

---

### Option 2: Manual .env Fix

**Step 1:** Check if you have a `.env` file:
```bash
cd backend
cat .env
```

**Step 2:** If you see `DATABASE_PATH=./database.sqlite`, you have the old path!

**Step 3:** Fix it:
```bash
# Option A: Delete the .env file (system will use defaults)
rm .env

# Option B: Update the .env file
# Change this line:
DATABASE_PATH=./database.sqlite

# To this:
DATABASE_PATH=./database/college_app.db
```

**Step 4:** Remove old database and start fresh:
```bash
rm -f database.sqlite database/college_app.db
node scripts/runMigrations.js
node scripts/seedCollegesNew.js
```

---

### Option 3: Use .env.example Template

```bash
cd backend

# Remove your old .env
rm .env

# Copy the correct template
cp .env.example .env

# Now run setup
./fresh-start.sh
```

---

## Why This Happens

The original CollegeOS used `database.sqlite` as the database path.

The new overhaul uses `database/college_app.db` with a unified schema.

If you have a `.env` file from before the overhaul, it overrides the default path and points to the old database with the old schema.

---

## Verification

After fixing, verify the correct path is being used:

```bash
cd backend
node -e "console.log(require('./src/config/env').database.path)"
```

Should output:
```
/full/path/to/backend/database/college_app.db
```

NOT:
```
./database.sqlite
```

---

## Still Having Issues?

1. **Delete ALL database files:**
   ```bash
   cd backend
   rm -f database.sqlite* database/*.db*
   ```

2. **Delete .env file:**
   ```bash
   rm .env
   ```

3. **Run fresh-start.sh:**
   ```bash
   ./fresh-start.sh
   ```

4. **Verify path:**
   ```bash
   node -e "console.log(require('./src/config/env').database.path)"
   ```

5. **Start backend:**
   ```bash
   npm start
   ```

---

## See Also

- `backend/MIGRATION_TROUBLESHOOTING.md` - Full migration guide
- `SCHEMA_ERROR_FIX.md` - Schema error solutions
- `START_HERE.md` - Complete setup guide

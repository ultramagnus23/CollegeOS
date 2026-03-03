# Troubleshooting: Zero Colleges Issue

## Problem
You've run seeding (`npm run seed`) and maybe scraping, but the application shows **zero colleges**.

---

## Quick Fix (Most Common)

### Option 1: Run Complete Setup ⭐ (Recommended)

```bash
cd backend
npm run db:setup
```

This will:
1. Create database directory if missing
2. Run migrations
3. Seed database
4. Verify everything works

### Option 2: Manual Setup

```bash
cd backend

# Step 1: Ensure database directory exists
mkdir -p database

# Step 2: Run migrations
npm run migrate

# Step 3: Seed database
node scripts/seedFromUnifiedData.js --force

# Step 4: Verify
npm run db:check
```

---

## Diagnostic Tool

To see what's wrong:

```bash
cd backend
npm run db:diagnose
```

This checks:
- ✅ Database directory exists
- ✅ Database file exists  
- ✅ Database has colleges
- ✅ Tables are created
- ✅ Configuration is correct

---

## Common Issues & Solutions

### Issue 1: Database Directory Missing

**Symptoms:**
```
Error: ENOENT: no such file or directory, open '.../database/college_app.db'
```

**Solution:**
```bash
cd backend
mkdir -p database
npm run migrate
npm run seed
```

---

### Issue 2: Database Empty After Seeding

**Symptoms:**
- Seeding completes without errors
- But database has 0 colleges

**Causes:**
1. Wrong seed script used
2. Seed data file missing
3. Database path mismatch

**Solution:**
```bash
cd backend

# Check which seed script you're using
cat package.json | grep "seed"

# Use the correct one for unified data:
node scripts/seedFromUnifiedData.js --force

# Verify:
npm run db:check
```

---

### Issue 3: Wrong Database Path

**Symptoms:**
- Database has colleges when checked directly
- But API returns empty array

**Solution:**

Check `backend/src/config/database.js`:
```javascript
const dbPath = path.join(__dirname, '../../database/college_app.db');
```

Should point to: `backend/database/college_app.db`

---

### Issue 4: Multiple Seed Scripts Confusion

The backend has **multiple seed scripts**:

| Script | Purpose | Use When |
|--------|---------|----------|
| `seedFromUnifiedData.js` ⭐ | Seeds 6322 colleges from unified_colleges.json | **Use this one!** |
| `seedVerifiedData.js` | Old verified data | Legacy |
| `seedMasterData.js` | Old master data | Legacy |
| `seedComprehensiveData.js` | Comprehensive seed | Alternative |

**Correct command:**
```bash
node scripts/seedFromUnifiedData.js --force
```

---

### Issue 5: Migrations Not Run

**Symptoms:**
```
SqliteError: no such table: colleges
```

**Solution:**
```bash
cd backend
npm run migrate
```

---

### Issue 6: Dependencies Not Installed

**Symptoms:**
```
Error: Cannot find module 'better-sqlite3'
```

**Solution:**
```bash
cd backend
npm install
```

---

## Verification Steps

After fixing, verify everything works:

### Step 1: Check Database

```bash
cd backend
npm run db:check
```

**Expected output:**
```
✅ Database file exists
✅ Found 20+ tables
✅ Total colleges: 6322
📝 Sample colleges:
   1. Harvard University (Cambridge, MA)
   2. Stanford University (Stanford, CA)
   ...
```

### Step 2: Query Directly

```bash
cd backend
sqlite3 database/college_app.db "SELECT COUNT(*) FROM colleges;"
```

**Expected:** Should show a number like `6322`

### Step 3: View Sample Data

```bash
cd backend
node scripts/viewCollegeData.js "Harvard"
```

**Expected:** Shows Harvard's full data

### Step 4: Test API

```bash
# In one terminal:
cd backend
npm run dev

# In another terminal:
curl http://localhost:3000/api/colleges?limit=5
```

**Expected:** Returns JSON array with 5 colleges

---

## Data Flow Reminder

```
unified_colleges.json (seed data)
    ↓ npm run seed
database/college_app.db (live database)
    ↓ API reads from
Backend API (/api/colleges)
    ↓ Frontend calls
React Frontend
```

**Key point:** The application reads from the **database**, not from JSON files!

---

## Start Fresh

If nothing works, start completely fresh:

```bash
cd backend

# Remove old database
rm -rf database/

# Start setup from scratch
npm run db:setup

# Verify
npm run db:check
```

This will create everything from scratch.

---

## Check Frontend Configuration

If database has colleges but frontend shows zero:

### Check API Base URL

In `src/config.js` or similar:
```javascript
const API_BASE_URL = 'http://localhost:3000/api';
```

### Check Frontend API Call

In colleges list component, ensure it calls:
```javascript
fetch('/api/colleges')
  .then(res => res.json())
  .then(data => {
    console.log('Colleges:', data); // Debug
    setColleges(data);
  });
```

### Check Browser Console

Open Developer Tools (F12) and check:
1. Network tab - Is API call succeeding?
2. Console tab - Any errors?
3. Response - Does API return data?

---

## Still Not Working?

### Run Full Diagnostic

```bash
cd backend

# Complete diagnostic
npm run db:diagnose

# View actual data
node scripts/viewDatabaseChanges.js

# Check specific college
node scripts/viewCollegeData.js "Duke University"

# Export to verify
node scripts/exportDatabaseToJSON.js
# Check: backend/data/unified_colleges_updated.json
```

### Check Logs

```bash
# Backend logs
cd backend
npm run dev

# Look for errors in console output
```

### Verify Seed File

```bash
cd backend
ls -lh data/unified_colleges.json

# Should show ~17MB file
```

If file is missing:
- Check if it was accidentally deleted
- May need to restore from git
- Or download fresh copy

---

## Prevention

To avoid this issue in the future:

### 1. Use Setup Script

Always use:
```bash
npm run db:setup
```

Instead of running migrations and seeding separately.

### 2. Check Before Starting

Before starting development:
```bash
npm run db:check
```

### 3. Use Correct Seed Script

Always use:
```bash
node scripts/seedFromUnifiedData.js --force
```

Not other seed scripts unless you know what they do.

---

## Quick Reference

| Command | What It Does |
|---------|--------------|
| `npm run db:setup` | Complete setup (recommended) |
| `npm run db:check` | Diagnose issues |
| `npm run migrate` | Create database tables |
| `npm run seed` | Seed database |
| `node scripts/seedFromUnifiedData.js --force` | Force reseed |
| `npm run db:diagnose` | Detailed diagnostic |

---

## Success Indicators

You know it's working when:

✅ `npm run db:check` shows thousands of colleges  
✅ API endpoint returns college data  
✅ Frontend displays college list  
✅ No errors in browser console  
✅ Backend starts without database errors  

---

## Need More Help?

1. Run: `npm run db:diagnose`
2. Check: `backend/data/scrape_log.json` for errors
3. Review: Browser console for frontend errors
4. Test: API endpoints directly with curl

If issue persists, check:
- File permissions on database directory
- Disk space availability
- Node.js version compatibility (need 18+)
- SQLite installation

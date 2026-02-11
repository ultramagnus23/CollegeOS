# PERMANENT FIX: Migration 031 Error

## Your Situation

You're getting this error:
```
❌ Error executing migration 031_application_deadlines.sql
no such column: offers_early_decision
```

**Even after:**
- Deleting the database
- Running fresh-start.sh
- Pulling latest changes

## The Real Problem

You have a **LOCAL MODIFIED VERSION** of the migration file that's different from what's in the repository.

## Definitive Solution

### Step 1: Force Update the Migration File

```bash
cd /home/runner/work/CollegeOS/CollegeOS

# Force overwrite your local version with the repo version
git checkout origin/copilot/remove-duplicate-data-files -- backend/migrations/031_application_deadlines.sql

# Verify it's correct
grep "FROM colleges" backend/migrations/031_application_deadlines.sql
```

**Expected result:** No output (the grep should find nothing)

If you see ANY output, the file still has the problem.

### Step 2: Verify the File Content

```bash
# Check line 66-94 should show INSERT with hard-coded VALUES
sed -n '66,94p' backend/migrations/031_application_deadlines.sql
```

**You should see:**
```sql
INSERT OR IGNORE INTO application_deadlines (
  college_id,
  early_decision_1_date,
  ...
) VALUES (
  2378,  -- Hard-coded college ID
  '2024-11-01',  -- Hard-coded date
  ...
);
```

**You should NOT see:**
```sql
SELECT ... FROM colleges WHERE offers_early_decision = 1;
```

### Step 3: Delete Database and Re-run

```bash
# Remove database
rm -f backend/database/college_app.db

# Run migrations
cd backend
npm run migrate

# Seed data
npm run seed
```

## Why This Happens

The migration file was updated in the repository, but:
1. Your local copy may have been modified
2. Git pull doesn't overwrite locally modified files
3. You need to force checkout the file from the repo

## Verification

After Step 1, run this:

```bash
md5sum backend/migrations/031_application_deadlines.sql
```

Compare with the repo version. They should match.

## If Still Failing

If you STILL get the error after forcing the file update:

### Option A: Copy-Paste Fix

1. Open `backend/migrations/031_application_deadlines.sql`
2. Delete ALL content
3. Copy the ENTIRE content from:
   https://github.com/ultramagnus23/CollegeOS/blob/copilot/remove-duplicate-data-files/backend/migrations/031_application_deadlines.sql
4. Paste into your local file
5. Save
6. Delete database and re-run migrations

### Option B: Manual Fix

Open `backend/migrations/031_application_deadlines.sql` and:

1. **REMOVE** any lines that look like:
```sql
INSERT INTO application_deadlines (...)
SELECT id, offers_early_decision, ...
FROM colleges
WHERE offers_early_decision = 1;
```

2. **KEEP** only lines that look like:
```sql
INSERT OR IGNORE INTO application_deadlines (...)
VALUES (
  2378,
  '2024-11-01',
  ...
);
```

## About Your Scraping Data

You mentioned losing scraping data. Important notes:

1. **Scraping data is stored separately** in:
   - `scrape_audit_log` table
   - `field_metadata` table
   - `scrape_statistics` table

2. These tables are created by migration 029, not 031

3. When you delete the database and re-run migrations, you lose:
   - ❌ Custom scraped data
   - ✅ But you can re-scrape (it's automated)

4. To preserve scraping data in the future:
```bash
# Before deleting database, backup scraping tables
sqlite3 backend/database/college_app.db ".dump scrape_audit_log" > scrape_backup.sql
sqlite3 backend/database/college_app.db ".dump field_metadata" >> scrape_backup.sql

# After migrations, restore
sqlite3 backend/database/college_app.db < scrape_backup.sql
```

## Success Check

After completing all steps:

```bash
# Test migration
cd backend
npm run migrate

# You should see:
# ✅ Executing 031_application_deadlines.sql...
# ✅ Migration 031_application_deadlines.sql completed successfully
```

## Summary

**The migration file in the repository is correct.**

**You need to:**
1. Force update your local file from the repo
2. Verify it doesn't have SELECT FROM colleges
3. Delete database
4. Re-run migrations

**Commands in order:**
```bash
git checkout origin/copilot/remove-duplicate-data-files -- backend/migrations/031_application_deadlines.sql
grep "FROM colleges" backend/migrations/031_application_deadlines.sql  # Should return nothing
rm -f backend/database/college_app.db
cd backend && npm run migrate && npm run seed
```

**Problem solved!** ✅

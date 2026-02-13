# Migration 031 Fix - Application Deadlines

## Problem
Getting error when running migration 031:
```
❌ Error executing migration 031_application_deadlines.sql
no such column: offers_early_decision
```

## Root Cause
You're running an OLD version of the migration file that had problematic INSERT statements trying to SELECT from non-existent columns.

## Solution

### Step 1: Pull Latest Changes
```bash
git pull origin copilot/remove-duplicate-data-files
```

This ensures you have the FIXED version of migration 031.

### Step 2: Verify Migration File
Check that your `backend/migrations/031_application_deadlines.sql` looks like this:

**✅ CORRECT VERSION (lines 66-94):**
```sql
INSERT OR IGNORE INTO application_deadlines (
  college_id,
  early_decision_1_date,
  ...
) VALUES (
  2378,  -- Hard-coded value
  '2024-11-01',
  ...
);
```

**❌ OLD VERSION (DO NOT USE):**
```sql
INSERT INTO application_deadlines (...)
SELECT id, ...
FROM colleges
WHERE offers_early_decision = 1;  -- This column doesn't exist!
```

### Step 3: Delete Old Database and Start Fresh
```bash
cd backend

# Delete the old database
rm -f database/college_app.db

# Run migrations with the fixed version
npm run migrate
```

### Step 4: Verify Success
```bash
# Check that the table was created
sqlite3 database/college_app.db ".schema application_deadlines"

# Should show the table structure
```

### Step 5: Populate Sample Data
```bash
# Seed the database
npm run seed

# Optionally add sample deadline data
npm run populate:deadlines
```

## What Was Fixed

The migration file was updated to:
1. ✅ Create the `application_deadlines` table structure only
2. ✅ Insert sample data using hard-coded VALUES
3. ✅ NOT try to SELECT from non-existent `colleges.offers_early_decision` column

## Alternative: Manual Fix

If you can't pull changes, manually edit `backend/migrations/031_application_deadlines.sql`:

1. Find any lines with `SELECT ... FROM colleges WHERE offers_`
2. Delete those INSERT statements
3. The table creation (lines 7-53) is fine, keep that
4. Sample data INSERTs using VALUES (lines 66-125) are fine, keep those

## Verification

After fixing, you should be able to run:
```bash
npm run backend:migrate
```

And see:
```
✅ Executing 031_application_deadlines.sql...
✅ Migration 031 complete
```

## Still Having Issues?

1. **Make sure you pulled latest code:**
   ```bash
   git status
   git log --oneline -1
   # Should show: "Complete: Phases 2-4 migrations..."
   ```

2. **Delete database completely:**
   ```bash
   rm -rf backend/database
   mkdir backend/database
   npm run backend:migrate
   npm run backend:seed
   ```

3. **Check migration file manually:**
   ```bash
   grep -n "SELECT.*FROM colleges" backend/migrations/031_application_deadlines.sql
   # Should return nothing (no SELECT from colleges)
   ```

## Summary

The migration 031 has been fixed in the repository. You just need to:
1. Pull latest changes
2. Delete old database  
3. Run migrations again

**Problem solved!** ✅

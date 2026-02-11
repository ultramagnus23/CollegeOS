# Quick Fix: Migration 031 Error

## The Problem
```
🔨 Executing 031_application_deadlines.sql...
❌ Error: no such column: offers_early_decision
```

## The Solution (Just 3 Commands!)

```bash
# 1. Pull the latest fixed version
git pull origin copilot/remove-duplicate-data-files

# 2. Delete your old database
rm -f backend/database/college_app.db

# 3. Re-run migrations
cd backend && npm run migrate && npm run seed
```

**That's it!** ✅

## Why This Works

The migration file is **already fixed** in the repository (commit `3a947ae`). You just need to:
1. Get the latest version (git pull)
2. Start with a clean database (rm database)
3. Run the fixed migration

## Verify It Worked

```bash
# Should see success message
npm run backend:migrate

# Verify table exists
sqlite3 backend/database/college_app.db ".schema application_deadlines"
```

## What Changed?

**Old version (caused error):**
```sql
SELECT id, offers_early_decision FROM colleges  -- ❌ Column doesn't exist
```

**Fixed version:**
```sql
VALUES (2378, '2024-11-01', ...)  -- ✅ Uses hard-coded values
```

## Still Having Issues?

See detailed troubleshooting: **`MIGRATION_031_FIX.md`**

Or ask for help with this info:
```bash
git log --oneline -1
# Should show: "Add MIGRATION_031_FIX.md..." or later
```

---

**Problem solved in 3 commands!** 🎉

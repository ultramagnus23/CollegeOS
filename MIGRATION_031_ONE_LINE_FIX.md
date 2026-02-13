# Migration 031: One Command Fix

## The Problem
```
❌ no such column: offers_early_decision
```

## The One-Line Fix

```bash
git checkout origin/copilot/remove-duplicate-data-files -- backend/migrations/031_application_deadlines.sql && rm -f backend/database/college_app.db && cd backend && npm run migrate && npm run seed
```

## What This Does

1. **Forces** the correct migration file from the repo (overwrites your local version)
2. **Deletes** the old database
3. **Runs** migrations (creates all tables fresh)
4. **Seeds** the database (adds 6322 colleges)

## Why It Works

Your local file is different from the repo version. This command forces the correct version from the repo and rebuilds everything.

## Verify Success

```bash
# Should complete without errors
cd backend && npm run migrate
```

## Alternative: Step-by-Step

If the one-liner doesn't work, follow the detailed guide in:
- `FIX_MIGRATION_031_PERMANENTLY.md`

## About Your Scraping Data

When you delete the database, you lose scraped data. To prevent this in the future, backup before deleting:

```bash
# Backup scraping data
sqlite3 backend/database/college_app.db ".dump scrape_audit_log" > scrape_backup.sql

# After migrations, restore
sqlite3 backend/database/college_app.db < scrape_backup.sql
```

**Done!** ✅

# Backend Scripts

## ⚠️ IMPORTANT: Run Migrations First!

Before seeding the database, you MUST run migrations to create the correct schema:

```bash
cd backend
node scripts/runMigrations.js
```

This creates the tables with the unified schema (30+ fields).

## Seeding the Database

### ✅ Use This Script
```bash
node scripts/seedCollegesNew.js
```

This is the **correct** script that:
- Uses the proper database path: `database/college_app.db`
- Matches the new unified schema (30+ fields)
- Seeds 1100+ colleges with comprehensive data
- **Checks schema before running** - will error if migrations not run

**Options:**
- `--force` - Clear existing data and reseed

**Example:**
```bash
cd backend

# Step 1: Run migrations (REQUIRED - do this first!)
node scripts/runMigrations.js

# Step 2: Seed data
node scripts/seedCollegesNew.js --force
```

### Common Error: "table colleges has no column named type"

**Cause:** You're trying to seed without running migrations first. The old schema doesn't have the `type` column and other new fields.

**Solution:**
```bash
# Run migrations to update schema
node scripts/runMigrations.js

# Then seed
node scripts/seedCollegesNew.js
```

### ❌ Deprecated Scripts
- `seedColleges.js` - **Do not use**. Points to old database path and old schema.

## Running Migrations

```bash
node scripts/runMigrations.js
```

This runs all SQL migrations in the `migrations/` directory in order:
- `001_create_colleges.sql` - Original schema
- `002_recommendations.sql` - Recommendations table
- `003_timeline.sql` - Timeline table
- `004_user_profile.sql` - User profile updates
- `005_unified_colleges_schema.sql` - **NEW unified schema with 30+ fields**

Migrations are tracked, so running this multiple times is safe - it only runs new migrations.

## Database Location

The database is located at: `backend/database/college_app.db`

All scripts have been updated to use this path via `src/config/env.js`.

## Complete Setup Process

```bash
cd backend

# 1. Install dependencies (if not done)
npm install

# 2. Run migrations to create/update schema
node scripts/runMigrations.js

# 3. Seed data
node scripts/seedCollegesNew.js

# 4. Verify
sqlite3 database/college_app.db "SELECT COUNT(*) FROM colleges;"
# Should return: 1100
```

## Verifying the Seed

After seeding, verify the data:

```bash
sqlite3 database/college_app.db "SELECT COUNT(*) FROM colleges;"
# Should return: 1100

sqlite3 database/college_app.db "SELECT country, COUNT(*) FROM colleges GROUP BY country;"
# Shows distribution by country
```

## Troubleshooting

**Error: "table colleges has no column named type"**
- You're using old schema
- Solution: Run `node scripts/runMigrations.js` first

**Error: "Cannot find module 'better-sqlite3'"**
- Dependencies not installed
- Solution: Run `npm install` in backend directory

**Error: "no such table: colleges"**
- Database not initialized
- Solution: Run `node scripts/runMigrations.js`

**Need to reset everything?**
```bash
# Delete database
rm -f database/college_app.db

# Run migrations
node scripts/runMigrations.js

# Seed data
node scripts/seedCollegesNew.js
```

## Migration Order Matters!

The migrations MUST be run in order:
1. First run: All migrations execute
2. Subsequent runs: Only new migrations execute

The script tracks which migrations have been run in a `migrations` table.

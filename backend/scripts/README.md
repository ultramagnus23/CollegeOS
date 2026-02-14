# Backend Scripts

## ⚠️ IMPORTANT: Run Migrations First!

Before seeding the database, you MUST run migrations to create the correct schema:

```bash
cd backend
node scripts/runMigrations.js
```

This creates all necessary tables using the SQL migrations in `backend/migrations/`.

## Seeding the Database

### ✅ Primary Seeding Script

```bash
node scripts/seedColleges.js
```

This is the **recommended** seeding script used by `fresh-start.sh`. It:
- Uses the proper database path: `database/college_app.db`
- Seeds 1100+ colleges with comprehensive data
- Checks schema before running - will error if migrations not run

**Example:**
```bash
cd backend

# Step 1: Run migrations (REQUIRED - do this first!)
node scripts/runMigrations.js

# Step 2: Seed data
node scripts/seedColleges.js
```

### 📦 Other Available Seeding Scripts

The following seeding scripts are available for specific use cases:

- **`populateRealCollegeData.js`** - Populates REAL 2025-2026 cycle data for 25 top universities (all Ivies, Stanford, MIT, Duke, UChicago, etc.) with actual deadlines and essay prompts. Use this for realistic test data.
- **`seedVerifiedData.js`** - Seeds verified college data with quality checks
- **`seedComprehensiveData.js`** - Comprehensive data with extended fields
- **`seedFromUnifiedData.js`** - Unified data import script
- **`seedMasterData.js`** - Master dataset seeder
- **`seedNormalizedMajors.js`** - Populates normalized majors data
- **`seedComprehensiveSampleData.js`** - Sample data for testing

**Note:** Most users should use `seedColleges.js` unless you have a specific need for one of the specialized seeders above.

### Common Error: "table colleges has no column named [column]"

**Cause:** You're trying to seed without running migrations first.

**Solution:**
```bash
# Run migrations to update schema
node scripts/runMigrations.js

# Then seed
node scripts/seedColleges.js
```

## Running Migrations

```bash
node scripts/runMigrations.js
```

This runs all SQL migrations in the `migrations/` directory in order (001 through 034).
Migrations are tracked in a `migrations` table, so running this multiple times is safe - it only runs new migrations.

## Database Location

The database is located at: `backend/database/college_app.db`

All scripts use this path via `src/config/env.js`.

## Complete Setup Process

```bash
cd backend

# 1. Install dependencies (if not done)
npm install

# 2. Run migrations to create/update schema
node scripts/runMigrations.js

# 3. Seed data
node scripts/seedColleges.js

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

**Error: "table colleges has no column named [column]"**
- You're using old schema
- Solution: Run `node scripts/runMigrations.js` first

**Error: "Cannot find module 'better-sqlite3'"**
- Dependencies not installed
- Solution: Run `npm install` in backend directory

**Error: "no such table: colleges"**
- Database not initialized
- Solution: Run `node scripts/runMigrations.js`

**Need to reset everything?**
Use the fresh-start script:
```bash
cd backend
./fresh-start.sh
```

Or manually:
```bash
# Delete database
rm -f database/college_app.db

# Run migrations
node scripts/runMigrations.js

# Seed data
node scripts/seedColleges.js
```

## Migration Order Matters!

The migrations MUST be run in order:
1. First run: All migrations execute
2. Subsequent runs: Only new migrations execute

The script tracks which migrations have been run in a `migrations` table.

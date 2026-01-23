# Backend Scripts

## Seeding the Database

### ✅ Use This Script
```bash
node scripts/seedCollegesNew.js
```

This is the **correct** script that:
- Uses the proper database path: `database/college_app.db`
- Matches the new unified schema (30+ fields)
- Seeds 1100+ colleges with comprehensive data

**Options:**
- `--force` - Clear existing data and reseed

**Example:**
```bash
cd backend
node scripts/seedCollegesNew.js --force
```

### ❌ Deprecated Scripts
- `seedColleges.js` - **Do not use**. Points to old database path and old schema.

## Running Migrations

```bash
node scripts/runMigrations.js
```

This runs all SQL migrations in the `migrations/` directory.

## Database Location

The database is located at: `backend/database/college_app.db`

All scripts have been updated to use this path via `src/config/env.js`.

## Verifying the Seed

After seeding, verify the data:

```bash
sqlite3 database/college_app.db "SELECT COUNT(*) FROM colleges;"
# Should return: 1100

sqlite3 database/college_app.db "SELECT country, COUNT(*) FROM colleges GROUP BY country;"
# Shows distribution by country
```

## Troubleshooting

**Error: "colleges database does not exist"**
- You're using the old `seedColleges.js` script
- Solution: Use `seedCollegesNew.js` instead

**Error: "column mismatch"**
- The database schema doesn't match the seed script
- Solution: Run migrations first, then use `seedCollegesNew.js`

**Need to reset everything?**
```bash
rm -f database/college_app.db
node scripts/runMigrations.js
node scripts/seedCollegesNew.js
```

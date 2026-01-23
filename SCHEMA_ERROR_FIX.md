# 🔧 Quick Fix: Schema Error

## Error: "table colleges has no column named type"

This means you need a fresh database with the correct schema.

### Quick Fix (Recommended)

```bash
cd backend
./fresh-start.sh
```

**What this does:**
1. Deletes old database files
2. Runs all migrations (creates correct schema)
3. Seeds 1100 colleges
4. Verifies everything works

### Manual Fix

```bash
cd backend

# Delete old database
rm -f database/college_app.db

# Create new schema
node scripts/runMigrations.js

# Add data
node scripts/seedCollegesNew.js
```

### Why This Happens

The original database had a simpler schema. The new version has 30+ fields to support:
- Multiple educational boards (CBSE, IB, IGCSE)
- Country-specific requirements (Studielink, UCAS, Common App)
- Detailed program and major information
- Financial data and deadlines

Migration 005 updates your schema to the new version, but if you have an old database from before the overhaul, you need to start fresh.

### If Migrations Keep Failing

If `node scripts/runMigrations.js` fails with errors about "grade_level" or other columns:

```bash
cd backend

# Complete cleanup
rm -f database/*.db*
rm -f *.db*

# Fresh start
./fresh-start.sh
```

### Verification

After running fresh-start.sh, verify:

```bash
# Check database exists
ls -lh database/college_app.db

# Check it has 1100 colleges
sqlite3 database/college_app.db "SELECT COUNT(*) FROM colleges;"

# Check schema is correct
sqlite3 database/college_app.db "PRAGMA table_info(colleges);" | grep "type"
```

### Next Steps

After successful setup:

```bash
# Start backend
npm start

# In another terminal, start frontend
cd ..
npm run dev
```

Visit http://localhost:8080

### More Help

- `backend/MIGRATION_TROUBLESHOOTING.md` - Detailed troubleshooting guide
- `START_HERE.md` - Complete setup instructions
- `APP_BLANK_TROUBLESHOOTING.md` - If app appears blank

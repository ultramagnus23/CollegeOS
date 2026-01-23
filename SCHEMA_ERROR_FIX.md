# 🔧 Quick Fix: Schema Error

## Error: "table colleges has no column named type"

This means you need to run migrations BEFORE seeding!

### Solution (Copy & Paste)

```bash
cd backend
node scripts/runMigrations.js
node scripts/seedCollegesNew.js
```

### What This Does

1. **Migrations** - Creates/updates the database schema with 30+ fields including:
   - `type` column (Public/Private)
   - `official_website`, `admissions_url`
   - `major_categories`, `academic_strengths`
   - `cbse_requirements`, `igcse_requirements`, `ib_requirements`
   - `studielink_required`, `numerus_fixus_programs`
   - And 20+ more fields

2. **Seeding** - Populates database with 1100 colleges

### Complete Fresh Start

If you want to start completely fresh:

```bash
cd backend

# Delete old database
rm -f database/college_app.db

# Create new schema
node scripts/runMigrations.js

# Add data
node scripts/seedCollegesNew.js

# Verify
sqlite3 database/college_app.db "SELECT COUNT(*) FROM colleges;"
```

### Why This Happens

The original database had a simpler schema. The new version has 30+ fields to support:
- Multiple educational boards (CBSE, IB, IGCSE)
- Country-specific requirements (Studielink, UCAS, Common App)
- Detailed program and major information
- Financial data and deadlines

The migration updates your schema to the new version.

### Files Changed

- **Migration**: `backend/migrations/005_unified_colleges_schema.sql`
- **Seed Script**: `backend/scripts/seedCollegesNew.js`

Both now work together. Migration creates the schema, seed fills it with data.

### Next Steps

After running migrations and seeding:

```bash
# Start backend
npm start

# In another terminal, start frontend
npm run dev
```

Visit http://localhost:8080

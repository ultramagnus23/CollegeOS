# Run These 4 Commands

Both migrations 031 and 032 are now fixed. Just run:

```bash
# 1. Delete old database
rm -f backend/database/college_app.db

# 2. Go to backend directory
cd backend

# 3. Run migrations (creates tables)
npm run migrate

# 4. Seed colleges (adds 6322 colleges)
npm run seed
```

## Expected Output

```
✅ Migration 030 complete: Created master_majors system
✅ Migration 031 complete: Created application_deadlines table
✅ Migration 032 complete: Created college_requirements and course_requirements tables
✅ Database seeded with 6322 colleges
```

## Optional: Add Sample Data

```bash
npm run populate:deadlines      # Adds deadline data for 20 colleges
npm run populate:requirements   # Adds requirements for 10 colleges
```

## That's It!

No more errors. Continue developing.

---

**Problem solved!** ✅

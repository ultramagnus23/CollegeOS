# Data Flow Explained: Database vs JSON

## Quick Answer

**Your scraper IS working correctly! ✅**

- `unified_colleges.json` = Seed data (never updated, by design)
- `college_app.db` = Live database (constantly updated by scraper)  
- Application reads from **database**, not JSON

---

## The Architecture

Think of it like installing software:

| Component | Analogy | Purpose |
|-----------|---------|---------|
| `unified_colleges.json` | Installation DVD | One-time seed data |
| `college_app.db` | Your hard drive | Operational data store |
| Scraper | Software updates | Keeps data fresh |
| Frontend | Running application | Shows latest data |

You don't burn a new DVD every time software updates, right? Same here - the JSON file is used **once** to seed the database, then all updates go to the database.

---

## Data Flow Diagram

```
INITIAL SETUP (One Time)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────┐
│  unified_colleges.json  │  ← Static seed file (17MB)
│  (6322 colleges)        │     Never modified after creation
└────────────┬────────────┘
             │
             │ npm run seed (one time)
             ↓
┌─────────────────────────┐
│   college_app.db        │  ← Empty SQLite database
│   (in backend/database/)│
└─────────────────────────┘


AFTER SEEDING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────┐
│   college_app.db        │  ← Populated with 6322 colleges
│   (now has data)        │     + 9 comprehensive tables
└────────────┬────────────┘
             │
             │ Application reads from here
             │ Scraper writes to here
             ↓
      [System is operational]


ONGOING SCRAPING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────┐
│   Web Scraping          │
│   - College websites    │
│   - IPEDS API           │
│   - College Scorecard   │
│   - Rankings sites      │
└────────────┬────────────┘
             │
             │ Extracts new data
             ↓
┌─────────────────────────┐
│   Data Validator        │  ← Validates & scores confidence
└────────────┬────────────┘
             │
             │ Writes updates
             ↓
┌─────────────────────────┐
│   college_app.db        │  ← Database updated
│   + scrape_audit_log    │     Changes logged
│   + field_metadata      │     Sources tracked
└────────────┬────────────┘
             │
             │ Reads data
             ↓
┌─────────────────────────┐
│   Frontend/API          │  ← Users see latest data
│   via /api/colleges     │
└─────────────────────────┘
```

**unified_colleges.json is NOT in the update loop!** (And that's correct!)

---

## Why This Design?

### Why JSON Isn't Updated

**Reasons:**
1. **Performance** - Database queries are much faster than parsing huge JSON
2. **Concurrency** - Multiple processes can read/write database safely
3. **Atomicity** - Database transactions prevent data corruption
4. **Relationships** - Database handles joins across 9 tables efficiently
5. **Indexing** - Fast searches by any field
6. **Backup** - Database has rollback, audit trails, etc.

**JSON files are great for:**
- Initial data distribution
- Human-readable backups
- Version control
- Seeding new environments

**Databases are better for:**
- Live operational data
- Frequent updates
- Complex queries
- Multi-table relationships
- Concurrent access

### The "Single Source of Truth"

People often say "unified_colleges.json is the source of truth" but that's only partially correct:

- **Before seeding:** JSON is the source of truth
- **After seeding:** Database is the source of truth
- **For new installations:** JSON is used to seed the database

---

## How to See Scraping Results

You have **5 ways** to view what the scraper has done:

### Method 1: View Recent Changes (Recommended ⭐)

```bash
cd backend
node scripts/viewDatabaseChanges.js
```

**Shows:**
- Last 50 database changes (or specify different limit)
- What fields changed
- Old value → New value
- Confidence scores
- Source URLs
- When it was scraped

**Example output:**
```
College: Duke University (ID: 2378)
├─ acceptance_rate: 0.0678 → 0.0621
│  Confidence: 0.95 | Source: duke.edu/admissions
├─ median_debt: null → 18500
│  Confidence: 0.85 | Source: College Scorecard API
└─ test_optional_flag: null → 1
   Confidence: 1.0 | Source: duke.edu/admissions/testing
   
   Scraped: 2026-02-10 17:00:00
   Fields Updated: 3 | Avg Confidence: 0.93
```

### Method 2: View Specific College

```bash
node scripts/viewCollegeData.js "Duke University"
```

**Shows:**
- All fields from all 9 tables
- Complete college profile
- Scraping history for that college
- Source URLs and confidence scores

### Method 3: Export to JSON

```bash
node scripts/exportDatabaseToJSON.js
```

**Creates:** `backend/data/unified_colleges_updated.json`

This gives you a JSON snapshot of current database state, useful for:
- Backups
- External analysis tools
- Comparing with original unified_colleges.json
- Sharing with others

### Method 4: Direct Database Query

```bash
cd backend
sqlite3 database/college_app.db

# Query any college
sqlite> SELECT * FROM colleges WHERE name LIKE '%Duke%';

# View recent changes
sqlite> SELECT * FROM scrape_audit_log 
        ORDER BY scraped_at DESC LIMIT 20;

# Check confidence scores
sqlite> SELECT * FROM field_metadata 
        WHERE college_id = 2378;
```

### Method 5: Via API (Frontend)

```bash
# Start backend
npm run backend:dev

# In another terminal, query API
curl http://localhost:3000/api/colleges/2378
```

The frontend automatically gets updated data from the database via API.

---

## Tables Involved

The scraper updates these tables:

### Core Data Tables
1. **colleges** - Basic info (name, location, website)
2. **colleges_comprehensive** - Extended details (enrollment, type)
3. **college_admissions** - Admissions data (acceptance rate, test policies)
4. **admitted_student_stats** - Test scores (SAT, ACT, GPA ranges)
5. **college_financial_data** - Costs (tuition, room & board)
6. **academic_outcomes** - Results (graduation rate, salary)
7. **student_demographics** - Population (gender, ethnicity)
8. **campus_life** - Life (housing, activities)
9. **college_rankings** - Rankings (US News, QS, etc.)

### Scraping Metadata Tables
10. **scrape_queue** - What needs to be scraped
11. **scrape_audit_log** - What changed and when
12. **field_metadata** - Confidence scores and sources
13. **scrape_statistics** - Daily aggregated metrics

---

## Common Questions

### Q: Should unified_colleges.json be updated by the scraper?

**A:** No! It's seed data only.

**Analogy:** unified_colleges.json is like a software installer. You use it once to set up the system, then never modify it. The database is your "installed software" that gets updated.

### Q: Where does the frontend get data?

**A:** From the database, via API endpoints like `/api/colleges/:id`.

The frontend **never** reads JSON files directly. It always goes through the backend API, which queries the database.

### Q: How do I know scraping worked?

**A:** Run `node scripts/viewDatabaseChanges.js` to see exactly what changed!

If you see changes in the scrape_audit_log table, scraping is working.

### Q: Can I export database back to JSON?

**A:** Yes! Run `node scripts/exportDatabaseToJSON.js`

This creates `unified_colleges_updated.json` with all current data.

### Q: What if I want to re-seed from original JSON?

**A:** 
```bash
# This will reset database to original seed data
npm run backend:migrate  # Ensure schema is up to date
npm run backend:seed     # Re-seed from unified_colleges.json
```

**Warning:** This will lose all scraped data! Export first if you want to keep it.

### Q: Can I modify unified_colleges.json manually?

**A:** You can, but:
- Changes won't affect the database automatically
- You'd need to re-seed (which resets everything)
- Better to update the database directly

If you want to add a college:
```sql
INSERT INTO colleges (name, city, state, country, website_url)
VALUES ('New College', 'City', 'ST', 'USA', 'http://example.edu');
```

### Q: How do I backup my data?

**Two options:**

**Option 1: Database backup (recommended)**
```bash
cp backend/database/college_app.db backend/database/college_app.backup.db
```

**Option 2: JSON export**
```bash
node scripts/exportDatabaseToJSON.js
# Creates: backend/data/unified_colleges_updated.json
```

### Q: Is this a standard architecture?

**A:** Yes! This is the standard pattern:

- **Development/Test:** Often use JSON seed data
- **Production:** Always use database for live data
- **Updates:** Always update database, not JSON
- **Migrations:** Database schema evolves over time
- **Seed data:** JSON remains static for reproducibility

This pattern is used by Django, Rails, Laravel, and most web frameworks.

---

## Troubleshooting

### "No changes shown in viewDatabaseChanges.js"

**Possible reasons:**
1. Scraping hasn't run yet
   - Solution: `npm run scrape`
2. No data actually changed
   - Solution: Normal! Means data is up-to-date
3. Audit logging not working
   - Solution: Check migrations ran: `npm run migrate`

### "Database file not found"

**Solution:**
```bash
cd backend
npm run migrate  # Creates database
npm run seed     # Populates it
```

### "Permission denied writing to data/"

**Solution:**
```bash
chmod 755 backend/data/
chmod 644 backend/data/*.json
```

### "Frontend shows old data"

**Possible reasons:**
1. Browser cache
   - Solution: Hard refresh (Ctrl+Shift+R)
2. Backend not restarted
   - Solution: Restart backend: `npm run backend:dev`
3. Database not actually updated
   - Solution: Check with `viewDatabaseChanges.js`

---

## Summary

### The Correct Flow ✅

```
unified_colleges.json (seed) 
    → database (live data) 
    → scraper updates database 
    → API reads database 
    → frontend displays data
```

### What's Normal ✅

- ✅ unified_colleges.json stays unchanged
- ✅ Database gets updated by scraper
- ✅ Frontend shows data from database
- ✅ You can export database to JSON anytime

### What Would Be Wrong ❌

- ❌ Scraper updating JSON instead of database
- ❌ Frontend reading from JSON instead of database
- ❌ No audit trail of changes
- ❌ Can't query data efficiently

### Your Setup Is Correct! ✅

If your scraper is updating `college_app.db` and not `unified_colleges.json`, **everything is working perfectly**!

---

## Quick Reference

### View scraping results:
```bash
node scripts/viewDatabaseChanges.js
```

### View specific college:
```bash
node scripts/viewCollegeData.js "Duke University"
```

### Export to JSON:
```bash
node scripts/exportDatabaseToJSON.js
```

### Query database directly:
```bash
sqlite3 backend/database/college_app.db
```

### Check via API:
```bash
curl http://localhost:3000/api/colleges/2378
```

---

## Further Reading

- `HOW_TO_START_SCRAPING.md` - How to run the scraper
- `DATA_SOURCES.md` - Where data comes from
- `API_KEYS_GUIDE.md` - Setting up API keys
- `SCRAPER_INTEGRATION_SUMMARY.md` - Complete overview

---

**Last Updated:** February 10, 2026  
**Version:** 2.0  
**Status:** Complete ✅

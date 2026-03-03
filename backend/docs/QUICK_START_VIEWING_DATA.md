# Quick Start: Viewing Scraping Results

## Your Question Answered

**Q:** "The scraper updates colleges.db but not unified_colleges.json. Is this correct?"

**A:** **YES! ✅ This is exactly how it should work!**

---

## Understanding the Architecture

```
unified_colleges.json  →  [one-time seeding]  →  college_app.db
                                                        ↓
                                                  [scraper updates]
                                                        ↓
                                                  [application reads]
                                                        ↓
                                                   Frontend Display
```

**Think of it like:**
- `unified_colleges.json` = Installation DVD (use once, never modify)
- `college_app.db` = Your hard drive (constantly updated)

---

## 5 Ways to View Results

### 1. View Recent Changes (⭐ Start Here!)

```bash
cd backend
node scripts/viewDatabaseChanges.js
```

**What you'll see:**
- Last 50 database updates
- What fields changed (old → new)
- Confidence scores
- Source URLs
- When it happened

### 2. View Specific College

```bash
node scripts/viewCollegeData.js "Duke University"
```

**What you'll see:**
- All data from all 9 tables
- Complete college profile
- Scraping history
- Sources and confidence scores

### 3. Export to JSON

```bash
node scripts/exportDatabaseToJSON.js
```

**Creates:** `backend/data/unified_colleges_updated.json`

Use for backups or external analysis.

### 4. Query Database

```bash
sqlite3 backend/database/college_app.db
```

Then run SQL queries:
```sql
-- See recent changes
SELECT * FROM scrape_audit_log 
ORDER BY scraped_at DESC LIMIT 20;

-- Check specific college
SELECT * FROM colleges WHERE name LIKE '%Duke%';

-- View confidence scores
SELECT * FROM field_metadata WHERE college_id = 2378;
```

### 5. API Endpoint

```bash
# Start backend
npm run backend:dev

# Query API
curl http://localhost:3000/api/colleges/2378
```

---

## What's Happening

| Component | What It Does | File |
|-----------|--------------|------|
| Seed Data | Initial data for setup | `unified_colleges.json` (static) |
| Live Database | Operational data store | `college_app.db` (dynamic) |
| Scraper | Updates database | Various sources |
| Audit Log | Tracks changes | `scrape_audit_log` table |
| Field Metadata | Tracks sources | `field_metadata` table |
| Frontend | Displays data | Reads from database via API |

---

## Example Output

When you run `node scripts/viewDatabaseChanges.js`:

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

---

## Common Questions

**Q: Why doesn't unified_colleges.json update?**  
A: It's seed data only. Database is the operational data store.

**Q: Where does frontend get data?**  
A: From database via API (`/api/colleges/:id`).

**Q: How do I backup data?**  
A: Either copy `college_app.db` or run `exportDatabaseToJSON.js`.

**Q: Can I re-seed the database?**  
A: Yes: `npm run seed` (but this resets to original data).

**Q: Is this standard?**  
A: Yes! Django, Rails, Laravel all work this way.

---

## Further Reading

- `DATA_FLOW_EXPLAINED.md` - Complete architecture guide
- `HOW_TO_START_SCRAPING.md` - How to run scraper
- `DATA_SOURCES.md` - Where data comes from
- `SCRAPER_INTEGRATION_SUMMARY.md` - Full overview

---

**Start viewing your data now:**

```bash
cd backend
node scripts/viewDatabaseChanges.js
```

✅ **Your scraper is working perfectly!**

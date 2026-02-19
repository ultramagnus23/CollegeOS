# 🚀 How to Start the College Data Scraping Service

## Overview
The CollegeOS scraping system collects and updates college data from multiple authoritative sources with full transparency and audit logging.

---

## Prerequisites

### 1. Install Dependencies
```bash
cd backend
npm install
```

**Required packages** (already in package.json):
- `axios` - HTTP requests
- `cheerio` - HTML parsing
- `puppeteer` - Headless browser for JavaScript-heavy sites
- `robots-parser` - robots.txt compliance
- `better-sqlite3` - Database

### 2. Database Setup
```bash
# Run all migrations (creates scraping tables)
npm run migrate

# Seed colleges from unified_colleges.json
npm run seed
```

This creates these tables:
- `scrape_queue` - Priority queue for colleges to scrape
- `scrape_audit_log` - Complete audit trail of all data changes
- `field_metadata` - Source tracking with confidence scores
- `scrape_statistics` - Daily metrics
- `scrape_history` - Historical scrape attempts

### 3. Environment Configuration

**Edit `backend/.env`** (copy from `.env.example`):

```bash
# Required for basic scraping
SCRAPING_USER_AGENT=CollegeOS/1.0 (Educational Research)
SCRAPING_DELAY_MS=2000
REQUEST_TIMEOUT_MS=30000

# Optional API Keys (improves data quality)
# Get from: https://api.data.gov/signup/
DATA_GOV_API_KEY=your_api_key_here

# IPEDS API (optional - uses bulk CSV otherwise)
# No API key needed - uses public data downloads
# https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx

# College Scorecard API (uses DATA_GOV_API_KEY above)
# https://collegescorecard.ed.gov/data/documentation/
```

---

## 🎯 Starting the Scraper

### Option 1: One-Time Full Scrape (Recommended for Initial Setup)

```bash
cd backend
npm run scrape
```

**What it does:**
- Processes ALL colleges in database
- Batch processing (50 at a time)
- Auto-resume capability (saves progress)
- Retry logic (3 attempts per college)
- Respects robots.txt and rate limits

**Expected output:**
```
╔════════════════════════════════════════════════════════════╗
║          CollegeOS Comprehensive Data Scraper              ║
╚════════════════════════════════════════════════════════════╝

📚 Found 6322 colleges to process
📂 Progress file: backend/data/scrape_progress.json
📝 Log file: backend/data/scrape_log.json
🔄 Batch size: 50
🔁 Max retries: 3

========== BATCH 1/127 (50 colleges) ==========
📊 Processing college 1/6322 (0.0%)...
   📍 Harvard University (United States)
✅ Scraped Harvard University
...
```

**Duration:** ~3-6 hours for all 6322 colleges (with rate limiting)

### Option 2: Orchestrated Scraping (Production Mode)

```bash
# Initialize priority queue
npm run scrape:init

# Get today's batch (72 top colleges or 100 others)
npm run scrape:batch

# Then run scraper on the batch
# (You'd schedule this daily with cron)
npm run scrape
```

### Option 3: Test Single College

```bash
# Test with Duke University
node scripts/testScraperDuke.js
```

---

## 📊 Monitoring Progress

### Real-Time Progress

While scraping is running, you'll see:
```
📊 Processing college 150/6322 (2.4%)...
   📍 Stanford University (United States)
✅ Scraped Stanford University
   Sources: CDS, website
   Fields updated: 12
```

### Check Progress File
```bash
cat backend/data/scrape_progress.json
```

Shows:
- `lastCompletedId` - Last successfully scraped college
- `completedIds` - Array of all completed college IDs
- Can resume from here if interrupted

### View Metrics
```bash
# See queue status and metrics
npm run scrape:metrics
```

### Generate Report
```bash
# Comprehensive monitoring report
npm run monitor:report
```

---

## 🔄 Resume After Interruption

If scraping stops (network issue, manual stop, etc.):

```bash
# Just run again - it auto-resumes!
npm run scrape
```

The scraper will:
- ✅ Skip already-completed colleges
- ✅ Continue from where it stopped
- ✅ Show "Resuming from previous run: X already completed"

**To start fresh:**
```bash
npm run scrape:reset
```

---

## 📈 Monitoring & Logs

### Log Files

**`backend/data/scrape_log.json`** - Detailed log with timestamps
```json
[
  {
    "timestamp": "2026-02-10T17:00:00Z",
    "level": "SUCCESS",
    "message": "Scraped Harvard University",
    "sources": ["CDS", "website"]
  }
]
```

**`backend/data/scrape_summary.json`** - Final summary
```json
{
  "total": 6322,
  "succeeded": 5890,
  "failed": 432,
  "successRate": "93.2%",
  "duration": "4.5 hours"
}
```

### Database Audit Trail

**Query audit log:**
```sql
SELECT * FROM scrape_audit_log 
WHERE college_id = 2378 
ORDER BY scraped_at DESC;
```

Shows:
- Which fields changed
- Old vs new values
- Confidence scores
- Source URLs
- Extraction methods

---

## 🌍 Data Sources Used

### Priority Order (US Colleges):

1. **Common Data Set (CDS)** - Official institutional data
   - Confidence: 1.0
   - Example: `duke.edu/oir/common-data-set`
   - Status: Requires PDF parsing (planned)

2. **IPEDS Database** - Federal education database
   - Confidence: 0.95
   - Source: `https://nces.ed.gov/ipeds/`
   - Status: CSV bulk download (free)

3. **College Scorecard API** - Department of Education
   - Confidence: 0.95
   - Source: `https://api.data.gov/ed/collegescorecard/`
   - Requires: DATA_GOV_API_KEY

4. **College Website** - Official .edu sites
   - Confidence: 0.85-0.90
   - Example: `duke.edu/admissions`
   - Method: Cheerio HTML parsing

### International Colleges:

1. **Official University Website** (primary)
2. **QS World Rankings API** (if available)
3. **Times Higher Education** (web scraping)

---

## 🔍 Data Transparency

### Every Data Point Tracked

For each field updated, we store:
- ✅ **Source URL** - Exact page where data found
- ✅ **Extraction Method** - CSS selector, regex, or API
- ✅ **Confidence Score** - 0.5 to 1.0
- ✅ **Timestamp** - When scraped
- ✅ **Old vs New Value** - Complete audit trail

**Example audit entry:**
```json
{
  "college_id": 2378,
  "field_name": "acceptance_rate",
  "old_value": "0.0678",
  "new_value": "0.0621",
  "source_url": "https://duke.edu/admissions/class-profile",
  "extraction_method": "CSS selector: .admissions-stats .acceptance-rate",
  "confidence_score": 0.95,
  "scraped_at": "2026-02-10T17:30:00Z"
}
```

### Query Data Sources

```bash
# See where each field came from
node -e "
const db = require('better-sqlite3')('./database/college_app.db');
const rows = db.prepare(\`
  SELECT field_name, source_url, extraction_method, confidence_score
  FROM field_metadata
  WHERE college_id = 2378
\`).all();
console.log(JSON.stringify(rows, null, 2));
"
```

---

## ⚙️ Configuration Options

### Edit `backend/scripts/scrapeAllColleges.js`:

```javascript
const CONFIG = {
  BATCH_SIZE: 50,              // Colleges per batch
  MAX_RETRIES: 3,              // Retry attempts
  RETRY_DELAY_MS: 2000,        // Initial retry delay
  REQUEST_TIMEOUT_MS: 30000,   // HTTP timeout
  DELAY_BETWEEN_REQUESTS_MS: 500,  // Rate limiting
  // ... more options
};
```

**Adjust based on:**
- Network speed
- Rate limiting requirements
- Server capacity

---

## 🚨 Troubleshooting

### Problem: "no such table: scrape_queue"

**Solution:**
```bash
npm run migrate
```

### Problem: "Only 8 colleges in database"

**Solution:**
```bash
npm run seed
```

### Problem: Too many rate limit errors

**Solution:** Increase `DELAY_BETWEEN_REQUESTS_MS` in config:
```javascript
DELAY_BETWEEN_REQUESTS_MS: 2000,  // Increase to 2 seconds
```

### Problem: Scraper hangs on specific college

**Solution:** Check log file, then manually skip:
```bash
# Edit scrape_progress.json to add college ID to completedIds
# Then resume
npm run scrape
```

### Problem: Need to reset everything

**Solution:**
```bash
npm run scrape:reset
rm backend/data/scrape_progress.json
rm backend/data/scrape_log.json
npm run scrape
```

---

## 📅 Scheduling (Production)

### Daily Automated Scraping

**Using cron (Linux/Mac):**
```bash
# Edit crontab
crontab -e

# Add this line (runs at 2 AM daily)
0 2 * * * cd /path/to/CollegeOS/backend && npm run scrape:batch && npm run scrape >> /var/log/college-scraper.log 2>&1
```

**Using pm2 (Node.js process manager):**
```bash
npm install -g pm2
pm2 start npm --name "college-scraper" -- run scrape
pm2 save
pm2 startup
```

**Using Task Scheduler (Windows):**
1. Open Task Scheduler
2. Create Task
3. Trigger: Daily at 2:00 AM
4. Action: Start program
   - Program: `C:\Program Files\nodejs\node.exe`
   - Arguments: `scripts/scrapeAllColleges.js`
   - Start in: `C:\path\to\CollegeOS\backend`

---

## 🎯 Success Criteria

After running scraper, verify:

1. ✅ **Success rate >85%**
   ```bash
   # Check scrape_summary.json
   cat backend/data/scrape_summary.json
   ```

2. ✅ **Audit log has entries**
   ```sql
   SELECT COUNT(*) FROM scrape_audit_log;
   ```

3. ✅ **Field metadata populated**
   ```sql
   SELECT COUNT(*) FROM field_metadata;
   ```

4. ✅ **Data completeness improved**
   ```bash
   npm run scrape:metrics
   ```

---

## 📚 Additional Resources

- **API Keys:** See `API_KEYS_GUIDE.md`
- **Data Sources:** See `DATA_SOURCES.md`
- **Architecture:** See `SCRAPER_DISCOVERY_REPORT.md`
- **Phase 2 Details:** See `PHASE_2_COMPLETE.md`

---

## 🆘 Support

If you encounter issues:

1. Check logs: `backend/data/scrape_log.json`
2. Review audit trail: `scrape_audit_log` table
3. Test single college: `node scripts/testScraperDuke.js`
4. Reset and retry: `npm run scrape:reset && npm run scrape`

---

**Last Updated:** February 10, 2026  
**Version:** 2.0 (Phase 2 Complete)

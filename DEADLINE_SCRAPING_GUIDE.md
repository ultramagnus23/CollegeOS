# Automated Deadline Scraping System - Complete Guide

## Overview

The automated deadline scraping system is a comprehensive solution for extracting, updating, and managing college application deadlines across thousands of institutions. It intelligently scrapes college websites, detects changes, notifies users, and maintains data accuracy through confidence scoring and manual review processes.

## 🏗️ Architecture

### Core Components

1. **Date Parser** (`backend/src/utils/dateParser.js`)
   - Parses 10+ date formats
   - Intelligent year inference
   - Relative date handling ("early November")

2. **Deadline Extraction Service** (`backend/src/services/deadlineExtractionService.js`)
   - Multi-format extraction (tables, lists, paragraphs)
   - Deadline type detection (ED1, ED2, EA, REA, RD, Rolling)
   - Confidence scoring

3. **Scraping Service** (`backend/src/services/scrappingService.js`)
   - URL pattern matching
   - Fallback strategies
   - Rate limiting & robots.txt compliance

4. **Scraping Orchestrator** (`backend/src/services/deadlineScrapingOrchestrator.js`)
   - Change detection
   - Database updates
   - User notifications
   - Failure handling

5. **Scheduler** (`backend/src/jobs/deadlineScrapingScheduler.js`)
   - Two-tier scheduling system
   - Cron job management
   - Priority recalculation

## 📊 Database Schema

### New Tables (Migration 034)

**scraping_logs:**
```sql
- id (PRIMARY KEY)
- college_id (FOREIGN KEY)
- scrape_type ('deadlines')
- url_visited
- started_at, completed_at
- status ('success'/'failure'/'partial')
- deadlines_found (count)
- changes_detected (count)
- error_message
- confidence_score (0.0-1.0)
- extraction_method ('table'/'list'/'paragraph')
- duration_ms
```

**manual_review_queue:**
```sql
- id (PRIMARY KEY)
- college_id (FOREIGN KEY)
- reason (text)
- confidence_score
- error_details
- flagged_at, reviewed_at
- status ('pending'/'in_review'/'resolved'/'dismissed')
- notes
```

**scraping_summary:**
```sql
- id (PRIMARY KEY)
- summary_date (UNIQUE)
- tier1_colleges_scraped
- tier2_colleges_scraped
- total_successful
- total_failed
- deadlines_added, deadlines_updated
- changes_detected
- notifications_sent
- avg_confidence_score
- avg_duration_ms
```

### Enhanced Columns on `colleges`

```sql
- deadlines_page_url (TEXT)
- last_scraped_deadlines (DATETIME)
- priority_tier (INTEGER: 1 or 2)
- deadline_frequently_changes (BOOLEAN)
- scraping_difficult (BOOLEAN)
- deadlines_not_available (BOOLEAN)
- scraping_failures_count (INTEGER)
```

## 🔄 Scraping Flow

```
┌─────────────────────────────────────────┐
│  Scheduler Triggers (Cron Job)          │
│  - Weekly: Sunday 2 AM (Tier 1)         │
│  - Monthly: 1st of month 3 AM (Tier 2)  │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Query Colleges by Priority Tier        │
│  - Tier 1: Top 100, >10 users, <90 days│
│  - Tier 2: All others, not scraped 30d │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  For Each College:                       │
└──────────────┬──────────────────────────┘
               │
               ├─► Find Deadline Page URL
               │   ├─ Try 8 common patterns
               │   └─ Fallback: search admissions page
               │
               ├─► Scrape Page Content
               │   ├─ Check robots.txt
               │   ├─ Rate limit (2-5 sec delay)
               │   └─ Fetch HTML with axios + cheerio
               │
               ├─► Extract Deadlines
               │   ├─ Try table extraction (confidence 1.0)
               │   ├─ Try list extraction (confidence 0.8)
               │   └─ Try paragraph extraction (confidence 0.6)
               │
               ├─► Parse Dates
               │   └─ Handle 10+ formats + year inference
               │
               ├─► Compare with Existing Data
               │   └─ Detect changes in dates
               │
               ├─► Update Database
               │   ├─ Insert/update application_deadlines
               │   └─ Track change history (JSON)
               │
               ├─► Notify Users
               │   └─ Send notifications for significant changes
               │
               └─► Log Attempt
                   └─ Record to scraping_logs
               │
               ▼
┌─────────────────────────────────────────┐
│  Generate Daily Summary                  │
│  - Statistics to scraping_summary        │
│  - Recalculate priorities (Monday 1 AM)  │
└─────────────────────────────────────────┘
```

## 🎯 Priority Tier System

### Tier 1 (Weekly Scraping)
Colleges that meet ANY of these criteria:
- Top 100 ranked colleges
- >10 users have college in their applications
- Deadline is within 90 days
- College historically changes deadlines frequently

**Schedule:** Every Sunday at 2 AM

### Tier 2 (Monthly Scraping)
All other colleges:
- Not in Top 100
- Lower user engagement
- Deadlines >90 days away
- Stable deadline history

**Schedule:** 1st of month at 3 AM (max 500 colleges per run)

### Priority Recalculation
**Schedule:** Every Monday at 1 AM

Automatically adjusts tiers based on:
- Current user engagement
- Approaching deadlines
- Detected changes

## 📅 Date Parsing

### Supported Formats

```javascript
// Full dates with year
"November 1, 2025"
"Nov 1, 2025"
"Nov. 1, 2025"
"1 Nov 2025"
"1 November 2025"
"2025-11-01" (ISO)
"11/1/2025" (US format)

// Dates without year (year inferred)
"November 1"
"Nov 1"
"11/1"
"11-1"

// Relative dates (approximate dates assigned)
"early November" → November 7
"mid November" → November 15
"late November" → November 25
"early December" → December 7
"mid December" → December 15
```

### Year Inference Logic

```
Current Month >= August:
  Application Year = Current Year + 1
  (August 2025 → 2026 application cycle)

Current Month < August:
  Application Year = Current Year
  (March 2025 → 2025 application cycle)

For dates without year:
  - Fall dates (Aug-Dec) → Current year
  - Spring dates (Jan-Jul) → Application year
```

## 🔍 Extraction Methods

### 1. Table Extraction (Confidence: 1.0)

Looks for HTML tables with deadline information:
```html
<table>
  <tr><th>Deadline Type</th><th>Date</th><th>Decision</th></tr>
  <tr><td>Early Decision</td><td>November 1</td><td>December 15</td></tr>
  <tr><td>Regular Decision</td><td>January 2</td><td>April 1</td></tr>
</table>
```

### 2. List Extraction (Confidence: 0.8)

Handles definition lists, bullet lists:
```html
<dl>
  <dt>Early Decision I</dt>
  <dd>Deadline: November 1, 2025 | Decision: December 15, 2025</dd>
  
  <dt>Regular Decision</dt>
  <dd>Deadline: January 2, 2026 | Decision: April 1, 2026</dd>
</dl>
```

### 3. Paragraph Extraction (Confidence: 0.6)

Extracts from natural language text:
```
"Students applying Early Decision must submit their application 
by November 1. Decisions will be released in mid-December. 
Regular Decision applications are due January 2 with decisions 
released by April 1."
```

## 🎓 Deadline Types Detected

| Type | Pattern | Example |
|------|---------|---------|
| ED1 | `early decision i/1/one` | Early Decision I |
| ED2 | `early decision ii/2/two` | Early Decision II |
| EA | `early action` (not restrictive) | Early Action |
| REA | `restrictive early action` / `single choice` | Restrictive Early Action |
| RD | `regular decision` | Regular Decision |
| Rolling | `rolling admission` | Rolling Admission |

## 📈 Confidence Scoring

Confidence score (0.0-1.0) based on:

### Base Score (by extraction method)
- Table: 1.0
- List: 0.8
- Paragraph: 0.6

### Adjustments
- **.edu domain:** +0.1
- **3+ deadline types found:** +0.1
- **Missing notification dates:** -0.05 per missing

### Confidence Ranges
- **1.0:** Perfect extraction from structured table, .edu domain
- **0.8-0.9:** Good extraction from lists or tables
- **0.6-0.7:** Acceptable extraction from paragraphs
- **0.4-0.5:** Questionable extraction, needs review
- **<0.4:** Flag for manual review

## 🔔 Change Detection & Notifications

### Detection Logic

Compares each deadline date:
```javascript
if (oldDate && newDate && oldDate !== newDate) {
  change = {
    type: 'Early Decision I',
    oldDate: '2025-11-01',
    newDate: '2025-11-05',
    field: 'early_decision_1_date'
  };
}
```

### Notification Triggers

**Always notify:**
- Date changed by any amount
- Deadline type added/removed

**Email notification if:**
- Change ≥7 days
- OR date moved earlier
- Otherwise in-app notification only

### Notification Message Format

```
"[College Name] [Deadline Type] deadline changed from 
[Old Date] to [New Date]"

Example:
"Stanford University Regular Decision deadline changed 
from January 2, 2026 to January 5, 2026"
```

## 🛡️ Error Handling

### Network Errors
```javascript
try {
  response = fetch(url, { timeout: 30000 });
} catch (NetworkError) {
  log_error(college_id, 'network_error', error);
  increment_failure_count();
  // Skip and continue
}
```

### Page Structure Changed
```javascript
if (no_deadlines_extracted) {
  try_alternative_urls();
  if (still_no_data) {
    flag_for_manual_review();
    use_cached_data();
  }
}
```

### Multiple Failures
```
Failure Count >= 3:
  - Flag for manual review
  - Set priority_tier = 2 (lower priority)
  - Set scraping_difficult = true
  - Alert admin
```

### Ambiguous Data
```
if (multiple_dates_for_same_type) {
  confidence_score = 0.4;
  flag_for_manual_review();
  // Use most conservative (earliest) date
}
```

## 📋 NPM Scripts

### Test Scraping
```bash
# Test single college
npm run scrape:test-deadlines "Duke University"

# Test multiple colleges (default 5)
npm run scrape:test-deadlines
```

### Run Scraping Jobs
```bash
# Run weekly high-priority scraping
npm run scrape:weekly

# Run monthly all-colleges scraping
npm run scrape:monthly
```

### Setup Automatic Scheduling
```javascript
// Add to backend/src/app.js
const scheduler = require('./src/jobs/deadlineScrapingScheduler');
scheduler.setupCronJobs(); // Requires: npm install node-cron
```

## 🧪 Testing

### Test Script Usage

```bash
# Single college test
node backend/scripts/testDeadlineScraper.js "Stanford University"

# Multiple colleges test (runs default 5)
node backend/scripts/testDeadlineScraper.js
```

### Test Output

```
========================================
Testing: Stanford University
========================================

College ID: 1234
Website: https://www.stanford.edu
Current priority tier: 1
Last scraped: Never

--- Scraping Result ---
Success: ✓
Changes detected: 0

--- Extracted Deadlines ---
✓ Restrictive Early Action: 2025-11-01
  Notification: 2025-12-15
✓ Regular Decision: 2026-01-05
  Notification: 2026-04-01

Source: https://www.stanford.edu/admissions/deadlines
Confidence: 95%
Last verified: 2026-02-14
```

### Default Test Colleges
1. Duke University (table format)
2. Stanford University (mixed format)
3. Harvard University (paragraph format)
4. MIT (structured format)
5. UC Berkeley (UC-specific format)

## 📊 Monitoring

### Daily Tasks
- Review `scraping_logs` for failures
- Check `manual_review_queue` for flagged colleges
- Monitor success rates in `scraping_summary`

### Weekly Tasks
- Review flagged colleges
- Update difficult colleges manually
- Adjust priority tiers if needed

### Monthly Tasks
- Verify data accuracy on sample (10-20 colleges)
- Update URL patterns if needed
- Review confidence thresholds
- Archive old logs (>6 months)

### Key Metrics

**Query to check success rate:**
```sql
SELECT 
  DATE(started_at) as date,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
  ROUND(AVG(confidence_score) * 100) as avg_confidence,
  ROUND(AVG(duration_ms)) as avg_duration_ms
FROM scraping_logs
WHERE started_at >= DATE('now', '-7 days')
GROUP BY DATE(started_at)
ORDER BY date DESC;
```

**Query to check manual review queue:**
```sql
SELECT 
  colleges.name,
  manual_review_queue.reason,
  manual_review_queue.flagged_at,
  manual_review_queue.status
FROM manual_review_queue
JOIN colleges ON manual_review_queue.college_id = colleges.id
WHERE status = 'pending'
ORDER BY flagged_at ASC;
```

## 🚀 Deployment Guide

### 1. Install Dependencies
```bash
cd backend
npm install node-cron  # For scheduled jobs
```

### 2. Run Migration
```bash
npm run migrate
# This runs migration 034_deadline_scraping.sql
```

### 3. Test on Sample Colleges
```bash
npm run scrape:test-deadlines
```

### 4. Verify Data
```bash
# Check if deadlines were extracted
sqlite3 backend/database/college_app.db "SELECT COUNT(*) FROM application_deadlines;"

# Check recent scraping logs
sqlite3 backend/database/college_app.db "SELECT * FROM scraping_logs ORDER BY started_at DESC LIMIT 10;"
```

### 5. Setup Cron Jobs
Add to `backend/src/app.js`:
```javascript
// Near the end of the file, before server.listen()
const scheduler = require('./src/jobs/deadlineScrapingScheduler');
scheduler.setupCronJobs();

console.log('✓ Deadline scraping cron jobs initialized');
```

### 6. Start Server
```bash
npm start
# Server will now run scheduled scraping jobs automatically
```

### 7. Monitor First Week
- Check logs daily
- Review manual review queue
- Verify notification accuracy
- Adjust confidence thresholds if needed

## 🔧 Configuration

### Scraping Settings (in `backend/src/config/env.js`)

```javascript
scraping: {
  userAgent: 'Mozilla/5.0 ...',
  delayMs: 2000,  // Minimum delay between requests
  maxRetries: 3,  // Max retry attempts
  timeout: 30000  // Request timeout (ms)
}
```

### URL Patterns (in `scrappingService.js`)

Add new patterns if colleges use different URLs:
```javascript
const patterns = [
  `https://${baseUrl}/admissions/deadlines`,
  `https://${baseUrl}/admissions/apply`,
  // Add custom patterns here
  `https://${baseUrl}/your-custom-path`,
];
```

### Deadline Type Patterns (in `deadlineExtractionService.js`)

Add new deadline types:
```javascript
this.deadlinePatterns = {
  ED1: /early\s+decision\s*(i|1|one)?/i,
  ED2: /early\s+decision\s*(ii|2|two)/i,
  // Add custom patterns here
  PRIORITY: /priority\s+deadline/i,
};
```

## 📚 API Reference

### DeadlineScrapingOrchestrator

```javascript
const orchestrator = require('./src/services/deadlineScrapingOrchestrator');

// Scrape single college
const result = await orchestrator.scrapeAndUpdateCollege(college);

// Get statistics
const stats = orchestrator.getStats();
// Returns: { scraped, succeeded, failed, changes, notifications }

// Reset statistics
orchestrator.resetStats();
```

### DeadlineScrapingScheduler

```javascript
const scheduler = require('./src/jobs/deadlineScrapingScheduler');

// Run jobs manually
await scheduler.runWeeklyHighPriority();
await scheduler.runMonthlyAllColleges();

// Recalculate priorities
await scheduler.recalculatePriorities();

// Setup automatic cron jobs
scheduler.setupCronJobs();
```

### DateParser

```javascript
const dateParser = require('./src/utils/dateParser');

// Parse single date
const date = dateParser.parse('November 1, 2025');
// Returns: Date object

// Extract all dates from text
const dates = dateParser.extractDates(text);
// Returns: [{ date: Date, originalText: string }]

// Format for database
const formatted = dateParser.formatForDatabase(date);
// Returns: '2025-11-01'
```

## 🎯 Best Practices

1. **Start Small**: Test on Top 50 colleges first, verify accuracy, then expand
2. **Monitor Closely**: Check logs daily for first week
3. **Manual Review**: Verify 10-20 colleges manually per month
4. **Update Patterns**: Add new URL patterns as you discover them
5. **Adjust Thresholds**: Fine-tune confidence scores based on accuracy
6. **Rate Limiting**: Respect website resources, don't scrape too aggressively
7. **Error Handling**: Always have fallback data available
8. **User Notifications**: Only notify for significant changes to avoid spam
9. **Data Verification**: Cross-check extracted data with official sources periodically
10. **Documentation**: Keep URL patterns and extraction methods documented

## 🆘 Troubleshooting

### No deadlines extracted
**Check:**
1. Is URL pattern correct? Run test script to see URL attempted
2. Does page require JavaScript? (current scraper doesn't execute JS)
3. Is data in unexpected format? Check HTML manually
4. Is robots.txt blocking? Check logs for robots.txt warnings

**Solution:** Add college to manual review queue, extract manually

### Low confidence scores
**Check:**
1. What extraction method was used? (table=best, paragraph=worst)
2. Were multiple deadline types found?
3. Were notification dates included?

**Solution:** Manually verify accuracy, adjust if needed

### High failure rate
**Check:**
1. Network connectivity issues?
2. College websites down/slow?
3. Rate limiting too aggressive?

**Solution:** Check error messages in logs, adjust delays

### Incorrect dates extracted
**Check:**
1. What date format was used?
2. Was year inferred correctly?
3. Is date ambiguous (e.g., 1/2 could be Jan 2 or Feb 1)?

**Solution:** Add specific parsing rule for that format

## 📝 Maintenance Checklist

### Daily
- [ ] Review scraping_summary for today
- [ ] Check for new manual review items
- [ ] Monitor failure rates

### Weekly
- [ ] Review flagged colleges
- [ ] Update 2-3 difficult colleges manually
- [ ] Check average confidence scores

### Monthly
- [ ] Manually verify 10-20 colleges
- [ ] Update URL patterns if needed
- [ ] Review and archive old logs
- [ ] Adjust priority tiers based on engagement

### Quarterly
- [ ] Deep dive on extraction accuracy
- [ ] Update deadline type patterns
- [ ] Review and optimize performance
- [ ] Plan for upcoming application cycle

## 🎉 Success Metrics

**Good Performance:**
- Success rate: >75%
- Average confidence: >0.75
- Changes detected: 5-10% of colleges
- Manual review queue: <50 colleges
- Average duration: <3 seconds per college

**Excellent Performance:**
- Success rate: >85%
- Average confidence: >0.85
- Changes detected: 2-5% of colleges
- Manual review queue: <20 colleges
- Average duration: <2 seconds per college

---

## 📞 Support

For issues or questions:
1. Check logs: `backend/database/college_app.db` → `scraping_logs` table
2. Review manual review queue for flagged colleges
3. Run test script to reproduce issue
4. Check this documentation for troubleshooting steps

**Remember:** This system is designed to augment, not replace, manual verification. Always cross-check critical data manually!

# College Data Scraping System

Minimal, production-ready web scraping system for maintaining 7,000+ US college records.

## Architecture

Built on existing infrastructure with:
- **Tiered scheduling**: Top 1000 every 14 days, rest quarterly
- **Priority queues**: File-based queue management
- **Confidence scoring**: Multi-factor data quality assessment
- **Change detection**: SHA-256 hashing to avoid redundant updates
- **Monitoring**: JSON-based metrics and alerting

## Database Schema

New tables (migration 029):
- `scrape_queue` - Scheduling and status tracking
- `scrape_audit_log` - Field-level change history
- `field_metadata` - Per-field confidence and freshness
- `scrape_statistics` - Daily aggregated metrics

## Usage

### Initialize Queue
```bash
npm run scrape:init
```
Populates queue with all colleges, sets priorities (1=top1000, 2=rest).

### Get Today's Batch
```bash
npm run scrape:batch
```
Returns JSON array of colleges scheduled for scraping today.

### Record Statistics
```bash
npm run scrape:stats
```
Logs daily metrics (scraped, succeeded, failed, avg confidence).

### Generate Monitoring Report
```bash
npm run monitor:report
```
Creates comprehensive JSON report in `data/monitoring/`:
- Queue status
- Data freshness
- Success metrics
- Field completeness heatmap
- Alerts (if any)
- Recent changes log

### Export ML Dataset
```bash
npm run monitor:ml-export
```
Exports all college data to `data/ml_datasets/colleges/YYYY-MM-DD.json`.

## Scraping Schedule

**Tier 1 (Top 1000)**:
- Batch size: 72 colleges/day
- Cycle: 14 days
- Priority: 1

**Tier 2 (Remaining 6000)**:
- Batch size: 100 colleges/day
- Cycle: 90 days (quarterly)
- Priority: 2

## Confidence Scoring

Formula: `(freshness × 0.3) + (authority × 0.4) + (certainty × 0.3)`

**Authority scores**:
- Official .edu: 1.0
- Common Data Set: 0.95
- IPEDS/Scorecard: 0.90
- Aggregators: 0.75

**Certainty scores**:
- JSON-LD: 1.0
- Meta tags: 0.95
- CSS selectors: 0.85
- Regex: 0.75

**Freshness**: 1.0 at 0 days, decays to 0.5 at 365 days

## Validation Rules

Numeric ranges enforced:
- `acceptance_rate`: 0.01 - 1.0
- `tuition`: 0 - 100,000
- `gpa_50`: 0.0 - 4.0
- `student_faculty_ratio`: 1 - 50

Cross-field checks:
- `graduation_rate_4yr ≤ graduation_rate_6yr`
- `salary_25th < salary_50th < salary_75th`
- `median_debt < tuition × 4` (warning)

## Monitoring & Alerts

**Critical alerts** (if triggered):
- Success rate < 70% for 6 hours
- Zero scrapes in 12 hours

**Warning alerts**:
- Success rate < 85% for 24 hours
- Queue backlog > 500 colleges
- Dead letter queue > 50
- Top 100 colleges > 21 days stale

## Integration with Existing Scraper

The orchestrator manages scheduling and validation. The existing `scrapeAllColleges.js` handles actual HTTP requests and HTML parsing. Connect them via:

```javascript
const ScrapingOrchestrator = require('./scrapeOrchestrator');
const orchestrator = new ScrapingOrchestrator();

// Get today's batch
const batch = orchestrator.getTodaysBatch();

// For each college in batch:
// 1. Run existing scraper
// 2. Validate data
// 3. Compute confidence
// 4. Update queue status
// 5. Log changes to audit
```

## Files

- `migrations/029_scraping_infrastructure.sql` - Schema
- `scripts/scrapeOrchestrator.js` - Queue management
- `scripts/dataValidator.js` - Validation rules
- `scripts/scrapingMonitor.js` - Reporting & metrics

## Metrics Output

JSON reports stored in `data/monitoring/`:
- `latest.json` - Most recent report
- `scraping_report_YYYY-MM-DD.json` - Daily snapshots

ML datasets in `data/ml_datasets/colleges/`:
- `YYYY-MM-DD.json` - Daily college data export
- Retention: 2 years (~730 files × 30MB)

## Future Enhancements

Out of scope for minimal implementation:
- Playwright/headless browsers (use existing axios/cheerio)
- Redis/Celery (file-based queue sufficient)
- Prometheus/Grafana (JSON logs sufficient)
- Worker pools (single-threaded for now)
- CDS PDF parsing (manual data entry alternative)

These can be added incrementally as needs grow.

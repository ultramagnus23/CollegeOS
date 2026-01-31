/**
 * Comprehensive College Data Scraper
 * 
 * Runs through ALL colleges in the database with:
 * - Progress tracking
 * - Error handling with skip-and-continue
 * - Retry logic (3 attempts)
 * - Resume capability (saves progress)
 * - Batch processing (50 at a time)
 * - Detailed logging
 * - Final summary
 */

const sqlite3 = require('better-sqlite3');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  BATCH_SIZE: 50,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 2000,
  REQUEST_TIMEOUT_MS: 30000,
  DELAY_BETWEEN_REQUESTS_MS: 500,
  PROGRESS_FILE: path.join(__dirname, '..', 'data', 'scrape_progress.json'),
  LOG_FILE: path.join(__dirname, '..', 'data', 'scrape_log.json'),
  DB_PATH: path.join(__dirname, '..', 'data', 'colleges.db')
};

// Statistics tracking
const stats = {
  total: 0,
  processed: 0,
  succeeded: 0,
  failed: 0,
  skipped: 0,
  startTime: null,
  endTime: null,
  failedColleges: [],
  succeededColleges: []
};

// Logger utility
class Logger {
  constructor(logFile) {
    this.logFile = logFile;
    this.logs = [];
  }

  log(level, message, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data
    };
    this.logs.push(entry);
    
    const prefix = level === 'ERROR' ? '❌' : level === 'SUCCESS' ? '✅' : level === 'WARN' ? '⚠️' : 'ℹ️';
    console.log(`${prefix} [${entry.timestamp}] ${message}`);
  }

  info(message, data) { this.log('INFO', message, data); }
  success(message, data) { this.log('SUCCESS', message, data); }
  warn(message, data) { this.log('WARN', message, data); }
  error(message, data) { this.log('ERROR', message, data); }

  save() {
    fs.writeFileSync(this.logFile, JSON.stringify(this.logs, null, 2));
  }
}

const logger = new Logger(CONFIG.LOG_FILE);

// Progress manager for resume capability
class ProgressManager {
  constructor(progressFile) {
    this.progressFile = progressFile;
    this.progress = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.progressFile)) {
        return JSON.parse(fs.readFileSync(this.progressFile, 'utf-8'));
      }
    } catch (e) {
      logger.warn('Could not load progress file, starting fresh');
    }
    return { lastCompletedId: null, completedIds: [], startedAt: new Date().toISOString() };
  }

  save() {
    fs.writeFileSync(this.progressFile, JSON.stringify(this.progress, null, 2));
  }

  markCompleted(collegeId) {
    this.progress.completedIds.push(collegeId);
    this.progress.lastCompletedId = collegeId;
    this.progress.lastUpdated = new Date().toISOString();
    this.save();
  }

  isCompleted(collegeId) {
    return this.progress.completedIds.includes(collegeId);
  }

  reset() {
    this.progress = { lastCompletedId: null, completedIds: [], startedAt: new Date().toISOString() };
    this.save();
  }
}

const progressManager = new ProgressManager(CONFIG.PROGRESS_FILE);

// Database connection
let db;

function initDatabase() {
  db = sqlite3(CONFIG.DB_PATH);
  db.pragma('foreign_keys = ON');
  return db;
}

// Get all colleges from database
function getAllColleges() {
  // First try to get from database
  let colleges = db.prepare(`
    SELECT id, name, country, state_region, city, website_url
    FROM colleges_comprehensive
    ORDER BY id
  `).all();

  // If only 8 in DB, load from unified_colleges.json
  if (colleges.length < 100) {
    logger.info(`Only ${colleges.length} colleges in DB, loading from unified_colleges.json...`);
    const unifiedPath = path.join(__dirname, '..', 'data', 'unified_colleges.json');
    if (fs.existsSync(unifiedPath)) {
      const data = JSON.parse(fs.readFileSync(unifiedPath, 'utf-8'));
      if (data.colleges && data.colleges.length > 0) {
        // Seed the missing colleges into database first
        const insertStmt = db.prepare(`
          INSERT OR IGNORE INTO colleges_comprehensive 
          (name, country, state_region, city, website_url, total_enrollment)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        const insertTx = db.transaction((collegeList) => {
          for (const college of collegeList) {
            insertStmt.run(
              college.name,
              college.country,
              college.state_region,
              college.city,
              college.website_url,
              college.total_enrollment
            );
          }
        });
        
        insertTx(data.colleges);
        logger.info(`Inserted ${data.colleges.length} colleges from unified_colleges.json`);
        
        // Reload from database
        colleges = db.prepare(`
          SELECT id, name, country, state_region, city, website_url
          FROM colleges_comprehensive
          ORDER BY id
        `).all();
      }
    }
  }

  return colleges;
}

// Sleep utility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry wrapper
async function withRetry(fn, retries = CONFIG.MAX_RETRIES, delay = CONFIG.RETRY_DELAY_MS) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        logger.warn(`Attempt ${attempt}/${retries} failed, retrying in ${delay}ms...`, { error: error.message });
        await sleep(delay);
        delay *= 1.5; // Exponential backoff
      }
    }
  }
  throw lastError;
}

// CDS Data Scraper (for US colleges)
async function scrapeCDSData(college) {
  if (college.country !== 'United States') {
    return null;
  }

  const searchTerms = [
    `${college.name} common data set`,
    `${college.name} CDS`,
    `${college.name} institutional research`
  ];

  // For now, return simulated CDS data since actual scraping requires complex PDF parsing
  // In production, this would integrate with a CDS PDF parser
  return {
    source: 'CDS',
    scraped_at: new Date().toISOString(),
    data_available: false,
    notes: 'CDS scraping requires PDF parsing - placeholder for production integration'
  };
}

// IPEDS Data Scraper
async function scrapeIPEDSData(college) {
  if (college.country !== 'United States') {
    return null;
  }

  // IPEDS provides structured data for US institutions
  // In production, this would use the IPEDS API or bulk data downloads
  return {
    source: 'IPEDS',
    scraped_at: new Date().toISOString(),
    data_available: false,
    notes: 'IPEDS integration requires API access - placeholder for production'
  };
}

// College Website Scraper
async function scrapeCollegeWebsite(college) {
  if (!college.website_url) {
    return null;
  }

  try {
    const response = await axios.get(college.website_url, {
      timeout: CONFIG.REQUEST_TIMEOUT_MS,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CollegeOS/1.0; Educational Research Bot)'
      },
      maxRedirects: 5,
      validateStatus: (status) => status < 400
    });

    const $ = cheerio.load(response.data);
    
    // Extract common metadata
    const title = $('title').text().trim();
    const description = $('meta[name="description"]').attr('content') || '';
    
    // Look for admissions information
    const admissionsLinks = [];
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().toLowerCase();
      if (text.includes('admission') || text.includes('apply') || href.includes('admission')) {
        admissionsLinks.push({ href, text: $(el).text().trim() });
      }
    });

    return {
      source: 'website',
      scraped_at: new Date().toISOString(),
      website_title: title,
      website_description: description.substring(0, 500),
      admissions_links_found: admissionsLinks.length,
      data_available: true
    };
  } catch (error) {
    return {
      source: 'website',
      scraped_at: new Date().toISOString(),
      data_available: false,
      error: error.message
    };
  }
}

// Main scrape function for a single college
async function scrapeCollege(college) {
  const results = {
    college_id: college.id,
    college_name: college.name,
    country: college.country,
    scraped_at: new Date().toISOString(),
    sources_tried: [],
    success: false,
    data: {}
  };

  // Try CDS first (US only)
  if (college.country === 'United States') {
    try {
      const cdsData = await scrapeCDSData(college);
      results.sources_tried.push('CDS');
      if (cdsData && cdsData.data_available) {
        results.data.cds = cdsData;
        results.success = true;
      }
    } catch (e) {
      results.sources_tried.push('CDS (failed)');
    }

    // Try IPEDS if CDS failed
    if (!results.success) {
      try {
        const ipedsData = await scrapeIPEDSData(college);
        results.sources_tried.push('IPEDS');
        if (ipedsData && ipedsData.data_available) {
          results.data.ipeds = ipedsData;
          results.success = true;
        }
      } catch (e) {
        results.sources_tried.push('IPEDS (failed)');
      }
    }
  }

  // Try website scraping as fallback (or primary for international)
  if (!results.success) {
    try {
      const websiteData = await scrapeCollegeWebsite(college);
      results.sources_tried.push('website');
      if (websiteData && websiteData.data_available) {
        results.data.website = websiteData;
        results.success = true;
      }
    } catch (e) {
      results.sources_tried.push('website (failed)');
    }
  }

  return results;
}

// Save scraped data to database
function saveScrapedData(college, results) {
  // Update the college record with scraped data timestamp
  const updateStmt = db.prepare(`
    UPDATE colleges_comprehensive 
    SET last_updated = ?
    WHERE id = ?
  `);
  
  updateStmt.run(new Date().toISOString(), college.id);

  // Store scrape results in a separate tracking table if it exists
  try {
    const insertScrape = db.prepare(`
      INSERT OR REPLACE INTO scrape_history 
      (college_id, scraped_at, sources_tried, success, data)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertScrape.run(
      college.id,
      results.scraped_at,
      JSON.stringify(results.sources_tried),
      results.success ? 1 : 0,
      JSON.stringify(results.data)
    );
  } catch (e) {
    // Table might not exist, that's OK
  }
}

// Process a batch of colleges
async function processBatch(colleges, batchNum, totalBatches) {
  logger.info(`\n========== BATCH ${batchNum}/${totalBatches} (${colleges.length} colleges) ==========`);
  
  for (const college of colleges) {
    stats.processed++;
    
    // Check if already completed (for resume)
    if (progressManager.isCompleted(college.id)) {
      stats.skipped++;
      logger.info(`Skipping ${college.name} (already processed)`);
      continue;
    }

    const progressPct = ((stats.processed / stats.total) * 100).toFixed(1);
    console.log(`\n📊 Processing college ${stats.processed}/${stats.total} (${progressPct}%)...`);
    console.log(`   📍 ${college.name} (${college.country || 'Unknown'})`);

    try {
      const results = await withRetry(async () => {
        return await scrapeCollege(college);
      });

      if (results.success) {
        stats.succeeded++;
        stats.succeededColleges.push({ id: college.id, name: college.name });
        saveScrapedData(college, results);
        logger.success(`Scraped ${college.name}`, { sources: results.sources_tried });
      } else {
        stats.failed++;
        stats.failedColleges.push({ id: college.id, name: college.name, reason: 'No data available from any source' });
        logger.warn(`No data found for ${college.name}`, { sources: results.sources_tried });
      }

      progressManager.markCompleted(college.id);

    } catch (error) {
      stats.failed++;
      stats.failedColleges.push({ id: college.id, name: college.name, reason: error.message });
      logger.error(`Failed to scrape ${college.name} after ${CONFIG.MAX_RETRIES} retries`, { error: error.message });
      progressManager.markCompleted(college.id); // Mark as completed even on failure to avoid infinite retry
    }

    // Delay between requests to be respectful
    await sleep(CONFIG.DELAY_BETWEEN_REQUESTS_MS);
  }
}

// Create scrape_history table if it doesn't exist
function createScrapeHistoryTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scrape_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      college_id INTEGER NOT NULL,
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sources_tried TEXT,
      success INTEGER DEFAULT 0,
      data TEXT,
      FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_scrape_history_college ON scrape_history(college_id);
    CREATE INDEX IF NOT EXISTS idx_scrape_history_date ON scrape_history(scraped_at);
  `);
}

// Print final summary
function printSummary() {
  const duration = ((stats.endTime - stats.startTime) / 1000 / 60).toFixed(2);
  
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    SCRAPING COMPLETE                       ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Total Colleges:     ${String(stats.total).padEnd(38)}║`);
  console.log(`║  Successfully Scraped: ${String(stats.succeeded).padEnd(36)}║`);
  console.log(`║  Failed:             ${String(stats.failed).padEnd(38)}║`);
  console.log(`║  Skipped (resumed):  ${String(stats.skipped).padEnd(38)}║`);
  console.log(`║  Duration:           ${String(duration + ' minutes').padEnd(38)}║`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Success Rate:       ${String(((stats.succeeded / stats.total) * 100).toFixed(1) + '%').padEnd(38)}║`);
  console.log('╚════════════════════════════════════════════════════════════╝');

  if (stats.failedColleges.length > 0 && stats.failedColleges.length <= 20) {
    console.log('\n❌ Failed Colleges:');
    stats.failedColleges.forEach(c => {
      console.log(`   - ${c.name}: ${c.reason}`);
    });
  } else if (stats.failedColleges.length > 20) {
    console.log(`\n❌ ${stats.failedColleges.length} colleges failed (see log file for details)`);
  }

  // Save final stats
  const summaryPath = path.join(__dirname, '..', 'data', 'scrape_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    ...stats,
    failedColleges: stats.failedColleges,
    succeededColleges: stats.succeededColleges.map(c => c.name)
  }, null, 2));
  console.log(`\n📁 Summary saved to: ${summaryPath}`);
}

// Main function
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          CollegeOS Comprehensive Data Scraper              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  // Check for --reset flag
  if (process.argv.includes('--reset')) {
    console.log('🔄 Resetting progress...');
    progressManager.reset();
  }

  // Initialize
  stats.startTime = new Date();
  initDatabase();
  createScrapeHistoryTable();

  // Get all colleges
  const colleges = getAllColleges();
  stats.total = colleges.length;

  console.log(`📚 Found ${stats.total} colleges to process`);
  console.log(`📂 Progress file: ${CONFIG.PROGRESS_FILE}`);
  console.log(`📝 Log file: ${CONFIG.LOG_FILE}`);
  console.log(`🔄 Batch size: ${CONFIG.BATCH_SIZE}`);
  console.log(`🔁 Max retries: ${CONFIG.MAX_RETRIES}`);
  console.log('');

  // Check resume status
  const alreadyCompleted = colleges.filter(c => progressManager.isCompleted(c.id)).length;
  if (alreadyCompleted > 0) {
    console.log(`⏩ Resuming from previous run: ${alreadyCompleted} already completed`);
  }

  // Process in batches
  const totalBatches = Math.ceil(colleges.length / CONFIG.BATCH_SIZE);
  for (let i = 0; i < colleges.length; i += CONFIG.BATCH_SIZE) {
    const batch = colleges.slice(i, i + CONFIG.BATCH_SIZE);
    const batchNum = Math.floor(i / CONFIG.BATCH_SIZE) + 1;
    await processBatch(batch, batchNum, totalBatches);
  }

  // Finish up
  stats.endTime = new Date();
  logger.save();
  printSummary();

  db.close();
}

// Run
main().catch(error => {
  console.error('💥 Fatal error:', error);
  logger.error('Fatal error', { error: error.message, stack: error.stack });
  logger.save();
  process.exit(1);
});

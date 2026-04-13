'use strict';

/**
 * deadlineIntelligenceScraper.js
 *
 * Scheduled scraper job that refreshes college_deadlines rows whose data is
 * stale (last_verified older than 7 days) or low-confidence (< 0.7).
 *
 * Pipeline per college:
 *   1. Fetch admission page via WebScraper
 *   2. Extract deadlines via DeadlineExtractionService
 *   3. Validate each extracted record via ScraperValidationService
 *   4. Upsert via CollegeDeadlineIntelligenceService
 *   5. Log attempt to deadline_scrape_log
 *   6. Fall back to estimateFromHistory if scrape fails
 *
 * Expected to be called from backend/jobs/orchestrator.js once per day.
 *
 * Prints "ROWS_UPSERTED=<n>" to stdout so orchestrator can parse it.
 */

const path = require('path');

// ── Bootstrap logger / db before other requires ───────────────────────────────
let logger;
try {
  logger = require('../src/utils/logger');
} catch {
  const { createLogger, transports, format } = require('winston');
  logger = createLogger({
    format: format.combine(format.timestamp(), format.json()),
    transports: [new transports.Console()],
  });
}

let dbManager;
try {
  dbManager = require('../src/config/database');
} catch {
  dbManager = null;
}

let intelligenceSvc;
try {
  intelligenceSvc = require('../src/services/collegeDeadlineIntelligenceService');
} catch (e) {
  logger.error('Failed to load collegeDeadlineIntelligenceService', { error: e.message });
  process.exit(1);
}

let webScraper;
try {
  webScraper = require('../src/services/webScraper');
} catch (e) {
  logger.error('Failed to load webScraper', { error: e.message });
  process.exit(1);
}

let extractionSvc;
try {
  extractionSvc = require('../src/services/deadlineExtractionService');
} catch (e) {
  logger.error('Failed to load deadlineExtractionService', { error: e.message });
  process.exit(1);
}

let validationSvc;
try {
  validationSvc = require('../src/services/scraperValidationService');
} catch {
  validationSvc = null; // optional hardening layer
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STALE_DAYS = parseInt(process.env.DEADLINE_STALE_DAYS || '7', 10);
const LOW_CONFIDENCE_THRESHOLD = parseFloat(process.env.DEADLINE_LOW_CONFIDENCE || '0.7');
const BATCH_SIZE = parseInt(process.env.DEADLINE_BATCH_SIZE || '50', 10);
const CONCURRENCY = parseInt(process.env.DEADLINE_CONCURRENCY || '3', 10);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function logScrapeAttempt(pool, collegeId, url, status, deadlinesFound, confidence, extractionMethod, error) {
  try {
    await pool.query(
      `INSERT INTO deadline_scrape_log
         (college_id, url, status, deadlines_found, confidence_score, extraction_method, error, scraped_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [collegeId, url || '', status, deadlinesFound || 0, confidence || 0, extractionMethod || null, error || null]
    );
  } catch (err) {
    logger.warn('Failed to write deadline_scrape_log', { error: err.message });
  }
}

/**
 * Process a single college: scrape → extract → validate → upsert.
 * Falls back to history estimation if scraping fails.
 *
 * @returns {number} count of rows upserted
 */
async function processCollege(college, pool) {
  const { id: collegeId, name, admissions_url } = college;
  let upserted = 0;

  if (!admissions_url) {
    logger.warn('No admissions URL for college — skipping', { name, collegeId });
    await logScrapeAttempt(pool, collegeId, null, 'failed', 0, 0, null, 'no_admissions_url');
    return 0;
  }

  logger.info('Scraping deadlines for college', { name, collegeId, url: admissions_url });

  let scrapeResult = null;
  try {
    scrapeResult = await webScraper.scrapeUrl(admissions_url);
  } catch (err) {
    logger.warn('Scrape request failed', { name, error: err.message });
  }

  if (!scrapeResult || !scrapeResult.success) {
    const errMsg = scrapeResult?.error || 'scrape_failed';
    await logScrapeAttempt(pool, collegeId, admissions_url, 'failed', 0, 0, null, errMsg);

    // Fallback: estimate from historical data
    logger.info('Falling back to history estimation', { name, collegeId });
    const deadlineTypes = ['Early Decision', 'Early Action', 'Regular Decision'];
    for (const dt of deadlineTypes) {
      await intelligenceSvc.estimateFromHistory(collegeId, dt);
    }
    return 0;
  }

  // Extract deadlines from scraped HTML
  let extracted = null;
  try {
    extracted = await extractionSvc.extract(scrapeResult);
  } catch (err) {
    logger.warn('Deadline extraction failed', { name, error: err.message });
    await logScrapeAttempt(pool, collegeId, admissions_url, 'failed', 0, 0, null, err.message);
    return 0;
  }

  if (!extracted || !extracted.deadlines || extracted.deadlines.length === 0) {
    await logScrapeAttempt(pool, collegeId, admissions_url, 'partial', 0,
      extracted?.confidence || 0, extracted?.extractionMethod || 'none', 'no_deadlines_extracted');

    // Still try estimation for missing types
    const deadlineTypes = ['Early Decision', 'Early Action', 'Regular Decision'];
    for (const dt of deadlineTypes) {
      await intelligenceSvc.estimateFromHistory(collegeId, dt);
    }
    return 0;
  }

  // Validate each extracted deadline
  for (const deadline of extracted.deadlines) {
    // Optional validation layer
    if (validationSvc && typeof validationSvc.validate === 'function') {
      const validation = validationSvc.validate(
        { ...deadline, college_id: collegeId, source_url: admissions_url, scraped_at: new Date().toISOString() },
        'admissions'
      );
      if (!validation.valid) {
        logger.warn('Deadline failed validation', { name, deadlineType: deadline.type, reasons: validation.reasons });
        continue;
      }
    }

    try {
      const result = await intelligenceSvc.upsertDeadline(
        collegeId,
        deadline.type,
        deadline.date || null,
        admissions_url,
        extracted.confidence || 0.5,
        {
          sourceType: 'official',
          isEstimated: false,
          estimationBasis: 'confirmed',
          notificationDate: deadline.notificationDate || null,
        }
      );
      if (result.upserted) upserted++;
    } catch (err) {
      logger.warn('upsertDeadline failed for deadline', { name, type: deadline.type, error: err.message });
    }
  }

  await logScrapeAttempt(
    pool, collegeId, admissions_url,
    upserted > 0 ? 'success' : 'partial',
    extracted.deadlines.length,
    extracted.confidence || 0.5,
    extracted.extractionMethod || 'unknown',
    null
  );

  logger.info('College deadline scrape complete', { name, collegeId, upserted });
  return upserted;
}

/**
 * Run the full scraping batch.
 * Processes up to BATCH_SIZE colleges with CONCURRENCY parallel workers.
 */
async function run() {
  if (!dbManager) {
    logger.error('No database manager available — aborting');
    process.exit(1);
  }

  const pool = dbManager.getDatabase();

  // Fetch stale or low-confidence colleges
  const { rows: colleges } = await pool.query(
    `SELECT cc.id, cc.name, cc.admissions_url
       FROM colleges_comprehensive cc
       LEFT JOIN (
         SELECT college_id,
                MAX(last_verified) AS last_verified,
                MIN(confidence_score) AS min_confidence
           FROM college_deadlines
          GROUP BY college_id
       ) cd ON cd.college_id = cc.id
      WHERE cc.admissions_url IS NOT NULL
        AND (
          cd.college_id IS NULL
          OR cd.last_verified IS NULL
          OR cd.last_verified < NOW() - ($1 || ' days')::INTERVAL
          OR cd.min_confidence < $2
        )
      ORDER BY
        cd.college_id IS NULL DESC,  -- unscraped first
        cd.last_verified ASC NULLS FIRST
      LIMIT $3`,
    [STALE_DAYS, LOW_CONFIDENCE_THRESHOLD, BATCH_SIZE]
  );

  logger.info(`Deadline scraper: ${colleges.length} colleges to process (batch_size=${BATCH_SIZE})`);

  if (colleges.length === 0) {
    console.log('ROWS_UPSERTED=0');
    return;
  }

  let totalUpserted = 0;
  let idx = 0;

  // Process in chunks of CONCURRENCY
  while (idx < colleges.length) {
    const chunk = colleges.slice(idx, idx + CONCURRENCY);
    idx += CONCURRENCY;

    const results = await Promise.allSettled(
      chunk.map(college => processCollege(college, pool))
    );

    for (const r of results) {
      if (r.status === 'fulfilled') totalUpserted += r.value;
    }
  }

  logger.info(`Deadline scraper finished: ${totalUpserted} rows upserted`);
  console.log(`ROWS_UPSERTED=${totalUpserted}`);
}

// ── Entry point (called directly or required) ─────────────────────────────────

if (require.main === module) {
  run().catch(err => {
    logger.error('Deadline scraper fatal error', { error: err.message });
    process.exit(1);
  });
}

module.exports = { run };

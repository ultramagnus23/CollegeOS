/**
 * Minimal Scraping Orchestrator
 * Manages tiered scraping schedule for 7000+ colleges
 * 
 * Features:
 * - Tiered scheduling (top 1000 biweekly, rest quarterly)
 * - Priority-based queue management
 * - Confidence scoring and validation
 * - Change detection via hashing
 * - Simple monitoring and metrics
 */

const path = require('path');
const crypto = require('crypto');
const dbManager = require('../src/config/database');
const logger = require('../src/utils/logger');

// Configuration
const CONFIG = {
  TIER1_BATCH_SIZE: 72,      // Top 1000: 72/day for 14-day cycle
  TIER2_BATCH_SIZE: 100,     // Remaining: 100/day for quarterly cycle
  TIER1_THRESHOLD: 1000,     // Top N colleges
  TIER1_CYCLE_DAYS: 14,      // Refresh every 2 weeks
  TIER2_CYCLE_DAYS: 90,      // Refresh every quarter
  MAX_RETRY_ATTEMPTS: 5,
  DEAD_LETTER_THRESHOLD: 5,  // Move to dead letter after 5 failures
  MIN_CONFIDENCE: 0.70,      // Minimum acceptable confidence score
  ALERT_THRESHOLD: 0.85      // Alert if success rate drops below
};

class ScrapingOrchestrator {
  constructor() {
    this.pool = dbManager.getDatabase();
    this.stats = {
      queued: 0,
      processed: 0,
      succeeded: 0,
      failed: 0
    };
  }

  /**
   * Check if required tables exist
   */
  async checkRequiredTables() {
    const requiredTables = ['scrape_queue', 'scrape_audit_log', 'field_metadata', 'scrape_statistics'];
    const missingTables = [];

    for (const table of requiredTables) {
      try {
        await this.pool.query(`SELECT 1 FROM ${table} LIMIT 1`);
      } catch (error) {
        if (error.message.includes('does not exist') || error.message.includes('relation')) {
          missingTables.push(table);
        }
      }
    }

    if (missingTables.length > 0) {
      logger.error(`Missing required tables: ${missingTables.join(', ')}`);
      console.error('\n❌ ERROR: Required database tables are missing!');
      console.error('\nMissing tables:', missingTables.join(', '));
      console.error('\n📋 SOLUTION: Run database migrations first:');
      console.error('   cd backend && npm run migrate');
      console.error('\nOr from root directory:');
      console.error('   npm run backend:migrate');
      console.error('\nThen try again:');
      console.error('   npm run scrape:init\n');
      process.exit(1);
    }
  }

  /**
   * Initialize scraping queue with priorities
   */
  async initializeQueue() {
    await this.checkRequiredTables();

    logger.info('Initializing scraping queue...');

    const { rows: colleges } = await this.pool.query(`
      SELECT id, name,
             (SELECT COUNT(*) FROM scrape_queue WHERE college_id = colleges.id) as queued
      FROM colleges
      WHERE id IS NOT NULL
      ORDER BY id ASC
    `);

    let tier1Count = 0;
    let tier2Count = 0;

    for (const college of colleges) {
      if (parseInt(college.queued) > 0) continue;

      const priority = (tier1Count < CONFIG.TIER1_THRESHOLD) ? 1 : 2;
      const lastScraped = await this.getLastScrapedDate(college.id);
      const cycleDays = priority === 1 ? CONFIG.TIER1_CYCLE_DAYS : CONFIG.TIER2_CYCLE_DAYS;
      const scheduledFor = this.calculateNextScrapeDate(lastScraped, cycleDays);

      await this.pool.query(`
        INSERT INTO scrape_queue (college_id, priority, scheduled_for, status)
        VALUES ($1, $2, $3, 'pending')
      `, [college.id, priority, scheduledFor]);

      if (priority === 1) tier1Count++;
      else tier2Count++;
    }

    logger.info(`Queue initialized: ${tier1Count} Tier1, ${tier2Count} Tier2`);
    return { tier1: tier1Count, tier2: tier2Count };
  }

  /**
   * Get today's batch of colleges to scrape
   */
  async getTodaysBatch() {
    const today = new Date().toISOString().split('T')[0];

    const { rows: batch } = await this.pool.query(`
      SELECT sq.id as queue_id, sq.college_id, sq.priority, sq.attempts,
             c.name, c.official_website
      FROM scrape_queue sq
      JOIN colleges c ON c.id = sq.college_id
      WHERE sq.status = 'pending'
        AND sq.scheduled_for::date <= $1
      ORDER BY sq.priority ASC, sq.scheduled_for ASC
      LIMIT $2
    `, [today, CONFIG.TIER1_BATCH_SIZE]);

    logger.info(`Today's batch: ${batch.length} colleges`);
    return batch;
  }

  /**
   * Calculate confidence score for scraped data
   * Formula: (freshness × 0.3) + (authority × 0.4) + (certainty × 0.3)
   */
  calculateConfidence(source, method, daysOld = 0) {
    const freshness = Math.max(0.5, 1.0 - (daysOld / 365) * 0.5);

    const authorityScores = {
      'official_website': 1.0,
      'common_data_set': 0.95,
      'ipeds': 0.90,
      'scorecard': 0.90,
      'aggregator': 0.75,
      'manual': 0.80
    };
    const authority = authorityScores[source] || 0.70;

    const certaintyScores = {
      'json_ld': 1.0,
      'meta_tags': 0.95,
      'css_selector': 0.85,
      'regex': 0.75,
      'table': 0.70
    };
    const certainty = certaintyScores[method] || 0.70;

    return (freshness * 0.3) + (authority * 0.4) + (certainty * 0.3);
  }

  /**
   * Compute hash for change detection
   */
  computeRecordHash(data) {
    const normalized = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Update queue status
   */
  async updateQueueStatus(queueId, status, error = null) {
    await this.pool.query(`
      UPDATE scrape_queue
      SET status = $1,
          attempts = attempts + 1,
          last_error = $2,
          updated_at = NOW()
      WHERE id = $3
    `, [status, error, queueId]);
  }

  /**
   * Log field change to audit table
   */
  async logFieldChange(collegeId, fieldName, oldValue, newValue, confidence, source, method) {
    await this.pool.query(`
      INSERT INTO scrape_audit_log
        (college_id, field_name, old_value, new_value, confidence_score, source, extraction_method)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [collegeId, fieldName, oldValue, newValue, confidence, source, method]);
  }

  /**
   * Update field metadata
   */
  async updateFieldMetadata(collegeId, fieldName, confidence, source, method) {
    await this.pool.query(`
      INSERT INTO field_metadata
        (college_id, field_name, confidence_score, source, extraction_method, last_updated, data_freshness_days)
      VALUES ($1, $2, $3, $4, $5, NOW(), 0)
      ON CONFLICT (college_id, field_name) DO UPDATE SET
        confidence_score = EXCLUDED.confidence_score,
        source = EXCLUDED.source,
        extraction_method = EXCLUDED.extraction_method,
        last_updated = NOW(),
        data_freshness_days = 0
    `, [collegeId, fieldName, confidence, source, method]);
  }

  /**
   * Record daily statistics
   */
  async recordDailyStats() {
    const today = new Date().toISOString().split('T')[0];

    const { rows: statsRows } = await this.pool.query(`
      SELECT
        COUNT(*) as total_scraped,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as succeeded,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM scrape_queue
      WHERE updated_at::date = $1
    `, [today]);
    const stats = statsRows[0];

    const { rows: confRows } = await this.pool.query(`
      SELECT AVG(confidence_score) as avg_conf
      FROM field_metadata
      WHERE last_updated::date = $1
    `, [today]);
    const avgConfidence = confRows[0];

    await this.pool.query(`
      INSERT INTO scrape_statistics
        (scrape_date, colleges_scraped, colleges_succeeded, colleges_failed, avg_confidence_score)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (scrape_date) DO UPDATE SET
        colleges_scraped = EXCLUDED.colleges_scraped,
        colleges_succeeded = EXCLUDED.colleges_succeeded,
        colleges_failed = EXCLUDED.colleges_failed,
        avg_confidence_score = EXCLUDED.avg_confidence_score
    `, [today, stats.total_scraped || 0, stats.succeeded || 0, stats.failed || 0, avgConfidence.avg_conf || 0]);

    return stats;
  }

  /**
   * Get monitoring metrics
   */
  async getMetrics() {
    const { rows: queueStats } = await this.pool.query(`
      SELECT status, COUNT(*) as count
      FROM scrape_queue
      GROUP BY status
    `);

    const { rows: freshnessRows } = await this.pool.query(`
      SELECT
        AVG(data_freshness_days) as avg_freshness,
        MAX(data_freshness_days) as max_freshness,
        AVG(confidence_score) as avg_confidence
      FROM field_metadata
    `);
    const freshnessStats = freshnessRows[0];

    const { rows: recentStats } = await this.pool.query(`
      SELECT *
      FROM scrape_statistics
      ORDER BY scrape_date DESC
      LIMIT 7
    `);

    return {
      queue: queueStats,
      freshness: freshnessStats,
      recent: recentStats
    };
  }

  /**
   * Helper: Get last scraped date for a college
   */
  async getLastScrapedDate(collegeId) {
    const { rows } = await this.pool.query(`
      SELECT MAX(last_updated) as last_scraped
      FROM field_metadata
      WHERE college_id = $1
    `, [collegeId]);
    return rows[0]?.last_scraped || null;
  }

  /**
   * Helper: Calculate next scrape date
   */
  calculateNextScrapeDate(lastScraped, cycleDays) {
    if (!lastScraped) {
      return new Date().toISOString();
    }
    const last = new Date(lastScraped);
    const next = new Date(last.getTime() + cycleDays * 24 * 60 * 60 * 1000);
    return next.toISOString();
  }
}

// Export for use in scraping scripts
module.exports = ScrapingOrchestrator;

// CLI usage
if (require.main === module) {
  async function run() {
    require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
    dbManager.initialize();
    const orchestrator = new ScrapingOrchestrator();
    const command = process.argv[2] || 'status';

    try {
      switch (command) {
        case 'init':
          await orchestrator.initializeQueue();
          break;
        case 'batch': {
          const batch = await orchestrator.getTodaysBatch();
          console.log(JSON.stringify(batch, null, 2));
          break;
        }
        case 'stats': {
          const stats = await orchestrator.recordDailyStats();
          console.log('Daily stats:', stats);
          break;
        }
        case 'metrics': {
          const metrics = await orchestrator.getMetrics();
          console.log(JSON.stringify(metrics, null, 2));
          break;
        }
        default:
          console.log('Usage: node scrapeOrchestrator.js [init|batch|stats|metrics]');
      }
    } catch (error) {
      logger.error('Scraping orchestrator error:', error);
      console.error('\n❌ ERROR:', error.message);
      process.exit(1);
    } finally {
      await dbManager.close();
    }
  }
  run().catch(e => {
    console.error('[orchestrator] Fatal error:', e);
    process.exit(1);
  });
}

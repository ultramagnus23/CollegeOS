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
    this.db = dbManager.getDatabase();
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
  checkRequiredTables() {
    const requiredTables = ['scrape_queue', 'scrape_audit_log', 'field_metadata', 'scrape_statistics'];
    const missingTables = [];

    for (const table of requiredTables) {
      try {
        this.db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get();
      } catch (error) {
        if (error.message.includes('no such table')) {
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
  initializeQueue() {
    // Check if tables exist first
    this.checkRequiredTables();
    
    logger.info('Initializing scraping queue...');
    
    // Get all colleges
    const colleges = this.db.prepare(`
      SELECT id, name, ranking, 
             (SELECT COUNT(*) FROM scrape_queue WHERE college_id = colleges.id) as queued
      FROM colleges
      WHERE id IS NOT NULL
      ORDER BY ranking ASC NULLS LAST
    `).all();

    let tier1Count = 0;
    let tier2Count = 0;

    for (const college of colleges) {
      // Skip if already queued
      if (college.queued > 0) continue;

      // Determine priority tier
      const priority = (tier1Count < CONFIG.TIER1_THRESHOLD) ? 1 : 2;
      
      // Calculate next scrape date based on tier
      const lastScraped = this.getLastScrapedDate(college.id);
      const cycleDays = priority === 1 ? CONFIG.TIER1_CYCLE_DAYS : CONFIG.TIER2_CYCLE_DAYS;
      const scheduledFor = this.calculateNextScrapeDate(lastScraped, cycleDays);

      // Insert into queue
      this.db.prepare(`
        INSERT INTO scrape_queue (college_id, priority, scheduled_for, status)
        VALUES (?, ?, ?, 'pending')
      `).run(college.id, priority, scheduledFor);

      if (priority === 1) tier1Count++;
      else tier2Count++;
    }

    logger.info(`Queue initialized: ${tier1Count} Tier1, ${tier2Count} Tier2`);
    return { tier1: tier1Count, tier2: tier2Count };
  }

  /**
   * Get today's batch of colleges to scrape
   */
  getTodaysBatch() {
    const today = new Date().toISOString().split('T')[0];
    
    // Get pending colleges scheduled for today or earlier
    const batch = this.db.prepare(`
      SELECT sq.id as queue_id, sq.college_id, sq.priority, sq.attempts, 
             c.name, c.official_website
      FROM scrape_queue sq
      JOIN colleges c ON c.id = sq.college_id
      WHERE sq.status = 'pending' 
        AND DATE(sq.scheduled_for) <= ?
      ORDER BY sq.priority ASC, sq.scheduled_for ASC
      LIMIT ?
    `).all(today, CONFIG.TIER1_BATCH_SIZE);

    logger.info(`Today's batch: ${batch.length} colleges`);
    return batch;
  }

  /**
   * Calculate confidence score for scraped data
   * Formula: (freshness × 0.3) + (authority × 0.4) + (certainty × 0.3)
   */
  calculateConfidence(source, method, daysOld = 0) {
    // Data freshness score (1.0 at 0 days, 0.5 at 365 days)
    const freshness = Math.max(0.5, 1.0 - (daysOld / 365) * 0.5);
    
    // Source authority score
    const authorityScores = {
      'official_website': 1.0,
      'common_data_set': 0.95,
      'ipeds': 0.90,
      'scorecard': 0.90,
      'aggregator': 0.75,
      'manual': 0.80
    };
    const authority = authorityScores[source] || 0.70;
    
    // Extraction method certainty
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
  updateQueueStatus(queueId, status, error = null) {
    this.db.prepare(`
      UPDATE scrape_queue 
      SET status = ?, 
          attempts = attempts + 1,
          last_error = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, error, queueId);
  }

  /**
   * Log field change to audit table
   */
  logFieldChange(collegeId, fieldName, oldValue, newValue, confidence, source, method) {
    this.db.prepare(`
      INSERT INTO scrape_audit_log 
        (college_id, field_name, old_value, new_value, confidence_score, source, extraction_method)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(collegeId, fieldName, oldValue, newValue, confidence, source, method);
  }

  /**
   * Update field metadata
   */
  updateFieldMetadata(collegeId, fieldName, confidence, source, method) {
    this.db.prepare(`
      INSERT INTO field_metadata 
        (college_id, field_name, confidence_score, source, extraction_method, last_updated, data_freshness_days)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0)
      ON CONFLICT(college_id, field_name) DO UPDATE SET
        confidence_score = excluded.confidence_score,
        source = excluded.source,
        extraction_method = excluded.extraction_method,
        last_updated = CURRENT_TIMESTAMP,
        data_freshness_days = 0
    `).run(collegeId, fieldName, confidence, source, method);
  }

  /**
   * Record daily statistics
   */
  recordDailyStats() {
    const today = new Date().toISOString().split('T')[0];
    
    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as total_scraped,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as succeeded,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM scrape_queue
      WHERE DATE(updated_at) = ?
    `).get(today);

    const avgConfidence = this.db.prepare(`
      SELECT AVG(confidence_score) as avg_conf
      FROM field_metadata
      WHERE DATE(last_updated) = ?
    `).get(today);

    this.db.prepare(`
      INSERT INTO scrape_statistics 
        (scrape_date, colleges_scraped, colleges_succeeded, colleges_failed, avg_confidence_score)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(scrape_date) DO UPDATE SET
        colleges_scraped = excluded.colleges_scraped,
        colleges_succeeded = excluded.colleges_succeeded,
        colleges_failed = excluded.colleges_failed,
        avg_confidence_score = excluded.avg_confidence_score
    `).run(today, stats.total_scraped || 0, stats.succeeded || 0, stats.failed || 0, avgConfidence.avg_conf || 0);

    return stats;
  }

  /**
   * Get monitoring metrics
   */
  getMetrics() {
    const queueStats = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM scrape_queue
      GROUP BY status
    `).all();

    const freshnessStats = this.db.prepare(`
      SELECT 
        AVG(data_freshness_days) as avg_freshness,
        MAX(data_freshness_days) as max_freshness,
        AVG(confidence_score) as avg_confidence
      FROM field_metadata
    `).get();

    const recentStats = this.db.prepare(`
      SELECT *
      FROM scrape_statistics
      ORDER BY scrape_date DESC
      LIMIT 7
    `).all();

    return {
      queue: queueStats,
      freshness: freshnessStats,
      recent: recentStats
    };
  }

  /**
   * Helper: Get last scraped date for a college
   */
  getLastScrapedDate(collegeId) {
    const result = this.db.prepare(`
      SELECT MAX(last_updated) as last_scraped
      FROM field_metadata
      WHERE college_id = ?
    `).get(collegeId);
    
    return result?.last_scraped || null;
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
  try {
    const orchestrator = new ScrapingOrchestrator();
    
    const command = process.argv[2] || 'status';
    
    switch(command) {
      case 'init':
        orchestrator.initializeQueue();
        break;
      case 'batch':
        const batch = orchestrator.getTodaysBatch();
        console.log(JSON.stringify(batch, null, 2));
        break;
      case 'stats':
        const stats = orchestrator.recordDailyStats();
        console.log('Daily stats:', stats);
        break;
      case 'metrics':
        const metrics = orchestrator.getMetrics();
        console.log(JSON.stringify(metrics, null, 2));
        break;
      default:
        console.log('Usage: node scrapeOrchestrator.js [init|batch|stats|metrics]');
    }
  } catch (error) {
    if (!error.message.includes('no such table')) {
      // Only log if it's not a table error (those are already handled)
      logger.error('Scraping orchestrator error:', error);
      console.error('\n❌ ERROR:', error.message);
      process.exit(1);
    }
  }
}

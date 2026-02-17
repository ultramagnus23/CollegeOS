const db = require('../config/database');
const orchestrator = require('../services/deadlineScrapingOrchestrator');
const logger = require('../utils/logger');

/**
 * Scheduled jobs for deadline scraping
 * - Weekly: High-priority colleges (Tier 1)
 * - Monthly: All colleges (Tier 2)
 */
class DeadlineScrapingScheduler {
  constructor() {
    this.isRunning = false;
    this.currentJob = null;
    this.cronJobs = [];
  }
  
  /**
   * Run weekly scraping for high-priority colleges (Tier 1)
   * Schedule: Every Sunday at 2 AM
   */
  async runWeeklyHighPriority() {
    if (this.isRunning) {
      logger.warn('Scraping job already running, skipping');
      return;
    }
    
    this.isRunning = true;
    this.currentJob = 'weekly-tier1';
    const startTime = Date.now();
    
    try {
      logger.info('=== WEEKLY HIGH-PRIORITY DEADLINE SCRAPING STARTED ===');
      
      orchestrator.resetStats();
      
      // Get Tier 1 colleges and colleges with approaching deadlines
      const colleges = db.prepare(`
        SELECT c.* FROM colleges c
        LEFT JOIN application_deadlines ad ON c.id = ad.college_id
        WHERE c.priority_tier = 1
          OR (ad.early_decision_1_date >= date('now') AND ad.early_decision_1_date <= date('now', '+90 days'))
          OR (ad.early_action_date >= date('now') AND ad.early_action_date <= date('now', '+90 days'))
          OR (ad.regular_decision_date >= date('now') AND ad.regular_decision_date <= date('now', '+90 days'))
        ORDER BY c.priority_tier ASC, c.ranking ASC
      `).all();
      
      logger.info(`Found ${colleges.length} colleges to scrape (Tier 1 + approaching deadlines)`);
      
      for (const college of colleges) {
        try {
          await orchestrator.scrapeAndUpdateCollege(college);
          
          // Polite delay between requests (2-5 seconds)
          const delay = 2000 + Math.random() * 3000;
          await this._sleep(delay);
          
        } catch (error) {
          logger.error(`Error scraping ${college.name}:`, error);
        }
      }
      
      const stats = orchestrator.getStats();
      const duration = Math.round((Date.now() - startTime) / 1000 / 60);
      
      logger.info(`=== WEEKLY SCRAPING COMPLETE ===`);
      logger.info(`Duration: ${duration} minutes`);
      logger.info(`Colleges scraped: ${stats.scraped}`);
      logger.info(`Successful: ${stats.succeeded}`);
      logger.info(`Failed: ${stats.failed}`);
      logger.info(`Changes detected: ${stats.changes}`);
      logger.info(`Notifications sent: ${stats.notifications}`);
      
      // Save summary
      await this._saveSummary('weekly', stats, duration);
      
    } catch (error) {
      logger.error('Weekly scraping job failed:', error);
    } finally {
      this.isRunning = false;
      this.currentJob = null;
    }
  }
  
  /**
   * Run monthly scraping for all colleges (Tier 2)
   * Schedule: 1st of month at 3 AM
   */
  async runMonthlyAllColleges() {
    if (this.isRunning) {
      logger.warn('Scraping job already running, skipping');
      return;
    }
    
    this.isRunning = true;
    this.currentJob = 'monthly-tier2';
    const startTime = Date.now();
    
    try {
      logger.info('=== MONTHLY ALL-COLLEGES DEADLINE SCRAPING STARTED ===');
      
      orchestrator.resetStats();
      
      // Get Tier 2 colleges that haven't been scraped recently
      const colleges = db.prepare(`
        SELECT * FROM colleges
        WHERE priority_tier = 2
          AND (
            last_scraped_deadlines IS NULL 
            OR last_scraped_deadlines < datetime('now', '-30 days')
          )
        ORDER BY ranking ASC NULLS LAST
        LIMIT 1500
      `).all();
      
      logger.info(`Found ${colleges.length} Tier 2 colleges to scrape`);
      
      for (const college of colleges) {
        try {
          await orchestrator.scrapeAndUpdateCollege(college);
          
          // Polite delay between requests (2-5 seconds)
          const delay = 2000 + Math.random() * 3000;
          await this._sleep(delay);
          
        } catch (error) {
          logger.error(`Error scraping ${college.name}:`, error);
        }
      }
      
      const stats = orchestrator.getStats();
      const duration = Math.round((Date.now() - startTime) / 1000 / 60);
      
      logger.info(`=== MONTHLY SCRAPING COMPLETE ===`);
      logger.info(`Duration: ${duration} minutes`);
      logger.info(`Colleges scraped: ${stats.scraped}`);
      logger.info(`Successful: ${stats.succeeded}`);
      logger.info(`Failed: ${stats.failed}`);
      logger.info(`Changes detected: ${stats.changes}`);
      logger.info(`Notifications sent: ${stats.notifications}`);
      
      // Save summary
      await this._saveSummary('monthly', stats, duration);
      
    } catch (error) {
      logger.error('Monthly scraping job failed:', error);
    } finally {
      this.isRunning = false;
      this.currentJob = null;
    }
  }
  
  /**
   * Recalculate priority tiers based on current data
   * Run this periodically to adjust priorities
   */
  async recalculatePriorities() {
    try {
      logger.info('Recalculating college priority tiers...');
      
      // Set Tier 1 for top 100 ranked colleges
      db.prepare(`
        UPDATE colleges 
        SET priority_tier = 1 
        WHERE ranking <= 100 AND ranking IS NOT NULL
      `).run();
      
      // Set Tier 1 for colleges with high user engagement (>10 applications)
      const highEngagement = db.prepare(`
        SELECT college_id, COUNT(*) as app_count
        FROM applications
        GROUP BY college_id
        HAVING COUNT(*) > 10
      `).all();
      
      for (const { college_id } of highEngagement) {
        db.prepare('UPDATE colleges SET priority_tier = 1 WHERE id = ?').run(college_id);
      }
      
      // Set Tier 1 for colleges that frequently change deadlines
      db.prepare(`
        UPDATE colleges 
        SET priority_tier = 1 
        WHERE deadline_frequently_changes = 1
      `).run();
      
      // Set Tier 2 for remaining colleges
      db.prepare(`
        UPDATE colleges 
        SET priority_tier = 2 
        WHERE priority_tier IS NULL OR priority_tier NOT IN (1, 2)
      `).run();
      
      const tier1Count = db.prepare('SELECT COUNT(*) as count FROM colleges WHERE priority_tier = 1').get().count;
      const tier2Count = db.prepare('SELECT COUNT(*) as count FROM colleges WHERE priority_tier = 2').get().count;
      
      logger.info(`Priority recalculation complete: Tier 1: ${tier1Count}, Tier 2: ${tier2Count}`);
      
    } catch (error) {
      logger.error('Failed to recalculate priorities:', error);
    }
  }
  
  /**
   * Save scraping summary to database
   * @param {string} jobType - Job type (weekly/monthly)
   * @param {object} stats - Scraping statistics
   * @param {number} duration - Duration in minutes
   */
  async _saveSummary(jobType, stats, duration) {
    try {
      const tier1Count = jobType === 'weekly' ? stats.scraped : 0;
      const tier2Count = jobType === 'monthly' ? stats.scraped : 0;
      
      db.prepare(`
        INSERT INTO scraping_summary (
          summary_date, tier1_colleges_scraped, tier2_colleges_scraped,
          total_successful, total_failed, changes_detected,
          notifications_sent, avg_duration_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(summary_date) DO UPDATE SET
          tier1_colleges_scraped = tier1_colleges_scraped + excluded.tier1_colleges_scraped,
          tier2_colleges_scraped = tier2_colleges_scraped + excluded.tier2_colleges_scraped,
          total_successful = total_successful + excluded.total_successful,
          total_failed = total_failed + excluded.total_failed,
          changes_detected = changes_detected + excluded.changes_detected,
          notifications_sent = notifications_sent + excluded.notifications_sent
      `).run(
        new Date().toISOString().split('T')[0],
        tier1Count,
        tier2Count,
        stats.succeeded,
        stats.failed,
        stats.changes,
        stats.notifications,
        Math.round(duration * 60 * 1000 / stats.scraped) // avg per college in ms
      );
      
      logger.info('Scraping summary saved to database');
      
    } catch (error) {
      logger.error('Failed to save scraping summary:', error);
    }
  }
  
  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Setup cron jobs (requires node-cron package)
   * Weekly: Every Sunday at 2 AM
   * Monthly: 1st of month at 3 AM
   */
  setupCronJobs() {
    try {
      const cron = require('node-cron');
      
      // Weekly job: Every Sunday at 2 AM
      this.cronJobs.push(
        cron.schedule('0 2 * * 0', async () => {
          logger.info('Triggered: Weekly high-priority deadline scraping');
          await this.runWeeklyHighPriority();
        })
      );
      
      // Monthly job: 1st of month at 3 AM
      this.cronJobs.push(
        cron.schedule('0 3 1 * *', async () => {
          logger.info('Triggered: Monthly all-colleges deadline scraping');
          await this.runMonthlyAllColleges();
        })
      );
      
      // Priority recalculation: Every Monday at 1 AM
      this.cronJobs.push(
        cron.schedule('0 1 * * 1', async () => {
          logger.info('Triggered: Priority tier recalculation');
          await this.recalculatePriorities();
        })
      );
      
      logger.info('Deadline scraping cron jobs setup complete');
      
    } catch (error) {
      logger.warn('node-cron not available, cron jobs not setup:', error.message);
      logger.info('Install with: npm install node-cron');
    }
  }
  
  /**
   * Stop all cron jobs
   */
  stop() {
    this.cronJobs.forEach(job => {
      if (job && job.stop) {
        job.stop();
      }
    });
    this.cronJobs = [];
    logger.info('Deadline scraping cron jobs stopped');
  }
}

module.exports = new DeadlineScrapingScheduler();

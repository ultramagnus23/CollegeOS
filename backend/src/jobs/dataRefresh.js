// backend/src/jobs/dataRefresh.js
// Automated data refresh jobs using cron

const cron = require('node-cron');
const dbManager = require('../config/database');
const dataAggregator = require('../services/dataAggregator');
const logger = require('../utils/logger');

class DataRefreshJob {
  constructor() {
    this.jobs = [];
  }
  
  /**
   * Start all scheduled jobs
   */
  start() {
    // Monthly: Refresh deadlines for colleges with active applications
    this.jobs.push(
      cron.schedule('0 0 1 * *', async () => {
        logger.info('Monthly deadline refresh starting...');
        await this.refreshDeadlines();
      })
    );
    
    // Quarterly: Refresh college data
    this.jobs.push(
      cron.schedule('0 0 1 */3 *', async () => {
        logger.info('Quarterly college data refresh starting...');
        await this.refreshCollegeData();
      })
    );
    
    logger.info('Data refresh jobs scheduled');
  }
  
  /**
   * Stop all scheduled jobs
   */
  stop() {
    this.jobs.forEach(job => job.stop());
    logger.info('Data refresh jobs stopped');
  }
  
  /**
   * Refresh deadlines for active applications
   */
  async refreshDeadlines() {
    try {
      const db = dbManager.getDatabase();
      
      const stmt = db.prepare(`
        SELECT DISTINCT c.id, c.admissions_url
        FROM colleges c
        JOIN applications a ON c.id = a.college_id
        WHERE a.status IN ('researching', 'preparing')
          AND c.admissions_url IS NOT NULL
        LIMIT 50
      `);
      
      const colleges = stmt.all();
      
      logger.info(`Refreshing deadlines for ${colleges.length} colleges`);
      
      for (const college of colleges) {
        try {
          await dataAggregator.aggregateCollegeData(college.id, {
            admissions: college.admissions_url
          });
          
          await new Promise(resolve => setTimeout(resolve, 3000));
          
        } catch (error) {
          logger.error(`Failed to refresh ${college.id}: ${error.message}`);
        }
      }
      
      logger.info('Deadline refresh completed');
      
    } catch (error) {
      logger.error('Deadline refresh failed:', error);
    }
  }
  
  /**
   * Refresh college data
   */
  async refreshCollegeData() {
    try {
      const db = dbManager.getDatabase();
      
      const stmt = db.prepare(`
        SELECT id, admissions_url, programs_url
        FROM colleges
        WHERE (admissions_url IS NOT NULL OR programs_url IS NOT NULL)
          AND (last_scraped_at IS NULL OR last_scraped_at < date('now', '-3 months'))
        ORDER BY RANDOM()
        LIMIT 20
      `);
      
      const colleges = stmt.all();
      
      logger.info(`Refreshing data for ${colleges.length} colleges`);
      
      for (const college of colleges) {
        try {
          const sources = {};
          if (college.admissions_url) sources.admissions = college.admissions_url;
          if (college.programs_url) sources.programs = college.programs_url;
          
          await dataAggregator.aggregateCollegeData(college.id, sources);
          
          const updateStmt = db.prepare(`
            UPDATE colleges 
            SET last_scraped_at = datetime('now')
            WHERE id = ?
          `);
          updateStmt.run(college.id);
          
          await new Promise(resolve => setTimeout(resolve, 5000));
          
        } catch (error) {
          logger.error(`Failed to refresh ${college.id}: ${error.message}`);
        }
      }
      
      logger.info('College data refresh completed');
      
    } catch (error) {
      logger.error('College data refresh failed:', error);
    }
  }
}

const dataRefreshJob = new DataRefreshJob();

module.exports = dataRefreshJob;

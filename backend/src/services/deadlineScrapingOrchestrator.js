const db = require('../src/config/database');
const scrapingService = require('../src/services/scrappingService');
const notificationService = require('../src/services/notificationService');
const dateParser = require('../src/utils/dateParser');
const logger = require('../src/utils/logger');

/**
 * Orchestrator for scraping college application deadlines
 * Handles change detection, database updates, and user notifications
 */
class DeadlineScrapingOrchestrator {
  constructor() {
    this.stats = {
      scraped: 0,
      succeeded: 0,
      failed: 0,
      changes: 0,
      notifications: 0
    };
  }
  
  /**
   * Scrape deadlines for a single college and update database
   * @param {object} college - College object
   * @returns {Promise<object>} Result of scraping
   */
  async scrapeAndUpdateCollege(college) {
    const startTime = Date.now();
    this.stats.scraped++;
    
    try {
      logger.info(`Scraping deadlines for ${college.name} (ID: ${college.id})`);
      
      // Scrape deadlines
      const result = await scrapingService.scrapeCollegeDeadlines(college);
      
      // Log the attempt
      await this._logScrapeAttempt(college.id, result);
      
      if (!result.success) {
        this.stats.failed++;
        await this._handleScrapingFailure(college, result);
        return result;
      }
      
      this.stats.succeeded++;
      
      // Get existing deadline data
      const existing = await this._getExistingDeadlines(college.id);
      
      // Check for changes and update database
      const changes = await this._updateDeadlines(college, existing, result);
      
      // Send notifications for changes
      if (changes.length > 0) {
        this.stats.changes += changes.length;
        await this._notifyUsers(college, changes);
      }
      
      // Update college metadata
      await this._updateCollegeMetadata(college.id, result);
      
      // Reset failure count on success
      db.prepare('UPDATE colleges SET scraping_failures_count = 0 WHERE id = ?').run(college.id);
      
      logger.info(`✓ Successfully scraped ${college.name}: ${result.deadlines.length} deadlines, ${changes.length} changes`);
      
      return { success: true, changes: changes.length };
      
    } catch (error) {
      this.stats.failed++;
      logger.error(`Error scraping ${college.name}:`, error);
      
      await this._logScrapeAttempt(college.id, {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      });
      
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Get existing deadline data for a college
   * @param {number} collegeId - College ID
   * @returns {object|null} Existing deadline data
   */
  _getExistingDeadlines(collegeId) {
    try {
      return db.prepare('SELECT * FROM application_deadlines WHERE college_id = ?').get(collegeId);
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Update deadline data in database and detect changes
   * @param {object} college - College object
   * @param {object} existing - Existing deadline data
   * @param {object} scrapeResult - Scraping result
   * @returns {Array<object>} Array of changes detected
   */
  async _updateDeadlines(college, existing, scrapeResult) {
    const changes = [];
    const deadlines = scrapeResult.deadlines;
    
    // Build deadline data object
    const deadlineData = {
      college_id: college.id,
      early_decision_1_date: null,
      early_decision_1_notification: null,
      early_decision_2_date: null,
      early_decision_2_notification: null,
      early_action_date: null,
      early_action_notification: null,
      restrictive_early_action_date: null,
      restrictive_early_action_notification: null,
      regular_decision_date: null,
      regular_decision_notification: null,
      ...scrapeResult.offeredTypes,
      source_url: scrapeResult.url,
      last_verified: new Date().toISOString().split('T')[0],
      confidence_score: scrapeResult.confidence
    };
    
    // Map scraped deadlines to database fields
    for (const deadline of deadlines) {
      const appDate = dateParser.formatForDatabase(deadline.applicationDate);
      const notifDate = dateParser.formatForDatabase(deadline.notificationDate);
      
      switch (deadline.type) {
        case 'ED1':
          deadlineData.early_decision_1_date = appDate;
          deadlineData.early_decision_1_notification = notifDate;
          break;
        case 'ED2':
          deadlineData.early_decision_2_date = appDate;
          deadlineData.early_decision_2_notification = notifDate;
          break;
        case 'EA':
          deadlineData.early_action_date = appDate;
          deadlineData.early_action_notification = notifDate;
          break;
        case 'REA':
          deadlineData.restrictive_early_action_date = appDate;
          deadlineData.restrictive_early_action_notification = notifDate;
          break;
        case 'RD':
          deadlineData.regular_decision_date = appDate;
          deadlineData.regular_decision_notification = notifDate;
          break;
      }
    }
    
    // Detect changes
    if (existing) {
      const fields = [
        { key: 'early_decision_1_date', label: 'Early Decision I' },
        { key: 'early_decision_2_date', label: 'Early Decision II' },
        { key: 'early_action_date', label: 'Early Action' },
        { key: 'restrictive_early_action_date', label: 'Restrictive Early Action' },
        { key: 'regular_decision_date', label: 'Regular Decision' }
      ];
      
      for (const field of fields) {
        const oldValue = existing[field.key];
        const newValue = deadlineData[field.key];
        
        if (oldValue && newValue && oldValue !== newValue) {
          changes.push({
            type: field.label,
            oldDate: oldValue,
            newDate: newValue,
            field: field.key
          });
        }
      }
    }
    
    // Update or insert deadline data
    if (existing) {
      // Update existing record
      const updateFields = Object.keys(deadlineData)
        .filter(k => k !== 'college_id')
        .map(k => `${k} = ?`)
        .join(', ');
      
      const updateValues = Object.keys(deadlineData)
        .filter(k => k !== 'college_id')
        .map(k => deadlineData[k]);
      
      updateValues.push(college.id);
      
      db.prepare(`UPDATE application_deadlines SET ${updateFields} WHERE college_id = ?`).run(...updateValues);
      
    } else {
      // Insert new record
      const fields = Object.keys(deadlineData).join(', ');
      const placeholders = Object.keys(deadlineData).map(() => '?').join(', ');
      const values = Object.values(deadlineData);
      
      db.prepare(`INSERT INTO application_deadlines (${fields}) VALUES (${placeholders})`).run(...values);
    }
    
    return changes;
  }
  
  /**
   * Notify users about deadline changes
   * @param {object} college - College object
   * @param {Array<object>} changes - Array of changes
   */
  async _notifyUsers(college, changes) {
    try {
      // Find users who have this college in their applications
      const users = db.prepare(`
        SELECT DISTINCT user_id 
        FROM applications 
        WHERE college_id = ?
      `).all(college.id);
      
      for (const { user_id } of users) {
        for (const change of changes) {
          // Create notification
          await notificationService.notifyDeadlineChange(
            user_id,
            college.name,
            change.type,
            change.oldDate,
            change.newDate,
            college.id
          );
          
          this.stats.notifications++;
        }
      }
      
      logger.info(`Sent ${changes.length} notifications to ${users.length} users for ${college.name}`);
      
    } catch (error) {
      logger.error(`Failed to send notifications for ${college.name}:`, error);
    }
  }
  
  /**
   * Update college metadata after scraping
   * @param {number} collegeId - College ID
   * @param {object} result - Scraping result
   */
  async _updateCollegeMetadata(collegeId, result) {
    try {
      db.prepare(`
        UPDATE colleges 
        SET last_scraped_deadlines = CURRENT_TIMESTAMP,
            deadlines_page_url = ?,
            deadlines_not_available = 0
        WHERE id = ?
      `).run(result.url, collegeId);
    } catch (error) {
      logger.error(`Failed to update college metadata:`, error);
    }
  }
  
  /**
   * Handle scraping failure
   * @param {object} college - College object
   * @param {object} result - Failed scraping result
   */
  async _handleScrapingFailure(college, result) {
    try {
      // Increment failure count
      db.prepare(`
        UPDATE colleges 
        SET scraping_failures_count = scraping_failures_count + 1,
            last_scraped_deadlines = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(college.id);
      
      // Get updated failure count
      const { scraping_failures_count } = db.prepare(
        'SELECT scraping_failures_count FROM colleges WHERE id = ?'
      ).get(college.id);
      
      // Flag for manual review after 3 failures
      if (scraping_failures_count >= 3) {
        logger.warn(`College ${college.name} flagged for manual review (${scraping_failures_count} failures)`);
        
        db.prepare(`
          INSERT INTO manual_review_queue (college_id, reason, error_details, confidence_score)
          VALUES (?, ?, ?, ?)
        `).run(
          college.id,
          'Repeated scraping failures',
          result.error || 'Unknown error',
          result.confidence || 0.0
        );
        
        // Set to tier 2 (lower priority)
        db.prepare('UPDATE colleges SET priority_tier = 2, scraping_difficult = 1 WHERE id = ?').run(college.id);
      }
      
    } catch (error) {
      logger.error(`Failed to handle scraping failure:`, error);
    }
  }
  
  /**
   * Log scraping attempt to database
   * @param {number} collegeId - College ID
   * @param {object} result - Scraping result
   */
  async _logScrapeAttempt(collegeId, result) {
    try {
      db.prepare(`
        INSERT INTO scraping_logs (
          college_id, scrape_type, url_visited, started_at, completed_at,
          status, deadlines_found, changes_detected, error_message,
          confidence_score, extraction_method, duration_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        collegeId,
        'deadlines',
        result.url || null,
        new Date(Date.now() - (result.duration || 0)).toISOString(),
        new Date().toISOString(),
        result.success ? 'success' : 'failure',
        result.deadlines ? result.deadlines.length : 0,
        result.changes || 0,
        result.error || null,
        result.confidence || null,
        result.extractionMethod || null,
        result.duration || 0
      );
    } catch (error) {
      logger.error(`Failed to log scrape attempt:`, error);
    }
  }
  
  /**
   * Get summary statistics
   * @returns {object} Statistics
   */
  getStats() {
    return { ...this.stats };
  }
  
  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      scraped: 0,
      succeeded: 0,
      failed: 0,
      changes: 0,
      notifications: 0
    };
  }
}

module.exports = new DeadlineScrapingOrchestrator();

const dbManager = require('../config/database');
const scrapingService = require('./scrappingService');
const notificationService = require('./notificationService');
const dateParser = require('../utils/dateParser');
const logger = require('../utils/logger');

/**
 * Orchestrator for scraping college application deadlines
 * Handles change detection, database updates, and user notifications
 */
class DeadlineScrapingOrchestrator {
  constructor() {
    this.stats = { scraped: 0, succeeded: 0, failed: 0, changes: 0, notifications: 0 };
  }

  async scrapeAndUpdateCollege(college) {
    const startTime = Date.now();
    this.stats.scraped++;

    try {
      logger.info('Scraping deadlines for college', { name: college.name, id: college.id });
      const result = await scrapingService.scrapeCollegeDeadlines(college);
      await this._logScrapeAttempt(college.id, result);

      if (!result.success) {
        this.stats.failed++;
        await this._handleScrapingFailure(college, result);
        return result;
      }

      this.stats.succeeded++;
      const existing = await this._getExistingDeadlines(college.id);
      const changes = await this._updateDeadlines(college, existing, result);

      if (changes.length > 0) {
        this.stats.changes += changes.length;
        await this._notifyUsers(college, changes);
      }

      await this._updateCollegeMetadata(college.id, result);

      const pool = dbManager.getDatabase();
      await pool.query('UPDATE colleges SET scraping_failures_count = 0 WHERE id = $1', [college.id]);

      logger.info('Successfully scraped college', { name: college.name, deadlines: result.deadlines.length, changes: changes.length });
      return { success: true, changes: changes.length };
    } catch (error) {
      this.stats.failed++;
      logger.error('Error scraping college', { name: college.name, error: error?.message });
      await this._logScrapeAttempt(college.id, { success: false, error: error.message, duration: Date.now() - startTime });
      return { success: false, error: error.message };
    }
  }

  async _getExistingDeadlines(collegeId) {
    try {
      const pool = dbManager.getDatabase();
      const { rows } = await pool.query('SELECT * FROM application_deadlines WHERE college_id = $1', [collegeId]);
      return rows[0] || null;
    } catch { return null; }
  }

  async _updateDeadlines(college, existing, scrapeResult) {
    const pool = dbManager.getDatabase();
    const changes = [];
    const deadlines = scrapeResult.deadlines;

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

    for (const deadline of deadlines) {
      const appDate = dateParser.formatForDatabase(deadline.applicationDate);
      const notifDate = dateParser.formatForDatabase(deadline.notificationDate);
      switch (deadline.type) {
        case 'ED1': deadlineData.early_decision_1_date = appDate; deadlineData.early_decision_1_notification = notifDate; break;
        case 'ED2': deadlineData.early_decision_2_date = appDate; deadlineData.early_decision_2_notification = notifDate; break;
        case 'EA':  deadlineData.early_action_date = appDate;     deadlineData.early_action_notification = notifDate;     break;
        case 'REA': deadlineData.restrictive_early_action_date = appDate; deadlineData.restrictive_early_action_notification = notifDate; break;
        case 'RD':  deadlineData.regular_decision_date = appDate; deadlineData.regular_decision_notification = notifDate; break;
      }
    }

    if (existing) {
      const fields = [
        { key: 'early_decision_1_date',        label: 'Early Decision I' },
        { key: 'early_decision_2_date',        label: 'Early Decision II' },
        { key: 'early_action_date',            label: 'Early Action' },
        { key: 'restrictive_early_action_date', label: 'Restrictive Early Action' },
        { key: 'regular_decision_date',        label: 'Regular Decision' }
      ];
      for (const field of fields) {
        const oldValue = existing[field.key];
        const newValue = deadlineData[field.key];
        if (oldValue && newValue && oldValue !== newValue) {
          changes.push({ type: field.label, oldDate: oldValue, newDate: newValue, field: field.key });
        }
      }

      const keys = Object.keys(deadlineData).filter(k => k !== 'college_id');
      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      const vals = keys.map(k => deadlineData[k]);
      vals.push(college.id);
      await pool.query(`UPDATE application_deadlines SET ${setClause} WHERE college_id = $${vals.length}`, vals);
    } else {
      const keys = Object.keys(deadlineData);
      const cols = keys.join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const vals = keys.map(k => deadlineData[k]);
      await pool.query(`INSERT INTO application_deadlines (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, vals);
    }
    return changes;
  }

  async _notifyUsers(college, changes) {
    try {
      const pool = dbManager.getDatabase();
      const { rows: users } = await pool.query(
        'SELECT DISTINCT user_id FROM applications WHERE college_id = $1', [college.id]
      );
      for (const { user_id } of users) {
        for (const change of changes) {
          await notificationService.notifyDeadlineChange(user_id, college.name, change.type, change.oldDate, change.newDate, college.id);
          this.stats.notifications++;
        }
      }
      logger.info('Sent notifications', { changes: changes.length, users: users.length, college: college.name });
    } catch (error) {
      logger.error('Failed to send notifications', { college: college.name, error: error?.message });
    }
  }

  async _updateCollegeMetadata(collegeId, result) {
    try {
      const pool = dbManager.getDatabase();
      await pool.query(
        `UPDATE colleges SET last_scraped_deadlines = NOW(), deadlines_page_url = $1, deadlines_not_available = false WHERE id = $2`,
        [result.url, collegeId]
      );
    } catch (error) {
      logger.error('Failed to update college metadata', { error: error?.message });
    }
  }

  async _handleScrapingFailure(college, result) {
    try {
      const pool = dbManager.getDatabase();
      await pool.query(
        `UPDATE colleges SET scraping_failures_count = scraping_failures_count + 1, last_scraped_deadlines = NOW() WHERE id = $1`,
        [college.id]
      );
      const { rows } = await pool.query('SELECT scraping_failures_count FROM colleges WHERE id = $1', [college.id]);
      const failCount = rows[0]?.scraping_failures_count || 0;
      if (failCount >= 3) {
        logger.warn('College flagged for manual review', { name: college.name, failures: failCount });
        await pool.query(
          `INSERT INTO manual_review_queue (college_id, reason, error_details, confidence_score)
           VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [college.id, 'Repeated scraping failures', result.error || 'Unknown error', result.confidence || 0.0]
        );
        await pool.query('UPDATE colleges SET priority_tier = 2, scraping_difficult = true WHERE id = $1', [college.id]);
      }
    } catch (error) {
      logger.error('Failed to handle scraping failure', { error: error?.message });
    }
  }

  async _logScrapeAttempt(collegeId, result) {
    try {
      const pool = dbManager.getDatabase();
      await pool.query(
        `INSERT INTO scraping_logs
           (college_id, scrape_type, url_visited, started_at, completed_at, status,
            deadlines_found, changes_detected, error_message, confidence_score, extraction_method, duration_ms)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
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
        ]
      );
    } catch (error) {
      logger.error('Failed to log scrape attempt', { error: error?.message });
    }
  }

  getStats() { return { ...this.stats }; }
  resetStats() { this.stats = { scraped: 0, succeeded: 0, failed: 0, changes: 0, notifications: 0 }; }
}

module.exports = new DeadlineScrapingOrchestrator();

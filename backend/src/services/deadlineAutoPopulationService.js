const dbManager = require('../config/database');
const logger = require('../utils/logger');

/**
 * Service for automatically populating deadlines when a college is added to user's list
 * Implements TASK 1 from problem statement
 */
class DeadlineAutoPopulationService {
  /**
   * Auto-populate deadlines for a college application
   * @param {number} userId - User ID
   * @param {number} applicationId - Application ID
   * @param {number} collegeId - College ID
   * @returns {object} Result with populated deadlines and status
   */
  static async populateDeadlinesForApplication(userId, applicationId, collegeId) {
    const db = dbManager.getDatabase();
    const currentYear = new Date().getFullYear();
    const result = {
      success: false,
      deadlinesAdded: [],
      message: '',
      usedHistoricalData: false
    };

    try {
      // Query college deadlines for current year
      let collegeDeadlines = this._getCollegeDeadlines(collegeId, currentYear);
      
      // Check if data exists with confidence_score >= 0.7
      if (!collegeDeadlines || (collegeDeadlines.confidence_score && collegeDeadlines.confidence_score < 0.7)) {
        logger.info(`No reliable current year data for college ${collegeId}, trying previous year`);
        
        // Try previous year as fallback
        collegeDeadlines = this._getCollegeDeadlines(collegeId, currentYear - 1);
        
        if (!collegeDeadlines) {
          result.message = 'No deadline data available for this college';
          return result;
        }
        
        result.usedHistoricalData = true;
      }

      // Get college name for messages
      const college = db.prepare('SELECT name FROM colleges WHERE id = ?').get(collegeId);
      const collegeName = college ? college.name : 'College';

      // Insert deadlines only for types that are offered (offered = true)
      const deadlinesToCreate = this._extractOfferedDeadlines(collegeDeadlines);
      
      if (deadlinesToCreate.length === 0) {
        result.message = 'No applicable deadlines found for this college';
        return result;
      }

      // Begin transaction
      const insertStmt = db.prepare(`
        INSERT INTO deadlines (
          application_id, 
          deadline_type, 
          deadline_date, 
          description,
          source_url,
          status
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      const insertMany = db.transaction((deadlines) => {
        for (const deadline of deadlines) {
          insertStmt.run(
            applicationId,
            deadline.type,
            deadline.date,
            deadline.description,
            collegeDeadlines.source_url || null,
            'not_started'
          );
          result.deadlinesAdded.push(deadline);
        }
      });

      insertMany(deadlinesToCreate);
      
      result.success = true;
      
      if (result.usedHistoricalData) {
        result.message = `Showing ${currentYear - 1} deadlines. ${currentYear} not yet released. Will auto-update when available.`;
      } else {
        result.message = `Deadlines added for ${collegeName}`;
      }

      logger.info(`Successfully populated ${result.deadlinesAdded.length} deadlines for application ${applicationId}`);
      
      return result;

    } catch (error) {
      logger.error('Error populating deadlines:', error);
      result.message = 'Failed to populate deadlines';
      throw error;
    }
  }

  /**
   * Get college deadlines from database
   * @private
   */
  static _getCollegeDeadlines(collegeId, year) {
    const db = dbManager.getDatabase();
    
    // Query application_deadlines table
    const stmt = db.prepare(`
      SELECT * FROM application_deadlines 
      WHERE college_id = ? AND application_year = ?
    `);
    
    return stmt.get(collegeId, year);
  }

  /**
   * Extract deadlines that are actually offered by the college
   * Only returns deadline types where the database has offered = true
   * @private
   */
  static _extractOfferedDeadlines(collegeDeadlines) {
    const deadlines = [];
    const currentYear = new Date().getFullYear();

    // Early Decision I
    if (collegeDeadlines.offers_early_decision && collegeDeadlines.early_decision_1_date) {
      deadlines.push({
        type: 'early_decision_1',
        date: collegeDeadlines.early_decision_1_date,
        description: 'Early Decision I deadline',
        notificationDate: collegeDeadlines.early_decision_1_notification
      });
    }

    // Early Decision II
    if (collegeDeadlines.offers_early_decision && collegeDeadlines.early_decision_2_date) {
      deadlines.push({
        type: 'early_decision_2',
        date: collegeDeadlines.early_decision_2_date,
        description: 'Early Decision II deadline',
        notificationDate: collegeDeadlines.early_decision_2_notification
      });
    }

    // Early Action
    if (collegeDeadlines.offers_early_action && collegeDeadlines.early_action_date) {
      deadlines.push({
        type: 'early_action',
        date: collegeDeadlines.early_action_date,
        description: 'Early Action deadline',
        notificationDate: collegeDeadlines.early_action_notification
      });
    }

    // Restrictive Early Action
    if (collegeDeadlines.offers_restrictive_ea && collegeDeadlines.restrictive_early_action_date) {
      deadlines.push({
        type: 'restrictive_early_action',
        date: collegeDeadlines.restrictive_early_action_date,
        description: 'Restrictive Early Action deadline',
        notificationDate: collegeDeadlines.restrictive_early_action_notification
      });
    }

    // Regular Decision
    if (collegeDeadlines.regular_decision_date) {
      deadlines.push({
        type: 'regular_decision',
        date: collegeDeadlines.regular_decision_date,
        description: 'Regular Decision deadline',
        notificationDate: collegeDeadlines.regular_decision_notification
      });
    }

    // Rolling Admission
    if (collegeDeadlines.offers_rolling_admission) {
      // For rolling admissions, use priority deadline if available
      const rollingDate = collegeDeadlines.priority_deadline || 
                         collegeDeadlines.regular_decision_date ||
                         `${currentYear + 1}-06-01`; // Default to June 1 if no date
      
      deadlines.push({
        type: 'rolling_admission',
        date: rollingDate,
        description: collegeDeadlines.priority_deadline ? 'Priority deadline for rolling admission' : 'Rolling admission',
        notificationDate: null
      });
    }

    return deadlines;
  }

  /**
   * Check if college has deadline data available
   * @param {number} collegeId - College ID
   * @returns {boolean} True if deadlines exist
   */
  static hasDeadlineData(collegeId) {
    const currentYear = new Date().getFullYear();
    const current = this._getCollegeDeadlines(collegeId, currentYear);
    const previous = this._getCollegeDeadlines(collegeId, currentYear - 1);
    
    return !!(current || previous);
  }
}

module.exports = DeadlineAutoPopulationService;

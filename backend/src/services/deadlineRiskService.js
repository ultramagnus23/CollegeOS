/**
 * DeadlineRiskService.js
 * Handles deadline tracking, risk calculation, and alerts
 * Core component of the CollegeOS deadline and risk system
 */

const dbManager = require('../config/database');
const logger = require('../utils/logger');

/**
 * Risk level thresholds (in hours)
 */
const RISK_THRESHOLDS = {
  SAFE: 100,      // 100+ hours buffer = safe
  TIGHT: 20,      // 20-100 hours buffer = tight
  CRITICAL: 0,    // 0-20 hours buffer = critical
  IMPOSSIBLE: -1  // Negative buffer = impossible
};

/**
 * @typedef {Object} RiskLevel
 * @property {'safe' | 'tight' | 'critical' | 'impossible'} level
 * @property {number} bufferHours
 * @property {string} description
 */

class DeadlineService {
  /**
   * Calculate time risk for a deadline
   * @param {Date|string} deadline - Deadline date
   * @param {Object[]} tasksRemaining - Array of remaining tasks with estimatedHours
   * @returns {RiskLevel}
   */
  static calculateTimeRisk(deadline, tasksRemaining = []) {
    const deadlineDate = new Date(deadline);
    const now = new Date();
    
    // Calculate hours remaining until deadline
    const hoursRemaining = (deadlineDate - now) / (1000 * 60 * 60);
    
    // Calculate total hours needed for remaining tasks
    const hoursNeeded = tasksRemaining.reduce((sum, task) => {
      return sum + (task.estimatedHours || task.estimated_hours || 0);
    }, 0);
    
    // Calculate buffer
    const buffer = hoursRemaining - hoursNeeded;
    
    let level, description;
    
    if (buffer > RISK_THRESHOLDS.SAFE) {
      level = 'safe';
      description = `${Math.round(buffer)} hours of buffer - comfortable timeline`;
    } else if (buffer > RISK_THRESHOLDS.TIGHT) {
      level = 'tight';
      description = `${Math.round(buffer)} hours of buffer - manageable but focused effort needed`;
    } else if (buffer > RISK_THRESHOLDS.CRITICAL) {
      level = 'critical';
      description = `Only ${Math.round(buffer)} hours of buffer - urgent action required`;
    } else {
      level = 'impossible';
      description = `${Math.round(Math.abs(buffer))} hours short - deadline may not be achievable`;
    }
    
    return {
      level,
      bufferHours: buffer,
      hoursRemaining,
      hoursNeeded,
      description,
      tasksCount: tasksRemaining.length
    };
  }

  /**
   * Flag colleges that are impossible to complete on time
   * @param {number} userId - User ID
   * @returns {Promise<Object[]>} List of impossible colleges with reasons
   */
  static async flagImpossibleColleges(userId) {
    const db = dbManager.getDatabase();
    const impossibleColleges = [];
    
    // Get all colleges the user is applying to
    const applications = db.prepare(`
      SELECT DISTINCT a.college_id, c.name as college_name
      FROM applications a
      JOIN colleges c ON c.id = a.college_id
      WHERE a.user_id = ? AND a.status NOT IN ('submitted', 'withdrawn', 'accepted', 'rejected')
    `).all(userId);
    
    for (const app of applications) {
      // Get nearest deadline
      const deadline = await this.getNearestDeadline(userId, app.college_id);
      
      if (!deadline) continue;
      
      // Get remaining tasks
      const tasks = db.prepare(`
        SELECT * FROM tasks
        WHERE user_id = ? AND college_id = ? AND status NOT IN ('complete', 'skipped')
      `).all(userId, app.college_id);
      
      const risk = this.calculateTimeRisk(deadline.deadline_date, tasks);
      
      if (risk.level === 'impossible') {
        impossibleColleges.push({
          collegeId: app.college_id,
          collegeName: app.college_name,
          deadline: deadline.deadline_date,
          deadlineType: deadline.deadline_type,
          risk,
          suggestions: this.generateImpossibleSuggestions(risk, deadline)
        });
        
        // Update risk assessment table
        await this.updateRiskAssessment(userId, app.college_id, risk);
      }
    }
    
    logger.debug(`Found ${impossibleColleges.length} impossible colleges for user ${userId}`);
    
    return impossibleColleges;
  }

  /**
   * Generate suggestions for impossible deadlines
   * @param {RiskLevel} risk - Risk assessment
   * @param {Object} deadline - Deadline info
   * @returns {string[]}
   */
  static generateImpossibleSuggestions(risk, deadline) {
    const suggestions = [];
    
    if (risk.bufferHours < -50) {
      suggestions.push('Consider withdrawing from this application to focus on achievable goals');
    } else {
      suggestions.push('Request deadline extension if possible');
    }
    
    if (risk.tasksCount > 5) {
      suggestions.push('Identify which tasks can be skipped or simplified');
    }
    
    if (deadline.deadline_type === 'early_decision' || deadline.deadline_type === 'early_action') {
      suggestions.push('Consider switching to regular decision deadline if available');
    }
    
    suggestions.push('Prioritize critical tasks and get help with others');
    
    return suggestions;
  }

  /**
   * Get critical deadlines in the next N days
   * @param {number} userId - User ID
   * @param {number} days - Number of days to look ahead
   * @returns {Promise<Object[]>}
   */
  static async getCriticalDeadlines(userId, days = 14) {
    const db = dbManager.getDatabase();
    
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    
    const deadlines = db.prepare(`
      SELECT ud.*, c.name as college_name
      FROM user_deadlines ud
      LEFT JOIN colleges c ON c.id = ud.college_id
      WHERE ud.user_id = ? 
        AND ud.is_active = 1 
        AND ud.is_completed = 0
        AND ud.deadline_date <= ?
        AND ud.deadline_date >= datetime('now')
      ORDER BY ud.deadline_date ASC
    `).all(userId, futureDate.toISOString());
    
    // Enrich with risk assessment
    const enrichedDeadlines = [];
    
    for (const deadline of deadlines) {
      const tasks = db.prepare(`
        SELECT * FROM tasks
        WHERE user_id = ? AND college_id = ? AND status NOT IN ('complete', 'skipped')
      `).all(userId, deadline.college_id);
      
      const risk = this.calculateTimeRisk(deadline.deadline_date, tasks);
      
      enrichedDeadlines.push({
        ...deadline,
        risk,
        daysUntil: Math.ceil((new Date(deadline.deadline_date) - new Date()) / (1000 * 60 * 60 * 24)),
        tasksRemaining: tasks.length
      });
    }
    
    return enrichedDeadlines;
  }

  /**
   * Get buffer time for a deadline
   * @param {Date|string} deadline - Deadline date
   * @param {number} estimatedWork - Estimated hours of work
   * @returns {number} Buffer hours
   */
  static getBufferTime(deadline, estimatedWork) {
    const deadlineDate = new Date(deadline);
    const now = new Date();
    const hoursRemaining = (deadlineDate - now) / (1000 * 60 * 60);
    
    return hoursRemaining - estimatedWork;
  }

  /**
   * Get the nearest deadline for a college
   * @param {number} userId - User ID
   * @param {number} collegeId - College ID
   * @returns {Promise<Object|null>}
   */
  static async getNearestDeadline(userId, collegeId) {
    const db = dbManager.getDatabase();
    
    // Check user_deadlines first
    let deadline = db.prepare(`
      SELECT * FROM user_deadlines
      WHERE user_id = ? AND college_id = ? AND is_active = 1 AND is_completed = 0
      ORDER BY deadline_date ASC
      LIMIT 1
    `).get(userId, collegeId);
    
    if (deadline) return deadline;
    
    // Fall back to application deadlines table
    try {
      deadline = db.prepare(`
        SELECT 
          college_id,
          COALESCE(
            early_decision_1_deadline,
            early_action_deadline,
            regular_decision_deadline,
            priority_deadline
          ) as deadline_date,
          'official' as deadline_type
        FROM application_deadlines
        WHERE college_id = ?
        ORDER BY deadline_date ASC
        LIMIT 1
      `).get(collegeId);
    } catch (error) {
      logger.debug('Could not get application deadline:', error.message);
    }
    
    return deadline;
  }

  /**
   * Create a user deadline
   * @param {number} userId - User ID
   * @param {Object} data - Deadline data
   * @returns {Promise<Object>}
   */
  static async createDeadline(userId, data) {
    const db = dbManager.getDatabase();
    
    // Calculate initial risk
    const risk = this.calculateTimeRisk(data.deadlineDate, []);
    
    const result = db.prepare(`
      INSERT INTO user_deadlines (
        user_id, college_id, application_id, title, deadline_type,
        deadline_date, risk_level, buffer_hours, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      data.collegeId || null,
      data.applicationId || null,
      data.title,
      data.deadlineType || 'personal',
      data.deadlineDate,
      risk.level,
      risk.bufferHours,
      data.notes || null
    );
    
    return {
      id: result.lastInsertRowid,
      ...data,
      risk
    };
  }

  /**
   * Update deadline risk assessment
   * @param {number} userId - User ID
   * @param {number} collegeId - College ID
   * @param {RiskLevel} risk - Risk assessment
   */
  static async updateRiskAssessment(userId, collegeId, risk) {
    const db = dbManager.getDatabase();
    
    try {
      db.prepare(`
        INSERT OR REPLACE INTO risk_assessments (
          user_id, college_id, time_risk_level, time_buffer_hours,
          overall_risk_score, risk_factors, calculated_at
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        userId,
        collegeId,
        risk.level,
        risk.bufferHours,
        this.calculateOverallRiskScore(risk),
        JSON.stringify([{ factor: 'time', level: risk.level, description: risk.description }])
      );
    } catch (error) {
      logger.debug('Could not update risk assessment:', error.message);
    }
  }

  /**
   * Calculate overall risk score (0-100, higher = more risk)
   * @param {RiskLevel} risk - Risk assessment
   * @returns {number}
   */
  static calculateOverallRiskScore(risk) {
    switch (risk.level) {
      case 'safe': return Math.max(0, 20 - (risk.bufferHours / 10));
      case 'tight': return 40 + (20 - Math.min(20, risk.bufferHours));
      case 'critical': return 70 + (10 - Math.min(10, risk.bufferHours));
      case 'impossible': return Math.min(100, 90 + Math.abs(risk.bufferHours) / 10);
      default: return 50;
    }
  }

  /**
   * Create alert for a deadline
   * @param {number} userId - User ID
   * @param {number} deadlineId - Deadline ID
   * @param {string} alertType - Alert type
   * @param {string} message - Alert message
   */
  static async createAlert(userId, deadlineId, alertType, message) {
    const db = dbManager.getDatabase();
    
    try {
      db.prepare(`
        INSERT INTO deadline_alerts (user_id, deadline_id, alert_type, alert_message)
        VALUES (?, ?, ?, ?)
      `).run(userId, deadlineId, alertType, message);
    } catch (error) {
      logger.debug('Could not create alert:', error.message);
    }
  }

  /**
   * Get unread alerts for a user
   * @param {number} userId - User ID
   * @returns {Promise<Object[]>}
   */
  static async getUnreadAlerts(userId) {
    const db = dbManager.getDatabase();
    
    try {
      return db.prepare(`
        SELECT da.*, ud.title as deadline_title, ud.deadline_date, c.name as college_name
        FROM deadline_alerts da
        JOIN user_deadlines ud ON ud.id = da.deadline_id
        LEFT JOIN colleges c ON c.id = ud.college_id
        WHERE da.user_id = ? AND da.is_read = 0 AND da.is_dismissed = 0
        ORDER BY da.created_at DESC
      `).all(userId);
    } catch (error) {
      logger.debug('Could not get alerts:', error.message);
      return [];
    }
  }

  /**
   * Mark alert as read
   * @param {number} alertId - Alert ID
   */
  static async markAlertRead(alertId) {
    const db = dbManager.getDatabase();
    
    db.prepare(`
      UPDATE deadline_alerts SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(alertId);
  }

  /**
   * Get all deadlines for a user
   * @param {number} userId - User ID
   * @param {Object} options - Filter options
   * @returns {Promise<Object[]>}
   */
  static async getDeadlines(userId, options = {}) {
    const db = dbManager.getDatabase();
    
    let query = `
      SELECT ud.*, c.name as college_name
      FROM user_deadlines ud
      LEFT JOIN colleges c ON c.id = ud.college_id
      WHERE ud.user_id = ?
    `;
    const params = [userId];
    
    if (options.activeOnly !== false) {
      query += ' AND ud.is_active = 1';
    }
    
    if (options.incompleteOnly) {
      query += ' AND ud.is_completed = 0';
    }
    
    if (options.collegeId) {
      query += ' AND ud.college_id = ?';
      params.push(options.collegeId);
    }
    
    query += ' ORDER BY ud.deadline_date ASC';
    
    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    
    return db.prepare(query).all(...params);
  }

  /**
   * Sync deadlines from college data
   * @param {number} userId - User ID
   * @param {number} collegeId - College ID
   * @param {number} [applicationId] - Optional application ID
   */
  static async syncCollegeDeadlines(userId, collegeId, applicationId = null) {
    const db = dbManager.getDatabase();
    
    try {
      // Get deadlines from application_deadlines table
      const collegeDeadlines = db.prepare(`
        SELECT * FROM application_deadlines WHERE college_id = ?
      `).get(collegeId);
      
      if (!collegeDeadlines) return;
      
      const deadlineFields = [
        { field: 'early_decision_1_deadline', type: 'early_decision', title: 'Early Decision 1' },
        { field: 'early_decision_2_deadline', type: 'early_decision', title: 'Early Decision 2' },
        { field: 'early_action_deadline', type: 'early_action', title: 'Early Action' },
        { field: 'regular_decision_deadline', type: 'regular', title: 'Regular Decision' },
        { field: 'priority_deadline', type: 'priority', title: 'Priority Deadline' },
        { field: 'fafsa_priority_deadline', type: 'financial_aid', title: 'FAFSA Priority' },
        { field: 'css_profile_deadline', type: 'financial_aid', title: 'CSS Profile' }
      ];
      
      for (const { field, type, title } of deadlineFields) {
        if (collegeDeadlines[field]) {
          // Check if deadline already exists
          const existing = db.prepare(`
            SELECT id FROM user_deadlines 
            WHERE user_id = ? AND college_id = ? AND title = ?
          `).get(userId, collegeId, title);
          
          if (!existing) {
            const risk = this.calculateTimeRisk(collegeDeadlines[field], []);
            
            db.prepare(`
              INSERT INTO user_deadlines (
                user_id, college_id, application_id, title, deadline_type,
                deadline_date, risk_level, buffer_hours
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              userId,
              collegeId,
              applicationId,
              title,
              type,
              collegeDeadlines[field],
              risk.level,
              risk.bufferHours
            );
          }
        }
      }
      
      logger.debug(`Synced deadlines for user ${userId}, college ${collegeId}`);
    } catch (error) {
      logger.warn('Could not sync college deadlines:', error.message);
    }
  }

  /**
   * Run daily deadline check and create alerts
   * @param {number} userId - User ID
   */
  static async runDailyCheck(userId) {
    const db = dbManager.getDatabase();
    
    // Get deadlines in next 14 days
    const criticalDeadlines = await this.getCriticalDeadlines(userId, 14);
    
    for (const deadline of criticalDeadlines) {
      // Create alerts based on risk level
      if (deadline.risk.level === 'impossible' && !deadline.alert_sent) {
        await this.createAlert(
          userId,
          deadline.id,
          'impossible',
          `⚠️ ${deadline.college_name}: This deadline may be impossible to meet. ${deadline.risk.description}`
        );
      } else if (deadline.risk.level === 'critical' && !deadline.alert_sent) {
        await this.createAlert(
          userId,
          deadline.id,
          'critical',
          `🔴 ${deadline.college_name}: Critical deadline approaching! ${deadline.risk.description}`
        );
      } else if (deadline.daysUntil <= 3 && !deadline.alert_sent) {
        await this.createAlert(
          userId,
          deadline.id,
          'warning',
          `⏰ ${deadline.college_name}: Deadline in ${deadline.daysUntil} days!`
        );
      }
      
      // Mark that alert was sent
      if (deadline.risk.level !== 'safe') {
        db.prepare(`
          UPDATE user_deadlines SET alert_sent = 1, last_alert_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(deadline.id);
      }
    }
    
    // Flag impossible colleges
    await this.flagImpossibleColleges(userId);
  }
}

module.exports = DeadlineService;

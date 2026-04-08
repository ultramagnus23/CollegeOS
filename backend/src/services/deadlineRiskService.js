/**
 * DeadlineRiskService.js
 * Handles deadline tracking, risk calculation, and alerts
 * Core component of the CollegeOS deadline and risk system
 */

const dbManager = require('../config/database');
const logger = require('../utils/logger');

const RISK_THRESHOLDS = {
  SAFE: 100,
  TIGHT: 20,
  CRITICAL: 0,
  IMPOSSIBLE: -1
};

class DeadlineService {
  static calculateTimeRisk(deadline, tasksRemaining = []) {
    const deadlineDate = new Date(deadline);
    const now = new Date();
    const hoursRemaining = (deadlineDate - now) / (1000 * 60 * 60);
    const hoursNeeded = tasksRemaining.reduce((sum, task) => sum + (task.estimatedHours || task.estimated_hours || 0), 0);
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

    return { level, bufferHours: buffer, hoursRemaining, hoursNeeded, description, tasksCount: tasksRemaining.length };
  }

  static async flagImpossibleColleges(userId) {
    const pool = dbManager.getDatabase();
    const impossibleColleges = [];

    const { rows: applications } = await pool.query(
      `SELECT DISTINCT a.college_id, c.name AS college_name
       FROM applications a
       JOIN colleges c ON c.id = a.college_id
       WHERE a.user_id = $1 AND a.status NOT IN ('submitted','withdrawn','accepted','rejected')`,
      [userId]
    );

    for (const app of applications) {
      const deadline = await this.getNearestDeadline(userId, app.college_id);
      if (!deadline) continue;

      const { rows: tasks } = await pool.query(
        `SELECT * FROM tasks WHERE user_id = $1 AND college_id = $2 AND status NOT IN ('complete','skipped')`,
        [userId, app.college_id]
      );

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
        await this.updateRiskAssessment(userId, app.college_id, risk);
      }
    }

    logger.debug('Found impossible colleges', { count: impossibleColleges.length, userId });
    return impossibleColleges;
  }

  static generateImpossibleSuggestions(risk, deadline) {
    const suggestions = [];
    if (risk.bufferHours < -50) {
      suggestions.push('Consider withdrawing from this application to focus on achievable goals');
    } else {
      suggestions.push('Request deadline extension if possible');
    }
    if (risk.tasksCount > 5) suggestions.push('Identify which tasks can be skipped or simplified');
    if (deadline.deadline_type === 'early_decision' || deadline.deadline_type === 'early_action') {
      suggestions.push('Consider switching to regular decision deadline if available');
    }
    suggestions.push('Prioritize critical tasks and get help with others');
    return suggestions;
  }

  static async getCriticalDeadlines(userId, days = 14) {
    const pool = dbManager.getDatabase();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const { rows: deadlines } = await pool.query(
      `SELECT ud.*, c.name AS college_name
       FROM user_deadlines ud
       LEFT JOIN colleges c ON c.id = ud.college_id
       WHERE ud.user_id = $1
         AND ud.is_active = 1
         AND ud.is_completed = 0
         AND ud.deadline_date <= $2
         AND ud.deadline_date >= NOW()
       ORDER BY ud.deadline_date ASC`,
      [userId, futureDate.toISOString()]
    );

    const enrichedDeadlines = [];
    for (const deadline of deadlines) {
      const { rows: tasks } = await pool.query(
        `SELECT * FROM tasks WHERE user_id = $1 AND college_id = $2 AND status NOT IN ('complete','skipped')`,
        [userId, deadline.college_id]
      );
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

  static getBufferTime(deadline, estimatedWork) {
    const deadlineDate = new Date(deadline);
    const now = new Date();
    return (deadlineDate - now) / (1000 * 60 * 60) - estimatedWork;
  }

  static async getNearestDeadline(userId, collegeId) {
    const pool = dbManager.getDatabase();

    const { rows: ud } = await pool.query(
      `SELECT * FROM user_deadlines
       WHERE user_id = $1 AND college_id = $2 AND is_active = 1 AND is_completed = 0
       ORDER BY deadline_date ASC LIMIT 1`,
      [userId, collegeId]
    );
    if (ud[0]) return ud[0];

    try {
      const { rows: ad } = await pool.query(
        `SELECT college_id,
                COALESCE(early_decision_1_deadline, early_action_deadline, regular_decision_deadline, priority_deadline) AS deadline_date,
                'official' AS deadline_type
         FROM application_deadlines
         WHERE college_id = $1
         ORDER BY deadline_date ASC LIMIT 1`,
        [collegeId]
      );
      return ad[0] || null;
    } catch (error) {
      logger.debug('Could not get application deadline', { error: error?.message });
      return null;
    }
  }

  static async createDeadline(userId, data) {
    const pool = dbManager.getDatabase();
    const risk = this.calculateTimeRisk(data.deadlineDate, []);

    const { rows } = await pool.query(
      `INSERT INTO user_deadlines
         (user_id, college_id, application_id, title, deadline_type, deadline_date, risk_level, buffer_hours, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        userId,
        data.collegeId || null,
        data.applicationId || null,
        data.title,
        data.deadlineType || 'personal',
        data.deadlineDate,
        risk.level,
        risk.bufferHours,
        data.notes || null
      ]
    );
    return { id: rows[0].id, ...data, risk };
  }

  static async updateRiskAssessment(userId, collegeId, risk) {
    const pool = dbManager.getDatabase();
    try {
      await pool.query(
        `INSERT INTO risk_assessments
           (user_id, college_id, time_risk_level, time_buffer_hours, overall_risk_score, risk_factors, calculated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (user_id, college_id) DO UPDATE SET
           time_risk_level = EXCLUDED.time_risk_level,
           time_buffer_hours = EXCLUDED.time_buffer_hours,
           overall_risk_score = EXCLUDED.overall_risk_score,
           risk_factors = EXCLUDED.risk_factors,
           calculated_at = NOW()`,
        [
          userId,
          collegeId,
          risk.level,
          risk.bufferHours,
          this.calculateOverallRiskScore(risk),
          JSON.stringify([{ factor: 'time', level: risk.level, description: risk.description }])
        ]
      );
    } catch (error) {
      logger.debug('Could not update risk assessment', { error: error?.message });
    }
  }

  static calculateOverallRiskScore(risk) {
    switch (risk.level) {
      case 'safe': return Math.max(0, 20 - (risk.bufferHours / 10));
      case 'tight': return 40 + (20 - Math.min(20, risk.bufferHours));
      case 'critical': return 70 + (10 - Math.min(10, risk.bufferHours));
      case 'impossible': return Math.min(100, 90 + Math.abs(risk.bufferHours) / 10);
      default: return 50;
    }
  }

  static async createAlert(userId, deadlineId, alertType, message) {
    const pool = dbManager.getDatabase();
    try {
      await pool.query(
        `INSERT INTO deadline_alerts (user_id, deadline_id, alert_type, alert_message) VALUES ($1,$2,$3,$4)`,
        [userId, deadlineId, alertType, message]
      );
    } catch (error) {
      logger.debug('Could not create alert', { error: error?.message });
    }
  }

  static async getUnreadAlerts(userId) {
    const pool = dbManager.getDatabase();
    try {
      const { rows } = await pool.query(
        `SELECT da.*, ud.title AS deadline_title, ud.deadline_date, c.name AS college_name
         FROM deadline_alerts da
         JOIN user_deadlines ud ON ud.id = da.deadline_id
         LEFT JOIN colleges c ON c.id = ud.college_id
         WHERE da.user_id = $1 AND da.is_read = false AND da.is_dismissed = false
         ORDER BY da.created_at DESC`,
        [userId]
      );
      return rows;
    } catch (error) {
      logger.debug('Could not get alerts', { error: error?.message });
      return [];
    }
  }

  static async markAlertRead(alertId) {
    const pool = dbManager.getDatabase();
    await pool.query(
      `UPDATE deadline_alerts SET is_read = true, read_at = NOW() WHERE id = $1`,
      [alertId]
    );
  }

  static async getDeadlines(userId, options = {}) {
    const pool = dbManager.getDatabase();
    let query = `
      SELECT ud.*, c.name AS college_name
      FROM user_deadlines ud
      LEFT JOIN colleges c ON c.id = ud.college_id
      WHERE ud.user_id = $1`;
    const params = [userId];
    let idx = 2;

    if (options.activeOnly !== false) {
      query += ' AND ud.is_active = 1';
    }
    if (options.incompleteOnly) {
      query += ' AND ud.is_completed = 0';
    }
    if (options.collegeId) {
      query += ` AND ud.college_id = $${idx++}`;
      params.push(options.collegeId);
    }
    query += ' ORDER BY ud.deadline_date ASC';
    if (options.limit) {
      query += ` LIMIT $${idx++}`;
      params.push(options.limit);
    }

    const { rows } = await pool.query(query, params);
    return rows;
  }

  static async syncCollegeDeadlines(userId, collegeId, applicationId = null) {
    const pool = dbManager.getDatabase();
    try {
      const { rows } = await pool.query(
        `SELECT * FROM application_deadlines WHERE college_id = $1`,
        [collegeId]
      );
      const collegeDeadlines = rows[0];
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
          const { rows: existing } = await pool.query(
            `SELECT id FROM user_deadlines WHERE user_id = $1 AND college_id = $2 AND title = $3`,
            [userId, collegeId, title]
          );
          if (!existing[0]) {
            const risk = this.calculateTimeRisk(collegeDeadlines[field], []);
            await pool.query(
              `INSERT INTO user_deadlines
                 (user_id, college_id, application_id, title, deadline_type, deadline_date, risk_level, buffer_hours)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [userId, collegeId, applicationId, title, type, collegeDeadlines[field], risk.level, risk.bufferHours]
            );
          }
        }
      }
      logger.debug('Synced deadlines', { userId, collegeId });
    } catch (error) {
      logger.warn('Could not sync college deadlines', { error: error?.message });
    }
  }

  static async runDailyCheck(userId) {
    const pool = dbManager.getDatabase();
    const criticalDeadlines = await this.getCriticalDeadlines(userId, 14);

    for (const deadline of criticalDeadlines) {
      if (deadline.risk.level === 'impossible' && !deadline.alert_sent) {
        await this.createAlert(userId, deadline.id, 'impossible',
          `⚠️ ${deadline.college_name}: This deadline may be impossible to meet. ${deadline.risk.description}`);
      } else if (deadline.risk.level === 'critical' && !deadline.alert_sent) {
        await this.createAlert(userId, deadline.id, 'critical',
          `🔴 ${deadline.college_name}: Critical deadline approaching! ${deadline.risk.description}`);
      } else if (deadline.daysUntil <= 3 && !deadline.alert_sent) {
        await this.createAlert(userId, deadline.id, 'warning',
          `⏰ ${deadline.college_name}: Deadline in ${deadline.daysUntil} days!`);
      }
      if (deadline.risk.level !== 'safe') {
        await pool.query(
          `UPDATE user_deadlines SET alert_sent = true, last_alert_at = NOW() WHERE id = $1`,
          [deadline.id]
        );
      }
    }
    await this.flagImpossibleColleges(userId);
  }
}

module.exports = DeadlineService;

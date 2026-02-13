const dbManager = require('../config/database');

class CollegeDeadline {
  /**
   * Find deadlines for a specific college and year
   */
  static findByCollege(collegeId, year = new Date().getFullYear()) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM application_deadlines 
      WHERE college_id = ? AND application_year = ?
    `);
    return stmt.get(collegeId, year);
  }

  /**
   * Get list of deadline types this college actually offers
   */
  static getOfferedDeadlineTypes(collegeId, year = new Date().getFullYear()) {
    const deadlines = this.findByCollege(collegeId, year);
    if (!deadlines) return [];
    
    const offered = [];
    if (deadlines.early_decision_1_date) {
      offered.push({
        type: 'Early Decision I',
        applicationDate: deadlines.early_decision_1_date,
        notificationDate: deadlines.early_decision_1_notification
      });
    }
    if (deadlines.early_decision_2_date) {
      offered.push({
        type: 'Early Decision II',
        applicationDate: deadlines.early_decision_2_date,
        notificationDate: deadlines.early_decision_2_notification
      });
    }
    if (deadlines.early_action_date) {
      offered.push({
        type: 'Early Action',
        applicationDate: deadlines.early_action_date,
        notificationDate: deadlines.early_action_notification
      });
    }
    if (deadlines.restrictive_ea_date) {
      offered.push({
        type: 'Restrictive Early Action',
        applicationDate: deadlines.restrictive_ea_date,
        notificationDate: deadlines.restrictive_ea_notification
      });
    }
    if (deadlines.regular_decision_date) {
      offered.push({
        type: 'Regular Decision',
        applicationDate: deadlines.regular_decision_date,
        notificationDate: deadlines.regular_decision_notification
      });
    }
    if (deadlines.rolling_admission) {
      offered.push({
        type: 'Rolling Admission',
        applicationDate: deadlines.priority_deadline || 'Rolling',
        notificationDate: 'Rolling'
      });
    }
    
    return offered;
  }

  /**
   * Create or update college deadlines
   */
  static createOrUpdate(data) {
    const db = dbManager.getDatabase();
    
    // Check if exists
    const existing = this.findByCollege(data.collegeId, data.applicationYear || new Date().getFullYear());
    
    if (existing) {
      // Update
      const stmt = db.prepare(`
        UPDATE application_deadlines SET
          early_decision_1_date = ?,
          early_decision_1_notification = ?,
          early_decision_2_date = ?,
          early_decision_2_notification = ?,
          early_action_date = ?,
          early_action_notification = ?,
          restrictive_ea_date = ?,
          restrictive_ea_notification = ?,
          regular_decision_date = ?,
          regular_decision_notification = ?,
          rolling_admission = ?,
          priority_deadline = ?,
          fafsa_deadline = ?,
          css_profile_deadline = ?,
          source_url = ?,
          confidence_score = ?,
          verification_status = ?,
          last_updated = CURRENT_TIMESTAMP
        WHERE college_id = ? AND application_year = ?
      `);
      
      stmt.run(
        data.earlyDecision1Date || null,
        data.earlyDecision1Notification || null,
        data.earlyDecision2Date || null,
        data.earlyDecision2Notification || null,
        data.earlyActionDate || null,
        data.earlyActionNotification || null,
        data.restrictiveEADate || null,
        data.restrictiveEANotification || null,
        data.regularDecisionDate || null,
        data.regularDecisionNotification || null,
        data.rollingAdmission || 0,
        data.priorityDeadline || null,
        data.fafsaDeadline || null,
        data.cssProfileDeadline || null,
        data.sourceUrl || null,
        data.confidenceScore || 0.5,
        data.verificationStatus || 'unverified',
        data.collegeId,
        data.applicationYear || new Date().getFullYear()
      );
    } else {
      // Insert
      const stmt = db.prepare(`
        INSERT INTO application_deadlines (
          college_id, application_year,
          early_decision_1_date, early_decision_1_notification,
          early_decision_2_date, early_decision_2_notification,
          early_action_date, early_action_notification,
          restrictive_ea_date, restrictive_ea_notification,
          regular_decision_date, regular_decision_notification,
          rolling_admission, priority_deadline,
          fafsa_deadline, css_profile_deadline,
          source_url, confidence_score, verification_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        data.collegeId,
        data.applicationYear || new Date().getFullYear(),
        data.earlyDecision1Date || null,
        data.earlyDecision1Notification || null,
        data.earlyDecision2Date || null,
        data.earlyDecision2Notification || null,
        data.earlyActionDate || null,
        data.earlyActionNotification || null,
        data.restrictiveEADate || null,
        data.restrictiveEANotification || null,
        data.regularDecisionDate || null,
        data.regularDecisionNotification || null,
        data.rollingAdmission || 0,
        data.priorityDeadline || null,
        data.fafsaDeadline || null,
        data.cssProfileDeadline || null,
        data.sourceUrl || null,
        data.confidenceScore || 0.5,
        data.verificationStatus || 'unverified'
      );
    }
    
    return this.findByCollege(data.collegeId, data.applicationYear || new Date().getFullYear());
  }

  /**
   * Get all colleges with deadlines for a specific year
   */
  static findAll(year = new Date().getFullYear()) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      SELECT ad.*, c.name as college_name
      FROM application_deadlines ad
      JOIN colleges c ON ad.college_id = c.id
      WHERE ad.application_year = ?
      ORDER BY c.name ASC
    `);
    return stmt.all(year);
  }
}

module.exports = CollegeDeadline;

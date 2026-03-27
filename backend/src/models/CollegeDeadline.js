const dbManager = require('../config/database');

class CollegeDeadline {
  static async findByCollege(collegeId, year = new Date().getFullYear()) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      'SELECT * FROM application_deadlines WHERE college_id = $1 AND application_year = $2',
      [collegeId, year]
    );
    return rows[0] || null;
  }

  static async getOfferedDeadlineTypes(collegeId, year = new Date().getFullYear()) {
    const deadlines = await this.findByCollege(collegeId, year);
    if (!deadlines) return [];
    const offered = [];
    if (deadlines.early_decision_1_date) offered.push({ type:'Early Decision I', applicationDate:deadlines.early_decision_1_date, notificationDate:deadlines.early_decision_1_notification });
    if (deadlines.early_decision_2_date) offered.push({ type:'Early Decision II', applicationDate:deadlines.early_decision_2_date, notificationDate:deadlines.early_decision_2_notification });
    if (deadlines.early_action_date) offered.push({ type:'Early Action', applicationDate:deadlines.early_action_date, notificationDate:deadlines.early_action_notification });
    if (deadlines.restrictive_ea_date) offered.push({ type:'Restrictive Early Action', applicationDate:deadlines.restrictive_ea_date, notificationDate:deadlines.restrictive_ea_notification });
    if (deadlines.regular_decision_date) offered.push({ type:'Regular Decision', applicationDate:deadlines.regular_decision_date, notificationDate:deadlines.regular_decision_notification });
    if (deadlines.rolling_admission) offered.push({ type:'Rolling Admission', applicationDate:deadlines.priority_deadline||'Rolling', notificationDate:'Rolling' });
    return offered;
  }

  static async createOrUpdate(data) {
    const pool = dbManager.getDatabase();
    const year = data.applicationYear || new Date().getFullYear();
    const existing = await this.findByCollege(data.collegeId, year);

    const vals = [
      data.earlyDecision1Date||null, data.earlyDecision1Notification||null,
      data.earlyDecision2Date||null, data.earlyDecision2Notification||null,
      data.earlyActionDate||null, data.earlyActionNotification||null,
      data.restrictiveEADate||null, data.restrictiveEANotification||null,
      data.regularDecisionDate||null, data.regularDecisionNotification||null,
      data.rollingAdmission||false, data.priorityDeadline||null,
      data.fafsaDeadline||null, data.cssProfileDeadline||null,
      data.sourceUrl||null, data.confidenceScore||0.5,
      data.verificationStatus||'unverified'
    ];

    if (existing) {
      await pool.query(
        `UPDATE application_deadlines SET
          early_decision_1_date=$1,early_decision_1_notification=$2,
          early_decision_2_date=$3,early_decision_2_notification=$4,
          early_action_date=$5,early_action_notification=$6,
          restrictive_ea_date=$7,restrictive_ea_notification=$8,
          regular_decision_date=$9,regular_decision_notification=$10,
          rolling_admission=$11,priority_deadline=$12,
          fafsa_deadline=$13,css_profile_deadline=$14,
          source_url=$15,confidence_score=$16,verification_status=$17,
          last_updated=NOW()
         WHERE college_id=$18 AND application_year=$19`,
        [...vals, data.collegeId, year]
      );
    } else {
      await pool.query(
        `INSERT INTO application_deadlines (
          college_id,application_year,
          early_decision_1_date,early_decision_1_notification,
          early_decision_2_date,early_decision_2_notification,
          early_action_date,early_action_notification,
          restrictive_ea_date,restrictive_ea_notification,
          regular_decision_date,regular_decision_notification,
          rolling_admission,priority_deadline,
          fafsa_deadline,css_profile_deadline,
          source_url,confidence_score,verification_status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [data.collegeId, year, ...vals]
      );
    }
    return this.findByCollege(data.collegeId, year);
  }

  static async findAll(year = new Date().getFullYear()) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT ad.*, c.name as college_name
       FROM application_deadlines ad
       JOIN colleges c ON ad.college_id = c.id
       WHERE ad.application_year = $1
       ORDER BY c.name ASC`,
      [year]
    );
    return rows;
  }
}

module.exports = CollegeDeadline;

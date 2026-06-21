const dbManager = require('../config/database');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/security');

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
    const pool = dbManager.getDatabase();
    const currentYear = new Date().getFullYear();
    const result = {
      success: false,
      deadlinesAdded: [],
      message: '',
      usedHistoricalData: false
    };

    try {
      // Query college deadlines for current year
      let collegeDeadlines = await this._getCollegeDeadlines(collegeId, currentYear);
      
      // Check if data exists with confidence_score >= 0.7
      if (!collegeDeadlines || (collegeDeadlines.confidence_score && collegeDeadlines.confidence_score < 0.7)) {
        logger.info(`No reliable current year data for college ${sanitizeForLog(collegeId)}, trying previous year`);
        
        // Try previous year as fallback
        collegeDeadlines = await this._getCollegeDeadlines(collegeId, currentYear - 1);
        
        if (!collegeDeadlines) {
          // No college-specific deadline data — still generate support task defaults
          await this._insertSupportDeadlines(pool, userId, applicationId, collegeId, null, result);
          result.message = 'Default support deadlines created (no college-specific data found)';
          result.success = true;
          return result;
        }

        result.usedHistoricalData = true;
      }

      // Get college name for messages. institution_identity_map.legacy_id is 0%
      // populated (8,329 rows use source_pk instead) — this always returned no
      // rows; use the populated source_pk/institution_id columns instead.
      const college = (await pool.query(
        `SELECT i.canonical_name AS name
         FROM canonical.institution_identity_map m
         JOIN canonical.institutions i ON i.id = m.institution_id
         WHERE m.source_pk = $1::text
         LIMIT 1`,
        [String(collegeId)]
      )).rows[0];
      const collegeName = college ? college.name : 'College';

      // Insert admission deadlines (types that the college offers)
      const deadlinesToCreate = this._extractOfferedDeadlines(collegeDeadlines);
      for (const deadline of deadlinesToCreate) {
        // Same parameter-type-inference issue as the support-deadlines insert below:
        // a bare SELECT with no FROM gives Postgres no column context, and $3 is
        // reused in the WHERE NOT EXISTS subquery — without explicit casts this
        // silently failed for every college-specific deadline on every application.
        await pool.query(
          `INSERT INTO deadlines (user_id, application_id, deadline_type, deadline_date, title, description)
           SELECT $1::integer, $2::integer, $3::varchar, $4::timestamp, $5::text, $6::text
           WHERE NOT EXISTS (
             SELECT 1 FROM deadlines WHERE application_id = $2::integer AND deadline_type = $3::varchar
           )`,
          [userId, applicationId, deadline.type, deadline.date, deadline.description, deadline.description]
        );
        result.deadlinesAdded.push(deadline);
      }

      // Always add support deadlines (FAFSA, transcripts, rec letters, etc.)
      const rdDate = collegeDeadlines.regular_decision_deadline || null;
      await this._insertSupportDeadlines(pool, userId, applicationId, collegeId, rdDate, result);

      result.success = true;

      if (result.usedHistoricalData) {
        result.message = `Showing ${currentYear - 1} deadlines. ${currentYear} not yet released.`;
      } else {
        result.message = `Deadlines added for ${collegeName}`;
      }

      logger.info(`Successfully populated ${sanitizeForLog(result.deadlinesAdded.length)} deadlines for application ${sanitizeForLog(applicationId)}`);
      
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
  static async _getCollegeDeadlines(collegeId, year) {
    const pool = dbManager.getDatabase();
    // Column is academic_year (text), not application_year
    return (await pool.query(
      `SELECT * FROM application_deadlines WHERE college_id = $1 AND academic_year = $2`,
      [collegeId, String(year)]
    )).rows[0];
  }

  /**
   * Extract deadlines that are actually offered by the college
   * Only returns deadline types where the database has offered = true
   * @private
   */
  static _extractOfferedDeadlines(collegeDeadlines) {
    const deadlines = [];
    const currentYear = new Date().getFullYear();

    // Actual column names in application_deadlines:
    //   early_decision_1_deadline, early_decision_2_deadline,
    //   early_action_deadline, restrictive_early_action_deadline,
    //   regular_decision_deadline, priority_deadline, rolling_admission (INTEGER)
    const d = collegeDeadlines;

    if (d.early_decision_1_deadline) {
      deadlines.push({ type: 'early_decision_1', date: d.early_decision_1_deadline, description: 'Early Decision I deadline', notificationDate: d.early_decision_1_notification });
    }
    if (d.early_decision_2_deadline) {
      deadlines.push({ type: 'early_decision_2', date: d.early_decision_2_deadline, description: 'Early Decision II deadline', notificationDate: d.early_decision_2_notification });
    }
    if (d.early_action_deadline) {
      deadlines.push({ type: 'early_action', date: d.early_action_deadline, description: 'Early Action deadline', notificationDate: d.early_action_notification });
    }
    if (d.restrictive_early_action_deadline) {
      deadlines.push({ type: 'restrictive_early_action', date: d.restrictive_early_action_deadline, description: 'Restrictive Early Action deadline', notificationDate: d.restrictive_early_action_notification });
    }
    if (d.regular_decision_deadline) {
      deadlines.push({ type: 'regular_decision', date: d.regular_decision_deadline, description: 'Regular Decision deadline', notificationDate: d.regular_decision_notification });
    }
    if (d.rolling_admission === 1 || d.rolling_admission === true) {
      const rollingDate = d.priority_deadline || d.regular_decision_deadline || `${currentYear + 1}-06-01`;
      deadlines.push({ type: 'rolling_admission', date: rollingDate, description: d.priority_deadline ? 'Priority deadline for rolling admission' : 'Rolling admission', notificationDate: null });
    }

    return deadlines;
  }

  /**
   * Insert standard support deadlines (FAFSA, CSS Profile, transcripts, rec letters, etc.).
   * Uses sensible date defaults derived from the RD deadline when available.
   * Skips any type that already exists for this application (dedup guard).
   * @private
   */
  static async _insertSupportDeadlines(pool, userId, applicationId, collegeId, rdDate, result) {
    const now = new Date();
    const nextJan1 = new Date(now.getFullYear() + 1, 0, 1);

    // If rdDate given, derive relative dates; otherwise use calendar defaults
    const rd = rdDate ? new Date(rdDate) : new Date(nextJan1);
    const minus30 = (base) => {
      const d = new Date(base);
      d.setDate(d.getDate() - 30);
      return d.toISOString().slice(0, 10);
    };
    const minus60 = (base) => {
      const d = new Date(base);
      d.setDate(d.getDate() - 60);
      return d.toISOString().slice(0, 10);
    };
    const minus90 = (base) => {
      const d = new Date(base);
      d.setDate(d.getDate() - 90);
      return d.toISOString().slice(0, 10);
    };

    const supportDeadlines = [
      { type: 'fafsa',               date: `${now.getFullYear()}-10-01`, title: 'FAFSA Opens — Submit Early' },
      { type: 'css_profile',          date: `${now.getFullYear()}-10-15`, title: 'CSS Profile Submission' },
      { type: 'transcript_request',   date: minus60(rd),                  title: 'Request Official Transcripts' },
      { type: 'teacher_rec_request',  date: minus90(rd),                  title: 'Ask Teachers for Recommendations' },
      { type: 'counselor_rec',        date: minus60(rd),                  title: 'Counselor Recommendation Request' },
      { type: 'test_score_send',      date: minus30(rd),                  title: 'Send SAT/ACT Scores to College' },
      { type: 'midyear_report',       date: `${now.getFullYear() + 1}-02-15`, title: 'Submit Midyear School Report' },
    ];

    for (const d of supportDeadlines) {
      try {
        // Explicit casts are required: a bare SELECT (no FROM) gives Postgres no
        // column context to infer parameter types, and $3 is reused inside the
        // WHERE NOT EXISTS subquery (compared against the varchar deadline_type
        // column) — without casts PG deduces conflicting types for the same
        // parameter ("inconsistent types deduced for parameter $3") and the
        // insert silently failed for every deadline, every application.
        await pool.query(
          `INSERT INTO deadlines (user_id, application_id, deadline_type, deadline_date, title, description)
           SELECT $1::integer, $2::integer, $3::varchar, $4::timestamp, $5::text, $5::text
           WHERE NOT EXISTS (
             SELECT 1 FROM deadlines WHERE application_id = $2::integer AND deadline_type = $3::varchar
           )`,
          [userId, applicationId, d.type, d.date, d.title]
        );
        result.deadlinesAdded.push({ type: d.type, date: d.date, description: d.title });
      } catch (err) {
        logger.warn(`Support deadline insert skipped for type=${d.type}:`, err?.message);
      }
    }
  }

  /**
   * Check if college has deadline data available
   * @param {number} collegeId - College ID
   * @returns {boolean} True if deadlines exist
   */
  static async hasDeadlineData(collegeId) {
    const currentYear = new Date().getFullYear();
    const current = await this._getCollegeDeadlines(collegeId, currentYear);
    const previous = await this._getCollegeDeadlines(collegeId, currentYear - 1);
    
    return !!(current || previous);
  }
}

module.exports = DeadlineAutoPopulationService;

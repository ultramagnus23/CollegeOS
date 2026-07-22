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
   * @param {number} collegeId - College ID (legacy numeric id, used for name lookup fallback)
   * @param {string|null} canonicalInstitutionId - canonical.institutions UUID, if already
   *   resolved by the caller (Application.create resolves this at write time). When absent,
   *   it is looked up from collegeId via the identity map.
   * @returns {object} Result with populated deadlines and status
   */
  static async populateDeadlinesForApplication(userId, applicationId, collegeId, canonicalInstitutionId = null) {
    const pool = dbManager.getDatabase();
    const currentYear = new Date().getFullYear();
    const result = {
      success: false,
      deadlinesAdded: [],
      message: '',
      usedHistoricalData: false
    };

    try {
      const institutionId = canonicalInstitutionId || await this._resolveInstitutionId(pool, collegeId);

      // Query college deadlines for the current admission cycle (e.g. "2025-2026").
      // canonical.institution_deadlines is one row per deadline_type, not a single
      // row per college — _getCollegeDeadlines returns an array or null.
      let collegeDeadlines = await this._getCollegeDeadlines(institutionId, this._cycleYear(currentYear));

      if (!collegeDeadlines) {
        logger.info(`No reliable current cycle data for college ${sanitizeForLog(collegeId)}, trying previous cycle`);

        // Try previous cycle as fallback
        collegeDeadlines = await this._getCollegeDeadlines(institutionId, this._cycleYear(currentYear - 1));

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
      const rdRow = collegeDeadlines.find(d => d.deadline_type === 'regular_decision');
      const rdDate = rdRow ? rdRow.deadline_date : null;
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
   * Resolve a legacy numeric college id to its canonical.institutions UUID via
   * the identity map. Mirrors Application.resolveCanonicalUuid's source_table
   * filter so both paths agree on which institution a given legacy id maps to.
   * @private
   */
  static async _resolveInstitutionId(pool, collegeId) {
    const { rows } = await pool.query(
      `SELECT institution_id
         FROM canonical.institution_identity_map
        WHERE source_pk = $1::text
          AND source_table IN ('public.colleges_comprehensive', 'public.colleges', 'colleges')
        ORDER BY source_table
        LIMIT 1`,
      [String(collegeId)]
    );
    return rows[0]?.institution_id || null;
  }

  /**
   * Build the cycle_year string (e.g. "2025-2026") canonical.institution_deadlines
   * uses for the admission cycle ending in `admissionYear`.
   * @private
   */
  static _cycleYear(admissionYear) {
    return `${admissionYear - 1}-${admissionYear}`;
  }

  /**
   * Get a college's deadlines from canonical.institution_deadlines.
   * One row per deadline_type, so this returns an array (or null if none/unresolved).
   * @private
   */
  static async _getCollegeDeadlines(institutionId, cycleYear) {
    if (!institutionId) return null;
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT deadline_type, deadline_date, notification_date, confidence_score
         FROM canonical.institution_deadlines
        WHERE institution_id = $1 AND cycle_year = $2
          AND (confidence_score IS NULL OR confidence_score >= 0.7)`,
      [institutionId, cycleYear]
    );
    return rows.length ? rows : null;
  }

  /**
   * Extract the deadline types actually offered by the college from the rows
   * returned by _getCollegeDeadlines. Some institutions (e.g. UCAS schools)
   * carry duplicate rows per deadline_type — first one wins.
   * @private
   */
  static _extractOfferedDeadlines(collegeDeadlines) {
    const labels = {
      early_decision_1: 'Early Decision I deadline',
      early_decision_2: 'Early Decision II deadline',
      early_action: 'Early Action deadline',
      restrictive_early_action: 'Restrictive Early Action deadline',
      regular_decision: 'Regular Decision deadline',
      rolling: 'Rolling admission deadline',
      ucas_equal_consideration: 'UCAS Equal Consideration deadline',
    };

    const seen = new Set();
    const deadlines = [];
    for (const row of collegeDeadlines) {
      if (!row.deadline_date || seen.has(row.deadline_type)) continue;
      seen.add(row.deadline_type);
      deadlines.push({
        type: row.deadline_type,
        date: row.deadline_date,
        description: labels[row.deadline_type] || row.deadline_type,
        notificationDate: row.notification_date,
      });
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
    const pool = dbManager.getDatabase();
    const currentYear = new Date().getFullYear();
    const institutionId = await this._resolveInstitutionId(pool, collegeId);
    const current = await this._getCollegeDeadlines(institutionId, this._cycleYear(currentYear));
    const previous = await this._getCollegeDeadlines(institutionId, this._cycleYear(currentYear - 1));

    return !!(current || previous);
  }
}

module.exports = DeadlineAutoPopulationService;

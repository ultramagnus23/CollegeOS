const dbManager = require('../config/database');
const logger = require('../utils/logger');

// Columns that are allowed in INSERT / UPDATE operations.
// Any field sent by the client that is NOT in this list is silently dropped
// before it reaches the DB, preventing "column does not exist" errors.
const ALLOWED_INSERT_FIELDS = [
  'user_id', 'college_id', 'application_type', 'status',
  'notes', 'deadline', 'priority',
];

class Application {
  static async create(userId, data) {
    const pool = dbManager.getDatabase();

    // Strip any unknown fields before they reach the DB.
    // Only columns defined in ALLOWED_INSERT_FIELDS are permitted.
    const safeData = Object.fromEntries(
      Object.entries(data).filter(([k]) => ALLOWED_INSERT_FIELDS.includes(k))
    );

    // Resolve collegeId from either camelCase or snake_case input
    const rawCollegeId = data.collegeId || data.college_id;
    logger.debug('Application.create', {
      userId,
      rawCollegeId,
      rawCollegeIdType: typeof rawCollegeId,
      dataKeys: Object.keys(data),
    });
    if (!rawCollegeId) {
      const err = new Error('Valid college_id is required');
      err.statusCode = 400;
      err.code = 'INVALID_COLLEGE_ID';
      throw err;
    }

    // Resolve the college ID to a numeric value:
    // - If numeric, use it directly
    // - If UUID string, look it up in canonical.mv_college_cards or canonical.institutions
    const numericCollegeId = await this.resolveCollegeId(pool, rawCollegeId);
    if (numericCollegeId == null) {
      const err = new Error('College not found');
      err.statusCode = 400;
      err.code = 'COLLEGE_NOT_FOUND';
      throw err;
    }

    // Check for duplicate first
    const existingApp = await this.findByUserAndCollege(userId, numericCollegeId);
    if (existingApp) {
      const error = new Error('College already added to your list');
      error.statusCode = 400;
      error.code = 'DUPLICATE_APPLICATION';
      throw error;
    }

    let rows;
    try {
      ({ rows } = await pool.query(
        `INSERT INTO applications (user_id, college_id, status, application_type, priority, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          userId,
          numericCollegeId,
          safeData.status || data.status || 'researching',
          safeData.application_type || data.application_type || data.applicationType || null,
          safeData.priority || data.priority || null,
          safeData.notes || data.notes || null
        ]
      ));
    } catch (dbErr) {
      logger.error('DB error in Application.create:', dbErr);
      if (dbErr?.code === '23505') {
        const duplicateErr = new Error('College already added to your list');
        duplicateErr.statusCode = 400;
        duplicateErr.code = 'DUPLICATE_APPLICATION';
        throw duplicateErr;
      }
      const err = new Error(dbErr.message || 'Database error while creating application');
      err.detail = dbErr.detail;
      err.code = dbErr.code;
      throw err;
    }

    const applicationId = rows[0].id;

    // Auto-populate deadlines
    try {
      const DeadlineAutoPopulationService = require('../services/deadlineAutoPopulationService');
      const deadlineResult = await DeadlineAutoPopulationService.populateDeadlinesForApplication(
        userId, applicationId, numericCollegeId
      );
      logger.info('Auto-populated deadlines:', deadlineResult);
    } catch (error) {
      logger.error('Failed to auto-populate deadlines, but application was created:', error);
    }

    // Auto-load essays
    try {
      const EssayAutoLoadingService = require('../services/essayAutoLoadingService');
      const essayResult = await EssayAutoLoadingService.loadEssaysForApplication(
        userId, applicationId, numericCollegeId
      );
      logger.info('Auto-loaded essays:', essayResult);
    } catch (error) {
      logger.error('Failed to auto-load essays, but application was created:', error);
    }

    return this.findById(applicationId);
  }

  /**
   * Resolve a raw college ID (numeric or UUID string) to a numeric ID.
   * 1. If numeric, use it directly (verify in legacy colleges table).
   * 2. If UUID string, look it up in canonical tables via identity map.
   * Returns null if the college cannot be resolved.
   */
  static async resolveCollegeId(pool, rawId) {
    logger.debug('resolveCollegeId called', { rawId, rawIdType: typeof rawId });
    // Case 1: numeric ID — use directly
    const numeric = Number(rawId);
    if (Number.isInteger(numeric) && numeric > 0) {
      // Verify the numeric ID exists in the legacy colleges table
      const { rows } = await pool.query(
        'SELECT id FROM colleges WHERE id = $1 LIMIT 1',
        [numeric]
      );
      if (rows.length > 0) return numeric;
      // Try colleges_comprehensive
      try {
        const { rows: ccRows } = await pool.query(
          'SELECT id FROM colleges_comprehensive WHERE id = $1 LIMIT 1',
          [numeric]
        );
        if (ccRows.length > 0) return numeric;
      } catch {
        // Table may not exist
      }
      return null;
    }

    // Case 2: UUID string — look up in canonical tables
    const strId = String(rawId).trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(strId)) return null;

    // Try canonical → identity map → legacy integer id
    try {
      const { rows: identityRows } = await pool.query(
        `SELECT im.legacy_id
         FROM canonical.institutions i
         JOIN canonical.institution_identity_map im ON i.id = im.canonical_institution_id
         WHERE i.id = $1
         LIMIT 1`,
        [strId]
      );
      if (identityRows.length > 0) return Number(identityRows[0].legacy_id);

      // UUID not in identity map — fetch canonical data and find/create a legacy record
      const { rows: canonRows } = await pool.query(
        `SELECT canonical_name, country_code FROM canonical.institutions WHERE id = $1 LIMIT 1`,
        [strId]
      );
      if (canonRows.length === 0) return null;

      const { canonical_name, country_code } = canonRows[0];

      // Try matching by name in legacy colleges table
      let legacyId;
      const { rows: byName } = await pool.query(
        `SELECT id FROM colleges WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [canonical_name]
      );
      if (byName.length > 0) {
        legacyId = byName[0].id;
      } else {
        // Create a minimal legacy record so this college can be added
        const { rows: inserted } = await pool.query(
          `INSERT INTO colleges (name, country) VALUES ($1, $2) RETURNING id`,
          [canonical_name, country_code || 'Unknown']
        );
        legacyId = inserted[0].id;
      }

      // Record the mapping so future lookups are fast
      await pool.query(
        `INSERT INTO canonical.institution_identity_map (canonical_institution_id, legacy_id, source)
         VALUES ($1, $2, 'auto') ON CONFLICT (canonical_institution_id) DO NOTHING`,
        [strId, legacyId]
      );
      return legacyId;
    } catch (err) {
      logger.warn('resolveCollegeId UUID lookup failed:', { uuid: strId, error: err?.message });
    }

    return null;
  }

  static async findByUserAndCollege(userId, collegeId) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT a.*,
              c.id AS canonical_institution_id,
              c.name AS college_name,
              c.country AS country,
              COALESCE(
                to_jsonb(c) ->> 'official_website',
                to_jsonb(c) ->> 'website_url',
                to_jsonb(c) ->> 'website'
              ) AS official_website
       FROM applications a
       LEFT JOIN colleges_full c ON a.college_id = c.id
       WHERE a.user_id = $1 AND a.college_id = $2`,
      [userId, collegeId]
    );
    return rows[0] || null;
  }

  static async findById(id) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT a.*,
              c.id AS canonical_institution_id,
              c.name AS college_name,
              c.country AS country,
              COALESCE(
                to_jsonb(c) ->> 'official_website',
                to_jsonb(c) ->> 'website_url',
                to_jsonb(c) ->> 'website'
              ) AS official_website
       FROM applications a
       LEFT JOIN colleges_full c ON a.college_id = c.id
       WHERE a.id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  static async findByUser(userId, filters = {}) {
    const pool = dbManager.getDatabase();
    let query = `
       SELECT a.*,
              c.id AS canonical_institution_id,
              c.name AS college_name,
              c.country AS country,
              COALESCE(
                to_jsonb(c) ->> 'official_website',
                to_jsonb(c) ->> 'website_url',
                to_jsonb(c) ->> 'website'
              ) AS official_website
       FROM applications a
       LEFT JOIN colleges_full c ON a.college_id = c.id
       WHERE a.user_id = $1
     `;
    const params = [userId];
    let idx = 2;

    if (filters.status) {
      query += ` AND a.status = $${idx++}`;
      params.push(filters.status);
    }

    if (filters.priority) {
      query += ` AND a.priority = $${idx++}`;
      params.push(filters.priority);
    }

    query += ' ORDER BY a.created_at DESC';

    const { rows } = await pool.query(query, params);
    return rows;
  }

  static async update(id, data) {
    const pool = dbManager.getDatabase();
    const updates = [];
    const params = [];
    let idx = 1;

    if (data.status) { updates.push(`status = $${idx++}`); params.push(data.status); }
    if (data.applicationType) { updates.push(`application_type = $${idx++}`); params.push(data.applicationType); }
    if (data.priority) { updates.push(`priority = $${idx++}`); params.push(data.priority); }
    if (data.notes !== undefined) { updates.push(`notes = $${idx++}`); params.push(data.notes); }
    if (data.submittedAt) { updates.push(`submitted_at = $${idx++}`); params.push(data.submittedAt); }
    if (data.decisionReceivedAt) { updates.push(`decision_received_at = $${idx++}`); params.push(data.decisionReceivedAt); }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    await pool.query(
      `UPDATE applications SET ${updates.join(', ')} WHERE id = $${idx}`,
      params
    );

    return this.findById(id);
  }

  static async delete(id) {
    const pool = dbManager.getDatabase();
    const { rowCount } = await pool.query('DELETE FROM applications WHERE id = $1', [id]);
    return { changes: rowCount };
  }

  static async getTimeline(applicationId) {
    const pool = dbManager.getDatabase();
    const application = await this.findById(applicationId);

    const { rows: deadlines } = await pool.query(
      'SELECT * FROM deadlines WHERE application_id = $1 ORDER BY deadline_date ASC',
      [applicationId]
    );

    const { rows: essays } = await pool.query(
      'SELECT * FROM essays WHERE application_id = $1 ORDER BY created_at ASC',
      [applicationId]
    );

    return {
      application,
      deadlines,
      essays,
      milestones: this._calculateMilestones(application, deadlines, essays)
    };
  }

  static _calculateMilestones(application, deadlines, essays) {
    const milestones = [];

    milestones.push({ type: 'application_created', date: application.created_at, completed: true });

    essays.forEach(essay => {
      milestones.push({
        type: 'essay', essayType: essay.essay_type, status: essay.status,
        date: essay.created_at, completed: essay.status === 'final'
      });
    });

    deadlines.forEach(deadline => {
      milestones.push({
        type: 'deadline', deadlineType: deadline.deadline_type,
        date: deadline.deadline_date, completed: deadline.is_completed === true || deadline.is_completed === 1
      });
    });

    if (application.submitted_at) {
      milestones.push({ type: 'application_submitted', date: application.submitted_at, completed: true });
    }

    if (application.decision_received_at) {
      milestones.push({
        type: 'decision_received', status: application.status,
        date: application.decision_received_at, completed: true
      });
    }

    return milestones.sort((a, b) => new Date(a.date) - new Date(b.date));
  }
}

module.exports = Application;

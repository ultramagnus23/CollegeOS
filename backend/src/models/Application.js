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

    // Check for duplicate first
    const existingApp = await this.findByUserAndCollege(userId, data.collegeId || data.college_id);
    if (existingApp) {
      const error = new Error('College already added to your list');
      error.statusCode = 400;
      error.code = 'DUPLICATE_APPLICATION';
      throw error;
    }

    // Resolve collegeId from either camelCase or snake_case input
    const collegeId = data.collegeId || data.college_id;
    if (!collegeId || Number.isNaN(Number(collegeId))) {
      const err = new Error('Valid college_id is required');
      err.statusCode = 400;
      err.code = 'INVALID_COLLEGE_ID';
      throw err;
    }

    // Ensure referenced college exists in canonical table.
    const { rows: collegeRows } = await pool.query(
      'SELECT id FROM colleges WHERE id = $1 LIMIT 1',
      [Number(collegeId)]
    );
    if (!collegeRows.length) {
      const err = new Error('College does not exist in canonical colleges table');
      err.statusCode = 400;
      err.code = 'COLLEGE_NOT_FOUND';
      throw err;
    }
    let rows;
    try {
      ({ rows } = await pool.query(
        `INSERT INTO applications (user_id, college_id, status, application_type, priority, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          userId,
          Number(collegeId),
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
        userId, applicationId, collegeId
      );
      logger.info('Auto-populated deadlines:', deadlineResult);
    } catch (error) {
      logger.error('Failed to auto-populate deadlines, but application was created:', error);
    }

    // Auto-load essays
    try {
      const EssayAutoLoadingService = require('../services/essayAutoLoadingService');
      const essayResult = await EssayAutoLoadingService.loadEssaysForApplication(
        userId, applicationId, collegeId
      );
      logger.info('Auto-loaded essays:', essayResult);
    } catch (error) {
      logger.error('Failed to auto-load essays, but application was created:', error);
    }

    return this.findById(applicationId);
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
       LEFT JOIN colleges c ON a.college_id = c.id
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
       LEFT JOIN colleges c ON a.college_id = c.id
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
       LEFT JOIN colleges c ON a.college_id = c.id
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

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
      // (a) 087-style mapping: canonical_institution_id → legacy_id.
      const { rows: identityRows } = await pool.query(
        `SELECT im.legacy_id
         FROM canonical.institutions i
         JOIN canonical.institution_identity_map im ON i.id = im.canonical_institution_id
         WHERE i.id = $1 AND im.legacy_id IS NOT NULL
         LIMIT 1`,
        [strId]
      );
      if (identityRows.length > 0) return Number(identityRows[0].legacy_id);

      // (b) 079-style mapping: institution_id + source_pk. These are the rows
      // that actually exist in production (legacy_id is ~0% populated; the
      // mapping lives in source_pk). Reuse them instead of creating a duplicate
      // legacy `colleges` row. Best-effort: ignored if those columns are absent.
      try {
        const { rows: legacyRows } = await pool.query(
          `SELECT c.id
             FROM canonical.institution_identity_map im
             JOIN colleges c ON c.id = im.source_pk::int
            WHERE im.institution_id = $1
              AND im.source_table = 'colleges'
              AND im.source_pk ~ '^[0-9]+$'
            LIMIT 1`,
          [strId]
        );
        if (legacyRows.length > 0) {
          const legacyId = Number(legacyRows[0].id);
          // Backfill the fast 087-path mapping for next time.
          await this._recordIdentityMapping(pool, strId, legacyId);
          return legacyId;
        }
      } catch (e) {
        logger.debug('079-style identity lookup unavailable', { error: e?.message });
      }

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

      // At this point the college DOES exist (we have a canonical row + a legacy
      // row). Recording the identity-map mapping is a cache for fast future
      // lookups — it must not be allowed to masquerade as "college not found".
      // It is wrapped in its OWN try/catch so a schema/constraint failure is
      // surfaced distinctly in the logs and never collapses into COLLEGE_NOT_FOUND.
      await this._recordIdentityMapping(pool, strId, legacyId);
      return legacyId;
    } catch (err) {
      // This outer catch only covers the canonical/legacy *lookup*. A failure
      // here means we could not determine whether the college exists — distinct
      // from "the college genuinely does not exist" (which returns null above).
      logger.warn('resolveCollegeId lookup failed:', { uuid: strId, error: err?.message });
    }

    return null;
  }

  /**
   * Record a canonical-UUID → legacy-INTEGER mapping in
   * canonical.institution_identity_map.
   *
   * The live table is a known schema-drift hotspot: two migrations
   * (079 canonical-rebuild and 087 college-id-compatibility) both declared a
   * table of this name with DIFFERENT, non-overlapping columns, and `CREATE
   * TABLE IF NOT EXISTS` means whichever ran first won — leaving production with
   * a hybrid that carries 079's NOT-NULL columns (institution_id, source_table,
   * source_pk, source_tier, source_priority, match_method) AND 087's columns
   * (canonical_institution_id, legacy_id, source). The previous insert only
   * populated 087's columns, so 079's `institution_id NOT NULL` blew up.
   *
   * Rather than hard-code one schema's column list, introspect the table's
   * actual columns and populate every column we know a correct value for. This
   * is resilient to whichever variant a given deployment actually has.
   *
   * @param {string} canonicalUuid canonical.institutions.id (UUID)
   * @param {number} legacyId      legacy colleges.id (INTEGER)
   */
  static async _recordIdentityMapping(pool, canonicalUuid, legacyId) {
    try {
      const cols = await this._identityMapColumns(pool);

      // Correct values for an application-created ("auto") mapping row.
      // institution_id and canonical_institution_id are the SAME value — both
      // are FKs to canonical.institutions(id); 079 named it institution_id,
      // 087 named it canonical_institution_id.
      const colExpr = {
        institution_id: '$1::uuid',                                        // 079 (== canonical id)
        canonical_institution_id: '$1::uuid',                              // 087
        legacy_id: '$2::int',                                              // 087
        source: `'auto'`,                                                  // 087
        source_table: `'colleges'`,                                        // 079 (legacy row lives in colleges)
        source_pk: '$2::text',                                             // 079 (legacy PK, as text)
        source_tier: `'inferred_generated'::canonical.source_tier`,        // 079 (app-derived ⇒ lowest tier)
        source_priority: '6',                                              // 079 (CHECK 1..6; lowest)
        match_method: `'auto'`,                                            // 079
      };

      const present = Object.keys(colExpr).filter((c) => cols.has(c));
      if (present.length === 0) {
        logger.error('identity_map auto-insert skipped: no known columns present', {
          canonicalUuid, tableColumns: [...cols],
        });
        return;
      }

      // Guard against duplicates without relying on a specific unique
      // constraint existing (constraints also drifted across 087/091).
      const dedupeKey = cols.has('canonical_institution_id')
        ? 'canonical_institution_id'
        : 'institution_id';

      const sql =
        `INSERT INTO canonical.institution_identity_map (${present.join(', ')})\n` +
        `SELECT ${present.map((c) => colExpr[c]).join(', ')}\n` +
        `WHERE NOT EXISTS (\n` +
        `  SELECT 1 FROM canonical.institution_identity_map WHERE ${dedupeKey} = $1::uuid\n` +
        `)`;

      await pool.query(sql, [canonicalUuid, legacyId]);
    } catch (err) {
      // Distinct, loud log — this is a schema/constraint failure, NOT a missing
      // college. The add itself still succeeds (the mapping is only a cache).
      logger.error('identity_map auto-insert failed (schema/constraint drift)', {
        canonicalUuid,
        legacyId,
        pgCode: err?.code,
        detail: err?.detail,
        error: err?.message,
      });
    }
  }

  /** Cached set of columns actually present on canonical.institution_identity_map. */
  static async _identityMapColumns(pool) {
    if (this._identityMapColsCache) return this._identityMapColsCache;
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'canonical' AND table_name = 'institution_identity_map'`
    );
    this._identityMapColsCache = new Set(rows.map((r) => r.column_name));
    return this._identityMapColsCache;
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

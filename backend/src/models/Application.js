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

    // Resolve the college ID to a legacy numeric value where one exists:
    // - If numeric, use it directly
    // - If UUID string, look it up via the legacy identity map — may be null
    //   for a canonical-only college with no legacy row (resolveCollegeId no
    //   longer mints one; see its comments)
    const numericCollegeId = await this.resolveCollegeId(pool, rawCollegeId);

    // Anchor the new application to canonical at write time. UUID inputs
    // resolve directly; legacy-integer inputs map through the identity map.
    const canonicalInstitutionId = await this.resolveCanonicalUuid(pool, rawCollegeId, numericCollegeId);

    // A college is "found" if it resolved to EITHER anchor — a legacy row is
    // no longer required to add a canonical-only college.
    if (numericCollegeId == null && canonicalInstitutionId == null) {
      const err = new Error('College not found');
      err.statusCode = 400;
      err.code = 'COLLEGE_NOT_FOUND';
      throw err;
    }

    // Check for duplicate first
    const existingApp = await this.findByUserAndCollege(userId, numericCollegeId, canonicalInstitutionId);
    if (existingApp) {
      const error = new Error('College already added to your list');
      error.statusCode = 400;
      error.code = 'DUPLICATE_APPLICATION';
      throw error;
    }

    let rows;
    try {
      ({ rows } = await pool.query(
        `INSERT INTO applications (user_id, college_id, canonical_institution_id, status, application_type, priority, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          userId,
          numericCollegeId,
          canonicalInstitutionId,
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
        userId, applicationId, numericCollegeId, canonicalInstitutionId
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
      // Verify the numeric ID exists in the legacy colleges table.
      //
      // IMPORTANT: `colleges` and `colleges_comprehensive` are two independent
      // tables with unrelated, coincidentally-overlapping SERIAL id ranges --
      // colleges.id=5 and colleges_comprehensive.id=5 are two completely
      // different schools (verified live: 0 of 2344 overlapping ids matched by
      // name). applications.college_id's FK now references `colleges` only
      // (migration 144), which is also what every read path (College.findById,
      // colleges_full, dashboardService) treats as primary. There used to be a
      // fallback here that accepted an id purely because it existed in
      // colleges_comprehensive -- that silently created applications pointing
      // at a row that satisfied the (old) FK but whose *displayed* name/data
      // (always read from `colleges`) was for a totally unrelated college. Do
      // not resurrect that fallback; a numeric id must exist in `colleges` to
      // resolve, same as every other read path.
      const { rows } = await pool.query(
        'SELECT id FROM colleges WHERE id = $1 LIMIT 1',
        [numeric]
      );
      if (rows.length > 0) return numeric;
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

      // UUID not in identity map. Try a last-resort name match against the
      // legacy table (reuses an existing legacy row if one coincidentally
      // matches by name — doesn't mint anything).
      //
      // IMPORTANT: this used to fall back to `INSERT INTO colleges (...)`,
      // minting a brand-new legacy row for every canonical college that had
      // never been touched by the legacy system. That was the one remaining
      // place still actively growing public.colleges — a real institution
      // added via canonical (the frontend's actual source of truth) doesn't
      // need or want a legacy row invented for it. Returns null instead; the
      // caller (Application.create) treats a resolved canonical UUID as
      // sufficient on its own — no legacy college_id required to add a
      // college. See resolveCanonicalUuid, which returns this same UUID
      // directly as the application's canonical anchor regardless of whether
      // a legacy row exists.
      const { rows: canonRows } = await pool.query(
        `SELECT canonical_name FROM canonical.institutions WHERE id = $1 LIMIT 1`,
        [strId]
      );
      if (canonRows.length === 0) return null;

      const { canonical_name } = canonRows[0];

      const { rows: byName } = await pool.query(
        `SELECT id FROM colleges WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [canonical_name]
      );
      if (byName.length === 0) return null;

      const legacyId = byName[0].id;

      // Cache the mapping for fast future lookups — the college DOES exist
      // (we have a canonical row + a legacy row that matched by name).
      // Wrapped in its own try/catch so a schema/constraint failure is
      // surfaced distinctly in the logs, not collapsed into "not found".
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
   * Resolve the canonical institution UUID for a new application.
   * - If the caller passed a canonical UUID directly, that IS the canonical id.
   * - Otherwise map the resolved legacy integer id via the identity map's
   *   source_pk/source_table path (the verified high-coverage path; see
   *   migration 151). Returns null if no canonical mapping exists (the row then
   *   falls back to college_id — acceptable during the dual-key transition).
   */
  static async resolveCanonicalUuid(pool, rawId, legacyId) {
    const strId = String(rawId).trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(strId)) return strId;

    if (legacyId != null) {
      try {
        // source_pk carries the legacy colleges(_comprehensive) PK. The live
        // identity map keys these under 'public.colleges_comprehensive' (the
        // dominant, 8.3k-row source), with a handful under bare 'colleges' and
        // none under 'public.colleges' — verified against prod. Cover all three;
        // order deterministically so a source_pk present in multiple source
        // tables always resolves to the same canonical institution.
        const { rows } = await pool.query(
          `SELECT institution_id
             FROM canonical.institution_identity_map
            WHERE source_pk = $1::text
              AND source_table IN ('public.colleges_comprehensive', 'public.colleges', 'colleges')
            ORDER BY source_table
            LIMIT 1`,
          [legacyId]
        );
        if (rows.length > 0) return rows[0].institution_id;
      } catch (err) {
        logger.debug('resolveCanonicalUuid lookup unavailable', { error: err?.message });
      }
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

  /**
   * Look up an existing application for this user against either anchor.
   * collegeId can be null now (a canonical-only college with no legacy row —
   * see resolveCollegeId); canonicalInstitutionId can be null for legacy-only
   * applications that predate migration 151. Match on whichever is present so
   * duplicate-prevention still works for both origins.
   */
  static async findByUserAndCollege(userId, collegeId, canonicalInstitutionId = null) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT a.*,
              COALESCE(a.canonical_institution_id, c.canonical_institution_id) AS canonical_institution_id,
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
         AND (
           ($2::int IS NOT NULL AND a.college_id = $2::int)
           OR ($3::uuid IS NOT NULL AND a.canonical_institution_id = $3::uuid)
         )`,
      [userId, collegeId, canonicalInstitutionId]
    );
    return rows[0] || null;
  }

  static async findById(id) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT a.*,
              COALESCE(a.canonical_institution_id, c.canonical_institution_id) AS canonical_institution_id,
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
              COALESCE(a.canonical_institution_id, c.canonical_institution_id) AS canonical_institution_id,
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

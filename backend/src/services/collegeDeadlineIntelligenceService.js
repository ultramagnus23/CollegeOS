'use strict';

/**
 * collegeDeadlineIntelligenceService.js
 *
 * Central service for the Deadlines Intelligence System.
 *
 * Responsibilities:
 *   • upsertDeadline          — write a scraped/inferred deadline + archive history
 *   • getUpcomingForUser      — upcoming deadlines for a user's saved colleges
 *   • getByCountry            — all deadlines for colleges in a given country
 *   • estimateFromHistory     — predict current-year date from previous years
 *   • flagMissingData         — detect failed enrichment sections per college
 *   • getConfidenceTier       — map raw score → 'unverified' | 'partial' | 'confirmed'
 *
 * Source priority (conflict resolution):
 *   official (1) > government (2) > aggregator (3) > inferred (4)
 */

const dbManager = require('../config/database');
const logger = require('../utils/logger');

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE_PRIORITY = { official: 1, government: 2, aggregator: 3, inferred: 4 };

const CONFIDENCE_TIERS = {
  UNVERIFIED: 'unverified', // 0.0 – 0.39
  PARTIAL: 'partial',       // 0.4  – 0.69
  CONFIRMED: 'confirmed',   // 0.7  – 1.0
};

/** How far back (days) to look when listing country deadlines. */
const COUNTRY_DEADLINE_LOOKBACK_DAYS = 30;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Map a numeric confidence score to a human-readable tier.
 * @param {number} score - 0.0 to 1.0
 * @returns {'unverified'|'partial'|'confirmed'}
 */
function getConfidenceTier(score) {
  if (typeof score !== 'number' || score < 0.4) return CONFIDENCE_TIERS.UNVERIFIED;
  if (score < 0.7) return CONFIDENCE_TIERS.PARTIAL;
  return CONFIDENCE_TIERS.CONFIRMED;
}

/**
 * Parse a numeric year from a source_url or fall back to the current year.
 * E.g. "https://admissions.mit.edu/2026" → 2026
 */
function guessYearFromUrl(url) {
  if (!url) return new Date().getFullYear();
  const match = url.match(/20\d{2}/);
  return match ? parseInt(match[0], 10) : new Date().getFullYear();
}

// ── Core Methods ──────────────────────────────────────────────────────────────

/**
 * Upsert a single deadline into college_deadlines, archiving the previous value
 * in deadline_history, and respecting source-priority conflict resolution.
 *
 * @param {number}  collegeId
 * @param {string}  deadlineType  - e.g. 'Early Decision', 'Regular Decision'
 * @param {string|null} deadlineDate - ISO date string (YYYY-MM-DD) or null
 * @param {string}  sourceUrl
 * @param {number}  confidence    - 0.0 – 1.0
 * @param {object}  opts
 * @param {string}  [opts.sourceType='aggregator'] - 'official'|'government'|'aggregator'|'inferred'
 * @param {boolean} [opts.isEstimated=false]
 * @param {string}  [opts.estimationBasis]
 * @param {string|null} [opts.notificationDate]
 * @returns {Promise<{upserted: boolean, reason: string}>}
 */
async function upsertDeadline(collegeId, deadlineType, deadlineDate, sourceUrl, confidence, opts = {}) {
  const {
    sourceType = 'aggregator',
    isEstimated = false,
    estimationBasis = null,
    notificationDate = null,
  } = opts;

  const pool = dbManager.getDatabase();

  try {
    // 1. Check if an existing row exists for this college + deadline_type
    const existingRes = await pool.query(
      `SELECT id, deadline_date, confidence_score, source_type, source_count, data_year
         FROM college_deadlines
        WHERE college_id = $1 AND deadline_type = $2
        LIMIT 1`,
      [collegeId, deadlineType]
    );
    const existing = existingRes.rows[0] || null;

    // 2. Conflict resolution: only overwrite if new source has equal or higher priority
    if (existing) {
      const existingPriority = SOURCE_PRIORITY[existing.source_type] || 99;
      const newPriority = SOURCE_PRIORITY[sourceType] || 99;
      if (newPriority > existingPriority && existing.confidence_score >= confidence) {
        logger.debug('Deadline upsert skipped — lower priority source', {
          collegeId, deadlineType, existingSource: existing.source_type, newSource: sourceType,
        });
        return { upserted: false, reason: 'lower_priority_source' };
      }

      // 3. Archive previous value in deadline_history before overwriting
      const dataYear = existing.data_year || guessYearFromUrl(null);
      await pool.query(
        `INSERT INTO deadline_history
           (college_id, deadline_type, deadline_date, data_year,
            source_url, confidence_score, is_estimated, estimation_basis, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (college_id, deadline_type, data_year) DO NOTHING`,
        [
          collegeId, deadlineType,
          existing.deadline_date, dataYear,
          sourceUrl, existing.confidence_score,
          false, null,
        ]
      );
    }

    // 4. Determine source_count — increment if same source_type, else reset to 1
    const newSourceCount = existing && existing.source_type === sourceType
      ? (existing.source_count || 1) + 1
      : 1;

    const currentYear = new Date().getFullYear();

    // 5. Upsert the current row
    await pool.query(
      `INSERT INTO college_deadlines
         (college_id, deadline_type, deadline_date, notification_date,
          data_year, source_url, confidence_score, last_verified,
          is_estimated, estimation_basis, source_count, source_type,
          created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8,$9,$10,$11,NOW(),NOW())
       ON CONFLICT (college_id, deadline_type)
         DO UPDATE SET
           deadline_date    = EXCLUDED.deadline_date,
           notification_date= EXCLUDED.notification_date,
           data_year        = EXCLUDED.data_year,
           source_url       = EXCLUDED.source_url,
           confidence_score = EXCLUDED.confidence_score,
           last_verified    = NOW(),
           is_estimated     = EXCLUDED.is_estimated,
           estimation_basis = EXCLUDED.estimation_basis,
           source_count     = EXCLUDED.source_count,
           source_type      = EXCLUDED.source_type,
           updated_at       = NOW()`,
      [
        collegeId, deadlineType, deadlineDate || null, notificationDate || null,
        currentYear, sourceUrl, confidence,
        isEstimated, estimationBasis, newSourceCount, sourceType,
      ]
    );

    logger.info('Deadline upserted', { collegeId, deadlineType, confidence, sourceType });
    return { upserted: true, reason: 'ok' };
  } catch (error) {
    logger.error('upsertDeadline failed', { collegeId, deadlineType, error: error.message });
    throw error;
  }
}

/**
 * Return upcoming deadlines for colleges the user has saved (via applications table).
 *
 * @param {number} userId
 * @param {number} [daysAhead=90]
 * @returns {Promise<Array>} - sorted by deadline_date ASC
 */
async function getUpcomingForUser(userId, daysAhead = 90) {
  const pool = dbManager.getDatabase();

  const { rows } = await pool.query(
    `SELECT
       cd.id,
       cd.college_id,
       c.name          AS college_name,
       c.country,
       cd.deadline_type,
       cd.deadline_date,
       cd.notification_date,
       cd.source_url,
       cd.confidence_score,
       cd.last_verified,
       cd.is_estimated,
       cd.estimation_basis,
       cd.source_count,
       cd.source_type,
       cd.data_year
     FROM applications a
     JOIN college_deadlines cd ON cd.college_id = a.college_id
     JOIN colleges_comprehensive c ON c.id = cd.college_id
     WHERE a.user_id = $1
       AND (cd.deadline_date IS NULL OR cd.deadline_date BETWEEN NOW() AND (NOW() + ($2 || ' days')::INTERVAL))
     ORDER BY cd.deadline_date ASC NULLS LAST`,
    [userId, daysAhead]
  );

  return rows.map(row => ({
    ...row,
    confidence_tier: getConfidenceTier(row.confidence_score),
    days_until: Math.ceil((new Date(row.deadline_date) - new Date()) / 86400000),
  }));
}

/**
 * Return all college_deadlines for colleges in a given country, grouped by college.
 *
 * @param {string} country
 * @returns {Promise<Object>} - { [college_name]: { college, deadlines[] } }
 */
async function getByCountry(country) {
  const pool = dbManager.getDatabase();

  const { rows } = await pool.query(
    `SELECT
       c.id            AS college_id,
       c.name          AS college_name,
       c.country,
       c.state,
       cd.deadline_type,
       cd.deadline_date,
       cd.notification_date,
       cd.source_url,
       cd.confidence_score,
       cd.last_verified,
       cd.is_estimated,
       cd.estimation_basis,
       cd.source_count,
       cd.source_type,
       cd.data_year
     FROM colleges_comprehensive c
     JOIN college_deadlines cd ON cd.college_id = c.id
     WHERE LOWER(c.country) = LOWER($1)
       AND (cd.deadline_date IS NULL OR cd.deadline_date >= NOW() - ($2 || ' days')::INTERVAL)
     ORDER BY c.name ASC, cd.deadline_date ASC NULLS LAST`,
    [country, COUNTRY_DEADLINE_LOOKBACK_DAYS]
  );

  // Group by college
  const grouped = {};
  for (const row of rows) {
    const key = row.college_id;
    if (!grouped[key]) {
      grouped[key] = {
        college_id: row.college_id,
        college_name: row.college_name,
        country: row.country,
        state: row.state,
        deadlines: [],
      };
    }
    grouped[key].deadlines.push({
      deadline_type: row.deadline_type,
      deadline_date: row.deadline_date,
      notification_date: row.notification_date,
      source_url: row.source_url,
      confidence_score: row.confidence_score,
      confidence_tier: getConfidenceTier(row.confidence_score),
      last_verified: row.last_verified,
      is_estimated: row.is_estimated,
      estimation_basis: row.estimation_basis,
      source_count: row.source_count,
      source_type: row.source_type,
      data_year: row.data_year,
    });
  }

  return Object.values(grouped);
}

/**
 * Estimate current-year deadline from historical averages.
 * If estimation succeeds, calls upsertDeadline with is_estimated=true.
 *
 * @param {number} collegeId
 * @param {string} deadlineType
 * @param {number} [targetYear] - defaults to current year
 * @returns {Promise<{estimated: boolean, date: string|null, basis: string}>}
 */
async function estimateFromHistory(collegeId, deadlineType, targetYear) {
  const year = targetYear || new Date().getFullYear();
  const pool = dbManager.getDatabase();

  // Check if we already have a confirmed/partial entry for the target year
  const existing = await pool.query(
    `SELECT deadline_date, confidence_score FROM college_deadlines
      WHERE college_id = $1 AND deadline_type = $2 AND data_year = $3 AND NOT is_estimated`,
    [collegeId, deadlineType, year]
  );
  if (existing.rows.length > 0) {
    return { estimated: false, date: existing.rows[0].deadline_date, basis: 'confirmed' };
  }

  // Pull up to 5 years of history
  const histRes = await pool.query(
    `SELECT deadline_date, data_year FROM deadline_history
      WHERE college_id = $1 AND deadline_type = $2
        AND deadline_date IS NOT NULL
        AND data_year < $3
      ORDER BY data_year DESC
      LIMIT 5`,
    [collegeId, deadlineType, year]
  );

  if (histRes.rows.length === 0) {
    return { estimated: false, date: null, basis: 'no_history' };
  }

  // Compute average day-of-year (1 = Jan 1, 365/366 = Dec 31)
  const dayNumbers = histRes.rows.map(r => {
    const d = new Date(r.deadline_date);
    const start = new Date(d.getFullYear(), 0, 1); // Jan 1 of that year
    return Math.floor((d - start) / 86400000) + 1; // +1 so Jan 1 = day 1
  });
  const avgDay = Math.round(dayNumbers.reduce((a, b) => a + b, 0) / dayNumbers.length);

  // Convert average day-of-year back to a date in target year
  const estimatedDate = new Date(year, 0);
  estimatedDate.setDate(avgDay);
  const isoDate = estimatedDate.toISOString().split('T')[0];

  await upsertDeadline(collegeId, deadlineType, isoDate, null, 0.3, {
    sourceType: 'inferred',
    isEstimated: true,
    estimationBasis: 'historical_pattern',
  });

  logger.info('Estimated deadline from history', { collegeId, deadlineType, year, isoDate });
  return { estimated: true, date: isoDate, basis: 'historical_pattern' };
}

/**
 * Detect missing enrichment sections for a college.
 *
 * @param {number} collegeId
 * @returns {Promise<{recommendations_failed, essays_failed, documents_failed, scholarships_failed}>}
 */
async function flagMissingData(collegeId) {
  const pool = dbManager.getDatabase();
  const flags = {
    recommendations_failed: false,
    essays_failed: false,
    documents_failed: false,
    scholarships_failed: false,
  };

  try {
    const [rec, ess, doc, sch] = await Promise.all([
      // Recommendations: check application_requirements or college_requirements
      pool.query(
        `SELECT 1 FROM college_requirements WHERE college_id = $1 LIMIT 1`,
        [collegeId]
      ).catch(() => ({ rows: [] })),

      // Essays: check essays table linked to this college
      pool.query(
        `SELECT 1 FROM essays WHERE college_id = $1 LIMIT 1`,
        [collegeId]
      ).catch(() => ({ rows: [] })),

      // Documents: check documents table or application_requirements
      pool.query(
        `SELECT 1 FROM college_requirements WHERE college_id = $1 AND required_documents IS NOT NULL LIMIT 1`,
        [collegeId]
      ).catch(() => ({ rows: [] })),

      // Scholarships: check college_financial_aid or scholarships table
      pool.query(
        `SELECT 1 FROM college_financial_aid WHERE college_id = $1 LIMIT 1`,
        [collegeId]
      ).catch(() => ({ rows: [] })),
    ]);

    flags.recommendations_failed = rec.rows.length === 0;
    flags.essays_failed = ess.rows.length === 0;
    flags.documents_failed = doc.rows.length === 0;
    flags.scholarships_failed = sch.rows.length === 0;
  } catch (error) {
    logger.error('flagMissingData failed', { collegeId, error: error.message });
  }

  return flags;
}

/**
 * Fetch all deadline types for a specific college, augmented with history.
 *
 * @param {number} collegeId
 * @returns {Promise<{college: object, deadlines: Array, history: Array, missing_data: object}>}
 */
async function getForCollege(collegeId) {
  const pool = dbManager.getDatabase();

  const [collegeRes, deadlinesRes, historyRes, missingData] = await Promise.all([
    pool.query(
      `SELECT id, name, country, state, official_website FROM colleges_comprehensive WHERE id = $1`,
      [collegeId]
    ),
    pool.query(
      `SELECT deadline_type, deadline_date, notification_date,
              source_url, confidence_score, last_verified,
              is_estimated, estimation_basis, source_count, source_type, data_year
         FROM college_deadlines WHERE college_id = $1
        ORDER BY deadline_date ASC NULLS LAST`,
      [collegeId]
    ),
    pool.query(
      `SELECT deadline_type, deadline_date, data_year, confidence_score, is_estimated, estimation_basis
         FROM deadline_history WHERE college_id = $1
        ORDER BY data_year DESC, deadline_date ASC`,
      [collegeId]
    ),
    flagMissingData(collegeId),
  ]);

  const college = collegeRes.rows[0] || null;
  const deadlines = deadlinesRes.rows.map(d => ({
    ...d,
    confidence_tier: getConfidenceTier(d.confidence_score),
  }));

  return { college, deadlines, history: historyRes.rows, missing_data: missingData };
}

/**
 * Return year-over-year history for a college.
 *
 * @param {number} collegeId
 * @returns {Promise<Array>}
 */
async function getHistory(collegeId) {
  const pool = dbManager.getDatabase();
  const { rows } = await pool.query(
    `SELECT deadline_type, deadline_date, notification_date,
            data_year, source_url, confidence_score, is_estimated, estimation_basis, recorded_at
       FROM deadline_history
      WHERE college_id = $1
      ORDER BY deadline_type ASC, data_year DESC`,
    [collegeId]
  );
  return rows;
}

module.exports = {
  getConfidenceTier,
  upsertDeadline,
  getUpcomingForUser,
  getByCountry,
  estimateFromHistory,
  flagMissingData,
  getForCollege,
  getHistory,
};

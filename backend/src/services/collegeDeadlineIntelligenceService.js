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
 * Resolve an application's row to a canonical institution_id: prefer the
 * direct FK, and fall back to the identity map (keyed on the legacy
 * college_id) for older application rows that predate the canonical
 * cutover. Shared by every read below.
 */
const RESOLVE_INSTITUTION_ID_CTE = `
  SELECT DISTINCT COALESCE(
    a.canonical_institution_id,
    (SELECT im.institution_id FROM canonical.institution_identity_map im
      WHERE im.source_pk = a.college_id::text
        AND im.source_table IN ('public.colleges_comprehensive', 'public.colleges', 'colleges')
      ORDER BY im.source_table LIMIT 1)
  ) AS institution_id
  FROM applications a
  WHERE a.user_id = $1
`;

/**
 * Return upcoming deadlines for colleges the user has saved (via applications table).
 *
 * Reads canonical.institution_deadlines — the table every scraper actually
 * writes — not the legacy public.college_deadlines, which has been
 * permanently empty since the canonical cutover and was silently starving
 * this endpoint of real data. See docs/audits/ for the 2026-08 finding.
 *
 * @param {number} userId
 * @param {number} [daysAhead=90]
 * @returns {Promise<Array>} - sorted by deadline_date ASC
 */
async function getUpcomingForUser(userId, daysAhead = 90) {
  const pool = dbManager.getDatabase();

  const { rows } = await pool.query(
    `WITH user_institutions AS (${RESOLVE_INSTITUTION_ID_CTE})
     SELECT
       d.id,
       ui.institution_id AS college_id,
       inst.canonical_name AS college_name,
       inst.country_code AS country,
       d.deadline_type,
       d.deadline_date,
       d.notification_date,
       d.source_url,
       d.confidence_score,
       d.last_verified,
       d.is_estimated,
       NULL::text AS estimation_basis,
       1 AS source_count,
       d.source_type,
       d.cycle_year AS data_year
     FROM user_institutions ui
     JOIN canonical.institution_deadlines d ON d.institution_id = ui.institution_id
     LEFT JOIN canonical.institutions inst ON inst.id = ui.institution_id
     WHERE ui.institution_id IS NOT NULL
       AND (d.deadline_date IS NULL OR d.deadline_date BETWEEN NOW() AND (NOW() + ($2 || ' days')::INTERVAL))
     ORDER BY d.deadline_date ASC NULLS LAST`,
    [userId, daysAhead]
  );

  return rows.map(row => ({
    ...row,
    confidence_tier: getConfidenceTier(row.confidence_score),
    days_until: Math.ceil((new Date(row.deadline_date) - new Date()) / 86400000),
  }));
}

/**
 * Return all institution_deadlines for institutions in a given country, grouped by institution.
 *
 * Reads canonical.institution_deadlines/canonical.institutions — see
 * getUpcomingForUser's header comment for why. Note `country` now matches
 * canonical.institutions.country_code (e.g. 'US', 'UK'), not a full country
 * name like the legacy colleges_full.country column held.
 *
 * @param {string} country - a country_code, e.g. 'US'
 * @returns {Promise<Object>} - { [college_name]: { college, deadlines[] } }
 */
async function getByCountry(country) {
  const pool = dbManager.getDatabase();

  const { rows } = await pool.query(
    `SELECT
       inst.id AS college_id,
       inst.canonical_name AS college_name,
       inst.country_code AS country,
       inst.state_region AS state,
       d.deadline_type,
       d.deadline_date,
       d.notification_date,
       d.source_url,
       d.confidence_score,
       d.last_verified,
       d.is_estimated,
       NULL::text AS estimation_basis,
       1 AS source_count,
       d.source_type,
       d.cycle_year AS data_year
     FROM canonical.institutions inst
     JOIN canonical.institution_deadlines d ON d.institution_id = inst.id
     WHERE LOWER(inst.country_code) = LOWER($1)
       AND (d.deadline_date IS NULL OR d.deadline_date >= NOW() - ($2 || ' days')::INTERVAL)
     ORDER BY inst.canonical_name ASC, d.deadline_date ASC NULLS LAST`,
    [country, COUNTRY_DEADLINE_LOOKBACK_DAYS]
  );

  // Group by institution
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

  // Each query result genuinely means "this section has no rows for this
  // college" only if the query actually ran. Previously each was wrapped in
  // .catch(() => ({ rows: [] })), so a real DB error (bad connection, a typo
  // in a future edit, a dropped table) was indistinguishable from "verified
  // empty" and silently reported as *_failed: true — a confidently wrong
  // "this college is missing X" instead of "we couldn't check X". Letting the
  // error propagate (caught by the caller, e.g. getForCollege's Promise.all)
  // is the same fix as the deadline-cycle bug: a real failure must surface as
  // a failure, not render as a plausible-looking zero.
  const [rec, ess, doc, sch] = await Promise.all([
    // Recommendations: check application_requirements or college_requirements
    pool.query(
      `SELECT 1 FROM college_requirements WHERE college_id = $1 LIMIT 1`,
      [collegeId]
    ),

    // Essays: check essays table linked to this college
    pool.query(
      `SELECT 1 FROM essays WHERE college_id = $1 LIMIT 1`,
      [collegeId]
    ),

    // Documents: college_requirements has no dedicated "required documents"
    // column — required_documents never existed under that name (verified
    // 2026-08-21 against the live schema). additional_requirements (freeform
    // text) is the closest real proxy for "we have some document-requirement
    // info on record for this college".
    pool.query(
      `SELECT 1 FROM college_requirements WHERE college_id = $1 AND additional_requirements IS NOT NULL LIMIT 1`,
      [collegeId]
    ),

    // Scholarships: check college_financial_aid or scholarships table
    pool.query(
      `SELECT 1 FROM college_financial_aid WHERE college_id = $1 LIMIT 1`,
      [collegeId]
    ),
  ]);

  flags.recommendations_failed = rec.rows.length === 0;
  flags.essays_failed = ess.rows.length === 0;
  flags.documents_failed = doc.rows.length === 0;
  flags.scholarships_failed = sch.rows.length === 0;

  return flags;
}

/**
 * Resolve a legacy integer college_id to its canonical institution row, via
 * the identity map (same fallback pattern as RESOLVE_INSTITUTION_ID_CTE).
 */
async function resolveInstitution(pool, collegeId) {
  const { rows } = await pool.query(
    `SELECT inst.id, inst.canonical_name AS name, inst.country_code AS country,
            inst.state_region AS state, inst.website AS official_website
       FROM canonical.institution_identity_map im
       JOIN canonical.institutions inst ON inst.id = im.institution_id
      WHERE im.source_pk = $1::text
        AND im.source_table IN ('public.colleges_comprehensive', 'public.colleges', 'colleges')
      ORDER BY im.source_table
      LIMIT 1`,
    [String(collegeId)]
  );
  return rows[0] || null;
}

/**
 * Fetch all deadline types for a specific college, augmented with history.
 *
 * Reads canonical.institution_deadlines, resolved via the identity map from
 * the legacy collegeId this function still takes (routes/deadlines.js's
 * :id param is unchanged). Rows from every cycle_year the scrapers have ever
 * written coexist in this table (a new cycle is a new row, not an
 * overwrite — see admissionsCycle.js), so "current" vs "history" is a split
 * on cycle_year_key rather than two separate tables. The old
 * public.deadline_history table this used to read is permanently empty.
 *
 * @param {number} collegeId
 * @returns {Promise<{college: object, deadlines: Array, history: Array, missing_data: object}>}
 */
async function getForCollege(collegeId) {
  const pool = dbManager.getDatabase();

  const [college, missingData] = await Promise.all([
    resolveInstitution(pool, collegeId),
    flagMissingData(collegeId),
  ]);

  if (!college) {
    return { college: null, deadlines: [], history: [], missing_data: missingData };
  }

  const { rows } = await pool.query(
    `SELECT deadline_type, deadline_date, notification_date,
            source_url, confidence_score, last_verified,
            is_estimated, source_type, cycle_year, cycle_year_key
       FROM canonical.institution_deadlines
      WHERE institution_id = $1
      ORDER BY cycle_year_key DESC, deadline_date ASC NULLS LAST`,
    [college.id]
  );

  const latestCycleKey = rows.length ? Math.max(...rows.map(r => r.cycle_year_key)) : null;
  const toRow = (d) => ({
    deadline_type: d.deadline_type,
    deadline_date: d.deadline_date,
    notification_date: d.notification_date,
    source_url: d.source_url,
    confidence_score: d.confidence_score,
    confidence_tier: getConfidenceTier(d.confidence_score),
    last_verified: d.last_verified,
    is_estimated: d.is_estimated,
    source_type: d.source_type,
    data_year: d.cycle_year,
  });

  const deadlines = rows.filter(r => r.cycle_year_key === latestCycleKey).map(toRow);
  const history = rows.filter(r => r.cycle_year_key !== latestCycleKey).map(toRow);

  return { college, deadlines, history, missing_data: missingData };
}

/**
 * Return year-over-year history for a college — every cycle_year on record
 * in canonical.institution_deadlines for this institution, oldest first
 * within each deadline_type. See getForCollege's header for why this is one
 * table split by cycle_year_key rather than two tables.
 *
 * @param {number} collegeId
 * @returns {Promise<Array>}
 */
async function getHistory(collegeId) {
  const pool = dbManager.getDatabase();

  const college = await resolveInstitution(pool, collegeId);
  if (!college) return [];

  const { rows } = await pool.query(
    `SELECT deadline_type, deadline_date, notification_date,
            cycle_year AS data_year, source_url, confidence_score, is_estimated, last_verified AS recorded_at
       FROM canonical.institution_deadlines
      WHERE institution_id = $1
      ORDER BY deadline_type ASC, cycle_year_key DESC`,
    [college.id]
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

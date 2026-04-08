'use strict';

/**
 * College Scorecard API scraper
 *
 * Fetches school data from the free US Department of Education College
 * Scorecard API (https://collegescorecard.ed.gov/data/documentation/) and
 * upserts acceptance_rate, tuition, and size_category into the `colleges`
 * table in Supabase / PostgreSQL.
 *
 * Required environment variables:
 *   COLLEGE_SCORECARD_API_KEY  — free key from https://api.data.gov/signup/
 *   DATABASE_URL               — PostgreSQL connection string
 *
 * Optional environment variables:
 *   SCORECARD_PER_PAGE  — results per API page (default: 100, max: 100)
 *   LOG_LEVEL           — winston log level (default: info)
 *
 * Usage:
 *   node collegeScorecard.js
 */

const axios = require('axios');
const { Pool } = require('pg');
const logger = require('./logger');

// ── Config ─────────────────────────────────────────────────────────────────

const API_BASE = 'https://api.data.gov/ed/collegescorecard/v1/schools.json';
const PER_PAGE = Math.min(parseInt(process.env.SCORECARD_PER_PAGE || '100', 10), 100);
const REQUEST_DELAY_MS = 500; // stay well inside the 1 000 req/hr free-tier limit

const FIELDS = [
  'school.name',
  'school.city',
  'school.state',
  'school.country',
  'latest.admissions.admission_rate.overall',
  'latest.cost.tuition.in_state',
  'latest.cost.tuition.out_of_state',
  'latest.student.size',
].join(',');

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Sleep for `ms` milliseconds. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Derive a size_category from total student enrollment.
 * Mirrors common US classification conventions.
 * @param {number|null} size
 * @returns {string}
 */
function sizeCategory(size) {
  if (!size || size <= 0) return 'unknown';
  if (size < 1000) return 'very_small';
  if (size < 5000) return 'small';
  if (size < 15000) return 'medium';
  if (size < 30000) return 'large';
  return 'very_large';
}

// ── API client ────────────────────────────────────────────────────────────

/**
 * Fetch one page from the College Scorecard API.
 * @param {number} page   0-based page index
 * @param {string} apiKey
 * @returns {Promise<{ results: object[], total: number }>}
 */
async function fetchPage(page, apiKey) {
  const response = await axios.get(API_BASE, {
    params: {
      api_key: apiKey,
      fields: FIELDS,
      per_page: PER_PAGE,
      page,
    },
    timeout: 20000,
  });

  const { results = [], metadata } = response.data;
  const total = metadata?.total || results.length;
  return { results, total };
}

// ── Database ──────────────────────────────────────────────────────────────

let _pool = null;

function getPool() {
  if (_pool) return _pool;
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  _pool.on('error', (err) => {
    logger.error({ msg: 'Idle PostgreSQL client error', error: err.message });
  });
  return _pool;
}

/**
 * Upsert a single school record into the `colleges` table.
 * Matches on LOWER(name) to handle minor capitalisation differences.
 * Only updates fields that the Scorecard provides — all other columns are
 * left untouched.
 *
 * @param {object} school  Normalised school object
 * @returns {Promise<boolean>}  true if a row was updated, false otherwise
 */
async function upsertCollege(school) {
  const pool = getPool();

  // Try exact name match first, then city+state as tiebreaker
  const { rows } = await pool.query(
    `SELECT id FROM colleges WHERE LOWER(name) = LOWER($1) LIMIT 1`,
    [school.name]
  );

  if (rows.length === 0) {
    // School not in our database yet — skip (we don't auto-create colleges here)
    return false;
  }

  const id = rows[0].id;
  await pool.query(
    `UPDATE colleges
     SET acceptance_rate   = COALESCE($1, acceptance_rate),
         tuition_domestic  = COALESCE($2, tuition_domestic),
         student_population = COALESCE($3, student_population),
         size_category     = COALESCE($4, size_category),
         updated_at        = NOW()
     WHERE id = $5`,
    [
      school.acceptance_rate,
      school.tuition_domestic,
      school.student_population,
      school.size_category,
      id,
    ]
  );

  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function run() {
  const apiKey = process.env.COLLEGE_SCORECARD_API_KEY;
  if (!apiKey) {
    logger.error({ msg: 'COLLEGE_SCORECARD_API_KEY is not set' });
    process.exitCode = 1;
    return;
  }

  if (!process.env.DATABASE_URL) {
    logger.error({ msg: 'DATABASE_URL is not set' });
    process.exitCode = 1;
    return;
  }

  logger.info({ msg: 'College Scorecard scraper starting', perPage: PER_PAGE });

  let page = 0;
  let totalFetched = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalRecords = null;

  while (true) {
    logger.info({ msg: 'Fetching page', page, totalFetched, totalRecords });

    let results, total;
    try {
      ({ results, total } = await fetchPage(page, apiKey));
    } catch (err) {
      logger.error({ msg: 'API request failed', page, error: err.message });
      totalErrors++;
      // Back off and retry once before moving on
      await sleep(5000);
      try {
        ({ results, total } = await fetchPage(page, apiKey));
      } catch (retryErr) {
        logger.error({ msg: 'Retry also failed, stopping', page, error: retryErr.message });
        break;
      }
    }

    if (!results || results.length === 0) {
      logger.info({ msg: 'No more results — pagination complete', page });
      break;
    }

    if (totalRecords === null) {
      totalRecords = total;
      logger.info({ msg: 'Total records from API', totalRecords });
    }

    for (const raw of results) {
      totalFetched++;

      const name = raw['school.name'];
      if (!name) {
        totalSkipped++;
        continue;
      }

      // Admission rate from API is a decimal (e.g. 0.045 = 4.5 %)
      const admissionRateRaw = raw['latest.admissions.admission_rate.overall'];
      const acceptance_rate =
        admissionRateRaw != null ? parseFloat(admissionRateRaw) : null;

      const tuitionInState = raw['latest.cost.tuition.in_state'];
      const tuitionOutState = raw['latest.cost.tuition.out_of_state'];
      const tuition_domestic =
        tuitionInState != null
          ? parseInt(tuitionInState, 10)
          : tuitionOutState != null
          ? parseInt(tuitionOutState, 10)
          : null;

      const sizeRaw = raw['latest.student.size'];
      const student_population = sizeRaw != null ? parseInt(sizeRaw, 10) : null;
      const size_category = sizeCategory(student_population);

      const school = {
        name,
        acceptance_rate,
        tuition_domestic,
        student_population,
        size_category,
      };

      try {
        const updated = await upsertCollege(school);
        if (updated) {
          totalUpdated++;
          logger.debug({ msg: 'Updated college', name, acceptance_rate, tuition_domestic, student_population, size_category });
        } else {
          totalSkipped++;
          logger.debug({ msg: 'College not in DB, skipping', name });
        }
      } catch (err) {
        logger.error({ msg: 'Failed to upsert college', name, error: err.message });
        totalErrors++;
      }
    }

    page++;

    // Stop when we've fetched all records
    if (totalFetched >= totalRecords) {
      logger.info({ msg: 'All records fetched', totalFetched, totalRecords });
      break;
    }

    await sleep(REQUEST_DELAY_MS);
  }

  logger.info({
    msg: 'College Scorecard scraper finished',
    totalFetched,
    totalUpdated,
    totalSkipped,
    totalErrors,
  });

  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

run().catch((err) => {
  logger.error({ msg: 'Fatal error in College Scorecard scraper', error: err.message, stack: err.stack });
  process.exitCode = 1;
});

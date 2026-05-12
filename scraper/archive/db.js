'use strict';

/**
 * Database access layer for the scraper pipeline.
 *
 * Requires DATABASE_URL to be set to a Supabase PostgreSQL connection string.
 * SSL is enabled automatically (rejectUnauthorized: false for Supabase).
 *
 * All exported functions are async.
 */

const { normalize } = require('./normalizer');
const logger = require('./logger');

// ── PostgreSQL ────────────────────────────────────────────────────────────────

let _pgPool = null;

function getPgPool() {
  if (_pgPool) return _pgPool;
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set to Supabase PostgreSQL URL');
  }
  const { Pool } = require('pg');
  _pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  _pgPool.on('error', (err) => {
    logger.error({ msg: 'Idle PostgreSQL client error', error: err.message });
  });
  return _pgPool;
}

async function ensurePostgresSchema() {
  const pool = getPgPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scraped_applicants (
      id BIGSERIAL PRIMARY KEY,
      reddit_post_id TEXT NOT NULL UNIQUE,
      gpa DOUBLE PRECISION,
      sat_score INTEGER,
      act_score INTEGER,
      num_ap_courses INTEGER,
      nationality TEXT,
      intended_major TEXT,
      first_gen SMALLINT,
      income_bracket TEXT,
      raw_text TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_scraped_applicants_post_id
      ON scraped_applicants(reddit_post_id);

    CREATE TABLE IF NOT EXISTS scraped_results (
      id BIGSERIAL PRIMARY KEY,
      applicant_id BIGINT NOT NULL
        REFERENCES scraped_applicants(id) ON DELETE CASCADE,
      school_name_raw TEXT NOT NULL,
      school_name_normalized TEXT NOT NULL,
      outcome TEXT NOT NULL
        CHECK(outcome IN ('accepted','rejected','waitlisted','deferred')),
      round TEXT
        CHECK(round IN ('ED','EA','RD','REA','SCEA') OR round IS NULL),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_scraped_results_applicant
      ON scraped_results(applicant_id);
    CREATE INDEX IF NOT EXISTS idx_scraped_results_school
      ON scraped_results(school_name_normalized);
    CREATE INDEX IF NOT EXISTS idx_scraped_results_outcome
      ON scraped_results(outcome);

    CREATE TABLE IF NOT EXISTS calibration_runs (
      id BIGSERIAL PRIMARY KEY,
      run_at TIMESTAMPTZ DEFAULT NOW(),
      school_name TEXT NOT NULL,
      predicted_rate DOUBLE PRECISION NOT NULL,
      actual_rate DOUBLE PRECISION NOT NULL,
      brier_score DOUBLE PRECISION NOT NULL,
      previous_brier_score DOUBLE PRECISION,
      delta DOUBLE PRECISION,
      sample_size INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_calibration_runs_school
      ON calibration_runs(school_name);
    CREATE INDEX IF NOT EXISTS idx_calibration_runs_at
      ON calibration_runs(run_at);

    CREATE TABLE IF NOT EXISTS scrape_runs (
      id BIGSERIAL PRIMARY KEY,
      run_at TIMESTAMPTZ DEFAULT NOW(),
      mode TEXT NOT NULL CHECK(mode IN ('seed','incremental')),
      posts_fetched INTEGER NOT NULL DEFAULT 0,
      posts_parsed INTEGER NOT NULL DEFAULT 0,
      posts_stored INTEGER NOT NULL DEFAULT 0,
      posts_skipped INTEGER NOT NULL DEFAULT 0,
      error_message TEXT
    );
  `);
}

// PostgreSQL adapter — uses pg Pool with parameterised queries ($1, $2, ...)
const pgAdapter = {
  async postExists(postId) {
    const pool = getPgPool();
    const { rows } = await pool.query(
      'SELECT 1 FROM scraped_applicants WHERE reddit_post_id = $1',
      [postId]
    );
    return rows.length > 0;
  },

  async storePost(postId, applicant, results, rawText) {
    const pool = getPgPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `INSERT INTO scraped_applicants
           (reddit_post_id, gpa, sat_score, act_score, num_ap_courses,
            nationality, intended_major, first_gen, income_bracket, raw_text)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id`,
        [
          postId,
          applicant.gpa ?? null,
          applicant.sat_score ?? null,
          applicant.act_score ?? null,
          applicant.num_ap_courses ?? null,
          applicant.nationality ?? null,
          applicant.intended_major ?? null,
          applicant.first_gen === null ? null : (applicant.first_gen ? 1 : 0),
          applicant.income_bracket ?? null,
          rawText ? rawText.slice(0, 5000) : null,
        ]
      );

      const applicantId = rows[0].id;

      for (const r of results) {
        await client.query(
          `INSERT INTO scraped_results
             (applicant_id, school_name_raw, school_name_normalized, outcome, round)
           VALUES ($1,$2,$3,$4,$5)`,
          [applicantId, r.school_name_raw, normalize(r.school_name_raw), r.outcome, r.round ?? null]
        );
      }

      await client.query('COMMIT');
      return applicantId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async recordScrapeRun(stats) {
    const pool = getPgPool();
    await pool.query(
      `INSERT INTO scrape_runs
         (mode, posts_fetched, posts_parsed, posts_stored, posts_skipped, error_message)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        stats.mode,
        stats.posts_fetched,
        stats.posts_parsed,
        stats.posts_stored,
        stats.posts_skipped,
        stats.error_message ?? null,
      ]
    );
  },

  async getSchoolStats() {
    const pool = getPgPool();
    const { rows } = await pool.query(`
      SELECT
        school_name_normalized AS school,
        COUNT(*)::int AS total,
        SUM(CASE WHEN outcome = 'accepted' THEN 1 ELSE 0 END)::int AS accepted_count
      FROM scraped_results
      GROUP BY school_name_normalized
      HAVING COUNT(*) >= 30
    `);
    return rows;
  },

  async getPublishedRate(normalizedName) {
    const pool = getPgPool();
    try {
      let res = await pool.query(
        'SELECT acceptance_rate FROM colleges WHERE LOWER(name) = LOWER($1) LIMIT 1',
        [normalizedName]
      );
      if (!res.rows.length) {
        res = await pool.query(
          "SELECT acceptance_rate FROM colleges WHERE LOWER(name) LIKE '%' || LOWER($1) || '%' LIMIT 1",
          [normalizedName]
        );
      }
      if (!res.rows.length || res.rows[0].acceptance_rate == null) return null;
      return parseFloat(res.rows[0].acceptance_rate);
    } catch (err) {
      if (err.code === '42P01') return null; // table does not exist
      throw err;
    }
  },

  async getLastBrierScore(schoolName) {
    const pool = getPgPool();
    const { rows } = await pool.query(
      'SELECT brier_score FROM calibration_runs WHERE school_name = $1 ORDER BY run_at DESC LIMIT 1',
      [schoolName]
    );
    return rows.length ? parseFloat(rows[0].brier_score) : null;
  },

  async getResultsForSchool(normalizedName) {
    const pool = getPgPool();
    const { rows } = await pool.query(
      'SELECT outcome FROM scraped_results WHERE school_name_normalized = $1',
      [normalizedName]
    );
    return rows;
  },

  async insertCalibrationRun(row) {
    const pool = getPgPool();
    await pool.query(
      `INSERT INTO calibration_runs
         (school_name, predicted_rate, actual_rate, brier_score,
          previous_brier_score, delta, sample_size)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        row.school_name,
        row.predicted_rate,
        row.actual_rate,
        row.brier_score,
        row.previous_brier_score,
        row.delta,
        row.sample_size,
      ]
    );
  },

  async close() {
    if (_pgPool) {
      await _pgPool.end();
      _pgPool = null;
    }
  },
};

// ── Initialisation ────────────────────────────────────────────────────────────

let _initialised = false;

/**
 * Initialise the database connection.  Must be called once before any other
 * function is used (or called automatically on first use via getPgPool()).
 */
async function init() {
  if (_initialised) return;
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set to Supabase PostgreSQL URL');
  }
  await ensurePostgresSchema();
  logger.info({
    msg: 'PostgreSQL database connected',
    url: process.env.DATABASE_URL.replace(/:\/\/[^@]*@/, '://***@'),
  });
  _initialised = true;
}

// ── Public API (all async) ────────────────────────────────────────────────────

async function postExists(postId) { return pgAdapter.postExists(postId); }
async function storePost(postId, applicant, results, rawText) { return pgAdapter.storePost(postId, applicant, results, rawText); }
async function recordScrapeRun(stats) { return pgAdapter.recordScrapeRun(stats); }
async function getSchoolStats() { return pgAdapter.getSchoolStats(); }
async function getPublishedRate(normalizedName) { return pgAdapter.getPublishedRate(normalizedName); }
async function getLastBrierScore(schoolName) { return pgAdapter.getLastBrierScore(schoolName); }
async function getResultsForSchool(normalizedName) { return pgAdapter.getResultsForSchool(normalizedName); }
async function insertCalibrationRun(row) { return pgAdapter.insertCalibrationRun(row); }
async function close() {
  if (_pgPool) {
    await _pgPool.end();
    _pgPool = null;
    _initialised = false;
  }
}

module.exports = {
  init,
  postExists,
  storePost,
  recordScrapeRun,
  getSchoolStats,
  getPublishedRate,
  getLastBrierScore,
  getResultsForSchool,
  insertCalibrationRun,
  close,
};


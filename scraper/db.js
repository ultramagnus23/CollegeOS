'use strict';

/**
 * Database access layer for the scraper pipeline.
 * Uses better-sqlite3 (synchronous) and the existing CollegeOS SQLite database.
 *
 * The DB path is resolved from DATABASE_PATH env var, falling back to the
 * backend's default location relative to this file.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { normalize } = require('./normalizer');
const logger = require('./logger');

const DEFAULT_DB_PATH = path.resolve(__dirname, '../backend/database/college_app.db');
const DB_PATH = process.env.DATABASE_PATH || DEFAULT_DB_PATH;

let _db = null;

/**
 * Open (or return cached) the SQLite database connection.
 * @returns {import('better-sqlite3').Database}
 */
function getDb() {
  if (_db) return _db;

  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma('foreign_keys = ON');
  _db.pragma('journal_mode = WAL');

  ensureSchema(_db);

  logger.info({ msg: 'SQLite database opened', path: DB_PATH });
  return _db;
}

/**
 * Create the scraper tables if they do not yet exist.
 * This mirrors migration 038_scraper_pipeline.sql and allows the scraper
 * to run even before the migration runner has been executed.
 */
function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scraped_applicants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reddit_post_id TEXT NOT NULL UNIQUE,
      gpa REAL,
      sat_score INTEGER,
      act_score INTEGER,
      num_ap_courses INTEGER,
      nationality TEXT,
      intended_major TEXT,
      first_gen INTEGER,
      income_bracket TEXT,
      raw_text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_scraped_applicants_post_id
      ON scraped_applicants(reddit_post_id);

    CREATE TABLE IF NOT EXISTS scraped_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      applicant_id INTEGER NOT NULL
        REFERENCES scraped_applicants(id) ON DELETE CASCADE,
      school_name_raw TEXT NOT NULL,
      school_name_normalized TEXT NOT NULL,
      outcome TEXT NOT NULL
        CHECK(outcome IN ('accepted','rejected','waitlisted','deferred')),
      round TEXT
        CHECK(round IN ('ED','EA','RD','REA','SCEA') OR round IS NULL),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_scraped_results_applicant
      ON scraped_results(applicant_id);
    CREATE INDEX IF NOT EXISTS idx_scraped_results_school
      ON scraped_results(school_name_normalized);
    CREATE INDEX IF NOT EXISTS idx_scraped_results_outcome
      ON scraped_results(outcome);

    CREATE TABLE IF NOT EXISTS calibration_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      school_name TEXT NOT NULL,
      predicted_rate REAL NOT NULL,
      actual_rate REAL NOT NULL,
      brier_score REAL NOT NULL,
      previous_brier_score REAL,
      delta REAL,
      sample_size INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_calibration_runs_school
      ON calibration_runs(school_name);
    CREATE INDEX IF NOT EXISTS idx_calibration_runs_at
      ON calibration_runs(run_at);

    CREATE TABLE IF NOT EXISTS scrape_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      mode TEXT NOT NULL CHECK(mode IN ('seed','incremental')),
      posts_fetched INTEGER NOT NULL DEFAULT 0,
      posts_parsed INTEGER NOT NULL DEFAULT 0,
      posts_stored INTEGER NOT NULL DEFAULT 0,
      posts_skipped INTEGER NOT NULL DEFAULT 0,
      error_message TEXT
    );
  `);
}

// ── Prepared statement cache ─────────────────────────────────────────────────

let _stmts = null;
function stmts() {
  if (_stmts) return _stmts;
  const db = getDb();
  _stmts = {
    postExists: db.prepare('SELECT 1 FROM scraped_applicants WHERE reddit_post_id = ?'),
    insertApplicant: db.prepare(`
      INSERT INTO scraped_applicants
        (reddit_post_id, gpa, sat_score, act_score, num_ap_courses,
         nationality, intended_major, first_gen, income_bracket, raw_text)
      VALUES
        (@reddit_post_id, @gpa, @sat_score, @act_score, @num_ap_courses,
         @nationality, @intended_major, @first_gen, @income_bracket, @raw_text)
    `),
    insertResult: db.prepare(`
      INSERT INTO scraped_results
        (applicant_id, school_name_raw, school_name_normalized, outcome, round)
      VALUES
        (@applicant_id, @school_name_raw, @school_name_normalized, @outcome, @round)
    `),
    insertScrapeRun: db.prepare(`
      INSERT INTO scrape_runs
        (mode, posts_fetched, posts_parsed, posts_stored, posts_skipped, error_message)
      VALUES
        (@mode, @posts_fetched, @posts_parsed, @posts_stored, @posts_skipped, @error_message)
    `),
    getSchoolStats: db.prepare(`
      SELECT
        school_name_normalized AS school,
        COUNT(*) AS total,
        SUM(CASE WHEN outcome = 'accepted' THEN 1 ELSE 0 END) AS accepted_count
      FROM scraped_results
      GROUP BY school_name_normalized
      HAVING COUNT(*) >= 30
    `),
    getLastBrierScore: db.prepare(`
      SELECT brier_score
      FROM calibration_runs
      WHERE school_name = ?
      ORDER BY run_at DESC
      LIMIT 1
    `),
    insertCalibrationRun: db.prepare(`
      INSERT INTO calibration_runs
        (school_name, predicted_rate, actual_rate, brier_score,
         previous_brier_score, delta, sample_size)
      VALUES
        (@school_name, @predicted_rate, @actual_rate, @brier_score,
         @previous_brier_score, @delta, @sample_size)
    `),
    getResultsForSchool: db.prepare(`
      SELECT outcome
      FROM scraped_results
      WHERE school_name_normalized = ?
    `),
  };
  return _stmts;
}

// Colleges-table statements are prepared lazily because the colleges table
// may not exist in all environments (e.g., standalone test DB).
let _getPublishedRate = null;
let _getPublishedRateByNorm = null;
function getPublishedRateStmt() {
  if (_getPublishedRate) return _getPublishedRate;
  const db = getDb();
  _getPublishedRate = db.prepare(
    'SELECT acceptance_rate FROM colleges WHERE LOWER(name) = LOWER(?) LIMIT 1'
  );
  return _getPublishedRate;
}
function getPublishedRateByNormStmt() {
  if (_getPublishedRateByNorm) return _getPublishedRateByNorm;
  const db = getDb();
  _getPublishedRateByNorm = db.prepare(
    "SELECT acceptance_rate FROM colleges WHERE LOWER(name) LIKE '%' || LOWER(?) || '%' LIMIT 1"
  );
  return _getPublishedRateByNorm;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check whether a Reddit post has already been stored.
 * @param {string} postId
 * @returns {boolean}
 */
function postExists(postId) {
  return !!stmts().postExists.get(postId);
}

/**
 * Store a parsed post (applicant + results) in a single transaction.
 * @param {string} postId
 * @param {object} applicant  - from claudeParser
 * @param {object[]} results  - from claudeParser
 * @param {string} rawText    - concatenated post title + body
 * @returns {number} applicant row id
 */
function storePost(postId, applicant, results, rawText) {
  const db = getDb();
  const insert = db.transaction(() => {
    const info = stmts().insertApplicant.run({
      reddit_post_id: postId,
      gpa: applicant.gpa ?? null,
      sat_score: applicant.sat_score ?? null,
      act_score: applicant.act_score ?? null,
      num_ap_courses: applicant.num_ap_courses ?? null,
      nationality: applicant.nationality ?? null,
      intended_major: applicant.intended_major ?? null,
      first_gen: applicant.first_gen === null ? null : (applicant.first_gen ? 1 : 0),
      income_bracket: applicant.income_bracket ?? null,
      raw_text: rawText ? rawText.slice(0, 5000) : null,
    });

    const applicantId = info.lastInsertRowid;

    for (const r of results) {
      stmts().insertResult.run({
        applicant_id: applicantId,
        school_name_raw: r.school_name_raw,
        school_name_normalized: normalize(r.school_name_raw),
        outcome: r.outcome,
        round: r.round ?? null,
      });
    }

    return applicantId;
  });

  return insert();
}

/**
 * Record a completed scrape run.
 * @param {object} stats
 * @param {string} stats.mode
 * @param {number} stats.posts_fetched
 * @param {number} stats.posts_parsed
 * @param {number} stats.posts_stored
 * @param {number} stats.posts_skipped
 * @param {string|null} stats.error_message
 */
function recordScrapeRun(stats) {
  stmts().insertScrapeRun.run({
    mode: stats.mode,
    posts_fetched: stats.posts_fetched,
    posts_parsed: stats.posts_parsed,
    posts_stored: stats.posts_stored,
    posts_skipped: stats.posts_skipped,
    error_message: stats.error_message ?? null,
  });
}

/**
 * Return schools with ≥30 data points plus their acceptance rate from scraped_results.
 * @returns {Array<{school: string, total: number, accepted_count: number}>}
 */
function getSchoolStats() {
  return stmts().getSchoolStats.all();
}

/**
 * Look up the published acceptance rate for a school from the colleges table.
 * Returns null if not found or if the colleges table does not exist.
 * @param {string} normalizedName
 * @returns {number|null}
 */
function getPublishedRate(normalizedName) {
  try {
    // Try exact match first
    let row = getPublishedRateStmt().get(normalizedName);
    if (!row) {
      row = getPublishedRateByNormStmt().get(normalizedName);
    }
    if (!row || row.acceptance_rate == null) return null;
    return parseFloat(row.acceptance_rate);
  } catch (err) {
    // colleges table may not exist in this environment
    if (err.message && err.message.includes('no such table')) {
      return null;
    }
    throw err;
  }
}

/**
 * Get the most recent Brier Score for a school (for delta calculation).
 * @param {string} schoolName
 * @returns {number|null}
 */
function getLastBrierScore(schoolName) {
  const row = stmts().getLastBrierScore.get(schoolName);
  return row ? row.brier_score : null;
}

/**
 * Get all scraped outcomes for a specific school (for per-record Brier Score).
 * @param {string} normalizedName
 * @returns {Array<{outcome: string}>}
 */
function getResultsForSchool(normalizedName) {
  return stmts().getResultsForSchool.all(normalizedName);
}

/**
 * Insert a calibration run row.
 * @param {object} row
 */
function insertCalibrationRun(row) {
  stmts().insertCalibrationRun.run(row);
}

/**
 * Close the database connection gracefully.
 */
function close() {
  if (_db) {
    _db.close();
    _db = null;
    _stmts = null;
  }
}

module.exports = {
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

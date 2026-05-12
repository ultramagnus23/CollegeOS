'use strict';

/**
 * College Confidential "Chance Me" scraper
 *
 * Scrapes https://talk.collegeconfidential.com/c/chance-me/ using axios +
 * cheerio (no headless browser required).  For each post it extracts college
 * names, admission result, GPA, SAT, and ACT scores, then upserts into the
 * `scraped_applicants` table.
 *
 * Required environment variables:
 *   DATABASE_URL   — PostgreSQL connection string (Supabase or direct)
 *
 * Optional environment variables:
 *   CC_MAX_PAGES   — how many pages to scrape (default: 10)
 *   LOG_LEVEL      — winston log level (default: info)
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { Pool } = require('pg');
const logger = require('./logger');

// ── Config ─────────────────────────────────────────────────────────────────

const BASE_URL = 'https://talk.collegeconfidential.com/c/chance-me/';
const USER_AGENT = 'Mozilla/5.0 (compatible; CollegeOS-Research-Bot/1.0)';
const REQUEST_DELAY_MS = 2000;
const MAX_PAGES = parseInt(process.env.CC_MAX_PAGES || '10', 10);

// Common college name keywords used for extraction heuristics.
// In production you'd load this from the colleges table; this set covers
// the names most frequently mentioned in Chance Me posts.
const COLLEGE_KEYWORDS = [
  'Harvard', 'Yale', 'Princeton', 'Stanford', 'MIT', 'Columbia', 'Penn',
  'Dartmouth', 'Brown', 'Cornell', 'Duke', 'Northwestern', 'Vanderbilt',
  'Rice', 'Notre Dame', 'Georgetown', 'Emory', 'Tufts', 'Carnegie Mellon',
  'Johns Hopkins', 'USC', 'UCLA', 'UC Berkeley', 'Michigan', 'Virginia',
  'UNC', 'Georgetown', 'Boston College', 'Boston University', 'NYU',
  'Northeastern', 'UNC Chapel Hill', 'Georgia Tech', 'Purdue', 'Ohio State',
  'Penn State', 'Texas', 'UT Austin', 'Florida', 'Wisconsin', 'Illinois',
  'Rutgers', 'Stony Brook', 'UMass', 'UConn', 'Miami', 'Syracuse',
  'Tulane', 'Wake Forest', 'William & Mary', 'Villanova', 'Fordham',
  'Rochester', 'Case Western', 'Lehigh', 'Rensselaer', 'WashU', 'Wash U',
  'Washington University', 'Reed', 'Amherst', 'Williams', 'Swarthmore',
  'Bowdoin', 'Middlebury', 'Colby', 'Hamilton', 'Bates', 'Haverford',
  'Pomona', 'Claremont', 'Harvey Mudd', 'Scripps', 'Pitzer', 'Colgate',
  'Davidson', 'Grinnell', 'Carleton', 'Oberlin', 'Kenyon', 'Macalester',
];

// Regex patterns
const GPA_RE = /\b([0-9]\.[0-9]{1,2})\b/;
const SAT_RE = /\bSAT[:\s]*([0-9]{3,4})\b/i;
const ACT_RE = /\bACT[:\s]*([0-9]{2})\b/i;
const RESULT_ACCEPTED_RE = /\b(accepted|admitted|got in|acceptance|admit)\b/i;
const RESULT_REJECTED_RE = /\b(rejected|denied|rejection)\b/i;
const RESULT_WAITLISTED_RE = /\b(waitlisted|waitlist|WL)\b/i;

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Sleep for `ms` milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Extract GPA, SAT, ACT, admission result, and college names from text.
 * @param {string} text
 * @returns {{ gpa: number|null, sat_score: number|null, act_score: number|null,
 *             result: string|null, college_names: string[] }}
 */
function extractFields(text) {
  const gpaMatch = GPA_RE.exec(text);
  const gpa = gpaMatch ? parseFloat(gpaMatch[1]) : null;

  const satMatch = SAT_RE.exec(text);
  const sat_score = satMatch ? parseInt(satMatch[1], 10) : null;

  const actMatch = ACT_RE.exec(text);
  const act_score = actMatch ? parseInt(actMatch[1], 10) : null;

  let result = null;
  if (RESULT_ACCEPTED_RE.test(text)) result = 'accepted';
  else if (RESULT_REJECTED_RE.test(text)) result = 'rejected';
  else if (RESULT_WAITLISTED_RE.test(text)) result = 'waitlisted';

  const college_names = COLLEGE_KEYWORDS.filter((name) =>
    new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)
  );

  return { gpa, sat_score, act_score, result, college_names };
}

/**
 * Fetch one page of the Chance Me category listing and return an array of
 * { title, url } objects for each topic listed.
 * @param {number} page  1-based page number
 * @returns {Promise<Array<{title: string, url: string}>>}
 */
async function fetchListingPage(page) {
  const url = page === 1 ? BASE_URL : `${BASE_URL}?page=${page}`;
  const response = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 15000,
  });

  const $ = cheerio.load(response.data);
  const topics = [];

  // Discourse uses <a class="title"> or <span class="link-top-line"> depending on
  // version; we grab every anchor that leads to a topic.
  $('a.title, td.main-link a.title, .topic-list-item .title a').each((_, el) => {
    const title = $(el).text().trim();
    let href = $(el).attr('href') || '';
    if (href && !href.startsWith('http')) {
      href = `https://talk.collegeconfidential.com${href}`;
    }
    if (title && href) {
      topics.push({ title, url: href });
    }
  });

  return topics;
}

/**
 * Fetch the body text of a single topic post.
 * Returns the concatenated text of the first post (OP).
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchPostBody(url) {
  const response = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 15000,
  });

  const $ = cheerio.load(response.data);
  // First post in a Discourse thread lives in .topic-post:first-child .cooked
  const bodyEl = $('.topic-post:first-child .cooked').first();
  return bodyEl.length ? bodyEl.text() : '';
}

// ── Database ───────────────────────────────────────────────────────────────

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
 * Ensure the scraped_applicants table has the columns this scraper needs.
 * The table may already exist from db.js; this migration is additive-only.
 */
async function ensureSchema() {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scraped_applicants (
      id          BIGSERIAL PRIMARY KEY,
      college_name TEXT,
      result      TEXT,
      gpa         DOUBLE PRECISION,
      sat_score   INTEGER,
      act_score   INTEGER,
      source_url  TEXT,
      scraped_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Add columns for CC-specific fields if the table already existed without them.
  for (const [col, def] of [
    ['college_name', 'TEXT'],
    ['result', 'TEXT'],
    ['source_url', 'TEXT'],
    ['scraped_at', 'TIMESTAMPTZ DEFAULT NOW()'],
  ]) {
    await pool.query(`
      ALTER TABLE scraped_applicants ADD COLUMN IF NOT EXISTS ${col} ${def};
    `).catch(() => { /* column already exists — ignore */ });
  }
}

/**
 * Insert one row into scraped_applicants.
 * @param {object} row
 */
async function insertRow(row) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO scraped_applicants
       (college_name, result, gpa, sat_score, act_score, source_url, scraped_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [row.college_name, row.result, row.gpa, row.sat_score, row.act_score, row.source_url]
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

async function run() {
  if (!process.env.DATABASE_URL) {
    logger.error({ msg: 'DATABASE_URL is not set — cannot save results' });
    process.exitCode = 1;
    return;
  }

  logger.info({ msg: 'College Confidential scraper starting', maxPages: MAX_PAGES });

  await ensureSchema();

  let totalInserted = 0;
  let totalErrors = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    logger.info({ msg: 'Fetching listing page', page });

    let topics;
    try {
      topics = await fetchListingPage(page);
    } catch (err) {
      logger.error({ msg: 'Failed to fetch listing page', page, error: err.message });
      totalErrors++;
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    if (topics.length === 0) {
      logger.info({ msg: 'No topics found — stopping early', page });
      break;
    }

    logger.info({ msg: 'Topics found on page', page, count: topics.length });

    for (const { title, url } of topics) {
      await sleep(REQUEST_DELAY_MS);

      let bodyText = '';
      try {
        bodyText = await fetchPostBody(url);
      } catch (err) {
        logger.error({ msg: 'Failed to fetch post body', url, error: err.message });
        totalErrors++;
        continue;
      }

      const fullText = `${title} ${bodyText}`;
      const { gpa, sat_score, act_score, result, college_names } = extractFields(fullText);

      // If we couldn't extract any signal from the post, skip it.
      if (!gpa && !sat_score && !act_score && college_names.length === 0) {
        logger.debug({ msg: 'No extractable data in post, skipping', url });
        continue;
      }

      // Insert one row per mentioned college (or one row with null college if
      // no specific college was identified but other stats were found).
      const colleges = college_names.length > 0 ? college_names : [null];
      for (const college_name of colleges) {
        try {
          await insertRow({ college_name, result, gpa, sat_score, act_score, source_url: url });
          totalInserted++;
          logger.debug({ msg: 'Inserted row', college_name, result, gpa, sat_score, act_score, url });
        } catch (err) {
          logger.error({ msg: 'Failed to insert row', url, college_name, error: err.message });
          totalErrors++;
        }
      }
    }

    await sleep(REQUEST_DELAY_MS);
  }

  logger.info({ msg: 'College Confidential scraper finished', totalInserted, totalErrors });

  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

run().catch((err) => {
  logger.error({ msg: 'Fatal error in College Confidential scraper', error: err.message, stack: err.stack });
  process.exitCode = 1;
});

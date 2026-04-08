#!/usr/bin/env node
'use strict';

/**
 * CollegeOS Scraper Pipeline
 *
 * Usage:
 *   node index.js seed         # First run: fetch as much historical Reddit data as possible
 *   node index.js incremental  # Scheduled: fetch only Reddit posts since last run
 *   node index.js scholarship  # Fetch & upsert scholarships (DAAD, Inlaks, NSF, etc.)
 *
 * Required environment variables (Reddit / admissions modes):
 *   ANTHROPIC_API_KEY
 *
 * Required environment variables (scholarship mode):
 *   DATABASE_URL                   – PostgreSQL connection string
 *
 * Optional:
 *   EXCHANGE_RATE_API_URL  – override the exchange-rate endpoint
 *                            (default: https://api.exchangerate-api.com/v4/latest/USD)
 *   DATABASE_PATH          – path to SQLite DB (defaults to ../backend/database/college_app.db)
 *   SEED_MAX_PAGES         – max pages per subreddit in seed mode (default: 0 = unlimited)
 *   LOG_LEVEL              – winston log level (default: info)
 */

const logger = require('./logger');
const redditClient = require('./redditClient');
const claudeParser = require('./claudeParser');
const db = require('./db');
const { calibrate } = require('./calibrate');
const { runScholarshipScraper, close: closeScholarshipDb } = require('./scholarshipScraper');

// ── Config ────────────────────────────────────────────────────────────────────

// Number of consecutive Claude failures before we abort a batch to avoid
// burning API quota on a broken run.
const MAX_CONSECUTIVE_FAILURES = 10;

// In seed mode, cap pages per subreddit (0 = no cap).
const SEED_MAX_PAGES = parseInt(process.env.SEED_MAX_PAGES || '0', 10);

// How far back incremental mode looks (2 weeks).
const INCREMENTAL_LOOKBACK_DAYS = 14;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build plain text from a Reddit post object.
 * @param {object} post
 * @returns {string}
 */
function buildRawText(post) {
  const title = (post.title || '').trim();
  const body = (post.selftext || '').trim();
  return body ? `${title}\n\n${body}` : title;
}

/**
 * Process a batch of raw Reddit posts: skip duplicates, parse via Claude,
 * store in DB, and return updated stats.
 * @param {object[]} posts
 * @param {object} stats  - mutable counters { fetched, parsed, stored, skipped }
 * @returns {Promise<void>}
 */
async function processBatch(posts, stats) {
  let consecutiveFailures = 0;

  for (const post of posts) {
    stats.fetched++;

    // Duplicate guard — Reddit post ID is the unique key
    if (await db.postExists(post.id)) {
      stats.skipped++;
      logger.debug({ msg: 'Skipping duplicate post', postId: post.id });
      continue;
    }

    const rawText = buildRawText(post);

    // Parse via Claude
    let parsed;
    try {
      parsed = await claudeParser.parsePost(post);
    } catch (err) {
      consecutiveFailures++;
      logger.error({ msg: 'Unexpected error calling Claude', postId: post.id, error: err.message });
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        throw new Error(
          `Aborting: ${MAX_CONSECUTIVE_FAILURES} consecutive Claude failures. Last error: ${err.message}`
        );
      }
      continue;
    }

    if (!parsed) {
      // Post doesn't contain parseable admissions data — skip silently
      logger.debug({ msg: 'No admissions data found in post', postId: post.id });
      continue;
    }

    consecutiveFailures = 0;
    stats.parsed++;

    try {
      await db.storePost(post.id, parsed.applicant, parsed.results, rawText);
      stats.stored++;
      logger.debug({
        msg: 'Stored post',
        postId: post.id,
        schools: parsed.results.length,
      });
    } catch (err) {
      // UNIQUE constraint on reddit_post_id — race condition between check and insert.
      // SQLite raises "UNIQUE constraint failed"; PostgreSQL uses error code 23505.
      if ((err.message && err.message.includes('UNIQUE constraint')) || err.code === '23505') {
        stats.skipped++;
        logger.debug({ msg: 'Race-condition duplicate, skipping', postId: post.id });
      } else {
        logger.error({ msg: 'DB error storing post', postId: post.id, error: err.message });
      }
    }
  }
}

// ── Seed mode ─────────────────────────────────────────────────────────────────

/**
 * Seed mode: scrape as much historical data as possible from top-all-time.
 * Runs in chunked pages to avoid timeouts; each page is committed before
 * moving to the next.
 */
async function runSeed() {
  logger.info({ msg: 'Starting seed run', maxPages: SEED_MAX_PAGES || 'unlimited' });

  const stats = { mode: 'seed', fetched: 0, parsed: 0, stored: 0, skipped: 0, error: null };

  try {
    for await (const { subreddit, posts } of redditClient.seedPosts(SEED_MAX_PAGES)) {
      logger.info({ msg: 'Processing page', subreddit, count: posts.length });
      await processBatch(posts, stats);
    }
  } catch (err) {
    stats.error = err.message;
    logger.error({ msg: 'Seed run error', error: err.message });
  }

  await db.recordScrapeRun({
    mode: 'seed',
    posts_fetched: stats.fetched,
    posts_parsed: stats.parsed,
    posts_stored: stats.stored,
    posts_skipped: stats.skipped,
    error_message: stats.error,
  });

  logger.info({
    msg: 'Seed run complete',
    fetched: stats.fetched,
    parsed: stats.parsed,
    stored: stats.stored,
    skipped: stats.skipped,
    error: stats.error,
  });

  return stats;
}

// ── Incremental mode ──────────────────────────────────────────────────────────

/**
 * Incremental mode: scrape only posts newer than the lookback window.
 */
async function runIncremental() {
  const since = new Date(Date.now() - INCREMENTAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  logger.info({ msg: 'Starting incremental run', since: since.toISOString() });

  const stats = { mode: 'incremental', fetched: 0, parsed: 0, stored: 0, skipped: 0, error: null };

  try {
    for await (const { subreddit, posts } of redditClient.incrementalPosts(since)) {
      logger.info({ msg: 'Processing page', subreddit, count: posts.length });
      await processBatch(posts, stats);
    }
  } catch (err) {
    stats.error = err.message;
    logger.error({ msg: 'Incremental run error', error: err.message });
  }

  await db.recordScrapeRun({
    mode: 'incremental',
    posts_fetched: stats.fetched,
    posts_parsed: stats.parsed,
    posts_stored: stats.stored,
    posts_skipped: stats.skipped,
    error_message: stats.error,
  });

  logger.info({
    msg: 'Incremental run complete',
    fetched: stats.fetched,
    parsed: stats.parsed,
    stored: stats.stored,
    skipped: stats.skipped,
    error: stats.error,
  });

  return stats;
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const mode = process.argv[2];

  if (!['seed', 'incremental', 'scholarship'].includes(mode)) {
    console.error('Usage: node index.js <seed|incremental|scholarship>');
    process.exit(1);
  }

  // ── Scholarship mode — no Reddit/Claude dependencies needed ──────────────

  if (mode === 'scholarship') {
    try {
      const result = await runScholarshipScraper();
      logger.info({ msg: 'Scholarship scrape finished', ...result });
    } catch (err) {
      logger.error({ msg: 'Scholarship scraper fatal error', error: err.message, stack: err.stack });
      process.exitCode = 1;
    } finally {
      await closeScholarshipDb();
    }
    return;
  }

  // ── Reddit admissions modes ───────────────────────────────────────────────

  try {
    await db.init();

    if (mode === 'seed') {
      await runSeed();
    } else {
      await runIncremental();
    }

    // Run calibration after every admissions scrape
    logger.info({ msg: 'Running calibration' });
    await calibrate();
  } catch (err) {
    logger.error({ msg: 'Fatal error', error: err.message, stack: err.stack });
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

main();

// backend/src/jobs/scraperScheduler.js
// node-cron based scheduler for Python & Node.js scraper processes.
//
// Schedule:
//   Reddit chance-me:    every 6 hours
//   Scholarship scraper: daily at 02:00 UTC
//   Admissions data:     every Sunday at 03:00 UTC
//
// Each job:
//   1. Spawns the subprocess via child_process.spawn().
//   2. Captures stdout / stderr.
//   3. Writes a row to the scraper_logs table in Postgres.
//
// Environment variables:
//   SCRAPER_DIR     — path to the scraper directory (default: resolved from __dirname)
//   ENABLE_SCRAPING_JOBS — must be 'true' (or NODE_ENV=production) for jobs to start
//   FEEDBACK_RETRAIN_THRESHOLD — rows before training_pipeline.py is triggered (default 100)

'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const cron = require('node-cron');
const dbManager = require('../config/database');
const logger = require('../utils/logger');

// Resolve the scraper directory relative to this file
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..'); // backend/src/jobs → repo root
const SCRAPER_DIR = process.env.SCRAPER_DIR || path.join(REPO_ROOT, 'scraper');

const jobs = [];

// ── Logging helpers ───────────────────────────────────────────────────────────

async function logToDb(scraperName, startedAt, completedAt, status, exitCode, stdout, stderr, errorMsg) {
  try {
    const pool = dbManager.getDatabase();
    await pool.query(
      `INSERT INTO scraper_logs
         (scraper_name, started_at, completed_at, status, exit_code, stdout, stderr, error_msg)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        scraperName,
        startedAt,
        completedAt,
        status,
        exitCode,
        stdout ? stdout.slice(0, 50000) : null,
        stderr ? stderr.slice(0, 10000) : null,
        errorMsg || null,
      ]
    );
  } catch (err) {
    logger.warn(`scraperScheduler: failed to write scraper_logs — ${err.message}`);
  }
}

// ── Generic runner ────────────────────────────────────────────────────────────

/**
 * Run a subprocess, capture output, and write to scraper_logs.
 *
 * @param {string} scraperName   — human label for the log row
 * @param {string} command       — 'node' | 'python3' | etc.
 * @param {string[]} args        — command arguments
 * @param {object} [env]         — extra environment variables
 * @returns {Promise<{exitCode: number}>}
 */
function runProcess(scraperName, command, args, env = {}) {
  return new Promise((resolve) => {
    const startedAt = new Date();
    logger.info(`scraperScheduler: starting ${scraperName}`, { command, args });

    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      cwd: SCRAPER_DIR,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', async (code) => {
      const completedAt = new Date();
      const status = code === 0 ? 'success' : 'error';
      const errorMsg = code !== 0 ? `Process exited with code ${code}` : null;

      logger.info(`scraperScheduler: ${scraperName} finished`, {
        exitCode: code,
        durationMs: completedAt - startedAt,
        status,
      });

      if (code !== 0) {
        logger.warn(`scraperScheduler: ${scraperName} stderr:\n${stderr.slice(0, 2000)}`);
      }

      await logToDb(scraperName, startedAt, completedAt, status, code, stdout, stderr, errorMsg);
      resolve({ exitCode: code });
    });

    child.on('error', async (err) => {
      const completedAt = new Date();
      logger.error(`scraperScheduler: ${scraperName} spawn error`, { error: err.message });
      await logToDb(scraperName, startedAt, completedAt, 'error', 1, stdout, stderr, err.message);
      resolve({ exitCode: 1 });
    });
  });
}

// ── Individual scraper runners ────────────────────────────────────────────────

async function runRedditScraper() {
  // Python-only mode: legacy JS reddit scraper is deprecated.
  const legacyIndex = path.join(SCRAPER_DIR, 'index.js');
  if (!fs.existsSync(legacyIndex)) {
    logger.info('scraperScheduler: skipping reddit scraper (legacy scraper/index.js not present)');
    return;
  }

  await runProcess(
    'reddit_incremental',
    'node',
    ['index.js', 'incremental'],
    {}
  );
}

async function runScholarshipScraper() {
  // Prefer maintained Python scholarship scraper; fallback to legacy Node entrypoint if present.
  const pythonScholarship = path.join(SCRAPER_DIR, 'scholarship_scraper.py');
  if (fs.existsSync(pythonScholarship)) {
    await runProcess(
      'scholarship',
      'python3',
      [pythonScholarship],
      {}
    );
    return;
  }

  const legacyIndex = path.join(SCRAPER_DIR, 'index.js');
  if (fs.existsSync(legacyIndex)) {
    await runProcess(
      'scholarship',
      'node',
      ['index.js', 'scholarship'],
      {}
    );
    return;
  }

  logger.info('scraperScheduler: skipping scholarship scraper (no supported entrypoint found)');
}

async function runAdmissionsScraper() {
  // Python-only: funding_scraper.py is the maintained entrypoint in this repo.
  const fundingScript = path.join(SCRAPER_DIR, 'funding_scraper.py');
  if (!fs.existsSync(fundingScript)) {
    logger.info('scraperScheduler: skipping admissions/funding scraper (funding_scraper.py not present)');
    return;
  }

  await runProcess(
    'admissions_funding',
    'python3',
    [fundingScript],
    {}
  );
}

async function runTrainingPipeline() {
  // python3 scraper/training_pipeline.py
  await runProcess(
    'training_pipeline',
    'python3',
    [path.join(SCRAPER_DIR, 'training_pipeline.py')],
    {}
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Trigger a background retrain (called from ml.js /feedback route).
 */
function triggerRetrain() {
  runTrainingPipeline().catch((err) => {
    logger.error('scraperScheduler: background retrain failed', { error: err.message });
  });
}

/**
 * Start all cron jobs.
 */
function start() {
  // Reddit incremental: every 6 hours
  jobs.push(
    cron.schedule('0 */6 * * *', async () => {
      logger.info('scraperScheduler: running Reddit incremental scraper');
      try { await runRedditScraper(); } catch (e) { logger.error('Reddit scraper failed', { error: e.message }); }
    }, { timezone: 'UTC' })
  );

  // Scholarship: daily at 02:00 UTC
  jobs.push(
    cron.schedule('0 2 * * *', async () => {
      logger.info('scraperScheduler: running scholarship scraper');
      try { await runScholarshipScraper(); } catch (e) { logger.error('Scholarship scraper failed', { error: e.message }); }
    }, { timezone: 'UTC' })
  );

  // Admissions/financial aid data: every Sunday at 03:00 UTC
  jobs.push(
    cron.schedule('0 3 * * 0', async () => {
      logger.info('scraperScheduler: running admissions/funding scraper');
      try { await runAdmissionsScraper(); } catch (e) { logger.error('Admissions scraper failed', { error: e.message }); }
    }, { timezone: 'UTC' })
  );

  logger.info('scraperScheduler: all cron jobs scheduled', {
    reddit: 'every 6 hours',
    scholarship: 'daily 02:00 UTC',
    admissions: 'Sunday 03:00 UTC',
  });
}

/**
 * Stop all running cron jobs.
 */
function stop() {
  jobs.forEach((j) => j.stop());
  jobs.length = 0;
  logger.info('scraperScheduler: all jobs stopped');
}

module.exports = { start, stop, triggerRetrain };

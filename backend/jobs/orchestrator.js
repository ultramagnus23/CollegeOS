// CollegeOS Auto-generated backend/jobs/orchestrator.js — do not edit manually
'use strict';

/**
 * CollegeOS Master Orchestrator
 *
 * Single file that schedules ALL automated data-pipeline jobs.
 * Python scrapers are spawned as child processes.
 * Every run is logged to the scraper_run_logs table.
 *
 * Schedules
 * ─────────
 *   Reddit scraper         every 6 h
 *   Admissions data        every 24 h at 02:00 UTC
 *   Financial aid          every 24 h at 03:00 UTC
 *   SAT/GPA stats          every Sunday at 04:00 UTC
 *   Tuition/costs          every Sunday at 05:00 UTC
 *   Acceptance rates       every Sunday at 06:00 UTC
 *   ML retrain check       every 1 h (triggers when 100+ new rows)
 *
 * Environment variables required
 * ────────────────────────────────
 *   DATABASE_URL
 *   REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET / REDDIT_REFRESH_TOKEN
 *   GEMINI_API_KEY   (used by scraper/claudeParser.js and backend/src/services/valuesEngine.js)
 *
 * Optional
 * ────────
 *   SCRAPER_DIR             — path to the scraper directory
 *   FEEDBACK_RETRAIN_THRESHOLD — rows before ML retrain (default 100)
 *   ENABLE_ORCHESTRATOR     — must be 'true' or NODE_ENV=production to activate
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const cron = require('node-cron');

// ── Logger — reuse backend winston instance if available, else fall back ───────
let logger;
try {
  logger = require('../src/utils/logger');
} catch {
  const { createLogger, transports, format } = require('winston');
  logger = createLogger({
    format: format.combine(format.timestamp(), format.json()),
    transports: [new transports.Console()],
  });
}

// ── DB helper — reuse backend db manager if available ─────────────────────────
let dbManager;
try {
  dbManager = require('../src/config/database');
} catch {
  dbManager = null;
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRAPER_DIR = process.env.SCRAPER_DIR || path.join(REPO_ROOT, 'scraper');
const DATA_PIPELINE_DIR = path.join(REPO_ROOT, 'backend', 'scripts', 'data-pipeline');
const RETRAIN_THRESHOLD = parseInt(process.env.FEEDBACK_RETRAIN_THRESHOLD || '100', 10);

const jobs = [];

// ── DB log helper ─────────────────────────────────────────────────────────────

async function logRun(jobName, startedAt, finishedAt, rowsUpserted, status, errorMessage) {
  if (!dbManager) return;
  try {
    const pool = dbManager.getDatabase();
    await pool.query(
      `INSERT INTO scraper_run_logs
         (job_name, started_at, finished_at, rows_upserted, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [jobName, startedAt, finishedAt, rowsUpserted || 0, status, errorMessage || null]
    );
  } catch (err) {
    logger.warn(`[ORCHESTRATOR] Failed to write scraper_run_logs: ${err.message}`);
  }
}

// ── Generic process runner ────────────────────────────────────────────────────

/**
 * Spawn a subprocess, capture its output, and log results to scraper_run_logs.
 * The subprocess is expected to print "ROWS_UPSERTED=<n>" somewhere in stdout
 * to report how many rows it inserted; if absent, 0 is recorded.
 */
function runProcess(jobName, command, args, env = {}) {
  return new Promise((resolve) => {
    const startedAt = new Date();
    logger.info(`[JOB START] ${jobName} — ${startedAt.toISOString()}`);

    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      cwd: SCRAPER_DIR,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', async (code) => {
      const finishedAt = new Date();
      const durationMs = finishedAt - startedAt;
      const status = code === 0 ? 'success' : 'failed';

      // Parse ROWS_UPSERTED=<n> from stdout if present
      const match = stdout.match(/ROWS_UPSERTED=(\d+)/);
      const rowsUpserted = match ? parseInt(match[1], 10) : 0;

      if (code === 0) {
        logger.info(`[JOB END] ${jobName} — ${rowsUpserted} rows upserted in ${durationMs}ms`);
      } else {
        const errSnippet = stderr.slice(-500) || stdout.slice(-500);
        logger.error(`[JOB FAILED] ${jobName} — exit ${code}: ${errSnippet}`);
      }

      await logRun(jobName, startedAt, finishedAt, rowsUpserted, status,
        code !== 0 ? `Process exited ${code}: ${stderr.slice(0, 2000)}` : null);

      resolve({ exitCode: code, rowsUpserted });
    });

    child.on('error', async (err) => {
      const finishedAt = new Date();
      logger.error(`[JOB FAILED] ${jobName} — spawn error: ${err.message}`);
      await logRun(jobName, startedAt, finishedAt, 0, 'failed', err.message);
      resolve({ exitCode: 1, rowsUpserted: 0 });
    });
  });
}

// ── Individual job runners ────────────────────────────────────────────────────

function runRedditScraper() {
  const legacyIndex = path.join(SCRAPER_DIR, 'index.js');
  if (!fs.existsSync(legacyIndex)) {
    logger.info('[ORCHESTRATOR] Skipping reddit job: legacy scraper/index.js not present');
    return Promise.resolve({ exitCode: 0, rowsUpserted: 0 });
  }
  return runProcess('reddit', 'node', ['index.js', 'incremental']);
}

function runAdmissionsScraper() {
  const script = path.join(DATA_PIPELINE_DIR, 'fetch-ipeds.py');
  if (!fs.existsSync(script)) {
    logger.info('[ORCHESTRATOR] Skipping admissions job: fetch-ipeds.py not present');
    return Promise.resolve({ exitCode: 0, rowsUpserted: 0 });
  }
  return runProcess('admissions', 'python3',
    [script]);
}

function runFinancialScraper() {
  const script = path.join(DATA_PIPELINE_DIR, 'fetch-collegedata-org.py');
  if (!fs.existsSync(script)) {
    logger.info('[ORCHESTRATOR] Skipping financial aid job: fetch-collegedata-org.py not present');
    return Promise.resolve({ exitCode: 0, rowsUpserted: 0 });
  }
  return runProcess('financial_aid', 'python3',
    [script]);
}

function runCollegeProfileScraper() {
  const script = path.join(DATA_PIPELINE_DIR, 'fetch-cds-web.py');
  if (!fs.existsSync(script)) {
    logger.info('[ORCHESTRATOR] Skipping college profile job: fetch-cds-web.py not present');
    return Promise.resolve({ exitCode: 0, rowsUpserted: 0 });
  }
  return runProcess('college_profiles', 'python3',
    [script]);
}

function runMlRetrain() {
  return runProcess('ml_retrain', 'python3',
    [path.join(REPO_ROOT, 'scraper', 'training_pipeline.py')],
    { RETRAIN_EVERY: String(RETRAIN_THRESHOLD) });
}

function runDeadlineIntelligenceScraper() {
  return runProcess('deadline_intelligence', 'node',
    [path.join(__dirname, 'deadlineIntelligenceScraper.js')]);
}

// ── Safe wrapper ──────────────────────────────────────────────────────────────

function safe(name, fn) {
  return async () => {
    try {
      await fn();
    } catch (err) {
      logger.error(`[JOB FAILED] ${name} — uncaught: ${err.message}`);
    }
  };
}

// ── Start ─────────────────────────────────────────────────────────────────────

function start() {
  logger.info('[ORCHESTRATOR] CollegeOS automation started. Next runs:');
  logger.info('  - Reddit scraper:    every 6h');
  logger.info('  - Admissions data:   every 24h at 2am UTC');
  logger.info('  - Financial aid:     every 24h at 3am UTC');
  logger.info('  - Deadline intelligence: every 24h at 1am UTC');
  logger.info('  - SAT/GPA stats:     every Sunday 4am UTC');
  logger.info('  - Tuition/costs:     every Sunday 5am UTC');
  logger.info('  - Acceptance rates:  every Sunday 6am UTC');
  logger.info(`  - ML retrain check:  every 1h (triggers if ${RETRAIN_THRESHOLD}+ new rows)`);

  // Reddit incremental — every 6 hours
  jobs.push(cron.schedule('0 */6 * * *', safe('reddit', runRedditScraper), { timezone: 'UTC' }));

  // Deadline intelligence — every day at 01:00 UTC
  jobs.push(cron.schedule('0 1 * * *', safe('deadline_intelligence', runDeadlineIntelligenceScraper), { timezone: 'UTC' }));

  // Admissions stats — every day at 02:00 UTC
  jobs.push(cron.schedule('0 2 * * *', safe('admissions', runAdmissionsScraper), { timezone: 'UTC' }));

  // Financial aid — every day at 03:00 UTC
  jobs.push(cron.schedule('0 3 * * *', safe('financial_aid', runFinancialScraper), { timezone: 'UTC' }));

  // SAT/GPA stats (college profiles, pass 1) — every Sunday at 04:00 UTC
  jobs.push(cron.schedule('0 4 * * 0', safe('college_profiles_sat_gpa', runCollegeProfileScraper), { timezone: 'UTC' }));

  // Tuition/costs (college profiles, pass 2) — every Sunday at 05:00 UTC
  jobs.push(cron.schedule('0 5 * * 0', safe('college_profiles_tuition', runCollegeProfileScraper), { timezone: 'UTC' }));

  // Acceptance rates (college profiles, pass 3) — every Sunday at 06:00 UTC
  jobs.push(cron.schedule('0 6 * * 0', safe('college_profiles_rates', runCollegeProfileScraper), { timezone: 'UTC' }));

  // ML retrain — every hour (internal threshold check skips actual training if not enough new rows)
  jobs.push(cron.schedule('0 * * * *', safe('ml_retrain', runMlRetrain), { timezone: 'UTC' }));
}

function stop() {
  jobs.forEach((j) => j.stop());
  jobs.length = 0;
  logger.info('[ORCHESTRATOR] All jobs stopped.');
}

module.exports = { start, stop };

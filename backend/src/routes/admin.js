// CollegeOS Auto-generated backend/src/routes/admin.js — do not edit manually
'use strict';

/**
 * GET /api/admin/health
 *
 * Returns a JSON snapshot of the automated pipeline status:
 *   - Last run + status of every scraper job
 *   - Database row counts
 *   - Latest ML model metrics
 *
 * Result is cached for 60 seconds to avoid hammering the DB on every request.
 */

const express = require('express');
const router = express.Router();
const dbManager = require('../config/database');
const logger = require('../utils/logger');
const { authenticate, adminOnly } = require('../middleware/auth');

// 60-second in-memory cache
let _cachedResult = null;
let _cacheExpiresAt = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Compute ISO string for next cron run given a cron expression.
 * Uses a simple heuristic — for production-accuracy use node-cron or cronstrue.
 */
function nextRunAfter(cronExpr, fromDate = new Date()) {
  // Very lightweight: just add the fixed interval implied by each schedule
  const map = {
    '0 */6 * * *': 6 * 60 * 60 * 1000,
    '0 2 * * *': 24 * 60 * 60 * 1000,
    '0 3 * * *': 24 * 60 * 60 * 1000,
    '0 4 * * 0': 7 * 24 * 60 * 60 * 1000,
    '0 5 * * 0': 7 * 24 * 60 * 60 * 1000,
    '0 6 * * 0': 7 * 24 * 60 * 60 * 1000,
    '0 * * * *': 60 * 60 * 1000,
  };
  const interval = map[cronExpr] || 24 * 60 * 60 * 1000;
  return new Date(fromDate.getTime() + interval).toISOString();
}

// Job name → cron expression mapping (mirrors orchestrator.js schedules)
const JOB_CRON = {
  reddit: '0 */6 * * *',
  admissions: '0 2 * * *',
  financial_aid: '0 3 * * *',
  college_profiles: '0 4 * * 0',
  ml_retrain: '0 * * * *',
};

// ── Health query ──────────────────────────────────────────────────────────────

async function buildHealthPayload() {
  const pool = dbManager.getDatabase();

  // ── Scraper status ────────────────────────────────────────────────────────
  // Query latest run per job from scraper_run_logs (Python worker) and
  // scraper_logs (Node scraperScheduler) — union both tables.
  const scraperRows = await pool.query(`
    SELECT job_name AS name, started_at, status, rows_upserted
    FROM (
      SELECT
        job_name,
        started_at,
        status,
        rows_upserted,
        ROW_NUMBER() OVER (PARTITION BY job_name ORDER BY started_at DESC) AS rn
      FROM scraper_run_logs
    ) t
    WHERE rn = 1

    UNION ALL

    SELECT
      scraper_name AS name,
      started_at,
      status,
      NULL AS rows_upserted
    FROM (
      SELECT
        scraper_name,
        started_at,
        status,
        ROW_NUMBER() OVER (PARTITION BY scraper_name ORDER BY started_at DESC) AS rn
      FROM scraper_logs
    ) t
    WHERE rn = 1
  `).catch(() => ({ rows: [] }));  // graceful if table missing

  const scraperMap = {};
  for (const row of scraperRows.rows) {
    const key = row.name;
    if (!scraperMap[key] || new Date(row.started_at) > new Date(scraperMap[key].last_run)) {
      scraperMap[key] = {
        last_run: row.started_at ? new Date(row.started_at).toISOString() : null,
        status: row.status,
        rows_upserted: row.rows_upserted ?? 0,
        next_run: row.started_at
          ? nextRunAfter(JOB_CRON[key] || '0 */6 * * *', new Date(row.started_at))
          : null,
      };
    }
  }

  // Ensure all known jobs appear (even if never run)
  for (const jobName of Object.keys(JOB_CRON)) {
    if (!scraperMap[jobName]) {
      scraperMap[jobName] = {
        last_run: null,
        status: 'never_run',
        rows_upserted: 0,
        next_run: nextRunAfter(JOB_CRON[jobName]),
      };
    }
  }

  // ── Database counts ───────────────────────────────────────────────────────
  const [
    cmpTotal,
    cmpWithOutcome,
    collegesTotal,
    collegesFresh,
    collegesStale,
  ] = await Promise.all([
    pool.query("SELECT COUNT(*) FROM chance_me_posts").catch(() => ({ rows: [{ count: 0 }] })),
    pool.query("SELECT COUNT(*) FROM chance_me_posts WHERE outcome IS NOT NULL AND outcome != 'pending'")
      .catch(() => ({ rows: [{ count: 0 }] })),
    pool.query("SELECT COUNT(*) FROM public.clean_colleges").catch(() => ({ rows: [{ count: 0 }] })),
    pool.query("SELECT COUNT(*) FROM college_admissions_stats WHERE data_freshness = 'fresh'")
      .catch(() => ({ rows: [{ count: 0 }] })),
    pool.query("SELECT COUNT(*) FROM college_admissions_stats WHERE data_freshness = 'stale'")
      .catch(() => ({ rows: [{ count: 0 }] })),
  ]);

  // ── ML model info ─────────────────────────────────────────────────────────
  const mlRow = await pool.query(`
    SELECT model_version, accuracy, f1_score, training_samples, last_trained
    FROM ml_metadata
    ORDER BY last_trained DESC
    LIMIT 1
  `).catch(() => ({ rows: [] }));

  const ml = mlRow.rows[0] || null;

  // Count rows since last train
  let newRowsSinceLastTrain = 0;
  if (ml?.training_samples != null) {
    const newRowsRes = await pool.query(
      "SELECT COUNT(*) FROM chance_me_posts WHERE outcome IS NOT NULL AND outcome != 'pending'"
    ).catch(() => ({ rows: [{ count: ml.training_samples }] }));
    newRowsSinceLastTrain = Math.max(
      0,
      parseInt(newRowsRes.rows[0].count, 10) - parseInt(ml.training_samples, 10)
    );
  }

  const retrainThreshold = parseInt(process.env.FEEDBACK_RETRAIN_THRESHOLD || '100', 10);

  return {
    scrapers: scraperMap,
    database: {
      chance_me_posts_total: parseInt(cmpTotal.rows[0].count, 10),
      chance_me_posts_with_outcome: parseInt(cmpWithOutcome.rows[0].count, 10),
      colleges_total: parseInt(collegesTotal.rows[0].count, 10),
      colleges_with_fresh_data: parseInt(collegesFresh.rows[0].count, 10),
      colleges_with_stale_data: parseInt(collegesStale.rows[0].count, 10),
    },
    ml_model: ml
      ? {
          current_version: ml.model_version,
          accuracy: ml.accuracy,
          f1_score: ml.f1_score,
          training_samples: ml.training_samples,
          last_trained: ml.last_trained
            ? new Date(ml.last_trained).toISOString()
            : null,
          new_rows_since_last_train: newRowsSinceLastTrain,
          next_retrain_triggers_at: retrainThreshold,
        }
      : {
          current_version: null,
          accuracy: null,
          f1_score: null,
          training_samples: 0,
          last_trained: null,
          new_rows_since_last_train: 0,
          next_retrain_triggers_at: retrainThreshold,
        },
  };
}

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/health
 * Requires authentication and admin role.
 */
router.get('/health', authenticate, adminOnly, async (req, res) => {
  const now = Date.now();
  if (_cachedResult && now < _cacheExpiresAt) {
    return res.json(_cachedResult);
  }

  try {
    const payload = await buildHealthPayload();
    _cachedResult = payload;
    _cacheExpiresAt = now + 60000; // 60-second TTL
    res.json(payload);
  } catch (err) {
    logger.error('admin/health: failed to build health payload', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch health data', detail: err.message });
  }
});

module.exports = router;

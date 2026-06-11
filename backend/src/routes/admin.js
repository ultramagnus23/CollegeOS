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
const { getScraperHealthSnapshot } = require('../services/scraperHealthService');

// 60-second in-memory cache
let _cachedResult = null;
let _cacheExpiresAt = 0;
let _cachedScraperHealth = null;
let _scraperHealthCacheExpiresAt = 0;

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
    pool.query("SELECT COUNT(*) FROM canonical.mv_college_cards").catch(() => ({ rows: [{ count: 0 }] })),
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

/**
 * Build scraper health payload from canonical.scraper_execution_history.
 */
async function buildScraperHealthPayload() {
      const pool = dbManager.getDatabase();
      const nowIso = new Date().toISOString();

      const rowsRes = await pool.query(`
        SELECT
          scraper_name,
          started_at,
          finished_at,
          rows_inserted,
          rows_updated,
          rows_skipped,
          duplicates_detected,
          runtime_ms,
          success,
          failure_reason,
          failure_category,
          schema_mismatches,
          stale_records_detected,
          ingestion_coverage,
          diagnostics
        FROM canonical.scraper_execution_history
        WHERE started_at > NOW() - INTERVAL '30 days'
        ORDER BY started_at DESC
        LIMIT 500
      `).catch(() => ({ rows: [] }));

      const byScraper = new Map();
      const recentExceptions = [];

      for (const row of rowsRes.rows) {
        const name = row.scraper_name || 'unknown';
        const bucket = byScraper.get(name) || {
          scraper_name: name,
          total_runs: 0,
          successful_runs: 0,
          failed_runs: 0,
          duplicates_detected: 0,
          avg_runtime_ms: 0,
          latest_run_at: null,
          latest_success_at: null,
          latest_failure_reason: null,
          schema_mismatches: 0,
          stale_records_detected: 0,
          ingestion_coverage_values: [],
        };

        bucket.total_runs += 1;
        bucket.duplicates_detected += Number(row.duplicates_detected || 0);
        bucket.schema_mismatches += Number(row.schema_mismatches || 0);
        bucket.stale_records_detected += Number(row.stale_records_detected || 0);
        if (typeof row.runtime_ms === 'number') {
          bucket.avg_runtime_ms = ((bucket.avg_runtime_ms * (bucket.total_runs - 1)) + row.runtime_ms) / bucket.total_runs;
        }

        const startedAtIso = row.started_at ? new Date(row.started_at).toISOString() : null;
        if (!bucket.latest_run_at || (startedAtIso && startedAtIso > bucket.latest_run_at)) {
          bucket.latest_run_at = startedAtIso;
        }

        if (row.success) {
          bucket.successful_runs += 1;
          if (!bucket.latest_success_at || (startedAtIso && startedAtIso > bucket.latest_success_at)) {
            bucket.latest_success_at = startedAtIso;
          }
        } else {
          bucket.failed_runs += 1;
          bucket.latest_failure_reason = row.failure_reason || row.failure_category || 'unknown_failure';
          if (recentExceptions.length < 50) {
            recentExceptions.push({
              scraper_name: name,
              started_at: startedAtIso,
              failure_reason: row.failure_reason || null,
              failure_category: row.failure_category || null,
            });
          }
        }

        if (row.ingestion_coverage != null) {
          bucket.ingestion_coverage_values.push(Number(row.ingestion_coverage));
        }
        byScraper.set(name, bucket);
      }

      const scrapers = Array.from(byScraper.values()).map((item) => {
        const failureRate = item.total_runs > 0 ? item.failed_runs / item.total_runs : 0;
        const duplicateRate = item.total_runs > 0 ? item.duplicates_detected / item.total_runs : 0;
        const avgCoverage = item.ingestion_coverage_values.length
          ? item.ingestion_coverage_values.reduce((a, b) => a + b, 0) / item.ingestion_coverage_values.length
          : null;
        const stale = !item.latest_success_at || (Date.now() - Date.parse(item.latest_success_at)) > 7 * 24 * 60 * 60 * 1000;
        return {
          scraper_name: item.scraper_name,
          total_runs: item.total_runs,
          successful_runs: item.successful_runs,
          failed_runs: item.failed_runs,
          failure_rate: Number(failureRate.toFixed(4)),
          duplicate_rate: Number(duplicateRate.toFixed(4)),
          avg_runtime_ms: Math.round(item.avg_runtime_ms || 0),
          latest_run_at: item.latest_run_at,
          latest_success_at: item.latest_success_at,
          latest_failure_reason: item.latest_failure_reason,
          stale,
          schema_mismatches: item.schema_mismatches,
          stale_records_detected: item.stale_records_detected,
          ingestion_coverage: avgCoverage == null ? null : Number(avgCoverage.toFixed(2)),
        };
      });

  return {
    generated_at: nowIso,
    scraper_count: scrapers.length,
    stale_scrapers: scrapers.filter((s) => s.stale).map((s) => s.scraper_name),
    runtime_trends: scrapers
      .map((s) => ({ scraper_name: s.scraper_name, avg_runtime_ms: s.avg_runtime_ms }))
      .sort((a, b) => b.avg_runtime_ms - a.avg_runtime_ms),
    failure_rates: scrapers
      .map((s) => ({ scraper_name: s.scraper_name, failure_rate: s.failure_rate }))
      .sort((a, b) => b.failure_rate - a.failure_rate),
    duplicate_rates: scrapers
      .map((s) => ({ scraper_name: s.scraper_name, duplicate_rate: s.duplicate_rate }))
      .sort((a, b) => b.duplicate_rate - a.duplicate_rate),
    ingestion_coverage: scrapers
      .map((s) => ({ scraper_name: s.scraper_name, ingestion_coverage: s.ingestion_coverage }))
      .filter((row) => row.ingestion_coverage != null),
    last_successful_runs: scrapers
      .map((s) => ({ scraper_name: s.scraper_name, latest_success_at: s.latest_success_at }))
      .sort((a, b) => (b.latest_success_at || '').localeCompare(a.latest_success_at || '')),
    recent_exceptions: recentExceptions,
    scrapers,
  };
}

// ── Route ─────────────────────────────────────────────────────────────

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
    res.status(500).json({ success: false, code: 'HEALTH_CHECK_FAILED', message: 'Failed to fetch health data' });
  }
});

/**
 * GET /api/admin/scraper-health
 * Requires authentication and admin role.
 */
router.get('/scraper-health', authenticate, adminOnly, async (req, res) => {
  const now = Date.now();
  if (_cachedScraperHealth && now < _scraperHealthCacheExpiresAt) {
    return res.json(_cachedScraperHealth);
  }

  try {
    const payload = await getScraperHealthSnapshot();
    _cachedScraperHealth = payload;
    _scraperHealthCacheExpiresAt = now + 60000;
    return res.json(payload);
  } catch (err) {
    logger.error('admin/scraper-health: failed to build scraper health payload', { error: err.message });
    return res.status(500).json({ success: false, code: 'SCRAPER_HEALTH_FAILED', message: 'Failed to fetch scraper health data' });
  }
});

/**
 * GET /api/admin/mv-health
 * Materialized view health check — freshness, row counts, staleness.
 * Requires authentication and admin role.
 */
router.get('/mv-health', authenticate, adminOnly, async (req, res) => {
  try {
    const pool = dbManager.getDatabase();

    const mvChecks = [];

    // Check mv_college_cards freshness
    try {
      const collegeCardResult = await pool.query(`
        SELECT
          matviewname,
          last_analyze,
          last_autoanalyze,
          (now() - COALESCE(last_analyze, last_autoanalyze))::interval AS staleness
        FROM pg_stat_user_tables
        WHERE schemaname = 'canonical'
          AND relname = 'mv_college_cards'
      `).catch(() => ({ rows: [] }));

      if (collegeCardResult.rows.length > 0) {
        const row = collegeCardResult.rows[0];
        const stalenessMs = row.staleness ? Date.parse(row.staleness.toString()) : null;
        const isStale = stalenessMs && (Date.now() - stalenessMs) > 24 * 60 * 60 * 1000;
        const rowCount = await pool.query('SELECT COUNT(*) FROM canonical.mv_college_cards').catch(() => ({ rows: [{ count: 0 }] }));
        mvChecks.push({
          name: 'mv_college_cards',
          schema: 'canonical',
          last_refreshed: row.last_analyze || row.last_autoanalyze || null,
          staleness_hours: row.staleness ? Math.round((Date.parse(row.staleness.toString()) / 3600000)) : null,
          row_count: parseInt(rowCount.rows[0].count, 10),
          is_stale: isStale,
          staleness_threshold_hours: 24,
        });
      }
    } catch (_) { /* mv may not exist yet */ }

    // Check mv_admissions_trends freshness
    try {
      const admissionsResult = await pool.query(`
        SELECT
          matviewname,
          last_analyze,
          last_autoanalyze,
          (now() - COALESCE(last_analyze, last_autoanalyze))::interval AS staleness
        FROM pg_stat_user_tables
        WHERE schemaname = 'canonical'
          AND relname = 'mv_admissions_trends'
      `).catch(() => ({ rows: [] }));

      if (admissionsResult.rows.length > 0) {
        const row = admissionsResult.rows[0];
        const stalenessMs = row.staleness ? Date.parse(row.staleness.toString()) : null;
        const isStale = stalenessMs && (Date.now() - stalenessMs) > 24 * 60 * 60 * 1000;
        const rowCount = await pool.query('SELECT COUNT(*) FROM canonical.mv_admissions_trends').catch(() => ({ rows: [{ count: 0 }] }));
        mvChecks.push({
          name: 'mv_admissions_trends',
          schema: 'canonical',
          last_refreshed: row.last_analyze || row.last_autoanalyze || null,
          staleness_hours: row.staleness ? Math.round((Date.parse(row.staleness.toString()) / 3600000)) : null,
          row_count: parseInt(rowCount.rows[0].count, 10),
          is_stale: isStale,
          staleness_threshold_hours: 24,
        });
      }
    } catch (_) { /* mv may not exist yet */ }

    // Check mv_scholarship_matches freshness
    try {
      const scholarshipResult = await pool.query(`
        SELECT
          matviewname,
          last_analyze,
          last_autoanalyze,
          (now() - COALESCE(last_analyze, last_autoanalyze))::interval AS staleness
        FROM pg_stat_user_tables
        WHERE schemaname = 'canonical'
          AND relname = 'mv_scholarship_matches'
      `).catch(() => ({ rows: [] }));

      if (scholarshipResult.rows.length > 0) {
        const row = scholarshipResult.rows[0];
        const stalenessMs = row.staleness ? Date.parse(row.staleness.toString()) : null;
        const isStale = stalenessMs && (Date.now() - stalenessMs) > 24 * 60 * 60 * 1000;
        const rowCount = await pool.query('SELECT COUNT(*) FROM canonical.mv_scholarship_matches').catch(() => ({ rows: [{ count: 0 }] }));
        mvChecks.push({
          name: 'mv_scholarship_matches',
          schema: 'canonical',
          last_refreshed: row.last_analyze || row.last_autoanalyze || null,
          staleness_hours: row.staleness ? Math.round((Date.parse(row.staleness.toString()) / 3600000)) : null,
          row_count: parseInt(rowCount.rows[0].count, 10),
          is_stale: isStale,
          staleness_threshold_hours: 24,
        });
      }
    } catch (_) { /* mv may not exist yet */ }

    res.json({
      success: true,
      data: {
        generated_at: new Date().toISOString(),
        materialized_views: mvChecks,
        summary: {
          total: mvChecks.length,
          stale: mvChecks.filter((mv) => mv.is_stale).length,
          healthy: mvChecks.filter((mv) => !mv.is_stale).length,
        },
      },
    });
  } catch (err) {
    logger.error('admin/mv-health: failed to build mv health payload', { error: err.message });
    res.status(500).json({ success: false, code: 'MV_HEALTH_FAILED', message: 'Failed to fetch materialized view health data' });
  }
});

/**
 * GET /api/admin/brier-scores
 * Aggregate Brier Score for all users — admin analytics.
 * Requires authentication and admin role.
 */
router.get('/brier-scores', authenticate, adminOnly, async (req, res) => {
  try {
    const pool = dbManager.getDatabase();

    // Overall Brier score
    const overallResult = await pool.query(`
      SELECT
        COUNT(*) AS total_predictions,
        AVG((predicted_probability - actual_outcome) ^ 2) AS brier_score
      FROM prediction_logs
      WHERE predicted_probability IS NOT NULL
        AND actual_outcome IS NOT NULL
    `).catch(() => ({ rows: [{ total_predictions: 0, brier_score: null }] }));

    // Per-major breakdown
    const majorResult = await pool.query(`
      SELECT
        t.major_applied AS major,
        COUNT(*) AS predictions,
        AVG((t.predicted_probability - t.actual_outcome) ^ 2) AS brier_score,
        AVG(t.predicted_probability) AS avg_predicted_prob,
        SUM(CASE WHEN t.actual_outcome = 1 THEN 1 ELSE 0 END)::float / COUNT(*) AS acceptance_rate
      FROM prediction_logs t
      WHERE t.predicted_probability IS NOT NULL
        AND t.actual_outcome IS NOT NULL
        AND t.major_applied IS NOT NULL
      GROUP BY t.major_applied
      ORDER BY predictions DESC
      LIMIT 20
    `).catch(() => ({ rows: [] }));

    // Prediction distribution (buckets)
    const distResult = await pool.query(`
      SELECT
        CASE
          WHEN predicted_probability < 0.2 THEN '0-20%'
          WHEN predicted_probability < 0.4 THEN '20-40%'
          WHEN predicted_probability < 0.6 THEN '40-60%'
          WHEN predicted_probability < 0.8 THEN '60-80%'
          ELSE '80-100%'
        END AS bucket,
        COUNT(*) AS count,
        AVG(actual_outcome) AS actual_acceptance_rate
      FROM prediction_logs
      WHERE predicted_probability IS NOT NULL
        AND actual_outcome IS NOT NULL
      GROUP BY bucket
      ORDER BY bucket
    `).catch(() => ({ rows: [] }));

    // Recent predictions trend (last 7 days)
    const trendResult = await pool.query(`
      SELECT
        DATE_TRUNC('day', created_at)::date AS day,
        COUNT(*) AS predictions,
        AVG((predicted_probability - actual_outcome) ^ 2) AS daily_brier
      FROM prediction_logs
      WHERE created_at >= NOW() - INTERVAL '7 days'
        AND predicted_probability IS NOT NULL
        AND actual_outcome IS NOT NULL
      GROUP BY day
      ORDER BY day
    `).catch(() => ({ rows: [] }));

    const overall = overallResult.rows[0];
    const score = overall.brier_score ? Math.round(overall.brier_score * 10000) / 10000 : null;
    let calibration;
    if (score == null) calibration = 'insufficient data';
    else if (score <= 0.10) calibration = 'excellent';
    else if (score <= 0.20) calibration = 'good';
    else if (score <= 0.25) calibration = 'decent';
    else calibration = 'needs more data';

    res.json({
      success: true,
      data: {
        overall: {
          score,
          calibration,
          total_predictions: parseInt(overall.total_predictions, 10),
        },
        by_major: majorResult.rows.map((r) => ({
          major: r.major,
          predictions: parseInt(r.predictions, 10),
          brier_score: r.brier_score ? Math.round(r.brier_score * 10000) / 10000 : null,
          avg_predicted_prob: r.avg_predicted_prob ? Math.round(r.avg_predicted_prob * 100) / 100 : null,
          acceptance_rate: r.acceptance_rate ? Math.round(r.acceptance_rate * 100) / 100 : null,
        })),
        prediction_distribution: distResult.rows.map((r) => ({
          bucket: r.bucket,
          count: parseInt(r.count, 10),
          actual_acceptance_rate: r.actual_acceptance_rate ? Math.round(r.actual_acceptance_rate * 100) / 100 : null,
        })),
        recent_trend: trendResult.rows.map((r) => ({
          day: r.day,
          predictions: parseInt(r.predictions, 10),
          daily_brier: r.daily_brier ? Math.round(r.daily_brier * 10000) / 10000 : null,
        })),
      },
    });
  } catch (err) {
    logger.error('admin/brier-scores: failed to build brier scores', { error: err.message });
    res.status(500).json({ success: false, code: 'BRIER_SCORES_FAILED', message: 'Failed to fetch Brier scores' });
  }
});

module.exports = router;

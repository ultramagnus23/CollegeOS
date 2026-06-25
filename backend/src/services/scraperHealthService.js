'use strict';

const dbManager = require('../config/database');

function toIso(value) {
  if (!value) return null;
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

function secondsBetween(startedAt, finishedAt) {
  if (!startedAt || !finishedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 1000);
}

// A job whose last successful run is older than this is flagged "stale".
const STALE_JOB_DAYS = 14;
// Default window for the dataset-staleness rollup (see getStalenessRollup).
const STALE_DATA_DAYS = 30;

function blankJob(jobName) {
  return {
    jobName,
    lastSuccessfulRun: null,
    lastFoundDataAt: null,        // last run that actually inserted/updated rows
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsFailed: 0,
    duplicateSkips: 0,
    schemaMismatchFailures: 0,
    runtimeExceptions: 0,
    executionDurationSeconds: null,
    lastStatus: 'never_run',
    lastRunAt: null,
    // Derived flags (filled in by finalizeJob):
    stale: true,                  // no recent successful run
    ranButNoNewData: false,       // succeeded but scraped zero rows (source may have changed)
    health: 'never_run',          // healthy | stale | silently_failing | failing | never_run
  };
}

function daysAgo(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

/**
 * Classify a job AFTER all its rows are folded in. Distinguishes "ran clean but
 * found nothing" (source changed / nothing new) from genuine failures and
 * staleness — the three states the admin page must tell apart.
 */
function finalizeJob(job) {
  job.stale = daysAgo(job.lastSuccessfulRun) > STALE_JOB_DAYS;
  job.ranButNoNewData =
    job.lastStatus === 'success' && job.rowsInserted === 0 && job.rowsUpdated === 0;

  if (job.lastStatus === 'never_run') job.health = 'never_run';
  else if (job.lastStatus === 'failed') job.health = 'failing';
  else if (job.stale) job.health = 'stale';
  else if (job.ranButNoNewData) job.health = 'silently_failing'; // green run, zero data
  else job.health = 'healthy';
  return job;
}

async function hasColumn(pool, tableName, columnName) {
  const { rows } = await pool.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function readScraperRunLogs(pool) {
  const tableExists = await pool.query(
    `SELECT to_regclass('public.scraper_run_logs') IS NOT NULL AS exists`
  );
  if (!tableExists.rows[0]?.exists) return [];

  const hasRowsInserted = await hasColumn(pool, 'scraper_run_logs', 'rows_inserted');
  const hasRowsUpdated = await hasColumn(pool, 'scraper_run_logs', 'rows_updated');
  const hasRowsFailed = await hasColumn(pool, 'scraper_run_logs', 'rows_failed');
  const hasDuplicateSkips = await hasColumn(pool, 'scraper_run_logs', 'duplicate_skips');
  const hasSchemaMismatchFailures = await hasColumn(pool, 'scraper_run_logs', 'schema_mismatch_failures');
  const hasFinishedAt = await hasColumn(pool, 'scraper_run_logs', 'finished_at');

  const sql = `
    SELECT
      job_name,
      started_at,
      ${hasFinishedAt ? 'finished_at' : 'NULL::timestamptz AS finished_at'},
      status,
      COALESCE(${hasRowsInserted ? 'rows_inserted' : '0'}, 0) AS rows_inserted,
      COALESCE(${hasRowsUpdated ? 'rows_updated' : 'rows_upserted'}, 0) AS rows_modified,
      COALESCE(${hasRowsFailed ? 'rows_failed' : '0'}, 0) AS rows_failed,
      COALESCE(${hasDuplicateSkips ? 'duplicate_skips' : '0'}, 0) AS duplicate_skips,
      COALESCE(${hasSchemaMismatchFailures ? 'schema_mismatch_failures' : '0'}, 0) AS schema_mismatch_failures,
      COALESCE(error, '') AS error
    FROM scraper_run_logs
    ORDER BY started_at DESC
    LIMIT 500
  `;

  const { rows } = await pool.query(sql);
  return rows;
}

function buildJobHealth(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const name = row.job_name || 'unknown';
    if (!grouped.has(name)) grouped.set(name, blankJob(name));
    const job = grouped.get(name);

    if (!job.lastRunAt) {
      job.lastRunAt = toIso(row.started_at);
      job.lastStatus = row.status || 'unknown';
      job.executionDurationSeconds = secondsBetween(row.started_at, row.finished_at);
      job.rowsInserted = Number(row.rows_inserted || 0);
      job.rowsUpdated = Number(row.rows_modified || 0);
      job.rowsFailed = Number(row.rows_failed || 0);
      job.duplicateSkips = Number(row.duplicate_skips || 0);
      job.schemaMismatchFailures = Number(row.schema_mismatch_failures || 0);
    }

    if (!job.lastSuccessfulRun && row.status === 'success') {
      job.lastSuccessfulRun = toIso(row.started_at);
    }

    // First (most recent) run that actually moved data — lets us separate
    // "scraper ran" from "scraper found new data".
    if (!job.lastFoundDataAt &&
        (Number(row.rows_inserted || 0) > 0 || Number(row.rows_modified || 0) > 0)) {
      job.lastFoundDataAt = toIso(row.started_at);
    }

    if (row.status === 'failed' || (row.error && String(row.error).trim().length > 0)) {
      job.runtimeExceptions += 1;
    }
  }

  const jobs = Array.from(grouped.values())
    .map(finalizeJob)
    .sort((a, b) => String(a.jobName).localeCompare(String(b.jobName)));

  const summary = jobs.reduce((acc, job) => {
    acc.rowsInserted += job.rowsInserted;
    acc.rowsUpdated += job.rowsUpdated;
    acc.rowsFailed += job.rowsFailed;
    acc.duplicateSkips += job.duplicateSkips;
    acc.schemaMismatchFailures += job.schemaMismatchFailures;
    acc.runtimeExceptions += job.runtimeExceptions;
    return acc;
  }, {
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsFailed: 0,
    duplicateSkips: 0,
    schemaMismatchFailures: 0,
    runtimeExceptions: 0,
  });

  return { jobs, summary };
}

/**
 * Dataset-staleness rollup: what share of colleges has not been refreshed in
 * the last N days. Makes staleness measurable instead of trusting a static
 * "freshness 100%" badge. Best-effort across whichever institution table exists.
 *
 * @param {number} days  staleness threshold (default 30)
 */
async function getStalenessRollup(pool, days = STALE_DATA_DAYS) {
  const candidates = [
    { table: 'canonical.institutions', col: 'updated_at' },
    { table: 'colleges', col: 'last_scraped' },
    { table: 'colleges', col: 'updated_at' },
  ];

  for (const { table, col } of candidates) {
    try {
      const reg = await pool.query(`SELECT to_regclass($1) IS NOT NULL AS exists`, [table]);
      if (!reg.rows[0]?.exists) continue;
      const { rows } = await pool.query(
        `SELECT
           count(*)::int                                                          AS total,
           count(*) FILTER (WHERE ${col} IS NULL
              OR ${col} < now() - ($1 || ' days')::interval)::int                 AS stale
         FROM ${table}`,
        [days],
      );
      const total = Number(rows[0]?.total || 0);
      const stale = Number(rows[0]?.stale || 0);
      return {
        thresholdDays: days,
        source: `${table}.${col}`,
        totalColleges: total,
        staleColleges: stale,
        stalePercent: total > 0 ? Math.round((stale / total) * 1000) / 10 : null,
      };
    } catch {
      /* try next candidate */
    }
  }
  return { thresholdDays: days, source: null, totalColleges: 0, staleColleges: 0, stalePercent: null };
}

async function getScraperHealthSnapshot() {
  const pool = dbManager.getDatabase();
  const rows = await readScraperRunLogs(pool);
  const { jobs, summary } = buildJobHealth(rows);
  const staleness = await getStalenessRollup(pool);

  // Rollup of job health so the admin page can show a one-glance status.
  const healthCounts = jobs.reduce((acc, j) => {
    acc[j.health] = (acc[j.health] || 0) + 1;
    return acc;
  }, {});

  return {
    generatedAt: new Date().toISOString(),
    totalJobs: jobs.length,
    healthCounts,
    staleness,
    summary,
    jobs,
  };
}

module.exports = {
  getScraperHealthSnapshot,
  getStalenessRollup,
};

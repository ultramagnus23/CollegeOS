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

function blankJob(jobName) {
  return {
    jobName,
    lastSuccessfulRun: null,
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsFailed: 0,
    duplicateSkips: 0,
    schemaMismatchFailures: 0,
    runtimeExceptions: 0,
    executionDurationSeconds: null,
    lastStatus: 'never_run',
    lastRunAt: null,
  };
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
      COALESCE(${hasRowsUpdated ? 'rows_updated' : 'rows_upserted'}, 0) AS rows_updated,
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
      job.rowsUpdated = Number(row.rows_updated || 0);
      job.rowsFailed = Number(row.rows_failed || 0);
      job.duplicateSkips = Number(row.duplicate_skips || 0);
      job.schemaMismatchFailures = Number(row.schema_mismatch_failures || 0);
    }

    if (!job.lastSuccessfulRun && row.status === 'success') {
      job.lastSuccessfulRun = toIso(row.started_at);
    }

    if (row.status === 'failed' || (row.error && String(row.error).trim().length > 0)) {
      job.runtimeExceptions += 1;
    }
  }

  const jobs = Array.from(grouped.values()).sort((a, b) =>
    String(a.jobName).localeCompare(String(b.jobName))
  );

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

async function getScraperHealthSnapshot() {
  const pool = dbManager.getDatabase();
  const rows = await readScraperRunLogs(pool);
  const { jobs, summary } = buildJobHealth(rows);

  return {
    generatedAt: new Date().toISOString(),
    totalJobs: jobs.length,
    summary,
    jobs,
  };
}

module.exports = {
  getScraperHealthSnapshot,
};

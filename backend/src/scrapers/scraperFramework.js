'use strict';

const dbManager = require('../config/database');
const { idempotentUpsert } = require('../utils/idempotentUpsert');

// ============================================================================
// Scraper framework — the contract every live scraper plugs into. A scraper is
// an "adapter" that does the LIVE fetch + row shaping; the framework handles the
// idempotent, validated, logged write so refreshes are always safe to re-run and
// never silently overwrite. Source provenance is the adapter's responsibility
// (it shapes rows into whatever source-metadata columns the target table has).
//
// Adapter contract:
//   {
//     name, source, sourceUrl,            // identity + provenance
//     table, columns, conflictColumns,    // idempotentUpsert target
//     async fetchRows(ctx) -> object[],   // LIVE fetch; must NOT fabricate — skip
//                                         // rows it cannot source
//     validateRow(row) -> {valid, reason} // per-row guard
//     requireNewRows: boolean             // optional; default true — see success-gate
//   }
//   ctx = { pool, dryRun, limit, logger }
//
// Success-gate
// ------------
// A population/expansion scraper run is only a SUCCESS when it adds NEW rows
// (idempotentUpsert.inserted > 0). `updated` does NOT count: ON CONFLICT DO UPDATE
// reports an "update" even when the incoming row is byte-identical to what's
// already stored, so rows_updated is a meaningless freshness signal. A run that
// touches only existing rows added nothing and must surface as a failure so a
// broken/empty source can't masquerade as a green run.
//
// Opt out for verification-only re-runs with `requireNewRows: false` (per adapter)
// or `opts.requireNewRows = false` (per run). dry-runs never fail the gate.
// ============================================================================

async function runScraper(adapter, opts = {}) {
  const logger = opts.logger || console;
  const pool = opts.pool || dbManager.getDatabase();
  if (!adapter || typeof adapter.fetchRows !== 'function') {
    throw new Error('runScraper: adapter with fetchRows() is required');
  }

  logger.info(`[scraper:${adapter.name}] fetching from ${adapter.source}…`);
  const rows = await adapter.fetchRows({ pool, dryRun: !!opts.dryRun, limit: opts.limit, logger });
  const fetched = Array.isArray(rows) ? rows.length : 0;
  logger.info(`[scraper:${adapter.name}] fetched ${fetched} row(s)`);

  const stats = await idempotentUpsert({
    client: pool,
    table: adapter.table,
    columns: adapter.columns,
    conflictColumns: adapter.conflictColumns,
    rows: Array.isArray(rows) ? rows : [],
    validateRow: adapter.validateRow,
    label: adapter.name,
    dryRun: !!opts.dryRun,
    logger,
  });

  // Success-gate: keyed on `inserted` (new rows), never `updated`.
  const requireNewRows = opts.requireNewRows !== undefined
    ? !!opts.requireNewRows
    : (adapter.requireNewRows !== undefined ? !!adapter.requireNewRows : true);
  const newRows = stats.inserted || 0;
  const success = opts.dryRun ? true : (!requireNewRows || newRows > 0);

  if (!success) {
    logger.error(
      `[scraper:${adapter.name}] SUCCESS-GATE FAILED: added ${newRows} new rows ` +
      `(updated=${stats.updated}, rejected=${stats.rejected}, skipped=${stats.skipped}). ` +
      `rows_updated does not count toward success — the source produced no new data.`
    );
  }

  return {
    adapter: adapter.name,
    source: adapter.source,
    fetched,
    ...stats,
    requireNewRows,
    success,
  };
}

// Run several adapters and aggregate. Throws if any adapter fails its success-gate,
// so a CI/cron caller exits non-zero instead of reporting a hollow "success".
async function runScrapers(adapters, opts = {}) {
  const logger = opts.logger || console;
  const results = [];
  for (const adapter of adapters) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await runScraper(adapter, opts));
  }
  const failed = results.filter((r) => !r.success);
  const summary = {
    runs: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    totalInserted: results.reduce((a, r) => a + (r.inserted || 0), 0),
    results,
  };
  if (failed.length && !opts.dryRun && opts.throwOnFailure !== false) {
    const names = failed.map((r) => `${r.adapter}(+${r.inserted} new)`).join(', ');
    const err = new Error(`scraper success-gate failed for ${failed.length}/${results.length} adapter(s): ${names}`);
    err.summary = summary;
    throw err;
  }
  return summary;
}

module.exports = { runScraper, runScrapers };

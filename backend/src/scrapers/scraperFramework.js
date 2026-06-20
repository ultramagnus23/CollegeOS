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
//   }
//   ctx = { pool, dryRun, limit, logger }
// ============================================================================

async function runScraper(adapter, opts = {}) {
  const logger = opts.logger || console;
  const pool = opts.pool || dbManager.getDatabase();
  if (!adapter || typeof adapter.fetchRows !== 'function') {
    throw new Error('runScraper: adapter with fetchRows() is required');
  }

  logger.info(`[scraper:${adapter.name}] fetching from ${adapter.source}…`);
  const rows = await adapter.fetchRows({ pool, dryRun: !!opts.dryRun, limit: opts.limit, logger });
  logger.info(`[scraper:${adapter.name}] fetched ${Array.isArray(rows) ? rows.length : 0} row(s)`);

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

  return { adapter: adapter.name, source: adapter.source, fetched: Array.isArray(rows) ? rows.length : 0, ...stats };
}

module.exports = { runScraper };

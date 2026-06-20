'use strict';

// ============================================================================
// Reusable validated, idempotent, logged upsert — the anti-"silent overwrite"
// writer. Scrapers/seeders MUST write through this instead of a blind INSERT or
// UPDATE so that (a) malformed rows are rejected LOUDLY instead of corrupting the
// DB, (b) writes are idempotent (ON CONFLICT upsert, safe to re-run), and (c)
// every run reports inserted / updated / skipped / rejected counts.
//
// Distinguishing insert vs update uses Postgres' `xmax = 0` trick on the
// RETURNING row: a freshly-inserted tuple has xmax 0, an updated one does not.
// ============================================================================

function redactRow(row) {
  // Avoid logging large/free-text blobs; keep keys + short scalar previews.
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (v == null) { out[k] = null; continue; }
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    out[k] = s.length > 60 ? `${s.slice(0, 57)}…` : s;
  }
  return out;
}

/**
 * @param {object}   opts
 * @param {object}   opts.client            - pg client/pool with .query(sql, values)
 * @param {string}   opts.table             - fully-qualified table name
 * @param {string[]} opts.columns           - columns to write (order matters)
 * @param {string[]} opts.conflictColumns   - unique key for ON CONFLICT
 * @param {object[]} opts.rows              - row objects keyed by column name
 * @param {(row)=>{valid:boolean, reason?:string}} [opts.validateRow] - per-row validation
 * @param {object}   [opts.logger=console]
 * @param {string}   [opts.label]
 * @param {boolean}  [opts.dryRun=false]    - validate + log only, no writes
 * @returns {Promise<{total:number, inserted:number, updated:number, rejected:number, skipped:number}>}
 */
async function idempotentUpsert(opts) {
  const {
    client, table, columns, conflictColumns, rows,
    validateRow, logger = console, label = table, dryRun = false,
  } = opts;

  if (!client || !table || !Array.isArray(columns) || !columns.length || !Array.isArray(conflictColumns) || !conflictColumns.length) {
    throw new Error('idempotentUpsert: client, table, columns and conflictColumns are required');
  }
  const updateCols = columns.filter((c) => !conflictColumns.includes(c));
  if (!updateCols.length) {
    throw new Error('idempotentUpsert: at least one non-conflict column is required to upsert');
  }

  const colList = columns.join(', ');
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const updateSet = updateCols.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
  const sql =
    `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ` +
    `ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE SET ${updateSet} ` +
    `RETURNING (xmax = 0) AS inserted`;

  const stats = { total: Array.isArray(rows) ? rows.length : 0, inserted: 0, updated: 0, rejected: 0, skipped: 0 };

  for (const row of (Array.isArray(rows) ? rows : [])) {
    const verdict = validateRow ? validateRow(row) : { valid: true };
    if (!verdict || !verdict.valid) {
      stats.rejected += 1;
      logger.warn(`[${label}] REJECTED invalid row: ${verdict?.reason || 'failed validation'}`, redactRow(row));
      continue;
    }
    if (dryRun) { stats.skipped += 1; continue; }
    const values = columns.map((c) => (row[c] === undefined ? null : row[c]));
    try {
      const { rows: ret } = await client.query(sql, values);
      if (ret && ret[0] && ret[0].inserted) stats.inserted += 1;
      else stats.updated += 1;
    } catch (err) {
      stats.skipped += 1;
      logger.error(`[${label}] write FAILED (skipped, not silently overwritten): ${err.message}`, redactRow(row));
    }
  }

  logger.info(`[${label}] upsert ${dryRun ? '(dry-run) ' : ''}complete`, stats);
  return stats;
}

module.exports = { idempotentUpsert, redactRow };

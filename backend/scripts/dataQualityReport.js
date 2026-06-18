#!/usr/bin/env node
/**
 * dataQualityReport.js — Phase 9 data-quality engine runner.
 *
 * Queries canonical.v_data_quality_summary (migration 102), writes a Markdown
 * report to repo root (daily_data_quality_report.md), and records a snapshot
 * row in canonical.data_quality_snapshots for trend history.
 *
 * Usage: node backend/scripts/dataQualityReport.js
 * Exit code 1 if any HIGH-severity issues exist (so CI can gate on it).
 */
const fs = require('fs');
const path = require('path');
const dbManager = require('../src/config/database');

async function main() {
  dbManager.initialize();
  const pool = dbManager.getDatabase();

  // Total institutions for percentage context.
  const { rows: [{ total }] } = await pool.query(
    'SELECT count(*)::int AS total FROM canonical.institutions'
  );
  const { rows: summary } = await pool.query(
    'SELECT severity, category, issue_count FROM canonical.v_data_quality_summary'
  );
  const recorded = await pool.query('SELECT canonical.fn_snapshot_data_quality() AS rows');

  const bySev = { HIGH: [], MEDIUM: [], LOW: [] };
  for (const r of summary) (bySev[r.severity] || (bySev[r.severity] = [])).push(r);

  const pct = (n) => (total ? ((100 * n) / total).toFixed(1) + '%' : 'n/a');
  const now = new Date().toISOString();
  let md = `# Daily Data Quality Report\n\n`;
  md += `**Generated:** ${now}\n`;
  md += `**Institutions scanned:** ${total}\n`;
  md += `**Snapshot rows recorded:** ${recorded.rows[0].rows}\n\n`;

  const highTotal = bySev.HIGH.reduce((s, r) => s + Number(r.issue_count), 0);
  md += highTotal > 0
    ? `> ⛔ **${highTotal} HIGH-severity issues** — CI gate fails.\n\n`
    : `> ✅ No HIGH-severity issues.\n\n`;

  for (const sev of ['HIGH', 'MEDIUM', 'LOW']) {
    md += `## ${sev}\n\n`;
    if (!bySev[sev] || bySev[sev].length === 0) { md += `_none_\n\n`; continue; }
    md += `| Category | Count | % of institutions |\n|---|---:|---:|\n`;
    for (const r of bySev[sev]) {
      md += `| ${r.category} | ${r.issue_count} | ${pct(Number(r.issue_count))} |\n`;
    }
    md += `\n`;
  }

  const outPath = path.join(__dirname, '../../daily_data_quality_report.md');
  fs.writeFileSync(outPath, md, 'utf8');
  console.log(`Wrote ${outPath} (${summary.length} categories, ${highTotal} HIGH).`);

  await dbManager.close();
  process.exit(highTotal > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('dataQualityReport failed:', err.message);
  try { await dbManager.close(); } catch (_) {}
  process.exit(2);
});

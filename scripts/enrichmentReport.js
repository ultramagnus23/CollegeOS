#!/usr/bin/env node
/**
 * Prints enrichment completeness report.
 * Usage: node scripts/enrichmentReport.js
 *
 * DB access uses a direct pg connection (DATABASE_URL / SUPABASE_DB_URL) —
 * see scripts/enrichColleges.js for why (Supabase JS client fetch calls were
 * failing in CI).
 */

import pg from 'pg';

const { Client } = pg;

function pad(value, width) {
  const s = String(value);
  return s.length >= width ? s : `${s}${' '.repeat(width - s.length)}`;
}

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error('Missing required env var: DATABASE_URL or SUPABASE_DB_URL');
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const totalRes = await client.query(`SELECT COUNT(*)::int AS total FROM colleges`);
    const total = totalRes.rows[0].total;

    const avgRes = await client.query(`SELECT AVG(data_quality_score)::numeric AS avg_quality FROM colleges`);
    const avgQuality = Number(avgRes.rows[0]?.avg_quality || 0);

    const needsRes = await client.query(`SELECT COUNT(*)::int AS n FROM colleges WHERE needs_enrichment = true`);
    const needsEnrichment = needsRes.rows[0].n;

    const q70Res = await client.query(`SELECT COUNT(*)::int AS n FROM colleges WHERE data_quality_score >= 70`);
    const quality70Plus = q70Res.rows[0].n;

    const sourceRes = await client.query(`SELECT data_source FROM colleges`);
    const bySource = sourceRes.rows.reduce((acc, row) => {
      const key = row.data_source || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    console.log('\nCollege Enrichment Report');
    console.log('='.repeat(72));
    console.log(`${pad('Metric', 44)} | ${pad('Value', 24)}`);
    console.log('-'.repeat(72));
    console.log(`${pad('Total colleges', 44)} | ${pad(total ?? 0, 24)}`);
    console.log(`${pad('Average data_quality_score', 44)} | ${pad(avgQuality.toFixed(2), 24)}`);
    console.log(`${pad('needs_enrichment = true', 44)} | ${pad(needsEnrichment ?? 0, 24)}`);
    console.log(`${pad('quality_score >= 70', 44)} | ${pad(quality70Plus ?? 0, 24)}`);
    console.log('-'.repeat(72));
    console.log('Counts by data_source');
    Object.entries(bySource)
      .sort((a, b) => b[1] - a[1])
      .forEach(([source, count]) => {
        console.log(`  - ${pad(source, 28)} ${count}`);
      });
    console.log('='.repeat(72));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Failed to generate enrichment report:', err.message);
  process.exit(1);
});

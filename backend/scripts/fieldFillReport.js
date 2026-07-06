'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const TABLES = process.argv.slice(2).length ? process.argv.slice(2) : [
  'institutions', 'institution_admissions', 'institution_financials', 'institution_outcomes',
  'institution_programs', 'institution_campus_life', 'institution_demographics',
  'institution_rankings', 'institution_deadlines', 'institution_requirements',
  'institution_placements', 'institution_quality_scores', 'masters_programs',
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  for (const table of TABLES) {
    const totalRes = await pool.query(`SELECT COUNT(*) FROM canonical.${table}`);
    const total = parseInt(totalRes.rows[0].count, 10);
    console.log(`\n=== canonical.${table} (${total} rows) ===`);
    if (total === 0) continue;
    const colsRes = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='canonical' AND table_name=$1 ORDER BY ordinal_position`,
      [table]
    );
    const selects = colsRes.rows.map((c) => `COUNT(${JSON.stringify(c.column_name).replace(/"/g, '"')}) AS "${c.column_name}"`).join(', ');
    const r = await pool.query(`SELECT ${selects} FROM canonical.${table}`);
    const row = r.rows[0];
    for (const c of colsRes.rows) {
      const filled = parseInt(row[c.column_name], 10);
      const pct = total > 0 ? ((100 * filled) / total).toFixed(1) : '0.0';
      console.log(`  ${c.column_name.padEnd(30)} ${String(filled).padStart(6)}/${total}  ${pct}%`);
    }
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

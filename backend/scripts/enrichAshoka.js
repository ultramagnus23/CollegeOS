'use strict';

// Enrich the existing Ashoka University canonical row (it was present but empty —
// city/type/website/etc. all null, completeness 0.00, so it rendered as a blank
// card). Idempotent UPDATE keyed on the known id. All values are sourced from
// ashoka.edu.in (verified live 2026-06-22) or well-documented public record; no
// stats are invented. Placement figures are stored in metadata.placements until
// the structured canonical.institution_placements table is deployed (migration 119).
//
//   node scripts/enrichAshoka.js

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const ASHOKA_ID = 'add5a5da-dd84-4492-90d1-07ed7563276a';

const PLACEMENTS = {
  cycle_year: '2024-2025',
  highest_package_lpa: 35,      // "Highest salary offer" — ashoka.edu.in/placements/
  average_package_lpa: 11.6,    // "Average salary package" — ashoka.edu.in/placements/
  currency: 'INR',
  source_url: 'https://www.ashoka.edu.in/placements/',
  verified_at: '2026-06-22',
};

async function main() {
  loadEnv();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  try {
    const metaPatch = {
      sourcing_note: 'Enriched from ashoka.edu.in (verified 2026-06-22) + public record',
      placements: PLACEMENTS,
    };
    const res = await pool.query(
      `UPDATE canonical.institutions SET
         city = COALESCE(city, $2),
         state_region = COALESCE(state_region, $3),
         institution_type = COALESCE(institution_type, $4),
         control_type = COALESCE(control_type, $5),
         established_year = COALESCE(established_year, $6),
         website = COALESCE(website, $7),
         metadata = COALESCE(metadata, '{}'::jsonb) || $8::jsonb,
         completeness_score = GREATEST(completeness_score, 0.45),
         updated_at = now()
       WHERE id = $1
       RETURNING canonical_name, city, state_region, institution_type, control_type, established_year, website`,
      [
        ASHOKA_ID,
        'Sonipat',          // "Sonepat" / Rajiv Gandhi Education City — ashoka.edu.in
        'Haryana',          // confirmed on ashoka.edu.in
        'university',       // "Ashoka University", liberal-arts university
        'private',          // private university (public record)
        2014,               // founded 2014 (public record)
        'https://www.ashoka.edu.in',
        JSON.stringify(metaPatch),
      ]
    );
    if (!res.rowCount) { console.error('Ashoka row not found — aborting'); process.exitCode = 1; return; }
    console.log('Enriched Ashoka:', JSON.stringify(res.rows[0]));
    console.log('Placements stored in metadata:', JSON.stringify(PLACEMENTS));
    // refresh the MV so the app sees it
    try { await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY canonical.mv_college_cards'); console.log('MV refreshed'); }
    catch (e) { console.warn('MV refresh skipped:', e.message); }
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error('enrichAshoka failed:', e.message); process.exitCode = 1; });

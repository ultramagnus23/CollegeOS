'use strict';

// Runner for the US official-source requirements scraper.
//   node scripts/runRequirementsScraper.js --dry-run
//   node scripts/runRequirementsScraper.js
// Exits non-zero if the success-gate fails (no NEW rows added).

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { runScrapers } = require('../src/scrapers/scraperFramework');
const { adapter } = require('../src/scrapers/adapters/usOfficialRequirements');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes('--dry-run');
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 3 });
  try {
    const summary = await runScrapers([adapter], { pool, dryRun, logger: console });
    console.log('\n=== SUMMARY ===\n' + JSON.stringify(summary, null, 2));
    process.exitCode = summary.failed > 0 && !dryRun ? 1 : 0;
  } catch (err) {
    console.error('\n=== SCRAPER FAILED ===\n' + err.message);
    if (err.summary) console.error(JSON.stringify(err.summary, null, 2));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();

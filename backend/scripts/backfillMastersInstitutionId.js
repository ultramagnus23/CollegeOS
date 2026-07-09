'use strict';

// Backfills canonical.masters_programs.canonical_institution_id (0% filled)
// by exact normalized name match against canonical.institutions. Needed so
// masters_programs rows can be enriched by other scripts that key off a real
// institution_id (e.g. Scorecard field-of-study earnings). Ambiguous names
// (matching >1 institution) are skipped rather than guessed.
//
// Usage: node scripts/backfillMastersInstitutionId.js [--dry-run]

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const DRY = process.argv.includes('--dry-run');
const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function main() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

  const { rows: insts } = await pool.query('SELECT id, canonical_name FROM canonical.institutions');
  const byName = new Map();
  for (const row of insts) {
    const key = normalize(row.canonical_name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(row.id);
  }

  const { rows: programs } = await pool.query(
    'SELECT id, institution_name FROM canonical.masters_programs WHERE canonical_institution_id IS NULL'
  );
  console.log(`${programs.length} masters_programs rows missing canonical_institution_id`);

  let updated = 0;
  let ambiguous = 0;
  let unmatched = 0;
  for (const prog of programs) {
    const cands = byName.get(normalize(prog.institution_name));
    if (!cands) { unmatched++; continue; } // eslint-disable-line no-continue
    if (cands.length > 1) { ambiguous++; continue; } // eslint-disable-line no-continue
    if (DRY) { updated++; continue; } // eslint-disable-line no-continue
    // eslint-disable-next-line no-await-in-loop
    await pool.query('UPDATE canonical.masters_programs SET canonical_institution_id = $1, updated_at = now() WHERE id = $2', [cands[0], prog.id]);
    updated++;
  }

  console.log(`Done. matched=${updated} ambiguous(skipped)=${ambiguous} unmatched(skipped)=${unmatched} dryRun=${DRY}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

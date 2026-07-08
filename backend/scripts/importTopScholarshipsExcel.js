'use strict';
/**
 * Imports records extracted by extract_top_scholarships.py into the canonical
 * `scholarships` table. See extract_top_scholarships.py's header for the
 * no-fabrication data-integrity stance on the source sheet's deadline/amount fields.
 *
 * Dedupes against existing rows by normalized name (case/whitespace/punctuation
 * insensitive) so re-running is safe and doesn't create near-duplicates of rows
 * already in `scholarships` (e.g. this sheet's "Knight - Hennessy Scholarship" vs.
 * the existing "Knight-Hennessy Scholars").
 *
 * Usage:
 *   python scripts/extract_top_scholarships.py "<xlsx path>" scripts/tmp_scholarships.json
 *   node scripts/importTopScholarshipsExcel.js [--dry-run] scripts/tmp_scholarships.json
 */

const fs = require('fs');
const dbManager = require('../src/config/database');

const DRY = process.argv.includes('--dry-run');
const jsonPath = process.argv.find((a) => a.endsWith('.json'));
const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function main() {
  if (!jsonPath) { console.error('Usage: node importTopScholarshipsExcel.js [--dry-run] <path.json>'); process.exit(1); }
  const records = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Loaded ${records.length} scholarship records.`);

  const pool = dbManager.getDatabase();
  const { rows: existing } = await pool.query('SELECT name FROM scholarships');
  const existingNorm = new Set(existing.map((e) => normalize(e.name)));

  let skippedDupe = 0;
  const toInsert = [];
  for (const rec of records) {
    if (existingNorm.has(normalize(rec.name))) { skippedDupe++; continue; } // eslint-disable-line no-continue
    existingNorm.add(normalize(rec.name));
    toInsert.push(rec);
  }

  console.log(`${toInsert.length} new, ${skippedDupe} already present (skipped).`);
  if (DRY) {
    console.log('--dry-run: not writing. Sample of what would be inserted:');
    toInsert.slice(0, 3).forEach((r) => console.log(JSON.stringify(r, null, 1)));
    return;
  }

  let inserted = 0;
  for (const rec of toInsert) {
    await pool.query(
      `INSERT INTO scholarships (name, provider, description, eligibility_summary, application_url, status, scraped_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [rec.name, rec.provider, rec.description, rec.eligibility_summary, rec.application_url, rec.status],
    );
    inserted++;
  }
  console.log(`Inserted ${inserted} new scholarships.`);
}

main().catch((e) => { console.error(e); process.exit(1); });

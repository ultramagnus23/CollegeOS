'use strict';

// Backfills canonical.institutions.international_pct and international_enrollment
// from canonical.institution_demographics.percent_international -- real IPEDS/Scorecard-
// sourced data that already exists in the demographics table (5,602 institutions as of
// 2026-07-10) but was never copied up to the institutions table, which has these columns
// at 0% fill. Uses the most recent data_year row per institution.
//
// international_pct is copied directly (already a 0-1 fraction).
// international_enrollment is only computed when institutions.total_enrollment is
// present (international_pct * total_enrollment, rounded), so we never invent a
// student count without a real enrollment denominator.
//
// Only fills currently-NULL columns -- never overwrites existing values.
//
// Usage: node scripts/backfillInternationalPctFromDemographics.js [--dry-run]

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const DRY = process.argv.includes('--dry-run');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (d.institution_id)
      d.institution_id, d.percent_international, d.data_year,
      i.international_pct, i.international_enrollment, i.total_enrollment
    FROM canonical.institution_demographics d
    JOIN canonical.institutions i ON i.id = d.institution_id
    WHERE d.percent_international IS NOT NULL
      AND (i.international_pct IS NULL OR i.international_enrollment IS NULL)
    ORDER BY d.institution_id, d.data_year DESC
  `);

  console.log(`Candidates: ${rows.length} institutions with real percent_international and a NULL target column`);

  let pctUpdates = 0;
  let enrollUpdates = 0;

  for (const r of rows) {
    const pct = Number(r.percent_international);
    if (Number.isNaN(pct) || pct < 0 || pct > 1) continue;

    const setParts = [];
    const params = [];
    if (r.international_pct === null) {
      params.push(pct);
      setParts.push(`international_pct = $${params.length}`);
    }
    if (r.international_enrollment === null && r.total_enrollment) {
      const enrollment = Math.round(pct * r.total_enrollment);
      params.push(enrollment);
      setParts.push(`international_enrollment = $${params.length}`);
    }
    if (setParts.length === 0) continue;

    if (setParts.some((s) => s.startsWith('international_pct'))) pctUpdates++;
    if (setParts.some((s) => s.startsWith('international_enrollment'))) enrollUpdates++;

    if (DRY) continue;

    params.push(r.institution_id);
    await pool.query(
      `UPDATE canonical.institutions SET ${setParts.join(', ')}, updated_at = now() WHERE id = $${params.length}`,
      params
    );
  }

  console.log(`international_pct would be set on: ${pctUpdates}`);
  console.log(`international_enrollment would be set on: ${enrollUpdates}`);
  if (DRY) console.log('[DRY RUN] no writes performed');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

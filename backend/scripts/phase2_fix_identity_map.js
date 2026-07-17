// Phase 2 schema-fix: backfills canonical.institution_identity_map rows for target-list
// institutions that have no identity-map entry at all (Phase 1 audit found 1,370 institutions
// dataset-wide with this gap; this fixes it for the ~382 in data/top_colleges_target.json only,
// per the scoped decision -- the long tail is a separate follow-up).
//
// These institutions have a real canonical.institutions row but never went through the
// staging-match pipeline (backend/migrations/079) that normally populates this table, so there's
// no external source record to attribute. Uses source_tier='inferred_generated' (lowest priority)
// and source_table='canonical.institutions' (self-referential) to be honest that this is a
// backfill, not a real external source match -- consistent with the enum's existing tiers.
//
// Idempotent: ON CONFLICT (source_table, source_pk) DO NOTHING (a real source record for this
// institution, if one shows up later, should not be clobbered by this backfill).
// Run: node scripts/phase2_fix_identity_map.js [--dry-run]

const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const target = JSON.parse(fs.readFileSync('../data/top_colleges_target.json', 'utf8'));
  let inserted = 0, skipped = 0;

  for (const inst of target.institutions) {
    const existing = await pool.query(
      `SELECT 1 FROM canonical.institution_identity_map WHERE canonical_institution_id = $1`,
      [inst.institution_id]
    );
    if (existing.rows.length) { skipped++; continue; }

    console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}INSERT identity_map: ${inst.canonical_name} (${inst.institution_id})`);
    if (!DRY_RUN) {
      await pool.query(`
        INSERT INTO canonical.institution_identity_map (
          institution_id, canonical_institution_id, source_table, source_pk,
          source_tier, source_priority, match_method, match_score, is_canonical_match, raw_payload
        ) VALUES ($1::uuid, $1::uuid, 'canonical.institutions', $1::text, 'inferred_generated', 6, 'canonical_self_backfill', 1, true, '{}'::jsonb)
        ON CONFLICT (source_table, source_pk) DO NOTHING
      `, [inst.institution_id]);
    }
    inserted++;
  }

  console.log(`\nInserted: ${inserted}, Already present: ${skipped}`);
  await pool.end();
}
main();

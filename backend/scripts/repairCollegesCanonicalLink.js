// backend/scripts/repairCollegesCanonicalLink.js
//
// Phase 1 of the colleges -> canonical.institutions identity consolidation.
// public.colleges.canonical_institution_id is 100% filled but 100% dangling
// -- every value points at a UUID from a canonical.institutions generation
// that no longer exists (colleges was last synced 2026-05-14; canonical.
// institutions has been rebuilt/reseeded since, with fresh UUIDs for the
// same real-world institutions).
//
// This has no unique/FK constraint of its own (verified), so it's safe to
// repair directly rather than fight canonical.institution_identity_map's
// table-wide UNIQUE(canonical_institution_id) constraint, which is already
// claimed for most real institutions by colleges_comprehensive's separate
// 8,329/8,330 mapping.
//
// Deterministic only: exact case-insensitive name match against
// canonical.institutions, non-deprecated rows only, and only auto-applied
// when the name matches EXACTLY ONE institution (unambiguous). Ambiguous
// (2+ candidates) and unmatched rows are set to NULL rather than left
// pointing at a stale/wrong UUID -- explicit "no match yet" beats silently
// wrong data every time a join is attempted against it.
//
// Usage: node scripts/repairCollegesCanonicalLink.js [--dry-run]

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const matches = await client.query(`
      select c.id as legacy_id, c.name as college_name, array_agg(distinct i.id) as institution_ids
      from public.colleges c
      join canonical.institutions i
        on lower(trim(i.canonical_name)) = lower(trim(c.name))
       and i.deprecated_duplicate_of is null
      group by c.id, c.name
    `);

    const unambiguous = matches.rows.filter((r) => r.institution_ids.length === 1);
    const ambiguous = matches.rows.filter((r) => r.institution_ids.length > 1);
    const totalColleges = (await client.query('select count(*)::int as c from public.colleges')).rows[0].c;
    const matchedIds = new Set(matches.rows.map((r) => r.legacy_id));
    const unmatchedCount = totalColleges - matchedIds.size;

    console.log(`Total colleges: ${totalColleges}`);
    console.log(`Unambiguous exact-name matches (will be set): ${unambiguous.length}`);
    console.log(`Ambiguous, 2+ candidates (will be nulled, not guessed): ${ambiguous.length}`);
    console.log(`Unmatched, no candidate (will be nulled): ${unmatchedCount}`);

    if (ambiguous.length) {
      console.log('\nAmbiguous rows (need manual review before they can be linked):');
      for (const a of ambiguous) console.log(`  - college.id=${a.legacy_id} "${a.college_name}" -> ${a.institution_ids.length} candidates`);
    }

    if (DRY_RUN) {
      console.log('\n[DRY RUN] no writes performed');
      await client.query('ROLLBACK');
      return;
    }

    // Null everything first (explicit "unknown" beats stale-wrong data), then set the verified matches.
    const nulled = await client.query(`update public.colleges set canonical_institution_id = null`);
    console.log(`\nNulled ${nulled.rowCount} rows.`);

    let written = 0;
    for (const m of unambiguous) {
      await client.query(
        `update public.colleges set canonical_institution_id = $1 where id = $2`,
        [m.institution_ids[0], m.legacy_id]
      );
      written += 1;
    }
    console.log(`Set canonical_institution_id on ${written} rows.`);

    await client.query('COMMIT');
    console.log('COMMITTED');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ERROR:', e.message);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

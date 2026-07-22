// Phase 2 schema-fix: merges the 71 same-canonical_name + same-country_code duplicate groups
// found in the Phase 1 audit (docs/data_audit_2026-07-16.md #3.1) -- 74 extra rows, mostly DE/KR/
// GB/CA institutions from the non-US enrichment pass that a prior dedup (migrations 132/146)
// didn't catch. Unlike the flagship merges (phase2_dedupe_flagships.js), these pairs share the
// exact same canonical_name AND country_code, so there's no name-ambiguity risk -- the only
// judgment call is which row survives. Survivor = whichever row in the group has more populated
// core fields (city, website, institution_type, founded_year, non-empty external ids); ties break
// on lowest id (stable, arbitrary but deterministic).
//
// Idempotent: WHERE deprecated_duplicate_of IS NULL, safe to re-run.
// Run: node scripts/phase2_dedupe_same_name_same_country.js [--dry-run]

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const DRY_RUN = process.argv.includes('--dry-run');

function score(row) {
  let s = 0;
  if (row.city) s++;
  if (row.website) s++;
  if (row.institution_type) s++;
  if (row.founded_year) s++;
  if (row.canonical_external_ids && Object.keys(row.canonical_external_ids).length > 0) s += 2;
  return s;
}

async function main() {
  const groups = await pool.query(`
    SELECT canonical_name, country_code, array_agg(id) ids
    FROM canonical.institutions
    WHERE deprecated_duplicate_of IS NULL
    GROUP BY canonical_name, country_code
    HAVING count(*) > 1
    ORDER BY canonical_name
  `);

  let mergeCount = 0, groupCount = 0;

  for (const g of groups.rows) {
    const rows = await pool.query(`
      SELECT id, city, website, institution_type, founded_year, canonical_external_ids
      FROM canonical.institutions WHERE id = ANY($1)
    `, [g.ids]);

    const scored = rows.rows.map(r => ({ ...r, s: score(r) }));
    scored.sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1));
    const survivor = scored[0];
    const dupes = scored.slice(1);

    groupCount++;
    for (const d of dupes) {
      console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}MERGE: ${g.canonical_name} [${g.country_code}] (${d.id}, score ${d.s}) -> (${survivor.id}, score ${survivor.s})`);
      if (!DRY_RUN) {
        await pool.query(
          `UPDATE canonical.institutions SET deprecated_duplicate_of=$1, deprecated_at=now() WHERE id=$2 AND deprecated_duplicate_of IS NULL`,
          [survivor.id, d.id]
        );
      }
      mergeCount++;
    }
  }

  console.log(`\nGroups processed: ${groupCount}, rows merged: ${mergeCount}`);

  if (!DRY_RUN && mergeCount > 0) {
    console.log('Refreshing canonical.mv_college_cards...');
    await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY canonical.mv_college_cards`);
    console.log('Done.');
  }

  await pool.end();
}
main();

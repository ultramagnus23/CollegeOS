// Phase 2 schema-fix: merges the 50 confirmed QS-ranked "master" duplicate rows into their
// real College-Scorecard-linked counterpart, and attaches a verified IPEDS id directly to the
// 5 flagship rows that have no Scorecard-linked duplicate in this DB at all. Every pairing below
// was individually verified against the College Scorecard API (by IPEDS UnitID, cross-checked by
// city) -- not by name-similarity alone, since trigram/name-fuzzy matching produced false
// positives during investigation (e.g. "Miami University" vs "University of Miami", "Purdue
// University" vs "Purdue University Global", "University of Idaho" vs "Idaho State University").
// See docs/data_audit_2026-07-16.md Phase 2 section for the investigation.
//
// Idempotent: uses UPDATE ... WHERE deprecated_duplicate_of IS NULL, safe to re-run.
// Run: node scripts/phase2_dedupe_flagships.js [--dry-run]

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const DRY_RUN = process.argv.includes('--dry-run');

// [masterName, survivorName] -- survivor is the row carrying real Scorecard data (admissions/
// financials/outcomes); master is the QS-ranked row with no IPEDS id that gets soft-deprecated.
const MERGES = [
  ['Columbia University', 'Columbia University in the City of New York'],
  ['University of California, Berkeley', 'University of California-Berkeley'],
  ['University of California, Los Angeles', 'University of California-Los Angeles'],
  ['University of Michigan, Ann Arbor', 'University of Michigan-Ann Arbor'],
  ['University of Virginia', 'University of Virginia-Main Campus'],
  ['University of California, San Diego', 'University of California-San Diego'],
  ['University of Texas at Austin', 'The University of Texas at Austin'],
  ['Georgia Institute of Technology', 'Georgia Institute of Technology-Main Campus'],
  ['University of California, Davis', 'University of California-Davis'],
  ['University of California, Irvine', 'University of California-Irvine'],
  ['University of California, Santa Barbara', 'University of California-Santa Barbara'],
  ['Ohio State University', 'Ohio State University-Main Campus'],
  ['University of Washington', 'University of Washington-Seattle Campus'],
  ['Purdue University', 'Purdue University-Main Campus'],
  ['University of Maryland, College Park', 'University of Maryland-College Park'],
  ['Rutgers University', 'Rutgers University-New Brunswick'],
  ['Tulane University', 'Tulane University of Louisiana'],
  ['Texas A&M University, College Station', 'Texas A&M University-College Station'],
  ['University of Pittsburgh', 'University of Pittsburgh-Pittsburgh Campus'],
  ['Pennsylvania State University', 'Pennsylvania State University-Main Campus'],
  ['Indiana University Bloomington', 'Indiana University-Bloomington'],
  ['University of Minnesota - Twin Cities', 'University of Minnesota-Twin Cities'],
  ['Arizona State University', 'Arizona State University Campus Immersion'],
  ['University of Tennessee, Knoxville', 'The University of Tennessee-Knoxville'],
  ['Virginia Tech', 'Virginia Polytechnic Institute and State University'],
  ['North Carolina State University', 'North Carolina State University at Raleigh'],
  ['University of California, Santa Cruz', 'University of California-Santa Cruz'],
  ['University of California, Riverside', 'University of California-Riverside'],
  ['University of California, Merced', 'University of California-Merced'],
  ['University of Massachusetts Amherst', 'University of Massachusetts-Amherst'],
  ['College of William & Mary', 'William & Mary'],
  ['University of New Hampshire', 'University of New Hampshire-Main Campus'],
  ['Colorado State University', 'Colorado State University-Fort Collins'],
  ['University of Missouri–Columbia', 'University of Missouri-Columbia'],
  ['University of Oklahoma, Norman', 'University of Oklahoma-Norman Campus'],
  ['Oklahoma State University', 'Oklahoma State University-Main Campus'],
  ['University of Cincinnati', 'University of Cincinnati-Main Campus'],
  ['Kent State University', 'Kent State University at Kent'],
  ['Bowling Green State University', 'Bowling Green State University-Main Campus'],
  ['Miami University', 'Miami University-Oxford'],
  ['University of Akron', 'University of Akron Main Campus'],
  ['Wright State University', 'Wright State University-Main Campus'],
  ['University of Maryland, Baltimore County', 'University of Maryland-Baltimore County'],
  ['University of Montana', 'The University of Montana'],
  ['New Mexico State University', 'New Mexico State University-Main Campus'],
  ['University of New Mexico', 'University of New Mexico-Main Campus'],
  ['North Dakota State University', 'North Dakota State University-Main Campus'],
  ['University of Massachusetts Boston', 'University of Massachusetts-Boston'],
  ['University of Massachusetts Lowell', 'University of Massachusetts-Lowell'],
  ['Catholic University of America', 'The Catholic University of America'],
];

// [masterName, verifiedIpedsId] -- no duplicate row exists in this DB; attach the real IPEDS id
// directly to the only row representing this institution so a future Scorecard refresh can find it.
const ENRICH = [
  ['Northwestern University', '147767'],
  ['Cornell University', '190415'],
  ['Boston College', '164924'],
  ['University of Idaho', '142285'],
  ['University of Central Florida', '132903'],
];

async function main() {
  let mergeCount = 0, enrichCount = 0, skipCount = 0;

  for (const [masterName, survivorName] of MERGES) {
    const master = await pool.query(`SELECT id, deprecated_duplicate_of FROM canonical.institutions WHERE canonical_name=$1`, [masterName]);
    const survivor = await pool.query(`SELECT id FROM canonical.institutions WHERE canonical_name=$1 AND deprecated_duplicate_of IS NULL`, [survivorName]);
    if (!master.rows.length || !survivor.rows.length) {
      console.log(`SKIP (not found): ${masterName} -> ${survivorName}`);
      skipCount++;
      continue;
    }
    if (master.rows[0].deprecated_duplicate_of) {
      console.log(`SKIP (already merged): ${masterName}`);
      skipCount++;
      continue;
    }
    console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}MERGE: ${masterName} (${master.rows[0].id}) -> ${survivorName} (${survivor.rows[0].id})`);
    if (!DRY_RUN) {
      await pool.query(
        `UPDATE canonical.institutions SET deprecated_duplicate_of=$1, deprecated_at=now() WHERE id=$2 AND deprecated_duplicate_of IS NULL`,
        [survivor.rows[0].id, master.rows[0].id]
      );
    }
    mergeCount++;
  }

  for (const [masterName, ipeds] of ENRICH) {
    const master = await pool.query(`SELECT id, canonical_external_ids->>'ipeds' AS ipeds FROM canonical.institutions WHERE canonical_name=$1 AND deprecated_duplicate_of IS NULL`, [masterName]);
    if (!master.rows.length) { console.log(`SKIP (not found): ${masterName}`); skipCount++; continue; }
    if (master.rows[0].ipeds === ipeds) { console.log(`SKIP (already enriched): ${masterName}`); skipCount++; continue; }
    console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}ENRICH: ${masterName} (${master.rows[0].id}) <- ipeds ${ipeds}`);
    if (!DRY_RUN) {
      await pool.query(
        `UPDATE canonical.institutions SET canonical_external_ids = COALESCE(canonical_external_ids, '{}'::jsonb) || jsonb_build_object('ipeds', $1::text) WHERE id=$2`,
        [ipeds, master.rows[0].id]
      );
    }
    enrichCount++;
  }

  console.log(`\nMerged: ${mergeCount}, Enriched: ${enrichCount}, Skipped: ${skipCount}`);

  if (!DRY_RUN && mergeCount > 0) {
    console.log('Refreshing canonical.mv_college_cards...');
    await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY canonical.mv_college_cards`);
    console.log('Done.');
  }

  await pool.end();
}
main();

'use strict';

// Second pass on canonical.masters_programs.canonical_institution_id backfill.
// The exact-normalized-name pass (backfillMastersInstitutionId.js, run 2026-07-05)
// matched 251/648 rows and plateaued -- the other 397 fail exact match for one of
// three real reasons, handled differently here:
//
//   1. Cosmetic variance ("The University of Cambridge" vs "University of
//      Cambridge", trailing "- Department of X" qualifiers). Fixed by stripping a
//      small, explicit set of prefixes/suffixes before comparing -- NOT a fuzzy
//      threshold, so it can't misfire.
//   2. Common-name aliases for schools whose canonical_name is the parent
//      university (Chicago Booth -> University of Chicago, MIT Sloan -> MIT,
//      Kellogg -> Northwestern). A short, manually-verified alias map -- adding an
//      entry here means a human confirmed the mapping, not a guess.
//   3. Genuinely ambiguous or non-institutional names (multi-university consortia
//      like GEMMA Erasmus Mundus, or names with no canonical match at all). These
//      are correctly left NULL -- do not guess. Fuzzy trigram similarity is
//      DELIBERATELY NOT used here: at this dataset's size a similarity threshold
//      loose enough to catch real matches also mismatches sibling institutions
//      (e.g. "University of Washington" vs "Washington University in St. Louis"),
//      and a wrong institution_id is worse than a missing one.
//
// Usage: node scripts/backfillMastersInstitutionIdFuzzy.js [--dry-run]

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const DRY = process.argv.includes('--dry-run');
const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Verified aliases: common/short program name -> the institution's canonical_name.
// Extend only with names you've manually confirmed against canonical.institutions.
const ALIASES = {
  'chicago booth': 'University of Chicago',
  'kellogg': 'Northwestern University',
  'mit sloan': 'Massachusetts Institute of Technology',
  'wharton': 'University of Pennsylvania',
  'haas': 'University of California, Berkeley',
  'stern': 'New York University',
  'sloan school of management': 'Massachusetts Institute of Technology',
  'harvard kennedy school': 'Harvard University',
  'hks': 'Harvard University',
};

function stripQualifiers(name) {
  return String(name || '')
    .replace(/^the\s+/i, '')
    .replace(/\s*-\s*(department|school|faculty|college)\s+of\s+.+$/i, '')
    .trim();
}

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
  console.log(`${programs.length} masters_programs rows still missing canonical_institution_id`);

  let updated = 0, ambiguous = 0, unmatched = 0;
  const unmatchedSample = [];

  for (const prog of programs) {
    // Pass A: alias map (lowercase substring match against the raw name)
    const lower = String(prog.institution_name || '').toLowerCase();
    let cands = null;
    for (const [alias, canonicalName] of Object.entries(ALIASES)) {
      if (lower.includes(alias)) {
        cands = byName.get(normalize(canonicalName)) || null;
        break;
      }
    }
    // Pass B: qualifier-stripped exact match
    if (!cands) cands = byName.get(normalize(stripQualifiers(prog.institution_name)));

    if (!cands) { unmatched++; if (unmatchedSample.length < 20) unmatchedSample.push(prog.institution_name); continue; } // eslint-disable-line no-continue
    if (cands.length > 1) { ambiguous++; continue; } // eslint-disable-line no-continue
    if (DRY) { updated++; continue; } // eslint-disable-line no-continue
    // eslint-disable-next-line no-await-in-loop
    await pool.query('UPDATE canonical.masters_programs SET canonical_institution_id = $1, updated_at = now() WHERE id = $2', [cands[0], prog.id]);
    updated++;
  }

  console.log(`Done. matched=${updated} ambiguous(skipped)=${ambiguous} unmatched(skipped)=${unmatched} dryRun=${DRY}`);
  if (unmatchedSample.length) {
    console.log('Sample still-unmatched names (real data gaps -- add to ALIASES only after verifying, or leave NULL):');
    unmatchedSample.forEach((n) => console.log('  -', n));
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

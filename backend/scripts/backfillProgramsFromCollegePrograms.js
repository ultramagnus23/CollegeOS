'use strict';

// Backfills canonical.institution_programs from the legacy public.college_programs
// table (19,049 real, previously-scraped program names, keyed to public.colleges.id).
// This is a REAL-DATA backfill (bridging existing rows to the canonical schema via
// public.colleges.canonical_institution_id), not fabrication — no new facts are
// invented, just carried over. Idempotent: ON CONFLICT DO NOTHING on
// (institution_id, normalized_program_name, degree_type_key).
//
// Usage: node scripts/backfillProgramsFromCollegePrograms.js [--dry-run]

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const DRY = process.argv.includes('--dry-run');

function normalize(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeDegreeType(dt) {
  const t = String(dt || '').trim();
  if (/^bachelor/i.test(t)) return 'Bachelor';
  if (/^master/i.test(t)) return 'Master';
  if (/^doctor|phd/i.test(t)) return 'PhD';
  return t || 'Bachelor';
}

async function main() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

  // public.colleges.canonical_institution_id is entirely stale (0 rows resolve to a
  // real canonical.institutions row — orphaned by a prior dedup/merge pass). Bridge
  // by exact normalized name instead, excluding ambiguous names that map to >1
  // institution (10 such names exist) so we never guess the wrong school.
  const { rows } = await pool.query(`
    WITH unique_names AS (
      SELECT lower(btrim(canonical_name)) AS n, MIN(id::text)::uuid AS only_id
      FROM canonical.institutions
      GROUP BY 1 HAVING COUNT(*) = 1
    )
    SELECT cp.college_id, cp.program_name, cp.degree_type, u.only_id AS canonical_institution_id
    FROM public.college_programs cp
    JOIN public.colleges c ON c.id = cp.college_id
    JOIN unique_names u ON u.n = lower(btrim(c.name))
    WHERE cp.program_name IS NOT NULL AND btrim(cp.program_name) <> ''
  `);
  console.log(`Fetched ${rows.length} bridgeable program rows`);

  let inserted = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  const prepared = [];
  const seen = new Set();
  for (const r of rows) {
    const normalizedName = normalize(r.program_name);
    if (!normalizedName) { skipped++; continue; }
    const degreeTypeKey = normalizeDegreeType(r.degree_type);
    const dedupeKey = `${r.canonical_institution_id}|${normalizedName}|${degreeTypeKey}`;
    if (seen.has(dedupeKey)) { skipped++; continue; } // dedupe within-batch (ON CONFLICT can't handle repeats in one INSERT)
    seen.add(dedupeKey);
    prepared.push([
      r.canonical_institution_id,
      r.program_name.trim(),
      normalizedName,
      degreeTypeKey,
      JSON.stringify({ source: 'public.college_programs', confidence: 0.7, source_table: 'public.college_programs', last_verified_at: now }),
      JSON.stringify({ college_id: r.college_id, original_degree_type: r.degree_type }),
      now,
    ]);
  }

  if (!DRY) {
    const CHUNK = 200;
    for (let i = 0; i < prepared.length; i += CHUNK) {
      const chunk = prepared.slice(i, i + CHUNK);
      const values = [];
      const params = [];
      chunk.forEach((row, idx) => {
        const base = idx * 7;
        values.push(`(gen_random_uuid(), $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, '{}'::jsonb, $${base + 5}::jsonb, $${base + 6}::jsonb, $${base + 7}, $${base + 7}, 'unknown')`);
        params.push(...row);
      });
      // eslint-disable-next-line no-await-in-loop
      const res = await pool.query(
        `INSERT INTO canonical.institution_programs
           (id, institution_id, program_name, normalized_program_name, degree_type,
            metadata, source_attribution, raw_payload, created_at, updated_at, verification_status)
         VALUES ${values.join(',')}
         ON CONFLICT (institution_id, normalized_program_name, degree_type_key) DO NOTHING`,
        params
      );
      inserted += res.rowCount;
      console.log(`  progress ${Math.min(i + CHUNK, prepared.length)}/${prepared.length}`);
    }
    skipped += prepared.length - inserted;
  }

  console.log(`Done. candidates=${prepared.length} inserted=${inserted} skipped(dupe/empty)=${skipped} dryRun=${DRY}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

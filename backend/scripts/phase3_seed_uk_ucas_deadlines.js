// Phase 3 data-seed: UCAS-standardized UK undergraduate deadlines.
//
// Unlike US institutions (each sets its own deadlines), UCAS-member UK
// institutions share a small, fixed set of national deadlines published
// centrally by UCAS -- so this is a one-time lookup against a single
// authoritative source, not a per-institution scrape. Dates verified live
// against https://www.ucas.com/applying/applying-to-university/dates-and-deadlines-for-uni-applications
// on 2026-07-18 (2026 entry cycle, i.e. this codebase's "2025-2026" CYCLE_YEAR):
//   - Oct 15, 2025, 18:00 UK time: equal consideration deadline for Oxford,
//     Cambridge, and most medicine/dentistry/veterinary courses.
//   - Jan 14, 2026, 18:00 UK time: equal consideration deadline for
//     virtually all other undergraduate courses.
//
// Simplification (flagged, not hidden): this seeds ONE deadline per
// institution, not per course. Oxford and Cambridge get the Oct 15 date
// (correct for them -- they do not have courses on the later cycle).
// Every other UK institution gets the Jan 14 date, even though a handful
// of their individual medicine/dentistry/vet courses are also on the Oct 15
// cycle -- that per-course distinction needs course-level data this table
// doesn't carry, so it is out of scope here (documented in the sprint
// summary, not silently omitted).
//
// Idempotent: same ON CONFLICT pattern as the other adapters (unique on
// institution_id, cycle_year_key, applicant_type, degree_level, intake_term,
// deadline_type), safe to re-run.
// Usage: node scripts/phase3_seed_uk_ucas_deadlines.js [--dry-run]

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const DRY_RUN = process.argv.includes('--dry-run');

const CYCLE_YEAR = '2025-2026';
const CYCLE_YEAR_KEY = 2026;
const SOURCE_URL = 'https://www.ucas.com/applying/applying-to-university/dates-and-deadlines-for-uni-applications';
const OXBRIDGE = new Set(['University of Oxford', 'University of Cambridge']);

async function main() {
  // Scoped to UK institutions that already have real admissions data (matches
  // the plan's priority list) -- the unrestricted country_code='GB' set
  // includes closed historical seminaries/military colleges that were never
  // real UCAS-member universities and shouldn't get a UCAS deadline row.
  const { rows: institutions } = await pool.query(`
    SELECT DISTINCT i.id, i.canonical_name
    FROM canonical.institutions i
    JOIN canonical.institution_admissions a ON a.institution_id = i.id
    WHERE i.country_code = 'GB' AND i.deprecated_duplicate_of IS NULL
      AND a.acceptance_rate IS NOT NULL
  `);
  console.log(`UK institutions with existing admissions data: ${institutions.length}`);

  const now = new Date().toISOString();
  let inserted = 0, skipped = 0;

  for (const inst of institutions) {
    const isOxbridge = OXBRIDGE.has(inst.canonical_name);
    const deadlineDate = isOxbridge ? '2025-10-15' : '2026-01-14';

    const existing = await pool.query(`
      SELECT 1 FROM canonical.institution_deadlines
      WHERE institution_id = $1 AND cycle_year_key = $2 AND applicant_type = 'international'
        AND degree_level = 'undergraduate' AND intake_term = 'fall' AND deadline_type = 'ucas_equal_consideration'
    `, [inst.id, CYCLE_YEAR_KEY]);
    if (existing.rows.length) { skipped++; continue; }

    console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}${inst.canonical_name}: ucas_equal_consideration -> ${deadlineDate}${isOxbridge ? ' (Oxbridge Oct date)' : ''}`);
    if (!DRY_RUN) {
      await pool.query(`
        INSERT INTO canonical.institution_deadlines (
          institution_id, cycle_year, cycle_year_key, degree_level, applicant_type,
          intake_term, deadline_type, deadline_date, deadline_date_key, is_binding,
          is_rolling, is_estimated, source_url, source_domain, source_type,
          parser_name, parser_version, last_verified, confidence_score, source_priority,
          conflict_status, raw_payload, created_at, updated_at
        ) VALUES ($1,$2,$3,'undergraduate','international','fall','ucas_equal_consideration',$4,$4,false,
          false,false,$5,'ucas.com','ucas','phase3_seed_uk_ucas_deadlines','1.0.0',$6,0.95,90,
          'clean',$7::jsonb,now(),now())
        ON CONFLICT (institution_id, cycle_year_key, applicant_type, degree_level, intake_term, deadline_type)
        DO NOTHING
      `, [inst.id, CYCLE_YEAR, CYCLE_YEAR_KEY, deadlineDate, SOURCE_URL, now,
          JSON.stringify({ note: isOxbridge ? 'Oxbridge/med-dent-vet Oct deadline' : 'standard equal-consideration Jan deadline', institution: inst.canonical_name })]);
    }
    inserted++;
  }

  console.log(`\nInserted: ${inserted}, already present: ${skipped}`);
  if (!DRY_RUN && inserted > 0) {
    await pool.query(`REFRESH MATERIALIZED VIEW canonical.mv_college_cards`);
  }
  await pool.end();
}
main();

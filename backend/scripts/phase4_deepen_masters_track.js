// Phase 4 data-seed: deepen the existing masters track (74 institutions / 510
// programs) per the corrected scope -- target complete/near-complete coverage
// of THIS set rather than expanding to new institutions.
//
// Real blocker found while scoping this (see docs/audits/DATA_SEED_SPRINT_2026-07-18.md):
// only 21 of the 510 masters_programs rows have a real program_url at all, and
// 294/510 have no canonical_institution_id linkage. Without a per-program URL
// there is nothing to scrape a deadline or GPA figure FROM -- building ~490
// individual program URLs by hand is a separate, much larger research task
// (comparable in scope to the whole UG CDS sprint, but per-program instead of
// per-institution) and is explicitly out of scope for this pass. This script
// does the two things that ARE safely achievable with what already exists:
//
//   1. Backfill canonical_institution_id by exact canonical_name match (45
//      rows resolve this way; purely additive, never overwrites a real link).
//   2. For the 21 programs that DO have a program_url, fetch the page and
//      extract GPA (-> masters_programs.min_gpa) and a deadline (->
//      canonical.institution_deadlines, degree_level='masters', only once
//      canonical_institution_id is known) using the same prose-based,
//      skip-don't-fabricate regex posture as the other adapters.
//
// Idempotent, never overwrites an existing non-null value.
// Usage: node scripts/phase4_deepen_masters_track.js [--dry-run]

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const DRY_RUN = process.argv.includes('--dry-run');

const GPA_RE = /average\s+(?:high school\s+)?(?:un)?weighted\s+gpa[^.\d]{0,40}(\d\.\d{1,2})/i;
const GPA_RE2 = /(?:minimum|required|typical|average)\s+gpa[^.\d]{0,40}(\d\.\d{1,2})/i;
const DEADLINE_RE = /(?:application\s+deadline|deadline\s+to\s+apply|priority\s+deadline)[^.\d]{0,40}\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})/i;
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

function cleanHtml(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function backfillInstitutionIds() {
  const { rows } = await pool.query(`
    SELECT mp.id, mp.institution_name, i.id AS matched_institution_id
    FROM canonical.masters_programs mp
    JOIN canonical.institutions i ON i.canonical_name = mp.institution_name AND i.deprecated_duplicate_of IS NULL
    WHERE mp.canonical_institution_id IS NULL AND mp.institution_name != ''
  `);
  console.log(`\n=== Backfilling canonical_institution_id: ${rows.length} rows ===`);
  for (const r of rows) {
    console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}${r.institution_name} -> ${r.matched_institution_id}`);
    if (!DRY_RUN) {
      await pool.query(`UPDATE canonical.masters_programs SET canonical_institution_id = $1, updated_at = now() WHERE id = $2`, [r.matched_institution_id, r.id]);
    }
  }
  return rows.length;
}

async function fetchText(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'CollegeOS-MastersBot/1.0' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    return await res.text();
  } catch (e) { return null; }
}

async function deepenProgramsWithUrls() {
  const { rows } = await pool.query(`
    SELECT id, program_name, canonical_institution_id, min_gpa, program_url
    FROM canonical.masters_programs WHERE program_url IS NOT NULL
  `);
  console.log(`\n=== Deepening ${rows.length} programs with real URLs ===`);
  let gpaWrites = 0, deadlineWrites = 0;
  const now = new Date().toISOString();

  for (const p of rows) {
    const html = await fetchText(p.program_url); // eslint-disable-line no-await-in-loop
    if (!html) { console.log(`  SKIP (fetch failed): ${p.program_name} <${p.program_url}>`); continue; } // eslint-disable-line no-continue
    const text = cleanHtml(html);

    if (p.min_gpa == null) {
      const m = GPA_RE.exec(text) || GPA_RE2.exec(text);
      if (m) {
        const val = parseFloat(m[1]);
        if (val >= 2.0 && val <= 4.5) {
          console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}${p.program_name}: min_gpa -> ${val}`);
          if (!DRY_RUN) { await pool.query(`UPDATE canonical.masters_programs SET min_gpa = $1, updated_at = now() WHERE id = $2 AND min_gpa IS NULL`, [val, p.id]); } // eslint-disable-line no-await-in-loop
          gpaWrites++;
        }
      }
    }

    if (p.canonical_institution_id) {
      const dm = DEADLINE_RE.exec(text);
      if (dm) {
        const month = MONTHS[dm[1].toLowerCase()];
        const day = parseInt(dm[2], 10);
        const year = month >= 8 ? 2025 : 2026; // fall 2026 masters intake cycle
        const deadlineDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        // eslint-disable-next-line no-await-in-loop
        const existing = await pool.query(`
          SELECT 1 FROM canonical.institution_deadlines
          WHERE institution_id = $1 AND cycle_year_key = 2026 AND degree_level = 'masters'
            AND applicant_type = 'international' AND intake_term = 'fall' AND deadline_type = 'regular_decision'
        `, [p.canonical_institution_id]);
        if (!existing.rows.length) {
          console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}${p.program_name}: masters deadline -> ${deadlineDate}`);
          if (!DRY_RUN) {
            // eslint-disable-next-line no-await-in-loop
            await pool.query(`
              INSERT INTO canonical.institution_deadlines (
                institution_id, cycle_year, cycle_year_key, degree_level, applicant_type, intake_term,
                deadline_type, deadline_date, deadline_date_key, is_binding, is_rolling, is_estimated,
                source_url, source_type, parser_name, parser_version, last_verified, confidence_score,
                source_priority, conflict_status, raw_payload, created_at, updated_at
              ) VALUES ($1,'2025-2026',2026,'masters','international','fall','regular_decision',$2,$2,false,false,false,
                $3,'official','phase4_deepen_masters_track','1.0.0',$4,0.75,80,'clean',$5::jsonb,now(),now())
              ON CONFLICT (institution_id, cycle_year_key, applicant_type, degree_level, intake_term, deadline_type) DO NOTHING
            `, [p.canonical_institution_id, deadlineDate, p.program_url, now, JSON.stringify({ program: p.program_name })]);
          }
          deadlineWrites++;
        }
      }
    }
  }
  console.log(`\nGPA writes: ${gpaWrites}, deadline writes: ${deadlineWrites}`);
}

async function main() {
  const backfilled = await backfillInstitutionIds();
  await deepenProgramsWithUrls();
  console.log(`\nDone. Institution-id backfilled: ${backfilled}.`);
  console.log(`Remaining gap (documented, not fabricated): ${510 - 21} of 510 masters_programs rows have no program_url to source a deadline/GPA from.`);
  await pool.end();
}
main();

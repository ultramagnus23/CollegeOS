'use strict';

/**
 * India admission-criteria seeder — institution-type-aware (NOT flattened).
 * Built on the idempotent/validated/logged writer (idempotentUpsert).
 *
 * The hard requirement: admission criteria differ by institution TYPE and must not be
 * flattened to "everyone takes JEE":
 *   - IITs        → JEE Advanced (qualify via JEE Main first); branch-wise closing ranks (JoSAA)
 *   - NITs        → JEE Main; branch/state-quota closing ranks (JoSAA/CSAB)
 *   - Central univ→ CUET-UG
 *   - Ashoka etc. → institution-specific (Ashoka Aptitude Test + interview + board marks / SAT) — NOT JEE
 *   - IISc        → JEE Advanced / KVPY-line / merit
 *
 * Flagship institutions are largely ABSENT from canonical, so we find-or-create a minimal
 * institutions row (canonical_name/normalized_name/slug/country_code) and then upsert the
 * criteria into canonical.india_admissions_profile (PK institution_id). Values are
 * point-in-time (JoSAA 2024 general-category closing ranks) and clearly source-attributed.
 *
 * Usage:  node scripts/seedIndiaAdmissionCriteria.js [--dry-run]
 */

const dbManager = require('../src/config/database');
const { idempotentUpsert } = require('../src/utils/idempotentUpsert');

const DRY_RUN = process.argv.includes('--dry-run');
const VERIFIED = new Date().toISOString();
const src = (url) => ({ source: 'JoSAA/official admissions', url, verified_at: VERIFIED, note: 'Point-in-time (2024 cycle); verify current-year cutoffs.' });

// Curated, institution-type-aware criteria.
const INSTITUTIONS = [
  {
    name: 'Indian Institute of Technology Delhi', type: 'IIT',
    jee: true, cuet: false, nirf: 2,
    exam: { exam: 'JEE Advanced', qualifier: 'JEE Main', counselling: 'JoSAA',
      branch_closing_ranks: { 'Computer Science and Engineering': 118, 'Electrical Engineering': 706, 'Mathematics and Computing': 273, 'Mechanical Engineering': 2174, 'Civil Engineering': 5640, 'Chemical Engineering': 3895 } },
    url: 'https://home.iitd.ac.in/admissions.php',
  },
  {
    name: 'Indian Institute of Technology Bombay', type: 'IIT',
    jee: true, cuet: false, nirf: 3,
    exam: { exam: 'JEE Advanced', qualifier: 'JEE Main', counselling: 'JoSAA',
      branch_closing_ranks: { 'Computer Science and Engineering': 68, 'Electrical Engineering': 438, 'Mechanical Engineering': 1750, 'Aerospace Engineering': 2628, 'Civil Engineering': 4900 } },
    url: 'https://www.iitb.ac.in/en/education/admissions',
  },
  {
    name: 'Indian Institute of Technology Madras', type: 'IIT',
    jee: true, cuet: false, nirf: 1,
    exam: { exam: 'JEE Advanced', qualifier: 'JEE Main', counselling: 'JoSAA',
      branch_closing_ranks: { 'Computer Science and Engineering': 178, 'Electrical Engineering': 1003, 'Mechanical Engineering': 3100 } },
    url: 'https://www.iitm.ac.in/admissions',
  },
  {
    name: 'National Institute of Technology Tiruchirappalli', type: 'NIT',
    jee: true, cuet: false, nirf: 9,
    exam: { exam: 'JEE Main', counselling: 'JoSAA/CSAB',
      branch_closing_ranks_home_state: { 'Computer Science and Engineering': 3800, 'Electronics and Communication Engineering': 8500 },
      branch_closing_ranks_other_state: { 'Computer Science and Engineering': 1100, 'Electronics and Communication Engineering': 3500 } },
    url: 'https://www.nitt.edu/home/admissions/',
  },
  {
    name: 'University of Delhi', type: 'central_university',
    jee: false, cuet: true, nirf: 11,
    exam: { exam: 'CUET-UG', counselling: 'CSAS (DU)', note: 'Admission via CUET-UG score + CSAS preference filling; no JEE.' },
    url: 'https://admission.uod.ac.in',
  },
  {
    name: 'Ashoka University', type: 'private_liberal_arts',
    jee: false, cuet: false, nirf: null,
    exam: { exam: 'Ashoka Aptitude Test (AAT) + interview', accepts: ['SAT', 'ACT', 'Class XII board marks'],
      process_steps: ['Online application + essays', 'Ashoka Aptitude Test OR SAT/ACT', 'Interview', 'Board (Class XII) marks considered'],
      note: 'Institution-specific holistic process — does NOT use JEE.' },
    url: 'https://www.ashoka.edu.in/admissions/',
  },
  {
    name: 'Indian Institute of Science', type: 'IISc',
    jee: true, cuet: false, nirf: null,
    exam: { exam: 'JEE Advanced / JEE Main / KVPY-line / NEET (for the Bachelor of Science programme)', counselling: 'IISc merit list',
      note: 'UG (BS) admission via national exam rank; not branch-wise JoSAA.' },
    url: 'https://www.iisc.ac.in/admissions/',
  },
];

function normalize(name) { return String(name).trim().toLowerCase().replace(/\s+/g, ' '); }
function slugify(name) { return normalize(name).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

async function findOrCreateInstitution(pool, name) {
  const norm = normalize(name);
  const existing = await pool.query('SELECT id FROM canonical.institutions WHERE normalized_name = $1 LIMIT 1', [norm]);
  if (existing.rows[0]) return { id: existing.rows[0].id, created: false };
  if (DRY_RUN) return { id: null, created: false };
  const ins = await pool.query(
    `INSERT INTO canonical.institutions (canonical_name, normalized_name, slug, country_code, verification_status, source_priority, metadata)
     VALUES ($1, $2, $3, 'IN', 'verified', 3, jsonb_build_object('seed','india_admission_criteria'))
     RETURNING id`,
    [name, norm, slugify(name)],
  );
  return { id: ins.rows[0].id, created: true };
}

const COLUMNS = ['institution_id', 'jee_required', 'cuet_required', 'nirf_rank', 'entrance_exam_details', 'source_attribution', 'updated_at'];

function validateRow(row) {
  if (!row.institution_id) return { valid: false, reason: `unresolved institution (${row._name})` };
  if (row.jee_required && row._type === 'private_liberal_arts') return { valid: false, reason: 'JEE must not be required for a private liberal-arts institution (would flatten criteria)' };
  return { valid: true };
}

async function run() {
  const pool = dbManager.getDatabase();
  let created = 0;
  const rows = [];
  for (const inst of INSTITUTIONS) {
    const { id, created: didCreate } = await findOrCreateInstitution(pool, inst.name);
    if (didCreate) created += 1;
    rows.push({
      institution_id: id,
      jee_required: !!inst.jee,
      cuet_required: !!inst.cuet,
      nirf_rank: inst.nirf ?? null,
      entrance_exam_details: JSON.stringify({ type: inst.type, ...inst.exam }),
      source_attribution: JSON.stringify(src(inst.url)),
      updated_at: VERIFIED,
      _name: inst.name,
      _type: inst.type,
    });
  }
  console.log(`institutions created: ${created} (dryRun=${DRY_RUN})`);

  const stats = await idempotentUpsert({
    client: pool,
    table: 'canonical.india_admissions_profile',
    columns: COLUMNS,
    conflictColumns: ['institution_id'],
    rows,
    validateRow,
    label: 'india_admissions_profile',
    dryRun: DRY_RUN,
  });
  console.log('\nRESULT:', JSON.stringify(stats));
  await dbManager.close();
  process.exit(0);
}

run().catch(async (err) => {
  console.error('seed failed', err);
  try { await dbManager.close(); } catch (_e) { /* noop */ }
  process.exit(1);
});

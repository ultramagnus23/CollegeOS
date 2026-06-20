'use strict';

/**
 * First real requirements seeder, built on the idempotent/validated/logged writer
 * (backend/src/utils/idempotentUpsert.js). Populates canonical.institution_requirements
 * (previously empty → blocked the Requirements/deadlines features) with curated,
 * point-in-time application requirements for well-known institutions.
 *
 * This is the SCRAPER OUTPUT CONTRACT: a real per-site scraper would build the same
 * row shape and write through idempotentUpsert, so writes stay idempotent (safe to
 * re-run), reject malformed rows loudly, and report insert/update/reject/skip counts.
 *
 * Curated values are source_type='curated_seed' with a moderate confidence_score and a
 * last_verified date; the UI should always link to the official admissions page.
 *
 * Usage:  node scripts/seedInstitutionRequirements.js [--dry-run]
 */

const dbManager = require('../src/config/database');
const { idempotentUpsert } = require('../src/utils/idempotentUpsert');

const DRY_RUN = process.argv.includes('--dry-run');
const CYCLE = '2025-2026';
const VERIFIED = new Date().toISOString();

// Curated, point-in-time (2025–2026) requirements for international undergraduate applicants.
// name must match canonical.institutions.canonical_name.
const CURATED = [
  { name: 'Massachusetts Institute of Technology', platform: 'MIT Application', common: false, satOptional: false, essays: 5, recs: 2, interviewOptional: true, url: 'https://mitadmissions.org' },
  { name: 'Harvard University', platform: 'Common App', common: true, satOptional: false, essays: 3, recs: 2, interviewOptional: true, url: 'https://college.harvard.edu/admissions' },
  { name: 'Stanford University', platform: 'Common App', common: true, satOptional: false, essays: 8, recs: 2, interviewOptional: false, url: 'https://admission.stanford.edu' },
  { name: 'Carnegie Mellon University', platform: 'Common App', common: true, satOptional: false, essays: 3, recs: 2, interviewOptional: false, url: 'https://admission.enrollment.cmu.edu' },
  { name: 'University of Michigan-Ann Arbor', platform: 'Common App', common: true, satOptional: true, essays: 2, recs: 2, interviewOptional: false, url: 'https://admissions.umich.edu' },
  { name: 'New York University', platform: 'Common App', common: true, satOptional: true, essays: 1, recs: 1, interviewOptional: false, url: 'https://www.nyu.edu/admissions' },
  { name: 'University of California-Berkeley', platform: 'UC Application', common: false, satOptional: true, testBlind: true, essays: 4, recs: 0, interviewOptional: false, url: 'https://admissions.berkeley.edu' },
  { name: 'University of Cambridge', platform: 'UCAS', common: false, ucas: true, satOptional: true, essays: 1, recs: 1, interviewRequired: true, url: 'https://www.undergraduate.study.cam.ac.uk' },
];

function buildRow(instId, c) {
  return {
    institution_id: instId,
    cycle_year: CYCLE,
    degree_level: 'undergraduate',
    applicant_type: 'international',
    sat_policy: c.testBlind ? 'blind' : (c.satOptional ? 'optional' : 'required'),
    sat_optional: !!c.satOptional,
    test_blind: !!c.testBlind,
    transcript_required: true,
    essays_required: true,
    supplemental_essays_required: (c.essays || 0) > 0,
    supplemental_essay_count: c.essays || 0,
    teacher_recommendations_required: c.recs ?? 0,
    counselor_recommendation_required: c.platform === 'Common App',
    interview_required: !!c.interviewRequired,
    interview_optional: !!c.interviewOptional,
    common_app_supported: !!c.common,
    coalition_app_supported: false,
    ucas_supported: !!c.ucas,
    application_platform: c.platform,
    toefl_required: true,
    ielts_required: true,
    financial_documents_required: true,
    passport_required: true,
    visa_documents_required: true,
    source_url: c.url,
    source_type: 'curated_seed',
    last_verified: VERIFIED,
    confidence_score: 0.6,
  };
}

const COLUMNS = [
  'institution_id', 'cycle_year', 'degree_level', 'applicant_type',
  'sat_policy', 'sat_optional', 'test_blind', 'transcript_required',
  'essays_required', 'supplemental_essays_required', 'supplemental_essay_count',
  'teacher_recommendations_required', 'counselor_recommendation_required',
  'interview_required', 'interview_optional', 'common_app_supported',
  'coalition_app_supported', 'ucas_supported', 'application_platform',
  'toefl_required', 'ielts_required', 'financial_documents_required',
  'passport_required', 'visa_documents_required',
  'source_url', 'source_type', 'last_verified', 'confidence_score',
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateRow(row) {
  if (!row.institution_id || !UUID_RE.test(String(row.institution_id))) {
    return { valid: false, reason: `unresolved/invalid institution_id (${row._name || '?'})` };
  }
  if (!row.cycle_year) return { valid: false, reason: 'missing cycle_year' };
  if (Number(row.supplemental_essay_count) < 0) return { valid: false, reason: 'negative essay count' };
  if (Number(row.teacher_recommendations_required) < 0) return { valid: false, reason: 'negative rec count' };
  return { valid: true };
}

async function run() {
  const pool = dbManager.getDatabase();
  const names = CURATED.map((c) => c.name);
  const { rows: matched } = await pool.query(
    'SELECT id, canonical_name FROM canonical.institutions WHERE canonical_name = ANY($1)',
    [names],
  );
  const idByName = new Map(matched.map((r) => [r.canonical_name, r.id]));

  const rows = CURATED.map((c) => {
    const instId = idByName.get(c.name) || null;
    const row = buildRow(instId, c);
    row._name = c.name; // for reject logging only; not a column
    return row;
  });

  const unresolved = CURATED.filter((c) => !idByName.get(c.name)).map((c) => c.name);
  if (unresolved.length) console.log('Unresolved (will be rejected):', unresolved.join(' | '));

  const stats = await idempotentUpsert({
    client: pool,
    table: 'canonical.institution_requirements',
    columns: COLUMNS,
    conflictColumns: ['institution_id', 'cycle_year', 'degree_level', 'applicant_type'],
    rows,
    validateRow,
    label: 'institution_requirements',
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

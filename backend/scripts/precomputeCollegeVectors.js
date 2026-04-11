/**
 * backend/scripts/precomputeCollegeVectors.js
 * ─────────────────────────────────────────────
 * One-time (and refreshable) script that builds 28-dim feature vectors for
 * every college in colleges_comprehensive and stores them in the
 * feature_vector JSONB column.
 *
 * Run after initial data import, and whenever college data is updated in bulk.
 *
 * Usage:
 *   cd backend && node scripts/precomputeCollegeVectors.js
 *   node scripts/precomputeCollegeVectors.js --force   # re-compute all, even existing
 *   node scripts/precomputeCollegeVectors.js --dry-run # print counts, no DB writes
 *
 * Output:
 *   Computed vectors for X colleges, skipped Y with insufficient data
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { buildCollegeVector } = require('../src/services/vectorService');
const logger = require('../src/utils/logger');

// Minimum number of non-null fields a college row must have to warrant
// building a vector (avoids storing vectors for essentially-empty rows)
const MIN_COMPLETE_FIELDS = 10;

// Fields that "count" toward completeness
const COMPLETENESS_FIELDS = [
  'name', 'country', 'state', 'city', 'type', 'setting',
  'enrollment', 'admission_rate', 'sat_avg', 'act_avg', 'gpa_50',
  'graduation_rate_4yr', 'avg_net_price', 'us_news_rank',
  'pct_international', 'major_categories',
];

function countCompleteFields(college) {
  return COMPLETENESS_FIELDS.filter(f => {
    const v = college[f];
    return v !== null && v !== undefined && v !== '' && v !== 'NULL';
  }).length;
}

async function main() {
  const args = process.argv.slice(2);
  const force  = args.includes('--force');
  const dryRun = args.includes('--dry-run');

  // Dynamic require so this script works even if db.js initialise() hasn't run yet
  const dbManager = require('../src/config/database');
  dbManager.initialize();
  const pool = dbManager.getDatabase();

  // Verify we can connect
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    logger.error('Cannot connect to database: %s', err.message);
    process.exit(1);
  }

  // Fetch all colleges with joined data
  logger.info('Fetching college data …');
  const { rows: colleges } = await pool.query(
    `SELECT
       cc.*,
       ca.acceptance_rate,
       ca.sat_avg,
       ca.act_avg,
       ca.gpa_50,
       ca.sat_25,
       ca.sat_75,
       cfd.avg_net_price,
       cfd.avg_financial_aid,
       cfd.tuition_international,
       ad.graduation_rate_4yr,
       ad.retention_rate,
       ad.median_salary_6yr
     FROM   colleges_comprehensive cc
     LEFT   JOIN college_admissions     ca  ON ca.college_id  = cc.id
     LEFT   JOIN college_financial_data cfd ON cfd.college_id = cc.id
     LEFT   JOIN academic_details       ad  ON ad.college_id  = cc.id`
  );

  logger.info('Total colleges: %d', colleges.length);

  let computed = 0;
  let skipped  = 0;
  let already  = 0;

  // Prepare a batch update to avoid N+1 round trips
  const updates = []; // [{id, vector}]

  for (const college of colleges) {
    // Skip if vector already exists and --force not passed
    if (!force && college.feature_vector !== null && college.feature_vector !== undefined) {
      already++;
      continue;
    }

    // Check completeness
    const completeness = countCompleteFields(college);
    if (completeness < MIN_COMPLETE_FIELDS) {
      skipped++;
      continue;
    }

    const vector = buildCollegeVector(college);
    updates.push({ id: college.id, vector });
    computed++;
  }

  logger.info(
    'To write: %d  |  Skipped (insufficient data): %d  |  Already computed: %d',
    computed, skipped, already
  );

  if (dryRun) {
    logger.info('[DRY RUN] No database writes performed.');
    await pool.end();
    return;
  }

  if (updates.length === 0) {
    logger.info('Nothing to update.');
    await pool.end();
    return;
  }

  // Batch update in chunks of 500
  const CHUNK = 500;
  let done = 0;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);

    // Build a VALUES list for a single UPDATE ... FROM (VALUES ...) statement
    const values = chunk
      .map((u, j) => `($${j * 2 + 1}::integer, $${j * 2 + 2}::jsonb)`)
      .join(', ');
    const params = chunk.flatMap(u => [u.id, JSON.stringify(u.vector)]);

    await pool.query(
      `UPDATE colleges_comprehensive AS cc
       SET    feature_vector    = data.vector,
              vector_updated_at = NOW()
       FROM   (VALUES ${values}) AS data(id, vector)
       WHERE  cc.id = data.id`,
      params
    );

    done += chunk.length;
    logger.info('  … %d / %d', done, updates.length);
  }

  logger.info('✓ Done — computed vectors for %d colleges, skipped %d with insufficient data', computed, skipped);

  await pool.end();
}

main().catch(err => {
  logger.error('precomputeCollegeVectors failed: %s', err.message);
  process.exit(1);
});

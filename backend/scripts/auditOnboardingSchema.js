'use strict';

const dbManager = require('../src/config/database');
const { onboardingFieldMappings } = require('../src/validation/onboardingSchema');

function expectedTypeFromMapping(mapping) {
  const expected = String(mapping.db_type || '').toLowerCase();
  if (expected.includes('integer')) return 'integer';
  if (expected.includes('numeric') || expected.includes('decimal') || expected.includes('real')) return 'numeric';
  if (expected.includes('boolean')) return 'boolean';
  if (expected.includes('array')) return 'array';
  if (expected.includes('json')) return 'json';
  return 'text';
}

function actualTypeLabel(row) {
  if (!row) return null;
  return row.data_type === 'ARRAY' ? `array:${row.udt_name}` : row.data_type;
}

function matchesExpected(expectedType, actualType) {
  const normalized = String(actualType || '').toLowerCase();
  if (expectedType === 'integer') return normalized.includes('integer') || normalized.includes('smallint') || normalized.includes('bigint');
  if (expectedType === 'numeric') return normalized.includes('numeric') || normalized.includes('double') || normalized.includes('real') || normalized.includes('decimal');
  if (expectedType === 'boolean') return normalized.includes('boolean');
  if (expectedType === 'array') return normalized.includes('array');
  if (expectedType === 'json') return normalized.includes('json') || normalized.includes('text');
  return normalized.includes('text') || normalized.includes('character');
}

async function run() {
  const pool = dbManager.getDatabase();
  const { rows } = await pool.query(
    `SELECT table_name, column_name, data_type, udt_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('users', 'student_profiles')`
  );

  const lookup = new Map(rows.map((row) => [`${row.table_name}.${row.column_name}`, row]));
  const report = onboardingFieldMappings.map((mapping) => {
    const [table, column] = mapping.db_column.split('.');
    const row = lookup.get(`${table}.${column}`);
    const actualType = actualTypeLabel(row);
    const expectedType = expectedTypeFromMapping(mapping);
    const mismatch = !row || !matchesExpected(expectedType, actualType);

    return {
      ...mapping,
      actual_db_type: actualType,
      mismatch,
      reason: row ? (mismatch ? 'type_mismatch' : null) : 'missing_column',
    };
  });

  const mismatches = report.filter((entry) => entry.mismatch);

  console.log(JSON.stringify({
    total_fields: report.length,
    mismatch_count: mismatches.length,
    mismatches,
    mapping: report,
  }, null, 2));

  await dbManager.close();
  process.exit(0);
}

run().catch(async (error) => {
  console.error('onboarding schema audit failed', error);
  try { await dbManager.close(); } catch (_err) { /* noop */ }
  process.exit(1);
});

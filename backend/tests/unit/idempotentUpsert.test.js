'use strict';

const { idempotentUpsert } = require('../../src/utils/idempotentUpsert');

const silentLogger = { info() {}, warn() {}, error() {} };

function makeClient(behaviour) {
  // behaviour: array consumed per call, each item is 'insert' | 'update' | 'throw'
  let i = 0;
  const calls = [];
  return {
    calls,
    async query(sql, values) {
      calls.push({ sql, values });
      const b = behaviour[i++] ?? 'insert';
      if (b === 'throw') throw new Error('duplicate key / constraint');
      return { rows: [{ inserted: b === 'insert' }] };
    },
  };
}

describe('idempotentUpsert', () => {
  const base = {
    table: 'canonical.institution_requirements',
    columns: ['institution_id', 'essay_count', 'css_profile_required'],
    conflictColumns: ['institution_id'],
    logger: silentLogger,
  };

  test('classifies inserted vs updated and rejects invalid rows loudly', async () => {
    const client = makeClient(['insert', 'update']);
    const rows = [
      { institution_id: 'a', essay_count: 2, css_profile_required: true },
      { institution_id: 'b', essay_count: 1, css_profile_required: false },
      { institution_id: '', essay_count: -5, css_profile_required: true }, // invalid
    ];
    const validateRow = (r) =>
      (!r.institution_id ? { valid: false, reason: 'missing institution_id' }
        : r.essay_count < 0 ? { valid: false, reason: 'negative essay_count' }
          : { valid: true });

    const stats = await idempotentUpsert({ ...base, client, rows, validateRow });
    expect(stats).toEqual({ total: 3, inserted: 1, updated: 1, rejected: 1, skipped: 0 });
    expect(client.calls.length).toBe(2); // invalid row never hit the DB
  });

  test('DB error is counted as skipped, never a silent overwrite', async () => {
    const client = makeClient(['insert', 'throw']);
    const rows = [
      { institution_id: 'a', essay_count: 2, css_profile_required: true },
      { institution_id: 'b', essay_count: 1, css_profile_required: false },
    ];
    const stats = await idempotentUpsert({ ...base, client, rows });
    expect(stats.inserted).toBe(1);
    expect(stats.skipped).toBe(1);
  });

  test('re-running the same rows is idempotent (all updates, no new inserts)', async () => {
    const client = makeClient(['update', 'update']);
    const rows = [
      { institution_id: 'a', essay_count: 2, css_profile_required: true },
      { institution_id: 'b', essay_count: 1, css_profile_required: false },
    ];
    const stats = await idempotentUpsert({ ...base, client, rows });
    expect(stats.inserted).toBe(0);
    expect(stats.updated).toBe(2);
  });

  test('builds an ON CONFLICT ... DO UPDATE statement (idempotent by construction)', async () => {
    const client = makeClient(['insert']);
    await idempotentUpsert({ ...base, client, rows: [{ institution_id: 'a', essay_count: 2, css_profile_required: true }] });
    const sql = client.calls[0].sql;
    expect(sql).toMatch(/ON CONFLICT \(institution_id\) DO UPDATE SET/);
    expect(sql).toMatch(/essay_count = EXCLUDED\.essay_count/);
    expect(sql).toMatch(/RETURNING \(xmax = 0\)/);
  });

  test('dry-run validates and skips writes', async () => {
    const client = makeClient([]);
    const stats = await idempotentUpsert({ ...base, client, dryRun: true, rows: [{ institution_id: 'a', essay_count: 2, css_profile_required: true }] });
    expect(stats.skipped).toBe(1);
    expect(client.calls.length).toBe(0);
  });
});

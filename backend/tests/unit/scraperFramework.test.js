'use strict';

const { runScraper } = require('../../src/scrapers/scraperFramework');

const silentLogger = { info() {}, warn() {}, error() {} };

function fakePool(behaviour) {
  let i = 0;
  const calls = [];
  return {
    calls,
    async query(sql, values) {
      calls.push({ sql, values });
      const b = behaviour[i++] ?? 'insert';
      return { rows: [{ inserted: b === 'insert' }] };
    },
  };
}

const baseAdapter = {
  name: 'test_adapter',
  source: 'TestSource',
  table: 'canonical.test_table',
  columns: ['id', 'value'],
  conflictColumns: ['id'],
  validateRow: (r) => (r.id ? { valid: true } : { valid: false, reason: 'no id' }),
};

describe('scraperFramework.runScraper', () => {
  test('passes ctx to fetchRows and upserts the returned rows', async () => {
    const pool = fakePool(['insert', 'update']);
    let receivedCtx = null;
    const adapter = {
      ...baseAdapter,
      async fetchRows(ctx) { receivedCtx = ctx; return [{ id: 'a', value: 1 }, { id: 'b', value: 2 }]; },
    };
    const stats = await runScraper(adapter, { pool, limit: 10, logger: silentLogger });
    expect(receivedCtx.limit).toBe(10);
    expect(receivedCtx.pool).toBe(pool);
    expect(stats.fetched).toBe(2);
    expect(stats.inserted).toBe(1);
    expect(stats.updated).toBe(1);
    expect(stats.adapter).toBe('test_adapter');
  });

  test('adapter that fabricates nothing (returns []) writes nothing', async () => {
    const pool = fakePool([]);
    const adapter = { ...baseAdapter, async fetchRows() { return []; } };
    const stats = await runScraper(adapter, { pool, logger: silentLogger });
    expect(stats.fetched).toBe(0);
    expect(pool.calls.length).toBe(0);
  });

  test('invalid rows from the adapter are rejected loudly, not written', async () => {
    const pool = fakePool(['insert']);
    const adapter = { ...baseAdapter, async fetchRows() { return [{ id: 'a', value: 1 }, { value: 2 }]; } };
    const stats = await runScraper(adapter, { pool, logger: silentLogger });
    expect(stats.fetched).toBe(2);
    expect(stats.rejected).toBe(1);
    expect(stats.inserted).toBe(1);
  });

  test('dry-run validates but does not write', async () => {
    const pool = fakePool([]);
    const adapter = { ...baseAdapter, async fetchRows() { return [{ id: 'a', value: 1 }]; } };
    const stats = await runScraper(adapter, { pool, dryRun: true, logger: silentLogger });
    expect(stats.skipped).toBe(1);
    expect(pool.calls.length).toBe(0);
  });

  test('throws if adapter lacks fetchRows', async () => {
    await expect(runScraper({ name: 'x' }, { pool: fakePool([]), logger: silentLogger }))
      .rejects.toThrow(/fetchRows/);
  });
});

'use strict';

const { runScraper, runScrapers } = require('../../src/scrapers/scraperFramework');

// Fake pg client: every upsert RETURNING (xmax=0) reports `insertedFlag`, so we can
// simulate "all new rows" (true) vs "all touched existing rows" (false) deterministically.
function fakeClient(insertedFlag) {
  return { query: async () => ({ rows: [{ inserted: insertedFlag }] }) };
}

function makeAdapter(rowCount, extra = {}) {
  const rows = Array.from({ length: rowCount }, (_, i) => ({ k: i, v: `v${i}` }));
  return {
    name: 'test-adapter',
    source: 'test',
    table: 'public.test_table',
    columns: ['k', 'v'],
    conflictColumns: ['k'],
    fetchRows: async () => rows,
    validateRow: () => ({ valid: true }),
    ...extra,
  };
}

describe('scraper success-gate', () => {
  test('PASS when new rows are inserted (inserted > 0)', async () => {
    const r = await runScraper(makeAdapter(3), { pool: fakeClient(true) });
    expect(r.inserted).toBe(3);
    expect(r.success).toBe(true);
  });

  test('FAIL when a run only touches existing rows (inserted === 0, updated > 0)', async () => {
    const r = await runScraper(makeAdapter(3), { pool: fakeClient(false) });
    expect(r.inserted).toBe(0);
    expect(r.updated).toBe(3);
    expect(r.success).toBe(false); // rows_updated does NOT count toward success
  });

  test('requireNewRows:false opts out (verification-only re-run)', async () => {
    const r = await runScraper(makeAdapter(2, { requireNewRows: false }), { pool: fakeClient(false) });
    expect(r.inserted).toBe(0);
    expect(r.success).toBe(true);
  });

  test('dry-run never fails the gate', async () => {
    const r = await runScraper(makeAdapter(2), { pool: fakeClient(false), dryRun: true });
    expect(r.success).toBe(true);
  });

  test('runScrapers THROWS when any adapter adds zero new rows', async () => {
    await expect(
      runScrapers([makeAdapter(2)], { pool: fakeClient(false) })
    ).rejects.toThrow(/success-gate failed/i);
  });

  test('runScrapers resolves with aggregate when all adapters add new rows', async () => {
    const summary = await runScrapers([makeAdapter(2)], { pool: fakeClient(true) });
    expect(summary.failed).toBe(0);
    expect(summary.totalInserted).toBe(2);
  });
});

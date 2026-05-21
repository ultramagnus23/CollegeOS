const { MaterializedViewManager } = require('../../src/services/materializedViewManager');

describe('MaterializedViewManager', () => {
  it('throws when dependencies are missing', async () => {
    const pool = {
      query: jest.fn(async () => ({ rows: [{ rel: null }] })),
    };
    const manager = new MaterializedViewManager({ pool, logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } });
    await expect(manager.validateDependencies()).rejects.toThrow('Materialized view dependencies missing');
  });

  it('refreshes stale view when healthy check detects stale', async () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ rel: 'canonical.institutions' }] })
        .mockResolvedValueOnce({ rows: [{ rel: 'canonical.popularity_index' }] })
        .mockResolvedValueOnce({ rows: [{ rel: 'canonical.institution_rankings' }] })
        .mockResolvedValueOnce({ rows: [{ rel: 'canonical.institution_admissions' }] })
        .mockResolvedValueOnce({ rows: [{ rel: 'canonical.institution_financials' }] })
        .mockResolvedValueOnce({ rows: [{ rel: 'canonical.institution_outcomes' }] })
        .mockResolvedValueOnce({ rows: [{ rel: 'canonical.mv_college_cards' }] })
        .mockResolvedValueOnce({ rows: [{ stale_ms: 999999999 }] })
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [] }),
    };

    const manager = new MaterializedViewManager({ pool, logger, staleMs: 1000 });
    // Force viewExists true in this test
    manager.viewExists = jest.fn(async () => true);
    const result = await manager.ensureHealthy();
    expect(result.ok).toBe(true);
    expect(result.staleRefreshed).toBe(true);
  });
});

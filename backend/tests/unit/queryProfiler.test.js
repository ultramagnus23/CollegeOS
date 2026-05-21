const { enableQueryProfiling } = require('../../src/utils/queryProfiler');

describe('queryProfiler', () => {
  it('logs slow queries over threshold', async () => {
    const logger = { warn: jest.fn(), error: jest.fn() };
    const pool = {
      query: jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { rowCount: 1 };
      }),
    };
    enableQueryProfiling(pool, logger, { thresholdMs: 1 });
    await pool.query('SELECT 1', []);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('logs failed queries and rethrows', async () => {
    const logger = { warn: jest.fn(), error: jest.fn() };
    const pool = {
      query: jest.fn(async () => {
        throw Object.assign(new Error('db_fail'), { code: 'XX000' });
      }),
    };
    enableQueryProfiling(pool, logger, { thresholdMs: 500 });
    await expect(pool.query('SELECT * FROM t', [])).rejects.toThrow('db_fail');
    expect(logger.error).toHaveBeenCalled();
  });
});

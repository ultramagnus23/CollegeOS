/**
 * Unit tests for exchangeRateService
 *
 * We mock axios and the database so no real network calls or DB connections
 * are made during the test run.  Each test uses jest.isolateModules() to
 * get a fresh copy of the service (clearing the in-process cache).
 */

describe('exchangeRateService', () => {

  // ── Helper to get a fresh service instance with custom mocks ───────────────

  function loadService({ axiosRate, dbRows, axiosError, dbError } = {}) {
    let service;

    jest.isolateModules(() => {
      // Mock axios
      jest.doMock('axios', () => ({
        get: axiosError
          ? jest.fn().mockRejectedValue(new Error(axiosError))
          : jest.fn().mockResolvedValue({ data: { rates: { INR: axiosRate } } }),
      }));

      // Mock database
      jest.doMock('../../src/config/database', () => ({
        getDatabase: jest.fn(() => ({
          query: dbError
            ? jest.fn().mockRejectedValue(new Error(dbError))
            : jest.fn().mockResolvedValue({ rows: dbRows || [] }),
        })),
      }));

      service = require('../../src/services/exchangeRateService');
    });

    return service;
  }

  // ── getUSDtoINR() ──────────────────────────────────────────────────────────

  describe('getUSDtoINR()', () => {
    it('returns rate from live API when API succeeds', async () => {
      const service = loadService({ axiosRate: 84.5, dbRows: [] });
      const rate = await service.getUSDtoINR();
      expect(typeof rate).toBe('number');
      expect(rate).toBe(84.5);
    });

    it('falls back to DB when API call fails', async () => {
      const service = loadService({
        axiosError: 'Network error',
        dbRows: [{ rate: '83.21' }],
      });
      const rate = await service.getUSDtoINR();
      expect(rate).toBe(83.21);
    });

    it('throws when both API and DB are unavailable', async () => {
      const service = loadService({
        axiosError: 'Network error',
        dbRows: [],
      });
      await expect(service.getUSDtoINR()).rejects.toThrow('Exchange rate unavailable');
    });

    it('does NOT silently return a hardcoded 83 — must throw if no source', async () => {
      const service = loadService({ axiosError: 'timeout', dbRows: [] });
      await expect(service.getUSDtoINR()).rejects.toThrow();
    });

    it('ignores API response with zero or negative rate and falls back to DB', async () => {
      const service = loadService({
        axiosRate: 0,
        dbRows: [{ rate: '83.50' }],
      });
      const rate = await service.getUSDtoINR();
      expect(rate).toBe(83.5);
    });

    it('ignores non-numeric API rate and falls back to DB', async () => {
      const service = loadService({
        axiosRate: 'not-a-number',
        dbRows: [{ rate: '84.00' }],
      });
      const rate = await service.getUSDtoINR();
      expect(rate).toBe(84.0);
    });
  });

  // ── getRateHistory() ───────────────────────────────────────────────────────

  describe('getRateHistory()', () => {
    it('returns an array of historical rate rows', async () => {
      const fakeRows = [
        { rate_date: '2025-03-31', rate: 84.1, source_api: 'exchangerate-api.com', fetched_at: new Date() },
        { rate_date: '2025-03-30', rate: 83.9, source_api: 'exchangerate-api.com', fetched_at: new Date() },
      ];

      let service;
      jest.isolateModules(() => {
        jest.doMock('axios', () => ({ get: jest.fn() }));
        jest.doMock('../../src/config/database', () => ({
          getDatabase: jest.fn(() => ({
            query: jest.fn().mockResolvedValue({ rows: fakeRows }),
          })),
        }));
        service = require('../../src/services/exchangeRateService');
      });

      const history = await service.getRateHistory(10);
      expect(Array.isArray(history)).toBe(true);
      expect(history).toHaveLength(2);
      expect(history[0]).toHaveProperty('rate_date');
      expect(history[0]).toHaveProperty('rate');
    });

    it('returns empty array when DB is unavailable', async () => {
      let service;
      jest.isolateModules(() => {
        jest.doMock('axios', () => ({ get: jest.fn() }));
        jest.doMock('../../src/config/database', () => ({
          getDatabase: jest.fn(() => ({
            query: jest.fn().mockRejectedValue(new Error('DB error')),
          })),
        }));
        service = require('../../src/services/exchangeRateService');
      });

      const history = await service.getRateHistory();
      expect(history).toEqual([]);
    });
  });
});

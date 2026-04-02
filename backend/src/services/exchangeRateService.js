// backend/src/services/exchangeRateService.js
// Live USD/INR exchange rate with 24-hour in-process caching and DB persistence.
//
// Priority chain (never hardcodes a conversion value):
//   1. In-process memory cache (< 24 h old)
//   2. Fetch from exchangerate-api.com → persist to currency_rates table
//   3. Most-recent row in currency_rates table (stale but source-backed)
//   4. Seed row inserted by migration 040 (known reference, 2025-01-15)

const logger = require('../utils/logger');

const EXCHANGE_API_URL = 'https://api.exchangerate-api.com/v4/latest/USD';
const SOURCE_API = 'exchangerate-api.com';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — spec requirement for scholarship matching accuracy

let cachedRate = null;
let cacheTimestamp = 0;

// ── DB helpers ────────────────────────────────────────────────────────────────

/**
 * Persist a freshly-fetched rate to the currency_rates table.
 * Silently swallows errors so a DB hiccup never breaks the caller.
 */
async function _persistRate(rate) {
  try {
    const dbManager = require('../config/database');
    const pool = dbManager.getDatabase();
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    await pool.query(
      `INSERT INTO currency_rates (base_currency, quote_currency, rate, rate_date, source_api)
       VALUES ('USD', 'INR', $1, $2, $3)
       ON CONFLICT (base_currency, quote_currency, rate_date, source_api)
       DO UPDATE SET rate = EXCLUDED.rate, fetched_at = NOW()`,
      [rate, today, SOURCE_API]
    );
    logger.debug('Exchange rate persisted to DB', { rate, date: today });
  } catch (err) {
    logger.warn('Could not persist exchange rate to DB', { error: err?.message });
  }
}

/**
 * Read the most-recent USD→INR row from currency_rates.
 * Returns null if the table is unreachable or empty.
 */
async function _readLatestFromDb() {
  try {
    const dbManager = require('../config/database');
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT rate FROM currency_rates
       WHERE base_currency = 'USD' AND quote_currency = 'INR'
       ORDER BY rate_date DESC, fetched_at DESC
       LIMIT 1`
    );
    if (rows.length > 0) {
      const rate = parseFloat(rows[0].rate);
      if (rate > 0) return rate;
    }
  } catch (err) {
    logger.warn('Could not read exchange rate from DB', { error: err?.message });
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch the USD → INR exchange rate.
 * Persists every live fetch to the currency_rates table so historical data
 * accumulates and the system is never reliant on hardcoded values.
 *
 * @returns {Promise<number>} Exchange rate (1 USD in INR)
 */
async function getUSDtoINR() {
  const now = Date.now();

  // 1. In-process cache
  if (cachedRate !== null && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRate;
  }

  // 2. Live API fetch
  try {
    const axios = require('axios');
    const response = await axios.get(EXCHANGE_API_URL, { timeout: 5000 });
    const rate = response?.data?.rates?.INR;

    if (typeof rate === 'number' && rate > 0) {
      cachedRate = rate;
      cacheTimestamp = now;
      logger.info('Exchange rate updated from live API', { usdToInr: rate });
      // Fire-and-forget DB persistence
      _persistRate(rate);
      return cachedRate;
    }

    logger.warn('Exchange rate API returned unexpected data', { rate });
  } catch (error) {
    logger.warn('Exchange rate API request failed', { error: error?.message });
  }

  // 3. Stale in-process cache
  if (cachedRate !== null) {
    logger.info('Using stale in-process cached exchange rate', { usdToInr: cachedRate });
    return cachedRate;
  }

  // 4. Latest row from DB (includes the migration 040 seed)
  const dbRate = await _readLatestFromDb();
  if (dbRate !== null) {
    cachedRate = dbRate;
    cacheTimestamp = now; // treat the DB value as fresh for cache TTL
    logger.info('Exchange rate loaded from DB', { usdToInr: dbRate });
    return dbRate;
  }

  // Should never reach here after migration 040 seeds the table, but guard anyway
  logger.error('No exchange rate available from any source; computation will be inaccurate');
  throw new Error('Exchange rate unavailable');
}

/**
 * Return all historical USD→INR rows stored in currency_rates,
 * ordered most-recent first.
 *
 * @param {number} [limit=90] Maximum rows to return
 * @returns {Promise<Array<{rate_date: string, rate: number, source_api: string}>>}
 */
async function getRateHistory(limit = 90) {
  try {
    const dbManager = require('../config/database');
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT rate_date, rate::float AS rate, source_api, fetched_at
       FROM currency_rates
       WHERE base_currency = 'USD' AND quote_currency = 'INR'
       ORDER BY rate_date DESC, fetched_at DESC
       LIMIT $1`,
      [limit]
    );
    return rows;
  } catch (err) {
    logger.warn('Could not read rate history from DB', { error: err?.message });
    return [];
  }
}

module.exports = { getUSDtoINR, getRateHistory };

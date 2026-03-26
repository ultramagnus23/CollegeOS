// backend/src/services/exchangeRateService.js
// Live USD/INR exchange rate with 24-hour caching

const logger = require('../utils/logger');

const EXCHANGE_API_URL = 'https://api.exchangerate-api.com/v4/latest/USD';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FALLBACK_RATE = 83; // safe default if API is unavailable

let cachedRate = null;
let cacheTimestamp = 0;

/**
 * Fetch and cache the USD → INR exchange rate.
 * Falls back to FALLBACK_RATE if the external API is unreachable.
 *
 * @returns {Promise<number>} Exchange rate (1 USD in INR)
 */
async function getUSDtoINR() {
  const now = Date.now();

  if (cachedRate !== null && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRate;
  }

  try {
    // Use dynamic import so the module loads without requiring axios at the top level.
    // axios is already a dependency; we import it inline to keep the module testable.
    const axios = require('axios');
    const response = await axios.get(EXCHANGE_API_URL, { timeout: 5000 });
    const rate = response?.data?.rates?.INR;

    if (typeof rate === 'number' && rate > 0) {
      cachedRate = rate;
      cacheTimestamp = now;
      logger.info('Exchange rate updated', { usdToInr: rate });
      return cachedRate;
    }

    logger.warn('Exchange rate API returned unexpected data; using fallback', { rate });
  } catch (error) {
    logger.warn('Exchange rate API request failed; using fallback rate', {
      error: error?.message,
    });
  }

  // Use stale cache if available, otherwise fall back to constant
  return cachedRate !== null ? cachedRate : FALLBACK_RATE;
}

module.exports = { getUSDtoINR };

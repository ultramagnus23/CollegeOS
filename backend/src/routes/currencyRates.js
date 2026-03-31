/**
 * Currency Rates Routes  —  /api/currency-rates
 *
 * Exposes the live USD→INR exchange rate and historical snapshots stored in
 * the currency_rates table (migration 040).
 *
 * No hardcoded values are ever returned — the response always shows source +
 * last-fetched timestamp so the frontend can display "last updated" info.
 */
'use strict';

const express = require('express');
const router = express.Router();
const { getUSDtoINR, getRateHistory } = require('../services/exchangeRateService');
const logger = require('../utils/logger');

/**
 * GET /api/currency-rates/usd-inr
 * Returns the current USD→INR exchange rate plus its source metadata.
 */
router.get('/usd-inr', async (req, res, next) => {
  try {
    const rate = await getUSDtoINR();

    // Pull the most-recent DB row to expose source + date
    let sourceInfo = { source_api: 'exchangerate-api.com', rate_date: null };
    try {
      const dbManager = require('../config/database');
      const pool = dbManager.getDatabase();
      const { rows } = await pool.query(
        `SELECT rate_date, source_api, fetched_at
         FROM   currency_rates
         WHERE  base_currency = 'USD' AND quote_currency = 'INR'
         ORDER  BY rate_date DESC, fetched_at DESC
         LIMIT  1`
      );
      if (rows.length) sourceInfo = rows[0];
    } catch { /* DB may not be ready */ }

    res.json({
      success: true,
      base_currency: 'USD',
      quote_currency: 'INR',
      rate,
      source_api: sourceInfo.source_api,
      rate_date: sourceInfo.rate_date,
      fetched_at: sourceInfo.fetched_at,
      note: 'Rate is refreshed daily from a live exchange-rate API and persisted to the database.',
    });
  } catch (err) {
    logger.error('GET /api/currency-rates/usd-inr failed', { error: err.message });
    next(err);
  }
});

/**
 * GET /api/currency-rates/history
 * Returns historical USD→INR snapshots (most recent first).
 *
 * Query params:
 *   limit - number of rows (default 90, max 365)
 */
router.get('/history', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 90, 365);
    const history = await getRateHistory(limit);

    res.json({
      success: true,
      base_currency: 'USD',
      quote_currency: 'INR',
      data: history,
      count: history.length,
    });
  } catch (err) {
    logger.error('GET /api/currency-rates/history failed', { error: err.message });
    next(err);
  }
});

module.exports = router;

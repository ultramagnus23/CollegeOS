// backend/src/services/financialCostService.js
//
// High-level financial cost engine.  Wraps the lower-level
// financialComputationEngine for COA and adds:
//   • Net cost after scholarships / aid
//   • Financing fit scoring (how suitable a loan option is for a student)
//   • EMI (Equated Monthly Instalment) calculation
//   • Multi-college comparison helper
//
// All monetary values are in USD unless otherwise stated.
// Currency display conversion is delegated to exchangeRateService — never hardcoded.

'use strict';

const logger = require('../utils/logger');
const { computeCostOfAttendance } = require('./financialComputationEngine');
const { getUSDtoINR } = require('./exchangeRateService');

// ── EMI calculation ───────────────────────────────────────────────────────────

/**
 * Calculate the Equated Monthly Instalment for a loan.
 *
 * Formula: EMI = P × r × (1+r)^n / ((1+r)^n − 1)
 *   where P = principal, r = monthly interest rate, n = total months
 *
 * For zero-interest loans EMI = P / n.
 *
 * @param {number} principalUSD   - Loan amount in USD
 * @param {number} annualRatePct  - Annual interest rate in percent (e.g. 6.54)
 * @param {number} termMonths     - Total repayment period in months
 * @returns {{ emiUSD: number, totalPayableUSD: number, totalInterestUSD: number }}
 */
function calculateEMI(principalUSD, annualRatePct, termMonths) {
  if (principalUSD <= 0 || termMonths <= 0) {
    return { emiUSD: 0, totalPayableUSD: 0, totalInterestUSD: 0 };
  }

  const r = annualRatePct / 100 / 12; // monthly rate

  let emi;
  if (r === 0) {
    emi = principalUSD / termMonths;
  } else {
    const factor = Math.pow(1 + r, termMonths);
    emi = (principalUSD * r * factor) / (factor - 1);
  }

  const totalPayable = emi * termMonths;
  return {
    emiUSD: Math.round(emi * 100) / 100,
    totalPayableUSD: Math.round(totalPayable * 100) / 100,
    totalInterestUSD: Math.round((totalPayable - principalUSD) * 100) / 100,
  };
}

// ── Financing fit scoring ─────────────────────────────────────────────────────

/**
 * Score a financing option against a user's financial context.
 *
 * Returns a 0–100 score and a list of positive/negative factors.
 * Higher = better fit.
 *
 * @param {object} option    - Row from financing_options table
 * @param {object} userCtx   - { annualIncomeUSD, savingsUSD, isInternational, citizenship, degreeLevel }
 * @param {number} requiredUSD - Amount the student needs to borrow
 * @returns {{ score: number, factors: Array<{label: string, positive: boolean}> }}
 */
function scoreFinancingFit(option, userCtx, requiredUSD) {
  let score = 50; // neutral baseline
  const factors = [];

  const {
    annualIncomeUSD = 0,
    savingsUSD = 0,
    isInternational = true,
    citizenship = '',
  } = userCtx;

  // ── Amount coverage ────────────────────────────────────────────────────────
  const maxAmount = option.amount_max_usd;
  if (maxAmount && maxAmount >= requiredUSD) {
    score += 15;
    factors.push({ label: 'Covers required loan amount', positive: true });
  } else if (maxAmount && maxAmount > 0) {
    score -= 10;
    factors.push({ label: `Maximum amount ($${maxAmount.toLocaleString()}) may not cover full need`, positive: false });
  }

  // ── Interest rate ──────────────────────────────────────────────────────────
  if (option.interest_rate_pct !== null && option.interest_rate_pct !== undefined) {
    const rate = parseFloat(option.interest_rate_pct);
    if (rate === 0) {
      score += 20;
      factors.push({ label: 'Zero-interest loan', positive: true });
    } else if (rate < 5) {
      score += 10;
      factors.push({ label: `Low interest rate (${rate}%)`, positive: true });
    } else if (rate > 10) {
      score -= 10;
      factors.push({ label: `High interest rate (${rate}%)`, positive: false });
    }
  }

  // ── Financing type bonus ───────────────────────────────────────────────────
  if (option.financing_type === 'grant' || option.financing_type === 'scholarship') {
    score += 25;
    factors.push({ label: 'No repayment required (grant / scholarship)', positive: true });
  } else if (option.financing_type === 'fellowship') {
    score += 20;
    factors.push({ label: 'Fellowship — typically no repayment', positive: true });
  }

  // ── Repayment grace period ─────────────────────────────────────────────────
  if (option.repayment_grace_months && option.repayment_grace_months >= 6) {
    score += 5;
    factors.push({ label: `${option.repayment_grace_months}-month repayment grace period`, positive: true });
  }

  // ── Loan forgiveness ──────────────────────────────────────────────────────
  if (option.loan_forgiveness_available) {
    score += 10;
    factors.push({ label: 'Loan forgiveness available', positive: true });
  }

  // ── Eligibility: citizenship match ────────────────────────────────────────
  const criteria = option.eligibility_criteria || {};
  if (criteria.citizenship) {
    const eligible = Array.isArray(criteria.citizenship)
      ? criteria.citizenship.some(c => c.toLowerCase() === 'all' || c.toLowerCase() === citizenship.toLowerCase())
      : (criteria.citizenship.toLowerCase() === 'all' || criteria.citizenship.toLowerCase() === citizenship.toLowerCase());
    if (!eligible) {
      score -= 30;
      factors.push({ label: 'Citizenship requirement may not be met', positive: false });
    } else {
      score += 5;
      factors.push({ label: 'Citizenship requirement met', positive: true });
    }
  }

  // ── Renewable bonus ────────────────────────────────────────────────────────
  if (option.renewable) {
    score += 5;
    factors.push({ label: 'Renewable for subsequent years', positive: true });
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    factors,
  };
}

// ── Net cost after aid ────────────────────────────────────────────────────────

/**
 * Compute the net cost a student pays after deducting known scholarship / grant aid.
 *
 * @param {number} totalCOAUsd           - Full cost of attendance in USD
 * @param {Array<{amountUSD: number}>} aidAwards - List of aid amounts
 * @returns {{ netCostUSD: number, totalAidUSD: number, coveragePct: number }}
 */
function computeNetCost(totalCOAUsd, aidAwards = []) {
  const totalAidUSD = aidAwards.reduce((sum, a) => sum + (Number(a.amountUSD) || 0), 0);
  const netCostUSD = Math.max(0, totalCOAUsd - totalAidUSD);
  const coveragePct = totalCOAUsd > 0 ? Math.round((totalAidUSD / totalCOAUsd) * 100) : 0;
  return { netCostUSD, totalAidUSD, coveragePct };
}

// ── Refresh exchange rates (called on boot + interval) ───────────────────────

/**
 * Force-refresh the USD→INR exchange rate (busts the in-process cache).
 * Called by app.js on startup and every 6 hours.
 * Errors are logged but not re-thrown so they never crash the server.
 */
async function refreshExchangeRates() {
  try {
    const rate = await getUSDtoINR();
    logger.info('Exchange rate refreshed', { usdToInr: rate });
  } catch (err) {
    logger.warn('Exchange rate refresh failed', { error: err.message });
  }
}

// ── COA with currency display ─────────────────────────────────────────────────

/**
 * Fetch COA for a college and optionally include an INR conversion.
 *
 * @param {object} opts
 * @param {number}  opts.collegeId
 * @param {string}  opts.collegeCountry
 * @param {boolean} [opts.isInternational]
 * @param {string}  [opts.displayCurrency]   'USD' | 'INR'
 * @returns {Promise<object>} COA breakdown from financialComputationEngine
 */
async function getCOA(opts) {
  return computeCostOfAttendance(opts);
}

// ── Multi-college comparison ─────────────────────────────────────────────────

/**
 * Compare COA across multiple colleges.
 *
 * @param {Array<{collegeId: number, collegeCountry: string}>} colleges
 * @param {boolean} isInternational
 * @param {string}  displayCurrency
 * @returns {Promise<Array<object>>} Array of COA breakdowns, sorted by totalUSD ascending
 */
async function compareCOA(colleges, isInternational = true, displayCurrency = 'USD') {
  const results = await Promise.allSettled(
    colleges.map(c =>
      getCOA({
        collegeId: c.collegeId,
        collegeCountry: c.collegeCountry,
        isInternational,
        displayCurrency,
      })
    )
  );

  return results.map((r, idx) => {
    if (r.status === 'fulfilled') return r.value;
    logger.warn('compareCOA: one college failed', {
      collegeId: colleges[idx].collegeId,
      error: r.reason?.message,
    });
    return {
      collegeId: colleges[idx].collegeId,
      error: 'COA data unavailable for this college',
    };
  }).sort((a, b) => (a.totalUSD ?? Infinity) - (b.totalUSD ?? Infinity));
}

// ── Financing options with fit scores ────────────────────────────────────────

/**
 * Fetch financing options from DB and annotate each with a fit score.
 *
 * @param {object} userCtx   - User financial context (see scoreFinancingFit)
 * @param {number} requiredUSD
 * @param {object} filters   - { type, country_of_study, home_country }
 * @returns {Promise<Array<object>>}
 */
async function getFinancingOptionsWithFit(userCtx, requiredUSD, filters = {}) {
  const dbManager = require('../config/database');
  const pool = dbManager.getDatabase();

  const conditions = ['is_validated = TRUE'];
  const params = [];

  if (filters.type) {
    params.push(filters.type);
    conditions.push(`financing_type = $${params.length}`);
  }
  if (filters.country_of_study) {
    params.push(filters.country_of_study);
    conditions.push(`(country_of_study IS NULL OR LOWER(country_of_study) = LOWER($${params.length}))`);
  }
  if (filters.home_country) {
    params.push(filters.home_country);
    conditions.push(`(home_country IS NULL OR LOWER(home_country) = LOWER($${params.length}))`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const { rows } = await pool.query(
    `SELECT * FROM financing_options ${where} ORDER BY financing_type, name`,
    params
  );

  return rows.map(option => {
    const { score, factors } = scoreFinancingFit(option, userCtx, requiredUSD);
    const emi = (option.financing_type === 'federal_loan' || option.financing_type === 'private_loan')
      ? calculateEMI(requiredUSD, parseFloat(option.interest_rate_pct) || 0, option.repayment_term_months || 120)
      : null;
    return { ...option, fitScore: score, fitFactors: factors, emi };
  }).sort((a, b) => b.fitScore - a.fitScore);
}

module.exports = {
  calculateEMI,
  scoreFinancingFit,
  computeNetCost,
  refreshExchangeRates,
  getCOA,
  compareCOA,
  getFinancingOptionsWithFit,
};

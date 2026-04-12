// backend/src/routes/financial.js
//
// REST API for the financial module.  Mounted at /api/financial.
//
// Endpoints:
//   GET  /api/financial/coa/:collegeId              – full COA breakdown
//   GET  /api/financial/net-cost/:collegeId         – COA minus user's aid
//   GET  /api/financial/compare                     – compare COA across colleges
//   GET  /api/financial/scholarships                – search scholarships
//   GET  /api/financial/financing-options           – financing options with fit scores
//   GET  /api/financial/college/:collegeId          – full financial profile (scoring engine)
//   GET  /api/financial/summary                     – all user's colleges ranked by affordability
//   GET  /api/financial/loans                       – loan options + EMI for authenticated user

'use strict';

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { authenticate } = require('../middleware/auth');
const dbManager = require('../config/database');
const config = require('../config/env');
const logger = require('../utils/logger');
const {
  getCOA,
  compareCOA,
  computeNetCost,
  getFinancingOptionsWithFit,
} = require('../services/financialCostService');
const {
  computeFinancialProfile,
  matchScholarships,
  recommendLoans,
} = require('../services/financialScoringService');

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseIntParam(val, fallback) {
  const n = parseInt(val, 10);
  return isNaN(n) ? fallback : n;
}

/**
 * Look up a college's country by ID.
 * Returns null if not found (callers must handle gracefully).
 */
async function getCollegeCountry(pool, collegeId) {
  const { rows } = await pool.query(
    'SELECT country FROM colleges WHERE id = $1',
    [collegeId]
  );
  return rows.length ? rows[0].country : null;
}

// ── GET /api/financial/coa/:collegeId ─────────────────────────────────────────

/**
 * Full cost-of-attendance breakdown for a single college.
 *
 * Query params:
 *   region        - context region (default 'US')
 *   studentType   - 'international' | 'domestic_instate' | 'domestic_outstate' (default 'international')
 *   currency      - 'USD' | 'INR' (default 'USD')
 */
router.get('/coa/:collegeId', async (req, res, next) => {
  try {
    const collegeId = parseIntParam(req.params.collegeId, null);
    if (!collegeId) {
      return res.status(400).json({ success: false, message: 'Invalid college ID' });
    }

    const isInternational = (req.query.studentType || 'international') !== 'domestic_instate';
    const displayCurrency = (req.query.currency || 'USD').toUpperCase() === 'INR' ? 'INR' : 'USD';

    const pool = dbManager.getDatabase();
    const collegeCountry = await getCollegeCountry(pool, collegeId);
    if (!collegeCountry) {
      return res.status(404).json({ success: false, message: 'College not found' });
    }

    const breakdown = await getCOA({ collegeId, collegeCountry, isInternational, displayCurrency });

    res.json({ success: true, data: breakdown });
  } catch (err) {
    logger.error('GET /api/financial/coa/:collegeId failed', { error: err.message });
    next(err);
  }
});

// ── GET /api/financial/net-cost/:collegeId ────────────────────────────────────

/**
 * Net cost after deducting scholarships/aid already tracked by the user.
 *
 * Requires authentication.
 *
 * Query params:
 *   studentType  - same as /coa
 *   currency     - same as /coa
 */
router.get('/net-cost/:collegeId', authenticate, async (req, res, next) => {
  try {
    const collegeId = parseIntParam(req.params.collegeId, null);
    if (!collegeId) {
      return res.status(400).json({ success: false, message: 'Invalid college ID' });
    }

    const isInternational = (req.query.studentType || 'international') !== 'domestic_instate';
    const displayCurrency = (req.query.currency || 'USD').toUpperCase() === 'INR' ? 'INR' : 'USD';
    const userId = req.user.userId;

    const pool = dbManager.getDatabase();
    const collegeCountry = await getCollegeCountry(pool, collegeId);
    if (!collegeCountry) {
      return res.status(404).json({ success: false, message: 'College not found' });
    }

    // Fetch COA
    const coa = await getCOA({ collegeId, collegeCountry, isInternational, displayCurrency });

    // Fetch user's awarded scholarships for this college (via user_scholarships)
    const { rows: awardRows } = await pool.query(
      `SELECT us.award_amount AS "amountUSD", s.name, s.provider
       FROM user_scholarships us
       JOIN scholarships s ON s.id = us.scholarship_id
       WHERE us.user_id = $1 AND us.status = 'awarded'`,
      [userId]
    );

    const netCost = computeNetCost(coa.totalUSD || 0, awardRows);

    res.json({
      success: true,
      data: {
        ...coa,
        netCostUSD: netCost.netCostUSD,
        totalAidUSD: netCost.totalAidUSD,
        aidCoveragePct: netCost.coveragePct,
        awardedScholarships: awardRows,
      },
    });
  } catch (err) {
    logger.error('GET /api/financial/net-cost/:collegeId failed', { error: err.message });
    next(err);
  }
});

// ── GET /api/financial/compare ────────────────────────────────────────────────

/**
 * Compare COA across up to 10 colleges side-by-side.
 *
 * Query params:
 *   collegeIds   - comma-separated college IDs (required, e.g. "1,2,3")
 *   studentType  - 'international' | 'domestic_instate'
 *   currency     - 'USD' | 'INR'
 */
router.get('/compare', async (req, res, next) => {
  try {
    const raw = (req.query.collegeIds || '').trim();
    if (!raw) {
      return res.status(400).json({ success: false, message: 'collegeIds query parameter is required' });
    }

    const ids = raw.split(',')
      .map(s => parseIntParam(s.trim(), null))
      .filter(Boolean)
      .slice(0, 10); // cap at 10

    if (ids.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid college IDs provided' });
    }

    const isInternational = (req.query.studentType || 'international') !== 'domestic_instate';
    const displayCurrency = (req.query.currency || 'USD').toUpperCase() === 'INR' ? 'INR' : 'USD';

    const pool = dbManager.getDatabase();

    // Fetch countries for all colleges in a single query
    const { rows: collegeRows } = await pool.query(
      `SELECT id, name, country FROM colleges WHERE id = ANY($1::int[])`,
      [ids]
    );

    const countryMap = {};
    collegeRows.forEach(r => { countryMap[r.id] = { country: r.country, name: r.name }; });

    const colleges = ids.map(id => ({
      collegeId: id,
      collegeCountry: countryMap[id]?.country || 'United States',
      collegeName: countryMap[id]?.name || `College ${id}`,
    }));

    const results = await compareCOA(colleges, isInternational, displayCurrency);

    res.json({ success: true, data: results, count: results.length });
  } catch (err) {
    logger.error('GET /api/financial/compare failed', { error: err.message });
    next(err);
  }
});

// ── GET /api/financial/scholarships ──────────────────────────────────────────

/**
 * Search scholarships.
 *
 * Query params:
 *   country, needBased, meritBased, minAmount, search, limit, offset
 */
router.get('/scholarships', async (req, res, next) => {
  try {
    const pool = dbManager.getDatabase();

    const {
      country,
      needBased,
      meritBased,
      minAmount,
      search,
      limit: rawLimit = '50',
      offset: rawOffset = '0',
    } = req.query;

    const limit = Math.min(parseIntParam(rawLimit, 50), 200);
    const offset = Math.max(parseIntParam(rawOffset, 0), 0);

    const conditions = [`status = 'active'`];
    const params = [];

    if (country) {
      params.push(country);
      conditions.push(`(LOWER(country) = LOWER($${params.length}) OR LOWER(country) = 'international')`);
    }
    if (needBased === 'true') {
      conditions.push('need_based = TRUE');
    }
    if (meritBased === 'true') {
      conditions.push('merit_based = TRUE');
    }
    if (minAmount) {
      params.push(parseIntParam(minAmount, 0));
      conditions.push(`amount_max >= $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      conditions.push(`(name ILIKE $${idx} OR description ILIKE $${idx} OR provider ILIKE $${idx})`);
    }

    params.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT id, name, provider, country, currency,
              amount, amount_min, amount_max,
              need_based, merit_based, deadline, renewable,
              description, eligibility_summary, application_url,
              nationality_requirements, academic_requirements
       FROM scholarships
       WHERE ${conditions.join(' AND ')}
       ORDER BY deadline ASC NULLS LAST, amount_max DESC NULLS LAST
       LIMIT $${params.length - 1}
       OFFSET $${params.length}`,
      params
    );

    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    logger.error('GET /api/financial/scholarships failed', { error: err.message });
    next(err);
  }
});

// ── GET /api/financial/financing-options ─────────────────────────────────────

/**
 * Financing options with fit scores for a given loan amount.
 *
 * Query params:
 *   requiredAmount  - loan amount needed in USD (default 50000)
 *   type            - financing_type filter
 *   country_of_study
 *   home_country
 *
 * Optionally authenticated: when a token is provided the user's financial
 * profile is loaded for richer scoring.
 */
router.get('/financing-options', async (req, res, next) => {
  try {
    const requiredUSD = Math.max(0, parseIntParam(req.query.requiredAmount, 50000));

    let userCtx = {
      annualIncomeUSD: 0,
      savingsUSD: 0,
      isInternational: true,
      citizenship: req.query.home_country || '',
    };

    // Enrich from DB if authenticated
    if (req.headers.authorization) {
      try {
        const token = req.headers.authorization.replace('Bearer ', '');
        const decoded = jwt.verify(token, config.jwt.secret);
        const pool = dbManager.getDatabase();
        const { rows } = await pool.query(
          'SELECT * FROM user_financial_profiles WHERE user_id = $1',
          [decoded.userId]
        );
        if (rows.length) {
          const fp = rows[0];
          userCtx = {
            annualIncomeUSD: Number(fp.annual_family_income_usd) || 0,
            savingsUSD: Number(fp.savings_available_usd) || 0,
            isInternational: fp.is_international,
            citizenship: fp.citizenship || userCtx.citizenship,
          };
        }
      } catch {
        // Token invalid or profile absent — proceed with anonymous context
      }
    }

    const filters = {
      type: req.query.type,
      country_of_study: req.query.country_of_study,
      home_country: req.query.home_country,
    };

    const options = await getFinancingOptionsWithFit(userCtx, requiredUSD, filters);

    res.json({ success: true, data: options, count: options.length, requiredAmountUSD: requiredUSD });
  } catch (err) {
    logger.error('GET /api/financial/financing-options failed', { error: err.message });
    next(err);
  }
});

// ── GET /api/financial/college/:collegeId ─────────────────────────────────────

/**
 * Full financial profile for a college, personalised to the authenticated user.
 * Includes predicted net cost, merit/need aid, ROI score, accessibility score.
 *
 * Requires authentication.
 */
router.get('/college/:collegeId', authenticate, async (req, res, next) => {
  try {
    const collegeId = parseIntParam(req.params.collegeId, null);
    if (!collegeId) {
      return res.status(400).json({ success: false, message: 'Invalid college ID' });
    }

    const pool = dbManager.getDatabase();

    // Fetch college row
    const { rows: colRows } = await pool.query(
      'SELECT * FROM colleges WHERE id = $1',
      [collegeId]
    );
    if (!colRows.length) {
      return res.status(404).json({ success: false, message: 'College not found' });
    }

    const userCtx = await loadUserFinancialCtx(pool, req.user.userId);
    const profile = await computeFinancialProfile(userCtx, colRows[0], pool);

    res.json({ success: true, data: profile });
  } catch (err) {
    logger.error('GET /api/financial/college/:collegeId failed', { error: err.message });
    next(err);
  }
});

// ── GET /api/financial/summary ────────────────────────────────────────────────

/**
 * Rank all colleges in the user's application list by affordability.
 * Returns each college with financial profile sorted by net_cost_usd ascending.
 *
 * Requires authentication.
 */
router.get('/summary', authenticate, async (req, res, next) => {
  try {
    const pool    = dbManager.getDatabase();
    const userId  = req.user.userId;

    // Load user's application list
    const { rows: appRows } = await pool.query(
      `SELECT a.college_id, c.name, c.country
       FROM applications a
       JOIN colleges c ON c.id = a.college_id
       WHERE a.user_id = $1 AND a.status NOT IN ('rejected')`,
      [userId]
    );

    if (!appRows.length) {
      return res.json({ success: true, data: [], message: 'No colleges in your application list' });
    }

    const userCtx  = await loadUserFinancialCtx(pool, userId);
    const profiles = [];

    for (const row of appRows) {
      try {
        const profile = await computeFinancialProfile(userCtx, { id: row.college_id, name: row.name, country: row.country }, pool);
        profiles.push(profile);
      } catch (e) {
        logger.warn(`Financial summary: skipped ${row.name}`, { error: e.message });
      }
    }

    // Sort by net_cost_usd ascending (most affordable first), nulls last
    profiles.sort((a, b) => {
      if (a.net_cost_usd == null) return 1;
      if (b.net_cost_usd == null) return -1;
      return a.net_cost_usd - b.net_cost_usd;
    });

    // Tag most affordable and best ROI
    if (profiles.length > 0) {
      const withCost = profiles.filter(p => p.net_cost_usd != null);
      if (withCost.length) withCost[0].badge = 'Most Affordable';
      const withROI = profiles.filter(p => p.roi_score != null).sort((a, b) => b.roi_score - a.roi_score);
      if (withROI.length) withROI[0].badge_roi = 'Best ROI';
    }

    res.json({ success: true, data: profiles, count: profiles.length });
  } catch (err) {
    logger.error('GET /api/financial/summary failed', { error: err.message });
    next(err);
  }
});

// ── GET /api/financial/loans ──────────────────────────────────────────────────

/**
 * Personalised loan recommendations with EMI calculation.
 *
 * Query params:
 *   requiredAmount  - required loan amount in USD (default 50000)
 *
 * Optionally authenticated for personalised scoring.
 */
router.get('/loans', async (req, res, next) => {
  try {
    const requiredUSD = Math.max(0, parseIntParam(req.query.requiredAmount, 50000));
    const pool = dbManager.getDatabase();

    let userCtx = {
      has_collateral: false,
      willing_to_take_loan: true,
      nationality: '',
    };

    if (req.headers.authorization) {
      try {
        const token = req.headers.authorization.replace('Bearer ', '');
        const decoded = jwt.verify(token, config.jwt.secret);
        const ctx = await loadUserFinancialCtx(pool, decoded.userId);
        if (ctx) userCtx = { ...userCtx, ...ctx };
      } catch { /* anonymous */ }
    }

    const loans = await recommendLoans(userCtx, requiredUSD, pool);
    res.json({ success: true, data: loans, count: loans.length, required_amount_usd: requiredUSD });
  } catch (err) {
    logger.error('GET /api/financial/loans failed', { error: err.message });
    next(err);
  }
});

module.exports = router;

// ── Helper: load user financial profile ───────────────────────────────────────

async function loadUserFinancialCtx(pool, userId) {
  const { rows } = await pool.query(
    `SELECT u.family_income_usd, u.family_income_inr,
            u.willing_to_take_loan, u.has_collateral,
            u.nationality, u.citizenship,
            sp.gpa, sp.sat_score, sp.act_score,
            sp.intended_major AS intended_majors,
            sp.gender
     FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
  if (!rows.length) return {};
  const r = rows[0];
  return {
    ...r,
    intended_majors: Array.isArray(r.intended_majors)
      ? r.intended_majors
      : r.intended_majors
        ? r.intended_majors.split(',').map(s => s.trim())
        : [],
  };
}

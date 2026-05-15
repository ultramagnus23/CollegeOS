// backend/src/routes/financial.js
//
// REST API for the financial module.  Mounted at /api/financial.
//
// Endpoints:
//   GET  /api/financial/coa/:collegeId              – full COA breakdown
//   GET  /api/financial/net-cost/:collegeId         – COA minus user's aid
//   GET  /api/financial/compare                     – compare COA across colleges
//   GET  /api/financial/scholarships                – search scholarships
//   GET  /api/financial/financing-options           – public, anonymous financing options
//   GET  /api/financial/financing-options/me        – personalised financing options (auth required)
//   GET  /api/financial/college/:collegeId          – full financial profile (scoring engine)
//   GET  /api/financial/summary                     – all user's colleges ranked by affordability
//   GET  /api/financial/loans                       – public loan options (anonymous)
//   GET  /api/financial/loans/me                    – personalised loan recommendations (auth required)

'use strict';

const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const dbManager = require('../config/database');
const logger    = require('../utils/logger');
const {
  getCOA,
  compareCOA,
  computeNetCost,
  getFinancingOptionsWithFit,
} = require('../services/financialCostService');
const {
  computeFinancialProfile,
  recommendLoans,
} = require('../services/financialScoringService');

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseIntParam(val, fallback) {
  const n = parseInt(val, 10);
  return isNaN(n) ? fallback : n;
}

async function getCollegeCountry(pool, collegeId) {
  const { rows } = await pool.query(
    'SELECT country FROM public.colleges WHERE id = $1',
    [collegeId]
  );
  return rows.length ? rows[0].country : null;
}

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

// ── GET /api/financial/coa/:collegeId ─────────────────────────────────────────

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

router.get('/net-cost/:collegeId', authenticate, async (req, res, next) => {
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

    const coa = await getCOA({ collegeId, collegeCountry, isInternational, displayCurrency });

    const { rows: awardRows } = await pool.query(
      `SELECT us.award_amount AS "amountUSD", s.name, s.provider
       FROM user_scholarships us
       JOIN scholarships s ON s.id = us.scholarship_id
       WHERE us.user_id = $1 AND us.status = 'awarded'`,
      [req.user.userId]
    );

    const netCost = computeNetCost(coa.totalUSD || 0, awardRows);
    res.json({
      success: true,
      data: {
        ...coa,
        netCostUSD:          netCost.netCostUSD,
        totalAidUSD:         netCost.totalAidUSD,
        aidCoveragePct:      netCost.coveragePct,
        awardedScholarships: awardRows,
      },
    });
  } catch (err) {
    logger.error('GET /api/financial/net-cost/:collegeId failed', { error: err.message });
    next(err);
  }
});

// ── GET /api/financial/compare ────────────────────────────────────────────────

router.get('/compare', async (req, res, next) => {
  try {
    const raw = (req.query.collegeIds || '').trim();
    if (!raw) {
      return res.status(400).json({ success: false, message: 'collegeIds query parameter is required' });
    }

    const ids = raw.split(',')
      .map(s => parseIntParam(s.trim(), null))
      .filter(Boolean)
      .slice(0, 10);

    if (!ids.length) {
      return res.status(400).json({ success: false, message: 'No valid college IDs provided' });
    }

    const isInternational = (req.query.studentType || 'international') !== 'domestic_instate';
    const displayCurrency = (req.query.currency || 'USD').toUpperCase() === 'INR' ? 'INR' : 'USD';

    const pool = dbManager.getDatabase();
    const { rows: collegeRows } = await pool.query(
      `SELECT id, name, country FROM public.colleges WHERE id = ANY($1::int[])`,
      [ids]
    );

    const countryMap = {};
    collegeRows.forEach(r => { countryMap[r.id] = { country: r.country, name: r.name }; });

    const colleges = ids.map(id => ({
      collegeId:      id,
      collegeCountry: countryMap[id]?.country || 'United States',
      collegeName:    countryMap[id]?.name || `College ${id}`,
    }));

    const results = await compareCOA(colleges, isInternational, displayCurrency);
    res.json({ success: true, data: results, count: results.length });
  } catch (err) {
    logger.error('GET /api/financial/compare failed', { error: err.message });
    next(err);
  }
});

// ── GET /api/financial/scholarships ──────────────────────────────────────────

router.get('/scholarships', async (req, res, next) => {
  try {
    const pool = dbManager.getDatabase();
    const {
      country, needBased, meritBased, minAmount, search,
      limit: rawLimit = '50', offset: rawOffset = '0',
    } = req.query;

    const limit  = Math.min(parseIntParam(rawLimit, 50), 200);
    const offset = Math.max(parseIntParam(rawOffset, 0), 0);

    const conditions = [`status = 'active'`];
    const params = [];

    if (country) {
      params.push(country);
      conditions.push(`(LOWER(country) = LOWER($${params.length}) OR LOWER(country) = 'international')`);
    }
    if (needBased  === 'true') conditions.push('need_based = TRUE');
    if (meritBased === 'true') conditions.push('merit_based = TRUE');
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
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    logger.error('GET /api/financial/scholarships failed', { error: err.message });
    next(err);
  }
});

// ── GET /api/financial/financing-options  (public / anonymous) ───────────────
//
// No user-controlled security check — anonymous context only.

router.get('/financing-options', async (req, res, next) => {
  try {
    const requiredUSD = Math.max(0, parseIntParam(req.query.requiredAmount, 50000));

    const anonymousCtx = {
      annualIncomeUSD:  0,
      savingsUSD:       0,
      isInternational:  true,
      citizenship:      req.query.home_country || '',
    };

    const filters = {
      type:             req.query.type,
      country_of_study: req.query.country_of_study,
      home_country:     req.query.home_country,
    };

    const options = await getFinancingOptionsWithFit(anonymousCtx, requiredUSD, filters);
    res.json({ success: true, data: options, count: options.length, requiredAmountUSD: requiredUSD });
  } catch (err) {
    logger.error('GET /api/financial/financing-options failed', { error: err.message });
    next(err);
  }
});

// ── GET /api/financial/financing-options/me  (authenticated, personalised) ───
//
// Auth enforced entirely by middleware — no branching on user-supplied headers
// inside the handler body (fixes CodeQL js/user-controlled-bypass).

router.get('/financing-options/me', authenticate, async (req, res, next) => {
  try {
    const requiredUSD = Math.max(0, parseIntParam(req.query.requiredAmount, 50000));
    const pool = dbManager.getDatabase();

    const { rows: fpRows } = await pool.query(
      'SELECT * FROM user_financial_profiles WHERE user_id = $1',
      [req.user.userId]
    );

    const fp = fpRows[0] || {};
    const dbCtx = await loadUserFinancialCtx(pool, req.user.userId);

    const userCtx = {
      annualIncomeUSD:  Number(fp.annual_family_income_usd) || 0,
      savingsUSD:       Number(fp.savings_available_usd)    || 0,
      isInternational:  fp.is_international ?? true,
      citizenship:      fp.citizenship || dbCtx.citizenship || '',
    };

    const filters = {
      type:             req.query.type,
      country_of_study: req.query.country_of_study,
      home_country:     req.query.home_country,
    };

    const options = await getFinancingOptionsWithFit(userCtx, requiredUSD, filters);
    res.json({ success: true, data: options, count: options.length, requiredAmountUSD: requiredUSD });
  } catch (err) {
    logger.error('GET /api/financial/financing-options/me failed', { error: err.message });
    next(err);
  }
});

// ── GET /api/financial/college/:collegeId ─────────────────────────────────────

router.get('/college/:collegeId', authenticate, async (req, res, next) => {
  try {
    const collegeId = parseIntParam(req.params.collegeId, null);
    if (!collegeId) {
      return res.status(400).json({ success: false, message: 'Invalid college ID' });
    }

    const pool = dbManager.getDatabase();
    const { rows: colRows } = await pool.query(
      `SELECT
         c.id, c.name, c.country, c.state, c.city,
         COALESCE(to_jsonb(c) ->> 'type', to_jsonb(c) ->> 'institution_type') AS type,
         c.acceptance_rate, c.sat_25, c.sat_75, c.act_25, c.act_75, c.gpa_25, c.gpa_75,
         c.tuition_domestic AS tuition_in_state,
         c.tuition_international
       FROM public.colleges c
       WHERE c.id = $1`,
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

router.get('/summary', authenticate, async (req, res, next) => {
  try {
    const pool   = dbManager.getDatabase();
    const userId = req.user.userId;

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
        const profile = await computeFinancialProfile(
          userCtx,
          { id: row.college_id, name: row.name, country: row.country },
          pool
        );
        profiles.push(profile);
      } catch (e) {
        logger.warn(`Financial summary: skipped ${row.name}`, { error: e.message });
      }
    }

    profiles.sort((a, b) => {
      if (a.net_cost_usd == null) return 1;
      if (b.net_cost_usd == null) return -1;
      return a.net_cost_usd - b.net_cost_usd;
    });

    if (profiles.length) {
      const withCost = profiles.filter(p => p.net_cost_usd != null);
      if (withCost.length) withCost[0].badge = 'Most Affordable';
      const withROI = [...profiles]
        .filter(p => p.roi_score != null)
        .sort((a, b) => b.roi_score - a.roi_score);
      if (withROI.length) withROI[0].badge_roi = 'Best ROI';
    }

    res.json({ success: true, data: profiles, count: profiles.length });
  } catch (err) {
    logger.error('GET /api/financial/summary failed', { error: err.message });
    next(err);
  }
});

// ── GET /api/financial/loans  (public / anonymous) ───────────────────────────

router.get('/loans', async (req, res, next) => {
  try {
    const requiredUSD = Math.max(0, parseIntParam(req.query.requiredAmount, 50000));
    const pool = dbManager.getDatabase();

    const anonymousCtx = {
      has_collateral:       false,
      willing_to_take_loan: true,
      nationality:          '',
    };

    const loans = await recommendLoans(anonymousCtx, requiredUSD, pool);
    res.json({ success: true, data: loans, count: loans.length, required_amount_usd: requiredUSD });
  } catch (err) {
    logger.error('GET /api/financial/loans failed', { error: err.message });
    next(err);
  }
});

// ── GET /api/financial/loans/me  (authenticated, personalised) ───────────────

router.get('/loans/me', authenticate, async (req, res, next) => {
  try {
    const requiredUSD = Math.max(0, parseIntParam(req.query.requiredAmount, 50000));
    const pool = dbManager.getDatabase();

    const userCtx = await loadUserFinancialCtx(pool, req.user.userId);
    const loans   = await recommendLoans(userCtx, requiredUSD, pool);
    res.json({ success: true, data: loans, count: loans.length, required_amount_usd: requiredUSD });
  } catch (err) {
    logger.error('GET /api/financial/loans/me failed', { error: err.message });
    next(err);
  }
});

module.exports = router;

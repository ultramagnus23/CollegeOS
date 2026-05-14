/**
 * Financing Options Routes  —  /api/financing
 *
 * REST endpoints for the `financing_options` table (migration 039).
 * Returns only validated rows by default; source_url + scraped_at are
 * always included so the client can show provenance and "last updated" info.
 */
'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const dbManager = require('../config/database');
const logger = require('../utils/logger');

const VALID_TYPES = ['federal_loan','private_loan','grant','scholarship','work_study','fellowship'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseIntParam(val, fallback) {
  const n = parseInt(val, 10);
  return isNaN(n) ? fallback : n;
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/financing
 * Search / list financing options.
 *
 * Query params:
 *   type            - financing_type filter
 *   country_of_study
 *   home_country
 *   validated       - 'true' (default) | 'false' | 'all'
 *   limit           - max results (default 50, max 200)
 *   offset          - pagination offset (default 0)
 */
router.get('/', async (req, res, next) => {
  try {
    const pool = dbManager.getDatabase();

    const {
      type,
      country_of_study,
      home_country,
      validated = 'true',
      limit: rawLimit = '50',
      offset: rawOffset = '0',
    } = req.query;

    const limit = Math.min(parseIntParam(rawLimit, 50), 200);
    const offset = Math.max(parseIntParam(rawOffset, 0), 0);

    if (type && !VALID_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid type. Allowed values: ${VALID_TYPES.join(', ')}`,
      });
    }

    const conditions = [];
    const params = [];

    if (validated !== 'all') {
      params.push(validated !== 'false');
      conditions.push(`is_validated = $${params.length}`);
    }

    if (type) {
      params.push(type);
      conditions.push(`financing_type = $${params.length}`);
    }

    if (country_of_study) {
      params.push(country_of_study);
      conditions.push(`(country_of_study IS NULL OR LOWER(country_of_study) = LOWER($${params.length}))`);
    }

    if (home_country) {
      params.push(home_country);
      conditions.push(`(home_country IS NULL OR LOWER(home_country) = LOWER($${params.length}))`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT id, name, provider, financing_type,
              country_of_study, home_country,
              amount_min_usd, amount_max_usd, amount_notes,
              interest_rate_pct, interest_type,
              repayment_grace_months, repayment_term_months,
              loan_forgiveness_available,
              eligibility_criteria,
              application_url, deadline_description,
              renewable, renewal_conditions,
              source_url, source_type,
              last_verified_at, scraped_at,
              is_validated
       FROM   financing_options
       ${where}
       ORDER  BY financing_type, name
       LIMIT  $${params.length - 1}
       OFFSET $${params.length}`,
      params
    );

    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    logger.error('GET /api/financing failed', { error: err.message });
    next(err);
  }
});

/**
 * GET /api/financing/:id
 * Get a single financing option by ID.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const pool = dbManager.getDatabase();
    const id = parseIntParam(req.params.id, null);

    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }

    const { rows } = await pool.query(
      'SELECT * FROM financing_options WHERE id = $1',
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Financing option not found' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error('GET /api/financing/:id failed', { error: err.message });
    next(err);
  }
});

/**
 * GET /api/financing/for-college/:collegeId
 * Returns financing options relevant to the college's home country.
 * Includes country-agnostic options (country_of_study IS NULL).
 */
router.get('/for-college/:collegeId', async (req, res, next) => {
  try {
    const pool = dbManager.getDatabase();
    const collegeId = parseIntParam(req.params.collegeId, null);

    if (!collegeId) {
      return res.status(400).json({ success: false, message: 'Invalid college ID' });
    }

    // Look up the college country first
    const { rows: collegeRows } = await pool.query(
      'SELECT country FROM public.clean_colleges WHERE id = $1',
      [collegeId]
    );

    if (!collegeRows.length) {
      return res.status(404).json({ success: false, message: 'College not found' });
    }

    const country = collegeRows[0].country;

    const { rows } = await pool.query(
      `SELECT id, name, provider, financing_type,
              country_of_study, home_country,
              amount_min_usd, amount_max_usd, amount_notes,
              interest_rate_pct, interest_type,
              eligibility_criteria, application_url,
              deadline_description, renewable,
              source_url, source_type, last_verified_at, scraped_at
       FROM   financing_options
       WHERE  is_validated = TRUE
         AND  (country_of_study IS NULL OR LOWER(country_of_study) = LOWER($1))
       ORDER  BY financing_type, name`,
      [country]
    );

    res.json({ success: true, data: rows, count: rows.length, college_country: country });
  } catch (err) {
    logger.error('GET /api/financing/for-college/:collegeId failed', { error: err.message });
    next(err);
  }
});

/**
 * POST /api/financing  (admin / authenticated)
 * Create a new financing option.  source_url and scraped_at are mandatory.
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { validateBatch } = require('../services/scraperValidationService');
    const { accepted, rejected } = validateBatch('financing_option', [req.body]);

    if (rejected.length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Record failed validation',
        errors: rejected[0].errors,
      });
    }

    const record = { scraped_at: new Date().toISOString(), ...accepted[0] };
    const pool = dbManager.getDatabase();

    const { rows } = await pool.query(
      `INSERT INTO financing_options (
         name, provider, financing_type, country_of_study, home_country,
         amount_min_usd, amount_max_usd, amount_notes,
         interest_rate_pct, interest_type,
         repayment_grace_months, repayment_term_months, loan_forgiveness_available,
         eligibility_criteria, application_url, deadline_description, deadline_month,
         renewable, renewal_conditions,
         source_url, source_type, last_verified_at, scraped_at,
         is_validated, validation_errors
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
       ) RETURNING *`,
      [
        record.name, record.provider, record.financing_type,
        record.country_of_study || null, record.home_country || null,
        record.amount_min_usd || null, record.amount_max_usd || null, record.amount_notes || null,
        record.interest_rate_pct || null, record.interest_type || null,
        record.repayment_grace_months || null, record.repayment_term_months || null,
        record.loan_forgiveness_available || false,
        JSON.stringify(record.eligibility_criteria || {}),
        record.application_url || null, record.deadline_description || null,
        record.deadline_month || null,
        record.renewable || false, record.renewal_conditions || null,
        record.source_url, record.source_type || 'official',
        record.last_verified_at || new Date().toISOString(),
        record.scraped_at,
        true, '[]',
      ]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error('POST /api/financing failed', { error: err.message });
    next(err);
  }
});

module.exports = router;

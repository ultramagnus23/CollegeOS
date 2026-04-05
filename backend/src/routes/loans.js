// backend/src/routes/loans.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');

// GET /api/loans/government
router.get('/government', authenticate, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, provider, provider_type, scheme_name, country_of_study,
              eligible_nationalities, degree_levels, max_loan_amount_inr,
              interest_rate_pct, interest_rate_type, subsidy_available, subsidy_scheme,
              moratorium_months, repayment_years, requires_co_applicant,
              eligible_colleges_type, portal_url, status, notes
       FROM government_loans WHERE status = 'active' ORDER BY created_at DESC LIMIT 50`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/loans/private
router.get('/private', authenticate, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, provider, provider_type, country_of_study,
              eligible_nationalities, degree_levels, requires_co_signer,
              requires_collateral, max_loan_amount_usd, max_loan_amount_inr,
              interest_rate_min_pct, interest_rate_max_pct, living_costs_covered,
              portal_url, status, notes
       FROM private_loans WHERE status = 'active' ORDER BY created_at DESC LIMIT 50`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

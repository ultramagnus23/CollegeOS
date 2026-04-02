// backend/src/routes/grants.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');

// GET /api/grants
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, provider, provider_type, country_of_study, eligible_nationalities,
              degree_levels, eligible_majors, income_based, max_family_income_inr,
              award_inr_per_year, award_usd_per_year, award_covers, renewable,
              application_deadline, deadline_is_rolling, portal_url, status, notes
       FROM grants WHERE status = 'active' ORDER BY created_at DESC LIMIT 50`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

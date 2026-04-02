// backend/src/routes/loans.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');

// GET /api/loans/government
router.get('/government', authenticate, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM government_loans WHERE status = 'active' ORDER BY created_at DESC LIMIT 50`
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
      `SELECT * FROM private_loans WHERE status = 'active' ORDER BY created_at DESC LIMIT 50`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

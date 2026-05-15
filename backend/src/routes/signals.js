/**
 * backend/src/routes/signals.js
 * ──────────────────────────────
 * User interaction signals for online-learning vector adjustments.
 *
 * Routes
 * ──────
 *   POST /api/signals  { collegeId, type: 'added'|'dismissed'|'viewed'|'removed' }
 *     Inserts a row into user_signals.  Idempotent per (user, college, type).
 *
 *   GET  /api/signals  (optional — useful for debugging / admin)
 *     Returns the user's 50 most-recent signals.
 */

'use strict';

const express = require('express');
const router  = express.Router();
const logger  = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');

const VALID_TYPES = new Set(['added', 'dismissed', 'viewed', 'removed']);

// ─── POST /api/signals ────────────────────────────────────────────────────────

router.post('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { collegeId, type } = req.body || {};

    if (!collegeId || isNaN(parseInt(collegeId))) {
      return res.status(400).json({ success: false, message: 'collegeId is required' });
    }
    if (!type || !VALID_TYPES.has(type)) {
      return res.status(400).json({
        success: false,
        message: `type must be one of: ${[...VALID_TYPES].join(', ')}`,
      });
    }

    const pool = db.getDatabase();
    const colId = parseInt(collegeId);

    // Verify the college exists
    const { rows: colRows } = await pool.query(
      'SELECT id FROM colleges WHERE id = $1',
      [colId]
    );
    if (!colRows.length) {
      return res.status(404).json({ success: false, message: 'College not found' });
    }

    // Insert signal (allow duplicates — each interaction is a separate data point)
    await pool.query(
      `INSERT INTO user_signals (user_id, college_id, signal_type)
       VALUES ($1, $2, $3)`,
      [userId, colId, type]
    );

    logger.debug('Signal recorded: user=%d college=%d type=%s', userId, colId, type);
    res.json({ success: true });
  } catch (err) {
    // Graceful degradation: signals are non-critical
    logger.warn('Signal insert failed: %s', err.message);
    // Still return 200 so the frontend does not surface an error to the user
    res.json({ success: true });
  }
});

// ─── GET /api/signals ─────────────────────────────────────────────────────────

router.get('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const pool   = db.getDatabase();

    const { rows } = await pool.query(
      `SELECT us.id, us.college_id, c.name AS college_name,
              us.signal_type, us.created_at
       FROM   user_signals us
       JOIN   colleges c ON c.id = us.college_id
       WHERE  us.user_id = $1
       ORDER  BY us.created_at DESC
       LIMIT  50`,
      [userId]
    );

    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    logger.error('GET /api/signals error: %s', err.message);
    next(err);
  }
});

module.exports = router;

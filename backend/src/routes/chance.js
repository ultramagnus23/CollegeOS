// backend/src/routes/chance.js
// POST /api/chance — deterministic JS admission-chancing endpoint.
//
// Uses the same consolidatedChancingService sigmoid model as /api/chancing.
// Returns { tier, probability, confidence, explanation }.

'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const dbManager = require('../config/database');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/security');
const consolidatedChancingService = require('../services/consolidatedChancingService');

/**
 * POST /api/chance
 *
 * Body: { gpa, sat, act, college_name, college_id }
 *
 * Response:
 *   {
 *     success: true,
 *     tier: "Reach",
 *     probability: 0.28,
 *     confidence: "Medium",
 *     explanation: "..."
 *   }
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const {
      gpa,
      sat,
      act,
      college_name,
      college_id,
    } = req.body;

    if (!college_name && !college_id) {
      return res.status(400).json({
        success: false,
        message: 'college_name or college_id is required',
      });
    }

    // Build student profile from request body
    const studentProfile = {
      gpa_unweighted: gpa != null ? parseFloat(gpa) : null,
      sat_total:      sat != null ? parseInt(sat, 10)  : null,
      act_composite:  act != null ? parseInt(act, 10)  : null,
    };

    // Look up the college so we have acceptance_rate, sat_avg, gpa_50
    const pool = dbManager.getDatabase();
    let college = null;
    if (college_id) {
      const College = require('../models/College');
      college = await College.findById(parseInt(college_id, 10));
    } else if (college_name) {
      const { rows } = await pool.query(
        `SELECT
           c.id,
           c.name,
           c.acceptance_rate,
           c.sat_25,
           c.sat_75,
           c.act_25,
           c.act_75,
           c.act_avg,
           c.gpa_25,
           c.gpa_75
         FROM public.colleges c
         WHERE c.name ILIKE $1
         ORDER BY CASE WHEN c.acceptance_rate IS NOT NULL THEN 1 ELSE 2 END, c.name ASC
         LIMIT 1`,
        [college_name]
      );
      college = rows[0] || null;
    }

    // Fall back to a minimal object so calculateChance can still run
    if (!college) {
      college = { name: college_name || String(college_id) };
    }

    const result = await consolidatedChancingService.calculateChance(studentProfile, college);

    return res.json({
      success: true,
      tier:        result.tier,
      probability: result.probability,
      confidence:  result.confidence,
      explanation: result.explanation,
    });
  } catch (error) {
    logger.error('POST /api/chance failed:', { error: sanitizeForLog(error?.message) });
    next(error);
  }
});

module.exports = router;

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
           cc.*,
           ca.acceptance_rate,
           ca.sat_25,
           ca.sat_75,
           ca.sat_avg,
           ca.act_25,
           ca.act_75,
           ca.act_avg,
           ca.gpa_25,
           ca.gpa_75,
           ca.gpa_50
         FROM public.clean_colleges cc
         LEFT JOIN public.college_admissions ca ON cc.id = ca.college_id
         WHERE cc.name ILIKE $1
         ORDER BY CASE WHEN ca.acceptance_rate IS NOT NULL THEN 1 ELSE 2 END, cc.name ASC
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

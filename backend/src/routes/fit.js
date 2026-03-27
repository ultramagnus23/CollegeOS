/**
 * Fit Classification Routes
 * API endpoints for college fit classification
 * 
 * P3: Uses consolidated chancing service
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { batchLimiter } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

// Use consolidated service (primary)
const consolidatedChancingService = require('../services/consolidatedChancingService');

// Legacy service (used where needed)
// fitClassificationService has been removed; consolidatedChancingService handles all fit logic

/**
 * GET /api/fit/:collegeId
 * Get fit classification for a specific college
 */
router.get('/:collegeId', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const collegeId = parseInt(req.params.collegeId);

    if (isNaN(collegeId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid college ID'
      });
    }

    const result = await consolidatedChancingService.classifyFit(userId, collegeId);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error('Fit classification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate fit classification',
      error: 'An internal error occurred'
    });
  }
});


/**
 * GET /api/fit/:collegeId/explain
 * Get detailed explanation for a fit classification
 */
router.get('/:collegeId/explain', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const collegeId = parseInt(req.params.collegeId);

    if (isNaN(collegeId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid college ID'
      });
    }

    const result = await consolidatedChancingService.classifyFit(userId, collegeId);

    res.json({
      success: true,
      data: {
        fitCategory: result.category || result.fit,
        overallScore: result.overall || result.academicFit,
        explanation: result.reasoning || []
      }
    });

  } catch (error) {
    logger.error('Fit explanation error:', error);
    res.status(500).json({
      success: false,
      message: 'An internal error occurred'
    });
  }
});


/**
 * POST /api/fit/batch
 * Get fit classification for multiple colleges (max 100 per request)
 * Returns data keyed by college ID: { 2115: {...fitData}, 2116: {...fitData} }
 */
router.post('/batch', authenticate, batchLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const { collegeIds } = req.body;

    if (!Array.isArray(collegeIds) || collegeIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'collegeIds must be a non-empty array'
      });
    }

    if (collegeIds.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 100 colleges per batch request'
      });
    }

    const validIds = collegeIds.map(id => parseInt(id)).filter(id => !isNaN(id));

    const results = await Promise.all(
      validIds.map(async (collegeId) => {
        try {
          const fitData = await consolidatedChancingService.classifyFit(userId, collegeId);
          return { collegeId, fitData };
        } catch (err) {
          logger.warn(`Fit classification failed for college ${collegeId}:`, err.message);
          return { collegeId, fitData: null };
        }
      })
    );

    // Build map keyed by college ID
    const data = {};
    for (const { collegeId, fitData } of results) {
      data[collegeId] = fitData;
    }

    res.json({
      success: true,
      data
    });

  } catch (error) {
    logger.error('Batch fit classification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process batch fit classification',
      error: 'An internal error occurred'
    });
  }
});


/**
 * POST /api/fit/:collegeId/override
 * Override the calculated fit classification
 */
router.post('/:collegeId/override', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const collegeId = parseInt(req.params.collegeId);
    const { fitCategory, reason } = req.body;

    if (isNaN(collegeId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid college ID'
      });
    }

    const validCategories = ['safety', 'target', 'reach', 'unrealistic'];
    if (!validCategories.includes(fitCategory)) {
      return res.status(400).json({
        success: false,
        message: 'fitCategory must be one of: safety, target, reach, unrealistic'
      });
    }

    const dbManager = require('../config/database');
    const pool = dbManager.getDatabase();

    await consolidatedChancingService.classifyFit(userId, collegeId);

    await pool.query(`
      UPDATE college_fits 
      SET fit_category = $1, 
          is_manual_override = true, 
          override_reason = $2, 
          calculated_at = NOW()
      WHERE user_id = $3 AND college_id = $4
    `, [fitCategory, reason || null, userId, collegeId]);

    res.json({
      success: true,
      message: 'Fit classification overridden',
      data: {
        collegeId,
        fitCategory,
        isManualOverride: true
      }
    });

  } catch (error) {
    logger.error('Fit override error:', error);
    res.status(500).json({
      success: false,
      message: 'An internal error occurred'
    });
  }
});


/**
 * PUT /api/fit/weights
 * Update user's custom weights
 */
router.put('/weights', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { academic, profile, financial, timeline } = req.body;

    const weights = [academic, profile, financial, timeline]
      .filter(w => typeof w === 'number');

    const sum = weights.reduce((a, b) => a + b, 0);

    if (Math.abs(sum - 1.0) > 0.01) {
      return res.status(400).json({
        success: false,
        message: 'Weights must sum to 1.0'
      });
    }

    const dbManager = require('../config/database');
    const pool = dbManager.getDatabase();

    await pool.query(`
      INSERT INTO user_custom_weights (
        user_id, 
        weight_academic, 
        weight_profile, 
        weight_financial, 
        weight_timeline, 
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        weight_academic = EXCLUDED.weight_academic,
        weight_profile = EXCLUDED.weight_profile,
        weight_financial = EXCLUDED.weight_financial,
        weight_timeline = EXCLUDED.weight_timeline,
        updated_at = EXCLUDED.updated_at
    `, [userId, academic, profile, financial, timeline]);

    res.json({
      success: true,
      message: 'Custom weights updated',
      data: { academic, profile, financial, timeline }
    });

  } catch (error) {
    logger.error('Update weights error:', error);
    res.status(500).json({
      success: false,
      message: 'An internal error occurred'
    });
  }
});


/**
 * GET /api/fit/weights
 * Get user's current weights (defaults returned; personalisation removed with deprecated service)
 */
router.get('/weights', authenticate, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        academic: 0.4,
        financial: 0.3,
        location: 0.15,
        outcomes: 0.15
      }
    });

  } catch (error) {
    logger.error('Get weights error:', error);
    res.status(500).json({
      success: false,
      message: 'An internal error occurred'
    });
  }
});

module.exports = router;

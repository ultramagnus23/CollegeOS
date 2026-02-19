/**
 * Fit Classification Routes
 * API endpoints for college fit classification
 * 
 * P3: Now uses consolidated chancing service
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

// Use consolidated service (P3 improvement)
const consolidatedChancingService = require('../services/consolidatedChancingService');

// Legacy service import (deprecated, kept for backward compatibility)
const FitClassificationService = require('../services/fitClassificationService');

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
    
    // Use consolidated service (P3 improvement)
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
      error: error.message
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
    
    const result = await FitClassificationService.classifyCollege(userId, collegeId);
    
    res.json({
      success: true,
      data: {
        fitCategory: result.fitCategory,
        overallScore: result.overallScore,
        explanation: result.explanation
      }
    });
  } catch (error) {
    logger.error('Fit explanation error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/fit/batch
 * Get fit classification for multiple colleges
 */
router.post('/batch', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { collegeIds } = req.body;
    
    if (!Array.isArray(collegeIds) || collegeIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'collegeIds must be a non-empty array'
      });
    }
    
    // Limit batch size
    if (collegeIds.length > 20) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 20 colleges per batch'
      });
    }
    
    const results = await FitClassificationService.classifyColleges(userId, collegeIds);
    
    res.json({
      success: true,
      data: results,
      count: results.length
    });
  } catch (error) {
    logger.error('Batch fit classification error:', error);
    res.status(500).json({
      success: false,
      message: error.message
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
    
    // Store override in database
    const dbManager = require('../config/database');
    const db = dbManager.getDatabase();
    
    // First ensure there's a fit record
    await FitClassificationService.classifyCollege(userId, collegeId);
    
    // Update with override
    db.prepare(`
      UPDATE college_fits 
      SET fit_category = ?, is_manual_override = 1, override_reason = ?, calculated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND college_id = ?
    `).run(fitCategory, reason || null, userId, collegeId);
    
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
      message: error.message
    });
  }
});

/**
 * PUT /api/fit/weights
 * Update user's custom weights for fit calculation
 */
router.put('/weights', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { academic, profile, financial, timeline } = req.body;
    
    // Validate weights sum to approximately 1.0
    const weights = [academic, profile, financial, timeline].filter(w => typeof w === 'number');
    const sum = weights.reduce((a, b) => a + b, 0);
    
    if (Math.abs(sum - 1.0) > 0.01) {
      return res.status(400).json({
        success: false,
        message: 'Weights must sum to 1.0'
      });
    }
    
    const dbManager = require('../config/database');
    const db = dbManager.getDatabase();
    
    db.prepare(`
      INSERT OR REPLACE INTO user_custom_weights (
        user_id, weight_academic, weight_profile, weight_financial, weight_timeline, updated_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(userId, academic, profile, financial, timeline);
    
    res.json({
      success: true,
      message: 'Custom weights updated',
      data: { academic, profile, financial, timeline }
    });
  } catch (error) {
    logger.error('Update weights error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/fit/weights
 * Get user's current weights
 */
router.get('/weights', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const weights = await FitClassificationService.getUserWeights(userId);
    
    res.json({
      success: true,
      data: weights
    });
  } catch (error) {
    logger.error('Get weights error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;

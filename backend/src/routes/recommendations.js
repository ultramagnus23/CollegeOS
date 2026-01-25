// ============================================
// FILE: backend/src/routes/recommendations.js
// Lean, deterministic college recommendation API
// Rule-based scoring with full explainability
// ============================================
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const College = require('../models/College');
const User = require('../models/User');
const logger = require('../utils/logger');
const { generateRecommendations, SCORING_WEIGHTS } = require('../../services/collegeRecommendationService');
const { logView, logSave, logClick, logApply, getUserInteractionStats, getSavedColleges, initializeInteractionTable } = require('../../services/interactionLogService');

// Initialize interaction logging table on first load
let interactionTableInitialized = false;

/**
 * GET /api/recommendations
 * Get curated college recommendations (Reach / Match / Safety)
 * 
 * Query params:
 * - limit: number of colleges per category (default: 5)
 * - country: filter by country
 * 
 * Response format (TODO 8: Frontend-ready response):
 * {
 *   success: boolean,
 *   reach: [{ collegeId, collegeName, category, score, explanation, trustTier }],
 *   match: [...],
 *   safety: [...],
 *   stats: { totalConsidered, reachCount, matchCount, safetyCount, ... }
 * }
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    // Ensure interaction table exists
    if (!interactionTableInitialized) {
      initializeInteractionTable();
      interactionTableInitialized = true;
    }

    const user = User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user's academic profile using the new method
    const userProfile = User.getAcademicProfile(req.user.userId);
    
    if (!userProfile) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your academic profile first',
        redirect: '/onboarding'
      });
    }

    // Get all colleges
    let collegeFilters = {};
    if (req.query.country) {
      collegeFilters.country = req.query.country;
    }
    const allColleges = College.findAll({ ...collegeFilters, limit: 1000 });
    
    // Generate recommendations using the new deterministic service
    const options = {
      limit: parseInt(req.query.limit) || 5
    };
    
    const result = generateRecommendations(userProfile, allColleges, options);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Return frontend-ready response
    res.json({
      success: true,
      reach: result.reach,
      match: result.match,
      safety: result.safety,
      stats: result.stats,
      scoringWeights: SCORING_WEIGHTS, // Include for transparency
      message: `Generated ${result.stats.totalScored} recommendations`
    });
  } catch (error) {
    logger.error('Get recommendations failed:', error);
    next(error);
  }
});

/**
 * POST /api/recommendations/generate
 * Force refresh recommendations
 * Same as GET but explicitly regenerates
 */
router.post('/generate', authenticate, async (req, res, next) => {
  try {
    const user = User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userProfile = User.getAcademicProfile(req.user.userId);
    
    if (!userProfile) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your academic profile first',
        redirect: '/onboarding'
      });
    }

    const allColleges = College.findAll({ limit: 1000 });
    
    const options = {
      limit: parseInt(req.body.limit) || 5
    };
    
    const result = generateRecommendations(userProfile, allColleges, options);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      message: `Generated ${result.stats.totalScored} personalized recommendations`,
      reach: result.reach,
      match: result.match,
      safety: result.safety,
      stats: result.stats,
      userSignals: result.userSignals // Include user signals for debugging
    });
  } catch (error) {
    logger.error('Generate recommendations failed:', error);
    next(error);
  }
});

/**
 * POST /api/recommendations/interactions
 * Log user interactions for future ML training
 * 
 * Body:
 * - collegeId: number (required)
 * - interactionType: 'view' | 'save' | 'click' | 'apply' | 'dismiss' (required)
 * - context: object (optional, additional context)
 * - sourcePage: string (optional, e.g., 'recommendations', 'search')
 */
router.post('/interactions', authenticate, async (req, res, next) => {
  try {
    const { collegeId, interactionType, context, sourcePage, recommendationScore, recommendationCategory } = req.body;
    
    if (!collegeId || !interactionType) {
      return res.status(400).json({
        success: false,
        message: 'collegeId and interactionType are required'
      });
    }

    // Log the interaction
    const logFunctions = {
      'view': logView,
      'save': logSave,
      'click': logClick,
      'apply': logApply
    };

    const logFn = logFunctions[interactionType];
    if (!logFn) {
      // Use generic log for other types
      const { logInteraction } = require('../../services/interactionLogService');
      const result = logInteraction({
        userId: req.user.userId,
        collegeId,
        interactionType,
        recommendationScore,
        recommendationCategory,
        context,
        sourcePage
      });
      return res.json(result);
    }

    const result = logFn(req.user.userId, collegeId, {
      recommendationScore,
      recommendationCategory,
      context,
      sourcePage
    });

    res.json(result);
  } catch (error) {
    logger.error('Log interaction failed:', error);
    next(error);
  }
});

/**
 * GET /api/recommendations/interactions/stats
 * Get user's interaction statistics
 */
router.get('/interactions/stats', authenticate, async (req, res, next) => {
  try {
    const stats = getUserInteractionStats(req.user.userId);
    res.json(stats);
  } catch (error) {
    logger.error('Get interaction stats failed:', error);
    next(error);
  }
});

/**
 * GET /api/recommendations/saved
 * Get user's saved colleges
 */
router.get('/saved', authenticate, async (req, res, next) => {
  try {
    const savedColleges = getSavedColleges(req.user.userId);
    
    res.json({
      success: true,
      count: savedColleges.length,
      data: savedColleges
    });
  } catch (error) {
    logger.error('Get saved colleges failed:', error);
    next(error);
  }
});

/**
 * GET /api/recommendations/explain/:collegeId
 * Get detailed explanation for why a college is recommended
 */
router.get('/explain/:collegeId', authenticate, async (req, res, next) => {
  try {
    const collegeId = parseInt(req.params.collegeId);
    
    // Get the college
    const college = College.findById(collegeId);
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'College not found'
      });
    }

    // Get user profile
    const userProfile = User.getAcademicProfile(req.user.userId);
    if (!userProfile) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your profile first'
      });
    }

    // Generate recommendation for this single college
    const result = generateRecommendations(userProfile, [college], { limit: 1 });
    
    if (!result.success || (result.reach.length === 0 && result.match.length === 0 && result.safety.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Could not generate recommendation for this college'
      });
    }

    // Get the recommendation from whichever category it's in
    const recommendation = result.reach[0] || result.match[0] || result.safety[0];

    res.json({
      success: true,
      data: {
        collegeId: recommendation.collegeId,
        collegeName: recommendation.collegeName,
        category: recommendation.category,
        score: recommendation.score,
        explanation: recommendation.explanation,
        signalScores: recommendation.signalScores,
        trustTier: recommendation.trustTier,
        // Include scoring weights for full transparency
        scoringWeights: SCORING_WEIGHTS
      }
    });
  } catch (error) {
    logger.error('Get explanation failed:', error);
    next(error);
  }
});

module.exports = router;
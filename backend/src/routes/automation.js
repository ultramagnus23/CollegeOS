/**
 * Automation Routes - API endpoints for magic automation features
 */

const express = require('express');
const router = express.Router();
const { authenticate, optionalAuth } = require('../middleware/auth');
const AutoDetectionService = require('../services/autoDetectionService');
const SmartRecommendationService = require('../services/smartRecommendationService');
const logger = require('../utils/logger');

// Input validation constants
const MAX_SCHOOL_NAME_LENGTH = 200;
const MAX_COUNTRIES = 10;
const MAX_MAJORS = 10;

/**
 * POST /api/automation/detect-curriculum
 * Auto-detect curriculum from school name
 */
router.post('/detect-curriculum', optionalAuth, async (req, res) => {
  try {
    const { schoolName } = req.body;
    
    if (!schoolName || typeof schoolName !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'School name is required' 
      });
    }

    if (schoolName.length > MAX_SCHOOL_NAME_LENGTH) {
      return res.status(400).json({
        success: false,
        error: 'School name is too long'
      });
    }

    const result = AutoDetectionService.detectCurriculum(schoolName);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Curriculum detection failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to detect curriculum' 
    });
  }
});

/**
 * POST /api/automation/detect-country
 * Auto-detect country from location
 */
router.post('/detect-country', optionalAuth, async (req, res) => {
  try {
    const { location } = req.body;
    
    if (!location || typeof location !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Location is required' 
      });
    }

    const result = AutoDetectionService.detectCountry(location);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Country detection failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to detect country' 
    });
  }
});

/**
 * POST /api/automation/check-exemption
 * Check English proficiency test exemption
 */
router.post('/check-exemption', authenticate, async (req, res) => {
  try {
    const { profile, targetCountry } = req.body;
    
    if (!profile || !targetCountry) {
      return res.status(400).json({ 
        success: false, 
        error: 'Profile and target country are required' 
      });
    }

    const result = AutoDetectionService.checkEnglishExemption(profile, targetCountry);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Exemption check failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to check exemption' 
    });
  }
});

/**
 * GET /api/automation/application-system/:country
 * Get application system requirements for a country
 */
router.get('/application-system/:country', optionalAuth, async (req, res) => {
  try {
    const { country } = req.params;
    
    if (!country) {
      return res.status(400).json({ 
        success: false, 
        error: 'Country is required' 
      });
    }

    const result = AutoDetectionService.getApplicationSystem(country);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Application system lookup failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get application system' 
    });
  }
});

/**
 * POST /api/automation/recommended-actions
 * Get auto-generated recommended actions
 */
router.post('/recommended-actions', authenticate, async (req, res) => {
  try {
    const { profile } = req.body;
    
    if (!profile) {
      return res.status(400).json({ 
        success: false, 
        error: 'Profile is required' 
      });
    }

    const actions = AutoDetectionService.generateRecommendedActions(profile);
    
    res.json({
      success: true,
      data: actions
    });
  } catch (error) {
    logger.error('Action generation failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate recommended actions' 
    });
  }
});

/**
 * POST /api/automation/profile-strength
 * Calculate profile strength score
 */
router.post('/profile-strength', authenticate, async (req, res) => {
  try {
    const { profile } = req.body;
    
    if (!profile) {
      return res.status(400).json({ 
        success: false, 
        error: 'Profile is required' 
      });
    }

    const strength = AutoDetectionService.calculateProfileStrength(profile);
    
    res.json({
      success: true,
      data: strength
    });
  } catch (error) {
    logger.error('Profile strength calculation failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to calculate profile strength' 
    });
  }
});

/**
 * POST /api/automation/college-list-strategy
 * Generate college list strategy recommendations
 */
router.post('/college-list-strategy', authenticate, async (req, res) => {
  try {
    const { profile, options } = req.body;
    
    if (!profile) {
      return res.status(400).json({ 
        success: false, 
        error: 'Profile is required' 
      });
    }

    const strategy = AutoDetectionService.generateCollegeListStrategy(profile, options || {});
    
    res.json({
      success: true,
      data: strategy
    });
  } catch (error) {
    logger.error('Strategy generation failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate strategy' 
    });
  }
});

/**
 * POST /api/automation/recommendations
 * Generate personalized college recommendations
 */
router.post('/recommendations', authenticate, async (req, res) => {
  try {
    const { profile, preferences } = req.body;
    
    if (!profile) {
      return res.status(400).json({ 
        success: false, 
        error: 'Profile is required' 
      });
    }

    // Validate preferences
    if (preferences) {
      if (preferences.targetCountries && preferences.targetCountries.length > MAX_COUNTRIES) {
        return res.status(400).json({
          success: false,
          error: `Maximum ${MAX_COUNTRIES} target countries allowed`
        });
      }
      if (preferences.majors && preferences.majors.length > MAX_MAJORS) {
        return res.status(400).json({
          success: false,
          error: `Maximum ${MAX_MAJORS} majors allowed`
        });
      }
    }

    const recommendations = await SmartRecommendationService.generateRecommendations(
      profile, 
      preferences || {}
    );
    
    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    logger.error('Recommendation generation failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate recommendations' 
    });
  }
});

/**
 * GET /api/automation/similar-colleges/:collegeId
 * Get colleges similar to a reference college
 */
router.get('/similar-colleges/:collegeId', authenticate, async (req, res) => {
  try {
    const { collegeId } = req.params;
    const profile = req.user; // Use authenticated user profile
    
    if (!collegeId) {
      return res.status(400).json({ 
        success: false, 
        error: 'College ID is required' 
      });
    }

    const similar = await SmartRecommendationService.getSimilarColleges(collegeId, profile);
    
    res.json({
      success: true,
      data: similar
    });
  } catch (error) {
    logger.error('Similar colleges lookup failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get similar colleges' 
    });
  }
});

/**
 * POST /api/automation/instant-recommendations
 * Get instant recommendations after onboarding
 */
router.post('/instant-recommendations', authenticate, async (req, res) => {
  try {
    const { profile } = req.body;
    
    if (!profile) {
      return res.status(400).json({ 
        success: false, 
        error: 'Profile is required' 
      });
    }

    const recommendations = await SmartRecommendationService.getInstantRecommendations(profile);
    
    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    logger.error('Instant recommendations failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate instant recommendations' 
    });
  }
});

/**
 * POST /api/automation/behavior-suggestions
 * Get suggestions based on browsing behavior
 */
router.post('/behavior-suggestions', authenticate, async (req, res) => {
  try {
    const { viewedColleges } = req.body;
    const profile = req.user;
    
    if (!viewedColleges || !Array.isArray(viewedColleges)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Viewed colleges array is required' 
      });
    }

    const suggestions = await SmartRecommendationService.suggestFromBehavior(
      viewedColleges, 
      profile
    );
    
    res.json({
      success: true,
      data: suggestions
    });
  } catch (error) {
    logger.error('Behavior suggestions failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate suggestions' 
    });
  }
});

module.exports = router;

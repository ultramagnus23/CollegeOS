/**
 * Eligibility Routes
 * API endpoints for checking and auto-fulfilling eligibility requirements
 */

const express = require('express');
const router = express.Router();
const EligibilityAutoFulfillService = require('../services/eligibilityAutoFulfillService');
const logger = require('../utils/logger');

/**
 * POST /api/eligibility/check
 * Check auto-fulfillable eligibility requirements for a student profile
 */
router.post('/check', async (req, res) => {
  try {
    const profile = req.body;
    
    if (!profile) {
      return res.status(400).json({
        success: false,
        message: 'Profile data is required'
      });
    }
    
    const result = EligibilityAutoFulfillService.checkAutoFulfillments(profile);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error checking eligibility:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check eligibility'
    });
  }
});

/**
 * POST /api/eligibility/summary
 * Get a complete eligibility summary including auto-fulfillments
 */
router.post('/summary', async (req, res) => {
  try {
    const { profile, college } = req.body;
    
    if (!profile) {
      return res.status(400).json({
        success: false,
        message: 'Profile data is required'
      });
    }
    
    const summary = EligibilityAutoFulfillService.getEligibilitySummary(profile, college);
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error('Error getting eligibility summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get eligibility summary'
    });
  }
});

/**
 * POST /api/eligibility/diploma
 * Specifically check high school diploma status
 */
router.post('/diploma', async (req, res) => {
  try {
    const profile = req.body;
    
    const diplomaStatus = EligibilityAutoFulfillService.checkAutoFulfillments(profile).high_school_diploma;
    
    res.json({
      success: true,
      data: diplomaStatus
    });
  } catch (error) {
    logger.error('Error checking diploma status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check diploma status'
    });
  }
});

/**
 * POST /api/eligibility/english
 * Check English proficiency status and potential waivers
 */
router.post('/english', async (req, res) => {
  try {
    const profile = req.body;
    
    const englishStatus = EligibilityAutoFulfillService.checkAutoFulfillments(profile).english_proficiency;
    
    res.json({
      success: true,
      data: englishStatus
    });
  } catch (error) {
    logger.error('Error checking English proficiency:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check English proficiency'
    });
  }
});

module.exports = router;

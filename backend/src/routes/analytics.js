/**
 * analytics.js - Advanced Analytics API Routes
 * 
 * Provides comprehensive admission analytics endpoints:
 * - Profile strength calculation
 * - College list optimization
 * - What-if scenario analysis
 * - Testing strategy recommendations
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

// Import services
const { calculateProfileStrength, compareProfiles } = require('../services/profileStrengthService');
const { 
  analyzeCollegeList, 
  suggestAdditions, 
  calculateWhatIf: calculateListWhatIf 
} = require('../services/collegeListOptimizerService');
const { 
  analyzeWhatIf, 
  sensitivityAnalysis, 
  findThresholds,
  recommendImprovements,
  analyzeScenarios
} = require('../services/whatIfAnalysisService');

// Models
const StudentProfile = require('../models/StudentProfile');
const College = require('../models/College');
const Application = require('../models/Application');

/**
 * POST /api/analytics/profile-strength
 * Calculate comprehensive profile strength score
 */
router.post('/profile-strength', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    // Get complete profile
    const profile = StudentProfile.getCompleteProfile(userId);
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found. Please complete your profile first.'
      });
    }
    
    // Calculate strength
    const result = calculateProfileStrength(profile);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error
      });
    }
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Profile strength calculation failed:', error);
    next(error);
  }
});

/**
 * POST /api/analytics/profile-strength/compare
 * Compare current profile with a previous snapshot
 */
router.post('/profile-strength/compare', authenticate, async (req, res, next) => {
  try {
    const { oldProfile, newProfile } = req.body;
    
    if (!oldProfile || !newProfile) {
      return res.status(400).json({
        success: false,
        message: 'Both oldProfile and newProfile are required'
      });
    }
    
    const result = compareProfiles(oldProfile, newProfile);
    
    res.json({
      success: result.success,
      data: result.success ? result : null,
      message: result.error || 'Comparison complete'
    });
  } catch (error) {
    logger.error('Profile comparison failed:', error);
    next(error);
  }
});

/**
 * POST /api/analytics/optimize-list
 * Analyze and optimize college application list
 */
router.post('/optimize-list', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { collegeIds } = req.body;
    
    // Get profile
    const profile = StudentProfile.getCompleteProfile(userId);
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found. Please complete your profile first.'
      });
    }
    
    // Get colleges - either from request or from user's applications
    let colleges = [];
    
    if (collegeIds && Array.isArray(collegeIds) && collegeIds.length > 0) {
      colleges = collegeIds.map(id => College.findById(id)).filter(c => c);
    } else {
      // Get from applications
      const applications = Application.findByUser(userId);
      colleges = applications.map(a => College.findById(a.college_id)).filter(c => c);
    }
    
    if (colleges.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No colleges found. Add colleges to your list first.'
      });
    }
    
    // Analyze the list
    const result = analyzeCollegeList(profile, colleges);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error
      });
    }
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('List optimization failed:', error);
    next(error);
  }
});

/**
 * POST /api/analytics/optimize-list/suggest
 * Get suggestions for colleges to add to the list
 */
router.post('/optimize-list/suggest', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { maxSuggestions = 5 } = req.body;
    
    // Get profile
    const profile = StudentProfile.getCompleteProfile(userId);
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }
    
    // Get current colleges
    const applications = Application.findByUser(userId);
    const currentColleges = applications.map(a => College.findById(a.college_id)).filter(c => c);
    
    // Get all available colleges
    const allColleges = College.findAll({ limit: 200 });
    
    // Analyze current distribution
    const analysis = analyzeCollegeList(profile, currentColleges);
    
    if (!analysis.success) {
      return res.status(400).json({
        success: false,
        message: 'Could not analyze current list'
      });
    }
    
    // Get suggestions
    const suggestions = suggestAdditions(
      profile, 
      currentColleges, 
      allColleges, 
      analysis.distribution
    );
    
    res.json({
      success: true,
      data: {
        currentDistribution: analysis.distribution,
        suggestions: suggestions.slice(0, maxSuggestions),
        gaps: analysis.gaps
      }
    });
  } catch (error) {
    logger.error('Suggestion generation failed:', error);
    next(error);
  }
});

/**
 * POST /api/analytics/optimize-list/what-if
 * Calculate what-if for adding/removing a college from the list
 */
router.post('/optimize-list/what-if', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { action, collegeId } = req.body;
    
    if (!action || !collegeId) {
      return res.status(400).json({
        success: false,
        message: 'action ("add" or "remove") and collegeId are required'
      });
    }
    
    // Get profile
    const profile = StudentProfile.getCompleteProfile(userId);
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }
    
    // Get current colleges
    const applications = Application.findByUser(userId);
    const currentColleges = applications.map(a => College.findById(a.college_id)).filter(c => c);
    
    // Get the target college
    const college = College.findById(collegeId);
    
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'College not found'
      });
    }
    
    // Calculate what-if
    const result = calculateListWhatIf(profile, currentColleges, { action, college });
    
    res.json({
      success: result.success,
      data: result.success ? result : null,
      message: result.error || 'What-if analysis complete'
    });
  } catch (error) {
    logger.error('List what-if failed:', error);
    next(error);
  }
});

/**
 * POST /api/analytics/what-if
 * Analyze how profile changes would affect admission chances
 */
router.post('/what-if', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { changes, collegeIds } = req.body;
    
    if (!changes || Object.keys(changes).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one change is required'
      });
    }
    
    // Get profile
    const profile = StudentProfile.getCompleteProfile(userId);
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }
    
    // Get colleges
    let colleges = [];
    if (collegeIds && Array.isArray(collegeIds) && collegeIds.length > 0) {
      colleges = collegeIds.map(id => College.findById(id)).filter(c => c);
    } else {
      const applications = Application.findByUser(userId);
      colleges = applications.map(a => College.findById(a.college_id)).filter(c => c);
    }
    
    if (colleges.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No colleges to analyze. Add colleges to your list.'
      });
    }
    
    // Run what-if analysis
    const result = analyzeWhatIf(profile, changes, colleges);
    
    res.json({
      success: result.success,
      data: result.success ? result : null,
      message: result.error || 'What-if analysis complete'
    });
  } catch (error) {
    logger.error('What-if analysis failed:', error);
    next(error);
  }
});

/**
 * POST /api/analytics/what-if/scenarios
 * Analyze multiple hypothetical scenarios
 */
router.post('/what-if/scenarios', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { scenarios, collegeIds } = req.body;
    
    if (!scenarios || !Array.isArray(scenarios) || scenarios.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one scenario is required'
      });
    }
    
    // Get profile
    const profile = StudentProfile.getCompleteProfile(userId);
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }
    
    // Get colleges
    let colleges = [];
    if (collegeIds && Array.isArray(collegeIds)) {
      colleges = collegeIds.map(id => College.findById(id)).filter(c => c);
    } else {
      const applications = Application.findByUser(userId);
      colleges = applications.map(a => College.findById(a.college_id)).filter(c => c);
    }
    
    // Run scenario analysis
    const result = analyzeScenarios(profile, scenarios, colleges);
    
    res.json({
      success: result.success,
      data: result.success ? result : null,
      message: result.error || 'Scenario analysis complete'
    });
  } catch (error) {
    logger.error('Scenario analysis failed:', error);
    next(error);
  }
});

/**
 * POST /api/analytics/sensitivity
 * Analyze sensitivity of chances to different factors
 */
router.post('/sensitivity', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { collegeIds } = req.body;
    
    // Get profile
    const profile = StudentProfile.getCompleteProfile(userId);
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }
    
    // Get colleges
    let colleges = [];
    if (collegeIds && Array.isArray(collegeIds)) {
      colleges = collegeIds.map(id => College.findById(id)).filter(c => c);
    } else {
      const applications = Application.findByUser(userId);
      colleges = applications.map(a => College.findById(a.college_id)).filter(c => c);
    }
    
    if (colleges.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No colleges to analyze'
      });
    }
    
    const result = sensitivityAnalysis(profile, colleges);
    
    res.json({
      success: result.success,
      data: result
    });
  } catch (error) {
    logger.error('Sensitivity analysis failed:', error);
    next(error);
  }
});

/**
 * POST /api/analytics/thresholds
 * Find thresholds needed to change admission category
 */
router.post('/thresholds', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { collegeId, field } = req.body;
    
    if (!collegeId || !field) {
      return res.status(400).json({
        success: false,
        message: 'collegeId and field are required'
      });
    }
    
    // Get profile
    const profile = StudentProfile.getCompleteProfile(userId);
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }
    
    // Get college
    const college = College.findById(collegeId);
    
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'College not found'
      });
    }
    
    const result = findThresholds(profile, college, field);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Threshold analysis failed:', error);
    next(error);
  }
});

/**
 * GET /api/analytics/recommendations
 * Get personalized improvement recommendations
 */
router.get('/recommendations', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    // Get profile
    const profile = StudentProfile.getCompleteProfile(userId);
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }
    
    // Get colleges
    const applications = Application.findByUser(userId);
    const colleges = applications.map(a => College.findById(a.college_id)).filter(c => c);
    
    // If no colleges, use sample top colleges
    let targetColleges = colleges;
    if (targetColleges.length === 0) {
      targetColleges = College.findAll({ limit: 10, orderBy: 'acceptance_rate' });
    }
    
    const result = recommendImprovements(profile, targetColleges);
    
    res.json({
      success: result.success,
      data: result.success ? result : null,
      message: result.error || 'Recommendations generated'
    });
  } catch (error) {
    logger.error('Recommendation generation failed:', error);
    next(error);
  }
});

/**
 * GET /api/analytics/summary
 * Get comprehensive analytics summary
 */
router.get('/summary', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    // Get profile
    const profile = StudentProfile.getCompleteProfile(userId);
    
    if (!profile) {
      return res.json({
        success: true,
        data: {
          profileComplete: false,
          message: 'Complete your profile to see analytics'
        }
      });
    }
    
    // Get colleges
    const applications = Application.findByUser(userId);
    const colleges = applications.map(a => College.findById(a.college_id)).filter(c => c);
    
    // Calculate profile strength
    const profileStrength = calculateProfileStrength(profile);
    
    // Calculate list optimization if colleges exist
    let listAnalysis = null;
    if (colleges.length > 0) {
      listAnalysis = analyzeCollegeList(profile, colleges);
    }
    
    res.json({
      success: true,
      data: {
        profileComplete: true,
        profileStrength: profileStrength.success ? {
          overallScore: profileStrength.overallScore,
          tier: profileStrength.tier,
          percentile: profileStrength.nationalPercentile
        } : null,
        collegeList: listAnalysis?.success ? {
          totalColleges: listAnalysis.summary.totalColleges,
          atLeastOneAcceptance: listAnalysis.summary.atLeastOneAcceptance,
          balanceScore: listAnalysis.summary.balanceScore,
          listHealth: listAnalysis.summary.listHealth
        } : null,
        recommendations: profileStrength.success ? 
          profileStrength.recommendations.slice(0, 3) : []
      }
    });
  } catch (error) {
    logger.error('Analytics summary failed:', error);
    next(error);
  }
});

module.exports = router;

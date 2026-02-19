/**
 * Profile Controller
 * Handles HTTP requests for profile management
 */

const ProfileService = require('../services/profileService');
const logger = require('../utils/logger');

/**
 * Get complete profile by user ID
 * GET /api/profile/:userId
 */
const getProfile = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    
    // Verify user has access (only own profile or admin)
    if (req.user.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const profile = ProfileService.getCompleteProfile(userId);
    
    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    logger.error('Get profile failed:', error);
    next(error);
  }
};

/**
 * Update basic info
 * PUT /api/profile/:userId/basic
 */
const updateBasicInfo = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    
    // Verify user has access
    if (req.user.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const data = req.validatedData || req.body;
    const profile = ProfileService.updateBasicInfo(userId, data);
    
    res.json({
      success: true,
      message: 'Basic info updated successfully',
      data: profile
    });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    logger.error('Update basic info failed:', error);
    next(error);
  }
};

/**
 * Update academic info
 * PUT /api/profile/:userId/academic
 */
const updateAcademicInfo = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    
    // Verify user has access
    if (req.user.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const data = req.validatedData || req.body;
    const result = ProfileService.updateAcademicInfo(userId, data);
    
    const response = {
      success: true,
      message: 'Academic info updated successfully',
      data: result
    };
    
    // Include warning if curriculum changed and subjects were cleared
    if (result.curriculum_changed && result.subjects_cleared) {
      response.warning = 'Curriculum type changed. Previous subjects have been cleared and need to be re-entered.';
    }
    
    res.json(response);
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    logger.error('Update academic info failed:', error);
    next(error);
  }
};

/**
 * Update subjects
 * PUT /api/profile/:userId/subjects
 */
const updateSubjects = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    
    // Verify user has access
    if (req.user.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const data = req.validatedData || req.body;
    const profile = ProfileService.updateSubjects(userId, data);
    
    res.json({
      success: true,
      message: 'Subjects updated successfully',
      data: profile
    });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    logger.error('Update subjects failed:', error);
    next(error);
  }
};

/**
 * Update test scores
 * PUT /api/profile/:userId/test-scores
 */
const updateTestScores = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    
    // Verify user has access
    if (req.user.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const data = req.validatedData || req.body;
    const profile = ProfileService.updateTestScores(userId, data);
    
    res.json({
      success: true,
      message: 'Test scores updated successfully',
      data: profile
    });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    logger.error('Update test scores failed:', error);
    next(error);
  }
};

/**
 * Update activities
 * PUT /api/profile/:userId/activities
 */
const updateActivities = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    
    // Verify user has access
    if (req.user.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const data = req.validatedData || req.body;
    const profile = ProfileService.updateActivities(userId, data);
    
    res.json({
      success: true,
      message: 'Activities updated successfully',
      data: profile
    });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    logger.error('Update activities failed:', error);
    next(error);
  }
};

/**
 * Delete specific activity
 * DELETE /api/profile/:userId/activities/:activityId
 */
const deleteActivity = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    const activityId = parseInt(req.params.activityId);
    
    // Verify user has access
    if (req.user.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const profile = ProfileService.deleteActivity(userId, activityId);
    
    res.json({
      success: true,
      message: 'Activity deleted successfully',
      data: profile
    });
  } catch (error) {
    if (error.message === 'Profile not found' || error.message === 'Activity not found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    logger.error('Delete activity failed:', error);
    next(error);
  }
};

/**
 * Update preferences
 * PUT /api/profile/:userId/preferences
 */
const updatePreferences = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    
    // Verify user has access
    if (req.user.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const data = req.validatedData || req.body;
    const profile = ProfileService.updatePreferences(userId, data);
    
    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: profile
    });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    logger.error('Update preferences failed:', error);
    next(error);
  }
};

/**
 * Get completion status
 * GET /api/profile/:userId/completion-status
 */
const getCompletionStatus = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    
    // Verify user has access
    if (req.user.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const status = ProfileService.getCompletionStatus(userId);
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Get completion status failed:', error);
    next(error);
  }
};

/**
 * Save onboarding draft
 * POST /api/profile/:userId/onboarding-draft
 */
const saveOnboardingDraft = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    
    // Verify user has access
    if (req.user.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const result = ProfileService.saveOnboardingDraft(userId, req.body);
    
    res.json({
      success: true,
      message: 'Draft saved successfully',
      data: result
    });
  } catch (error) {
    logger.error('Save onboarding draft failed:', error);
    next(error);
  }
};

/**
 * Get onboarding draft
 * GET /api/profile/:userId/onboarding-draft
 */
const getOnboardingDraft = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    
    // Verify user has access
    if (req.user.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const draft = ProfileService.getOnboardingDraft(userId);
    
    res.json({
      success: true,
      data: draft
    });
  } catch (error) {
    logger.error('Get onboarding draft failed:', error);
    next(error);
  }
};

module.exports = {
  getProfile,
  updateBasicInfo,
  updateAcademicInfo,
  updateSubjects,
  updateTestScores,
  updateActivities,
  deleteActivity,
  updatePreferences,
  getCompletionStatus,
  saveOnboardingDraft,
  getOnboardingDraft
};

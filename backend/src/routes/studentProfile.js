// backend/src/routes/studentProfile.js
// API routes for student profile and activities

const express = require('express');
const router = express.Router();
const StudentProfile = require('../models/StudentProfile');
const StudentActivity = require('../models/StudentActivity');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const profileController = require('../controllers/profileController');
const {
  validateBasicInfo,
  validateAcademicInfo,
  validateSubjects,
  validateTestScores,
  validateActivities,
  validatePreferences
} = require('../middleware/profileValidation');

/**
 * GET /api/profile
 * Get the current user's complete profile
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const profile = StudentProfile.getCompleteProfile(req.user.userId);
    
    if (!profile) {
      // Return empty profile structure if none exists
      return res.json({
        success: true,
        data: null,
        message: 'No profile found. Please complete onboarding.'
      });
    }
    
    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    logger.error('Error fetching profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: 'An internal error occurred'
    });
  }
});

/**
 * POST /api/profile
 * Create or update student profile
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const profile = StudentProfile.upsert(req.user.userId, req.body);
    
    res.json({
      success: true,
      data: profile,
      message: 'Profile saved successfully'
    });
  } catch (error) {
    logger.error('Error saving profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save profile',
      error: 'An internal error occurred'
    });
  }
});

/**
 * PUT /api/profile
 * Update student profile (alias for POST)
 */
router.put('/', authenticate, async (req, res) => {
  try {
    const profile = StudentProfile.upsert(req.user.userId, req.body);
    
    res.json({
      success: true,
      data: profile,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    logger.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: 'An internal error occurred'
    });
  }
});

/**
 * DELETE /api/profile
 * Delete student profile and all related data
 */
router.delete('/', authenticate, async (req, res) => {
  try {
    const deleted = StudentProfile.delete(req.user.userId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Profile deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete profile',
      error: 'An internal error occurred'
    });
  }
});

// ==========================================
// ACTIVITIES ROUTES
// ==========================================

/**
 * GET /api/profile/activities
 * Get all activities for the current user
 */
router.get('/activities', authenticate, async (req, res) => {
  try {
    const profile = StudentProfile.findByUserId(req.user.userId);
    
    if (!profile) {
      return res.json({
        success: true,
        data: [],
        message: 'No profile found. Create profile first.'
      });
    }
    
    const activities = StudentActivity.findByStudentId(profile.id);
    const summary = StudentActivity.getTierSummary(profile.id);
    
    res.json({
      success: true,
      data: activities,
      summary: summary,
      activityTypes: StudentActivity.ACTIVITY_TYPES,
      tierDefinitions: StudentActivity.TIER_DEFINITIONS
    });
  } catch (error) {
    logger.error('Error fetching activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activities',
      error: 'An internal error occurred'
    });
  }
});

/**
 * POST /api/profile/activities
 * Add a new activity
 */
router.post('/activities', authenticate, async (req, res) => {
  try {
    // Ensure profile exists
    let profile = StudentProfile.findByUserId(req.user.userId);
    
    if (!profile) {
      // Create minimal profile if it doesn't exist
      profile = StudentProfile.create(req.user.userId, {});
    }
    
    const activity = StudentActivity.create(profile.id, req.body);
    
    res.status(201).json({
      success: true,
      data: activity,
      message: 'Activity added successfully'
    });
  } catch (error) {
    logger.error('Error creating activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add activity',
      error: 'An internal error occurred'
    });
  }
});

/**
 * PUT /api/profile/activities/:id
 * Update an activity
 */
router.put('/activities/:id', authenticate, async (req, res) => {
  try {
    const activityId = parseInt(req.params.id);
    
    // Verify ownership
    const profile = StudentProfile.findByUserId(req.user.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }
    
    const existing = StudentActivity.findById(activityId);
    if (!existing || existing.student_id !== profile.id) {
      return res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
    }
    
    const activity = StudentActivity.update(activityId, req.body);
    
    res.json({
      success: true,
      data: activity,
      message: 'Activity updated successfully'
    });
  } catch (error) {
    logger.error('Error updating activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update activity',
      error: 'An internal error occurred'
    });
  }
});

/**
 * DELETE /api/profile/activities/:id
 * Delete an activity
 */
router.delete('/activities/:id', authenticate, async (req, res) => {
  try {
    const activityId = parseInt(req.params.id);
    
    // Verify ownership
    const profile = StudentProfile.findByUserId(req.user.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }
    
    const existing = StudentActivity.findById(activityId);
    if (!existing || existing.student_id !== profile.id) {
      return res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
    }
    
    StudentActivity.delete(activityId);
    
    res.json({
      success: true,
      message: 'Activity deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete activity',
      error: 'An internal error occurred'
    });
  }
});

/**
 * POST /api/profile/activities/reorder
 * Reorder activities
 */
router.post('/activities/reorder', authenticate, async (req, res) => {
  try {
    const { activityIds } = req.body;
    
    if (!Array.isArray(activityIds)) {
      return res.status(400).json({
        success: false,
        message: 'activityIds must be an array'
      });
    }
    
    const profile = StudentProfile.findByUserId(req.user.userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }
    
    const activities = StudentActivity.reorder(profile.id, activityIds);
    
    res.json({
      success: true,
      data: activities,
      message: 'Activities reordered successfully'
    });
  } catch (error) {
    logger.error('Error reordering activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reorder activities',
      error: 'An internal error occurred'
    });
  }
});

/**
 * GET /api/profile/activities/summary
 * Get activity tier summary
 */
router.get('/activities/summary', authenticate, async (req, res) => {
  try {
    const profile = StudentProfile.findByUserId(req.user.userId);
    
    if (!profile) {
      return res.json({
        success: true,
        data: {
          tier1: { count: 0, total_hours: 0 },
          tier2: { count: 0, total_hours: 0 },
          tier3: { count: 0, total_hours: 0 },
          tier4: { count: 0, total_hours: 0 },
          totalActivities: 0,
          totalHours: 0
        }
      });
    }
    
    const summary = StudentActivity.getTierSummary(profile.id);
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error('Error fetching summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch summary',
      error: 'An internal error occurred'
    });
  }
});

// ==========================================
// ADDITIONAL PROFILE ROUTES (merged from profile.js)
// ==========================================

// Get user profile (basic + extended)
router.get('/full', authenticate, async (req, res, next) => {
  try {
    const user = User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const basicProfile = {
      ...user,
      targetCountries: user.target_countries ? JSON.parse(user.target_countries) : [],
      intendedMajors: user.intended_majors ? JSON.parse(user.intended_majors) : [],
      testStatus: user.test_status ? JSON.parse(user.test_status) : {},
      languagePreferences: user.language_preferences ? JSON.parse(user.language_preferences) : []
    };
    const extendedProfile = StudentProfile.getCompleteProfile(req.user.userId);
    res.json({ success: true, data: { ...basicProfile, studentProfile: extendedProfile } });
  } catch (error) {
    logger.error('Get full profile failed:', error);
    next(error);
  }
});

// Update academic profile fields on the users table
router.patch('/academic', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const updates = req.body;
    const dbManager = require('../config/database');
    const pool = dbManager.getDatabase();
    await pool.query(`
      UPDATE users
      SET target_countries = $1,
          intended_majors = $2,
          test_status = $3,
          language_preferences = $4,
          updated_at = NOW()
      WHERE id = $5
    `, [
      JSON.stringify(updates.target_countries || updates.targetCountries || []),
      JSON.stringify(updates.intended_majors || updates.intendedMajors || []),
      JSON.stringify(updates.test_status || updates.testStatus || {}),
      JSON.stringify(updates.language_preferences || updates.languagePreferences || []),
      userId
    ]);
    const user = User.findById(userId);
    res.json({ success: true, message: 'Profile updated successfully', data: user });
  } catch (error) {
    logger.error('Update academic profile failed:', error);
    next(error);
  }
});

// Create or update extended student profile
router.post('/extended', authenticate, async (req, res, next) => {
  try {
    const profile = StudentProfile.upsert(req.user.userId, req.body);
    res.json({ success: true, data: profile, message: 'Extended profile saved successfully' });
  } catch (error) {
    logger.error('Save extended profile failed:', error);
    next(error);
  }
});

// Get extended student profile
router.get('/extended', authenticate, async (req, res, next) => {
  try {
    const profile = StudentProfile.getCompleteProfile(req.user.userId);
    res.json({ success: true, data: profile });
  } catch (error) {
    logger.error('Get extended profile failed:', error);
    next(error);
  }
});

// Update full profile and also sync user table fields
router.put('/full', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const data = req.body;
    const profile = StudentProfile.upsert(userId, data);
    const dbManager = require('../config/database');
    const pool = dbManager.getDatabase();
    if (data.targetCountries || data.target_countries ||
        data.intendedMajors || data.intended_majors ||
        data.testStatus || data.test_status) {
      await pool.query(`
        UPDATE users
        SET target_countries = COALESCE($1, target_countries),
            intended_majors = COALESCE($2, intended_majors),
            test_status = COALESCE($3, test_status),
            updated_at = NOW()
        WHERE id = $4
      `, [
        data.targetCountries || data.target_countries ? JSON.stringify(data.targetCountries || data.target_countries) : null,
        data.intendedMajors || data.intended_majors ? JSON.stringify(data.intendedMajors || data.intended_majors) : null,
        data.testStatus || data.test_status ? JSON.stringify(data.testStatus || data.test_status) : null,
        userId
      ]);
    }
    const completeProfile = StudentProfile.getCompleteProfile(userId);
    res.json({ success: true, message: 'Profile updated successfully', data: completeProfile });
  } catch (error) {
    logger.error('Full profile update failed:', error);
    next(error);
  }
});

// Get current profile snapshot
router.get('/snapshot', authenticate, async (req, res, next) => {
  try {
    const profile = StudentProfile.getCompleteProfile(req.user.userId);
    if (!profile) {
      return res.json({ success: true, data: null, message: 'No profile found' });
    }
    const snapshot = {
      timestamp: new Date().toISOString(),
      academic: {
        gpa: profile.gpa_unweighted || profile.gpa_weighted,
        sat: profile.sat_total,
        act: profile.act_composite,
        classRank: profile.class_rank_percentile
      },
      activities: {
        total: (profile.activities || []).length,
        tier1: (profile.activities || []).filter(a => a.tier_rating === 1).length,
        tier2: (profile.activities || []).filter(a => a.tier_rating === 2).length,
        tier3: (profile.activities || []).filter(a => a.tier_rating === 3).length
      },
      coursework: {
        total: (profile.coursework || []).length,
        apIb: (profile.coursework || []).filter(c => c.course_level === 'AP' || c.course_level === 'IB').length
      },
      demographics: {
        isFirstGen: profile.is_first_generation,
        isLegacy: profile.is_legacy,
        state: profile.state_province
      }
    };
    res.json({ success: true, data: snapshot });
  } catch (error) {
    logger.error('Get snapshot failed:', error);
    next(error);
  }
});

// ==========================================
// PER-USER PROFILE MANAGEMENT ENDPOINTS
// ==========================================

router.get('/:userId', authenticate, profileController.getProfile);
router.put('/:userId/basic', authenticate, validateBasicInfo, profileController.updateBasicInfo);
router.put('/:userId/academic', authenticate, validateAcademicInfo, profileController.updateAcademicInfo);
router.put('/:userId/subjects', authenticate, validateSubjects, profileController.updateSubjects);
router.put('/:userId/test-scores', authenticate, validateTestScores, profileController.updateTestScores);
router.put('/:userId/activities', authenticate, validateActivities, profileController.updateActivities);
router.delete('/:userId/activities/:activityId', authenticate, profileController.deleteActivity);
router.put('/:userId/preferences', authenticate, validatePreferences, profileController.updatePreferences);
router.get('/:userId/completion-status', authenticate, profileController.getCompletionStatus);
router.post('/:userId/onboarding-draft', authenticate, profileController.saveOnboardingDraft);
router.get('/:userId/onboarding-draft', authenticate, profileController.getOnboardingDraft);

module.exports = router;

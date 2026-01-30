const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const StudentActivity = require('../models/StudentActivity');
const logger = require('../utils/logger');

// Get user profile (basic + extended)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const user = User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Parse JSON fields from user table
    const basicProfile = {
      ...user,
      targetCountries: user.target_countries ? JSON.parse(user.target_countries) : [],
      intendedMajors: user.intended_majors ? JSON.parse(user.intended_majors) : [],
      testStatus: user.test_status ? JSON.parse(user.test_status) : {},
      languagePreferences: user.language_preferences ? JSON.parse(user.language_preferences) : []
    };

    // Get extended student profile if it exists
    const extendedProfile = StudentProfile.getCompleteProfile(req.user.userId);

    res.json({
      success: true,
      data: {
        ...basicProfile,
        studentProfile: extendedProfile
      }
    });
  } catch (error) {
    logger.error('Get profile failed:', error);
    next(error);
  }
});

// Update academic profile
router.patch('/academic', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const updates = req.body;

    // Update user with academic data
    const dbManager = require('../config/database');
    const db = dbManager.getDatabase();
    
    const stmt = db.prepare(`
      UPDATE users 
      SET target_countries = ?,
          intended_majors = ?,
          test_status = ?,
          language_preferences = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(
      JSON.stringify(updates.target_countries || updates.targetCountries || []),
      JSON.stringify(updates.intended_majors || updates.intendedMajors || []),
      JSON.stringify(updates.test_status || updates.testStatus || {}),
      JSON.stringify(updates.language_preferences || updates.languagePreferences || []),
      userId
    );

    const user = User.findById(userId);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: user
    });
  } catch (error) {
    logger.error('Update profile failed:', error);
    next(error);
  }
});

// ==========================================
// EXTENDED STUDENT PROFILE ROUTES
// ==========================================

// Create or update extended student profile
router.post('/extended', authenticate, async (req, res, next) => {
  try {
    const profile = StudentProfile.upsert(req.user.userId, req.body);
    
    res.json({
      success: true,
      data: profile,
      message: 'Extended profile saved successfully'
    });
  } catch (error) {
    logger.error('Save extended profile failed:', error);
    next(error);
  }
});

// Get extended student profile
router.get('/extended', authenticate, async (req, res, next) => {
  try {
    const profile = StudentProfile.getCompleteProfile(req.user.userId);
    
    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    logger.error('Get extended profile failed:', error);
    next(error);
  }
});

// ==========================================
// ACTIVITIES ROUTES
// ==========================================

// Get all activities
router.get('/activities', authenticate, async (req, res, next) => {
  try {
    const profile = StudentProfile.findByUserId(req.user.userId);
    
    if (!profile) {
      return res.json({
        success: true,
        data: [],
        summary: {
          tier1: { count: 0, total_hours: 0 },
          tier2: { count: 0, total_hours: 0 },
          tier3: { count: 0, total_hours: 0 },
          tier4: { count: 0, total_hours: 0 },
          totalActivities: 0,
          totalHours: 0
        },
        activityTypes: StudentActivity.ACTIVITY_TYPES,
        tierDefinitions: StudentActivity.TIER_DEFINITIONS
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
    logger.error('Get activities failed:', error);
    next(error);
  }
});

// Add a new activity
router.post('/activities', authenticate, async (req, res, next) => {
  try {
    // Ensure profile exists
    let profile = StudentProfile.findByUserId(req.user.userId);
    
    if (!profile) {
      profile = StudentProfile.create(req.user.userId, {});
    }
    
    const activity = StudentActivity.create(profile.id, req.body);
    
    res.status(201).json({
      success: true,
      data: activity,
      message: 'Activity added successfully'
    });
  } catch (error) {
    logger.error('Create activity failed:', error);
    next(error);
  }
});

// Update an activity
router.put('/activities/:id', authenticate, async (req, res, next) => {
  try {
    const activityId = parseInt(req.params.id);
    
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
    logger.error('Update activity failed:', error);
    next(error);
  }
});

// Delete an activity
router.delete('/activities/:id', authenticate, async (req, res, next) => {
  try {
    const activityId = parseInt(req.params.id);
    
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
    logger.error('Delete activity failed:', error);
    next(error);
  }
});

// Reorder activities
router.post('/activities/reorder', authenticate, async (req, res, next) => {
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
    logger.error('Reorder activities failed:', error);
    next(error);
  }
});

module.exports = router;
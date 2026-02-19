// backend/src/routes/studentProfile.js
// API routes for student profile and activities

const express = require('express');
const router = express.Router();
const StudentProfile = require('../models/StudentProfile');
const StudentActivity = require('../models/StudentActivity');
const { authenticateToken } = require('../middleware/auth');

/**
 * GET /api/profile
 * Get the current user's complete profile
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const profile = StudentProfile.getCompleteProfile(req.user.id);
    
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
    console.error('Error fetching profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: error.message
    });
  }
});

/**
 * POST /api/profile
 * Create or update student profile
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const profile = StudentProfile.upsert(req.user.id, req.body);
    
    res.json({
      success: true,
      data: profile,
      message: 'Profile saved successfully'
    });
  } catch (error) {
    console.error('Error saving profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save profile',
      error: error.message
    });
  }
});

/**
 * PUT /api/profile
 * Update student profile (alias for POST)
 */
router.put('/', authenticateToken, async (req, res) => {
  try {
    const profile = StudentProfile.upsert(req.user.id, req.body);
    
    res.json({
      success: true,
      data: profile,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
});

/**
 * DELETE /api/profile
 * Delete student profile and all related data
 */
router.delete('/', authenticateToken, async (req, res) => {
  try {
    const deleted = StudentProfile.delete(req.user.id);
    
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
    console.error('Error deleting profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete profile',
      error: error.message
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
router.get('/activities', authenticateToken, async (req, res) => {
  try {
    const profile = StudentProfile.findByUserId(req.user.id);
    
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
    console.error('Error fetching activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activities',
      error: error.message
    });
  }
});

/**
 * POST /api/profile/activities
 * Add a new activity
 */
router.post('/activities', authenticateToken, async (req, res) => {
  try {
    // Ensure profile exists
    let profile = StudentProfile.findByUserId(req.user.id);
    
    if (!profile) {
      // Create minimal profile if it doesn't exist
      profile = StudentProfile.create(req.user.id, {});
    }
    
    const activity = StudentActivity.create(profile.id, req.body);
    
    res.status(201).json({
      success: true,
      data: activity,
      message: 'Activity added successfully'
    });
  } catch (error) {
    console.error('Error creating activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add activity',
      error: error.message
    });
  }
});

/**
 * PUT /api/profile/activities/:id
 * Update an activity
 */
router.put('/activities/:id', authenticateToken, async (req, res) => {
  try {
    const activityId = parseInt(req.params.id);
    
    // Verify ownership
    const profile = StudentProfile.findByUserId(req.user.id);
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
    console.error('Error updating activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update activity',
      error: error.message
    });
  }
});

/**
 * DELETE /api/profile/activities/:id
 * Delete an activity
 */
router.delete('/activities/:id', authenticateToken, async (req, res) => {
  try {
    const activityId = parseInt(req.params.id);
    
    // Verify ownership
    const profile = StudentProfile.findByUserId(req.user.id);
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
    console.error('Error deleting activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete activity',
      error: error.message
    });
  }
});

/**
 * POST /api/profile/activities/reorder
 * Reorder activities
 */
router.post('/activities/reorder', authenticateToken, async (req, res) => {
  try {
    const { activityIds } = req.body;
    
    if (!Array.isArray(activityIds)) {
      return res.status(400).json({
        success: false,
        message: 'activityIds must be an array'
      });
    }
    
    const profile = StudentProfile.findByUserId(req.user.id);
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
    console.error('Error reordering activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reorder activities',
      error: error.message
    });
  }
});

/**
 * GET /api/profile/activities/summary
 * Get activity tier summary
 */
router.get('/activities/summary', authenticateToken, async (req, res) => {
  try {
    const profile = StudentProfile.findByUserId(req.user.id);
    
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
    console.error('Error fetching summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch summary',
      error: error.message
    });
  }
});

module.exports = router;

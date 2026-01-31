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

// ==========================================
// FULL PROFILE UPDATE WITH LIVE CHANCING
// ==========================================

/**
 * PUT /api/profile
 * Update full profile with all fields
 */
router.put('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const data = req.body;
    
    // Update student profile
    const profile = StudentProfile.upsert(userId, data);
    
    // Also update user table fields if provided
    const dbManager = require('../config/database');
    const db = dbManager.getDatabase();
    
    if (data.targetCountries || data.target_countries || 
        data.intendedMajors || data.intended_majors ||
        data.testStatus || data.test_status) {
      db.prepare(`
        UPDATE users 
        SET target_countries = COALESCE(?, target_countries),
            intended_majors = COALESCE(?, intended_majors),
            test_status = COALESCE(?, test_status),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        data.targetCountries || data.target_countries ? 
          JSON.stringify(data.targetCountries || data.target_countries) : null,
        data.intendedMajors || data.intended_majors ? 
          JSON.stringify(data.intendedMajors || data.intended_majors) : null,
        data.testStatus || data.test_status ? 
          JSON.stringify(data.testStatus || data.test_status) : null,
        userId
      );
    }
    
    const completeProfile = StudentProfile.getCompleteProfile(userId);
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: completeProfile
    });
  } catch (error) {
    logger.error('Full profile update failed:', error);
    next(error);
  }
});

/**
 * PUT /api/profile/with-chancing
 * Update profile and return live chancing impact
 */
router.put('/with-chancing', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { profileData, collegeIds } = req.body;
    
    if (!profileData) {
      return res.status(400).json({
        success: false,
        message: 'profileData is required'
      });
    }
    
    // Get old profile and chancing first
    const oldProfile = StudentProfile.getCompleteProfile(userId);
    const { getChancingForStudent } = require('../services/chancingCalculator');
    const College = require('../models/College');
    const Application = require('../models/Application');
    
    // Get colleges to calculate chancing for
    let colleges = [];
    if (collegeIds && Array.isArray(collegeIds) && collegeIds.length > 0) {
      colleges = collegeIds.map(id => College.findById(id)).filter(c => c);
    } else {
      // Use colleges from applications
      const applications = Application.findByUser(userId);
      colleges = applications.map(a => College.findById(a.college_id)).filter(c => c);
    }
    
    // Calculate old chancing
    let oldChancing = null;
    if (oldProfile && colleges.length > 0) {
      oldChancing = getChancingForStudent(userId, colleges);
    }
    
    // Update profile
    const updatedProfile = StudentProfile.upsert(userId, profileData);
    const completeProfile = StudentProfile.getCompleteProfile(userId);
    
    // Calculate new chancing
    let newChancing = null;
    let comparison = [];
    
    if (completeProfile && colleges.length > 0) {
      newChancing = getChancingForStudent(userId, colleges);
      
      // Build comparison
      if (oldChancing && !oldChancing.error && newChancing && !newChancing.error) {
        comparison = newChancing.results.map(newResult => {
          const oldResult = oldChancing.results.find(o => o.college.id === newResult.college.id);
          const oldChance = oldResult?.chancing?.chance || 0;
          const newChance = newResult.chancing.chance;
          const change = newChance - oldChance;
          
          return {
            college: newResult.college,
            oldChance,
            newChance,
            change,
            changeText: change > 0 ? `+${change}%` : `${change}%`,
            oldCategory: oldResult?.chancing?.category || 'Unknown',
            newCategory: newResult.chancing.category,
            categoryChanged: (oldResult?.chancing?.category || 'Unknown') !== newResult.chancing.category,
            improved: change > 0
          };
        });
      }
    }
    
    // Calculate summary stats
    const improved = comparison.filter(c => c.improved).length;
    const decreased = comparison.filter(c => c.change < 0).length;
    const stayed = comparison.filter(c => c.change === 0).length;
    
    res.json({
      success: true,
      message: 'Profile updated with chancing impact',
      data: {
        profile: completeProfile,
        chancing: newChancing?.error ? null : newChancing,
        comparison: comparison,
        summary: {
          collegesAnalyzed: comparison.length,
          improved,
          decreased,
          stayed,
          avgChange: comparison.length > 0 
            ? Math.round(comparison.reduce((sum, c) => sum + c.change, 0) / comparison.length)
            : 0,
          categoryChanges: comparison.filter(c => c.categoryChanged).map(c => ({
            college: c.college.name,
            from: c.oldCategory,
            to: c.newCategory
          }))
        }
      }
    });
  } catch (error) {
    logger.error('Profile update with chancing failed:', error);
    next(error);
  }
});

/**
 * GET /api/profile/snapshot
 * Get current profile snapshot for comparison
 */
router.get('/snapshot', authenticate, async (req, res, next) => {
  try {
    const profile = StudentProfile.getCompleteProfile(req.user.userId);
    
    if (!profile) {
      return res.json({
        success: true,
        data: null,
        message: 'No profile found'
      });
    }
    
    // Create compact snapshot
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
    
    res.json({
      success: true,
      data: snapshot
    });
  } catch (error) {
    logger.error('Get snapshot failed:', error);
    next(error);
  }
});

module.exports = router;
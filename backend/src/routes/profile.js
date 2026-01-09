const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const User = require('../models/User');
const logger = require('../utils/logger');

// Get user profile
router.get('/', authenticate, async (req, res, next) => {
  try {
    const user = User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Parse JSON fields
    const profile = {
      ...user,
      targetCountries: user.target_countries ? JSON.parse(user.target_countries) : [],
      intendedMajors: user.intended_majors ? JSON.parse(user.intended_majors) : [],
      testStatus: user.test_status ? JSON.parse(user.test_status) : {},
      languagePreferences: user.language_preferences ? JSON.parse(user.language_preferences) : []
    };

    res.json({
      success: true,
      data: profile
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

module.exports = router;
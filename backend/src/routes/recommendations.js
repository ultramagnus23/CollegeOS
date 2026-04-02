// ============================================
// FILE: backend/src/routes/recommendations.js
// ============================================
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const College = require('../models/College');
const User = require('../models/User');
const logger = require('../utils/logger');

// Get recommendations for user - uses recommendationEngine service
router.get('/', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user's academic profile
    const userProfile = await User.getAcademicProfile(req.user.userId);
    
    if (!userProfile) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your academic profile first',
        redirect: '/onboarding'
      });
    }

    // Get all colleges
    const College = require('../models/College');
    const allColleges = await College.findAll({ limit: 1000 }); // Get all for recommendations

    // Attach institutional funding to each college so the engine can use it
    const dbManager = require('../config/database');
    const pool = dbManager.getDatabase();
    try {
      const { rows: fundingRows } = await pool.query(
        `SELECT * FROM college_funding
          WHERE international_students_eligible = TRUE`
      );
      // Build a map by college_id
      const fundingMap = {};
      for (const row of fundingRows) {
        const cid = row.college_id;
        if (!fundingMap[cid]) fundingMap[cid] = [];
        fundingMap[cid].push(row);
      }
      for (const college of allColleges) {
        college.funding = fundingMap[college.id] || [];
      }
    } catch (_fundingErr) {
      // college_funding table may not exist in all environments — non-fatal
      for (const college of allColleges) {
        college.funding = college.funding || [];
      }
    }

    // Use recommendation engine service
    const { generateRecommendations } = require('../services/recommendationEngine');
    const result = await generateRecommendations(userProfile, allColleges);

    if (result && result.error === 'exchange_rate_missing') {
      return res.status(503).json({
        success: false,
        message: 'Exchange rate service unavailable — please try again in a few minutes',
        error: 'exchange_rate_missing',
      });
    }

    res.json({
      success: true,
      count: (result.recommendations || []).length,
      ...result,
    });
  } catch (error) {
    logger.error('Get recommendations failed:', error);
    next(error);
  }
});

// Generate new recommendations - same as GET but forces refresh
router.post('/generate', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userProfile = await User.getAcademicProfile(req.user.userId);
    
    if (!userProfile) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your academic profile first'
      });
    }

    const College = require('../models/College');
    const allColleges = await College.findAll({ limit: 1000 });

    // Attach institutional funding
    const dbManager = require('../config/database');
    const pool = dbManager.getDatabase();
    try {
      const { rows: fundingRows } = await pool.query(
        `SELECT * FROM college_funding WHERE international_students_eligible = TRUE`
      );
      const fundingMap = {};
      for (const row of fundingRows) {
        const cid = row.college_id;
        if (!fundingMap[cid]) fundingMap[cid] = [];
        fundingMap[cid].push(row);
      }
      for (const college of allColleges) {
        college.funding = fundingMap[college.id] || [];
      }
    } catch (_fundingErr) {
      for (const college of allColleges) {
        college.funding = college.funding || [];
      }
    }

    const { generateRecommendations } = require('../services/recommendationEngine');
    const result = await generateRecommendations(userProfile, allColleges);

    if (result && result.error === 'exchange_rate_missing') {
      return res.status(503).json({
        success: false,
        message: 'Exchange rate service unavailable — please try again in a few minutes',
        error: 'exchange_rate_missing',
      });
    }

    res.json({
      success: true,
      message: `Generated ${(result.recommendations || []).length} personalized recommendations`,
      count: (result.recommendations || []).length,
      ...result,
    });
  } catch (error) {
    logger.error('Generate recommendations failed:', error);
    next(error);
  }
});

// Helper function
function determineClassification(college, user) {
  // Simple logic - in real app this would be more sophisticated
  const acceptanceRate = college.acceptance_rate || 50;
  
  if (acceptanceRate < 20) return 'REACH';
  if (acceptanceRate < 50) return 'TARGET';
  return 'SAFETY';
}

module.exports = router;
// ============================================
// FILE: backend/src/routes/recommendations.js
// ============================================
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const College = require('../models/College');
const User = require('../models/User');
const logger = require('../utils/logger');

function createRequestId() {
  return `reco_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Get recommendations for user - uses recommendationEngine service
router.get('/', authenticate, async (req, res, next) => {
  const requestId = createRequestId();
  const startedAt = Date.now();
  try {
    const requestedLimit = Number.parseInt(String(req.query.limit ?? 250), 10);
    const safeLimit = Number.isFinite(requestedLimit) ? Math.min(500, Math.max(25, requestedLimit)) : 250;
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
    const allColleges = await College.findAll({ limit: safeLimit });

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
    const recs = Array.isArray(result?.recommendations) ? result.recommendations : [];
    const missingRankings = recs.filter((r) => r.acceptance_rate_pct == null).length;
    const malformedMajors = recs.filter((r) => Array.isArray(r.why_values) && r.why_values.some((v) => !v?.dimension)).length;

    res.json({
      success: true,
      count: recs.length,
      meta: { requestId, durationMs: Date.now() - startedAt, evaluated: allColleges.length },
      ...result,
    });
    logger.info('recommendations.generated', {
      requestId,
      durationMs: Date.now() - startedAt,
      evaluated: allColleges.length,
      returned: recs.length,
      missingRankings,
      malformedMajors,
    });
  } catch (error) {
    logger.error('Get recommendations failed:', { requestId, message: error?.message, stack: error?.stack });
    next(error);
  }
});

// Generate new recommendations - same as GET but forces refresh
router.post('/generate', authenticate, async (req, res, next) => {
  const requestId = createRequestId();
  const startedAt = Date.now();
  try {
    const requestedLimit = Number.parseInt(String(req.query.limit ?? 250), 10);
    const safeLimit = Number.isFinite(requestedLimit) ? Math.min(500, Math.max(25, requestedLimit)) : 250;
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
    const allColleges = await College.findAll({ limit: safeLimit });

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
    const recs = Array.isArray(result?.recommendations) ? result.recommendations : [];

    res.json({
      success: true,
      message: `Generated ${recs.length} personalized recommendations`,
      count: recs.length,
      meta: { requestId, durationMs: Date.now() - startedAt, evaluated: allColleges.length },
      ...result,
    });
    logger.info('recommendations.regenerated', {
      requestId,
      durationMs: Date.now() - startedAt,
      evaluated: allColleges.length,
      returned: recs.length,
    });
  } catch (error) {
    logger.error('Generate recommendations failed:', { requestId, message: error?.message, stack: error?.stack });
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

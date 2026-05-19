// ============================================
// FILE: backend/src/routes/recommendations.js
// ============================================
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
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

    const { generateRecommendationsV2 } = require('../services/recommendation/recommendationPipelineService');
    const recs = await generateRecommendationsV2(userProfile, { limit: safeLimit, candidateLimit: 220 });
    const missingRankings = recs.filter((r) => r?.score_breakdown?.ranking_fit == null).length;
    const malformedMajors = recs.filter((r) => Array.isArray(r.why_values) && r.why_values.some((v) => !v)).length;

    res.json({
      success: true,
      count: recs.length,
      generated_at: new Date().toISOString(),
      recommendations: recs,
      summary: {
        total_colleges_evaluated: Math.max(recs.length, safeLimit),
        exchange_rate_note: 'Recommendation pipeline v2 (embedding retrieval + LTR reranking + MMR diversification)',
      },
      meta: { requestId, durationMs: Date.now() - startedAt, evaluated: safeLimit, pipeline: 'v2' },
    });
    logger.info('recommendations.generated', {
      requestId,
      durationMs: Date.now() - startedAt,
      evaluated: safeLimit,
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

    const { generateRecommendationsV2 } = require('../services/recommendation/recommendationPipelineService');
    const recs = await generateRecommendationsV2(userProfile, { limit: safeLimit, candidateLimit: 260 });

    res.json({
      success: true,
      message: `Generated ${recs.length} personalized recommendations`,
      count: recs.length,
      generated_at: new Date().toISOString(),
      recommendations: recs,
      summary: {
        total_colleges_evaluated: Math.max(recs.length, safeLimit),
        exchange_rate_note: 'Recommendation pipeline v2 (embedding retrieval + LTR reranking + MMR diversification)',
      },
      meta: { requestId, durationMs: Date.now() - startedAt, evaluated: safeLimit, pipeline: 'v2' },
    });
    logger.info('recommendations.regenerated', {
      requestId,
      durationMs: Date.now() - startedAt,
      evaluated: safeLimit,
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

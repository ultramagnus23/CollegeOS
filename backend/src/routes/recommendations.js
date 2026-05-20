// ============================================
// FILE: backend/src/routes/recommendations.js
// ============================================
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const User = require('../models/User');
const logger = require('../utils/logger');
const { createSession, trackEvent, upsertFeedback } = require('../services/feedback/telemetryService');

function createRequestId() {
  return `reco_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchUserProfile(userId) {
  const user = await User.findById(userId);
  if (!user) return { user: null, profile: null };
  const profile = await User.getAcademicProfile(userId);
  return { user, profile };
}

// Get recommendations for user - uses recommendationEngine service
router.get('/', authenticate, async (req, res, next) => {
  const requestId = createRequestId();
  const startedAt = Date.now();
  try {
    const requestedLimit = Number.parseInt(String(req.query.limit ?? 250), 10);
    const safeLimit = Number.isFinite(requestedLimit) ? Math.min(500, Math.max(25, requestedLimit)) : 250;
    const { user, profile: userProfile } = await fetchUserProfile(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!userProfile) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your academic profile first',
        redirect: '/onboarding'
      });
    }

    const { generateRecommendationsV2 } = require('../services/recommendation/recommendationPipelineService');
    const sessionId = await createSession({
      userId: req.user.userId,
      requestContext: {
        endpoint: 'GET /api/recommendations',
        limit: safeLimit,
      },
      profileSnapshot: userProfile,
      modelVersion: 'ranker-v2',
      retrievalVersion: 'hybrid-v2',
    });

    const recs = await generateRecommendationsV2(userProfile, { limit: safeLimit, candidateLimit: 220, userId: req.user.userId });
    const missingRankings = recs.filter((r) => r?.score_breakdown?.ranking_fit == null).length;
    const malformedMajors = recs.filter((r) => Array.isArray(r.why_values) && r.why_values.some((v) => !v)).length;

    await trackEvent({
      sessionId,
      userId: req.user.userId,
      eventType: 'time_spent',
      eventValue: recs.length,
      dwellMs: Date.now() - startedAt,
      metadata: { requestId, returned: recs.length },
    });

    res.json({
      success: true,
      count: recs.length,
      generated_at: new Date().toISOString(),
      recommendations: recs,
      summary: {
        total_colleges_evaluated: Math.max(recs.length, safeLimit),
        exchange_rate_note: 'Recommendation pipeline v3 (hybrid retrieval + cross-encoder reranking + LTR + personalization)',
      },
      meta: { requestId, durationMs: Date.now() - startedAt, evaluated: safeLimit, pipeline: 'v3', sessionId },
    });
    logger.info('recommendations.generated', {
      requestId,
      durationMs: Date.now() - startedAt,
      evaluated: safeLimit,
      returned: recs.length,
      missingRankings,
      malformedMajors,
      sessionId,
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
    const { user, profile: userProfile } = await fetchUserProfile(req.user.userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!userProfile) {
      return res.status(400).json({ success: false, message: 'Please complete your academic profile first' });
    }

    const { generateRecommendationsV2 } = require('../services/recommendation/recommendationPipelineService');
    const sessionId = await createSession({
      userId: req.user.userId,
      requestContext: {
        endpoint: 'POST /api/recommendations/generate',
        limit: safeLimit,
      },
      profileSnapshot: userProfile,
      modelVersion: 'ranker-v2',
      retrievalVersion: 'hybrid-v2',
    });

    const recs = await generateRecommendationsV2(userProfile, { limit: safeLimit, candidateLimit: 260, userId: req.user.userId });

    await trackEvent({
      sessionId,
      userId: req.user.userId,
      eventType: 'time_spent',
      eventValue: recs.length,
      dwellMs: Date.now() - startedAt,
      metadata: { requestId, regenerated: true },
    });

    res.json({
      success: true,
      message: `Generated ${recs.length} personalized recommendations`,
      count: recs.length,
      generated_at: new Date().toISOString(),
      recommendations: recs,
      summary: {
        total_colleges_evaluated: Math.max(recs.length, safeLimit),
        exchange_rate_note: 'Recommendation pipeline v3 (hybrid retrieval + cross-encoder reranking + LTR + personalization)',
      },
      meta: { requestId, durationMs: Date.now() - startedAt, evaluated: safeLimit, pipeline: 'v3', sessionId },
    });
    logger.info('recommendations.regenerated', {
      requestId,
      durationMs: Date.now() - startedAt,
      evaluated: safeLimit,
      returned: recs.length,
      sessionId,
    });
  } catch (error) {
    logger.error('Generate recommendations failed:', { requestId, message: error?.message, stack: error?.stack });
    next(error);
  }
});

router.post('/events', authenticate, async (req, res, next) => {
  try {
    const { sessionId = null, institutionId = null, eventType, eventValue = null, dwellMs = null, position = null, metadata = {} } = req.body || {};
    if (!eventType) {
      return res.status(400).json({ success: false, message: 'eventType is required' });
    }

    await trackEvent({
      sessionId,
      userId: req.user.userId,
      institutionId,
      eventType,
      eventValue,
      dwellMs,
      position,
      metadata,
    });

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.post('/feedback', authenticate, async (req, res, next) => {
  try {
    const {
      sessionId = null,
      institutionId,
      explicitRating = null,
      fitRating = null,
      affordabilityRating = null,
      reasonCodes = [],
      notes = null,
      confidence = null,
    } = req.body || {};

    if (!institutionId) {
      return res.status(400).json({ success: false, message: 'institutionId is required' });
    }

    await upsertFeedback({
      sessionId,
      userId: req.user.userId,
      institutionId,
      explicitRating,
      fitRating,
      affordabilityRating,
      reasonCodes: Array.isArray(reasonCodes) ? reasonCodes : [],
      notes,
      confidence,
    });

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;

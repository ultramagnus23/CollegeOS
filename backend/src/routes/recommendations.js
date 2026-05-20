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

function logRecommendationPipelineError(err, context = {}) {
  console.error('==============================');
  console.error('RECOMMENDATION PIPELINE ERROR');
  console.error('==============================');
  console.error('MESSAGE:', err?.message);
  console.error('STACK:', err?.stack);
  console.error('FULL ERROR:', err);
  if (err?.details) console.error('DETAILS:', err.details);
  if (err?.hint) console.error('HINT:', err.hint);
  if (err?.code) console.error('CODE:', err.code);
  if (Object.keys(context).length > 0) console.error('CONTEXT:', context);
}

function recommendationErrorResponse(res, err, context = {}) {
  logRecommendationPipelineError(err, context);
  return res.status(500).json({
    success: false,
    error: err?.message || 'Internal server error',
    code: err?.code || null,
    details: err?.details || null,
    recommendations: [],
    metadata: {
      requestId: context.requestId || null,
      endpoint: context.endpoint || null,
    },
    diagnostics: {
      stage: context.stage || 'route_handler',
      timestamp: new Date().toISOString(),
    },
  });
}

// Get recommendations for user - uses recommendationEngine service
router.get('/', authenticate, async (req, res) => {
  const requestId = createRequestId();
  const startedAt = Date.now();
  try {
    const requestedLimit = Number.parseInt(String(req.query.limit ?? 250), 10);
    const safeLimit = Number.isFinite(requestedLimit) ? Math.min(500, Math.max(25, requestedLimit)) : 250;
    const { user, profile: userProfile } = await fetchUserProfile(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        recommendations: [],
        metadata: { requestId },
        diagnostics: {},
      });
    }

    if (!userProfile) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your academic profile first',
        redirect: '/onboarding',
        recommendations: [],
        metadata: { requestId },
        diagnostics: {},
      });
    }

    const { generateRecommendationsV2 } = require('../services/recommendation/recommendationPipelineService');
    let sessionId = null;
    try {
      sessionId = await createSession({
        userId: req.user.userId,
        requestContext: {
          endpoint: 'GET /api/recommendations',
          limit: safeLimit,
        },
        profileSnapshot: userProfile,
        modelVersion: 'ranker-v2',
        retrievalVersion: 'hybrid-v2',
      });
    } catch (sessionError) {
      logRecommendationPipelineError(sessionError, { requestId, endpoint: 'GET /api/recommendations', stage: 'create_session' });
    }

    const pipelineResult = await generateRecommendationsV2(userProfile, { limit: safeLimit, candidateLimit: 220, userId: req.user.userId });
    const recs = Array.isArray(pipelineResult?.recommendations) ? pipelineResult.recommendations : [];
    const missingRankings = recs.filter((r) => r?.score_breakdown?.ranking_fit == null).length;
    const malformedMajors = recs.filter((r) => Array.isArray(r.why_values) && r.why_values.some((v) => !v)).length;

    try {
      await trackEvent({
        sessionId,
        userId: req.user.userId,
        eventType: 'time_spent',
        eventValue: recs.length,
        dwellMs: Date.now() - startedAt,
        metadata: { requestId, returned: recs.length },
      });
    } catch (trackError) {
      logRecommendationPipelineError(trackError, { requestId, endpoint: 'GET /api/recommendations', stage: 'track_event' });
    }

    res.json({
      success: true,
      count: recs.length,
      generated_at: new Date().toISOString(),
      recommendations: recs,
      metadata: pipelineResult?.metadata || {},
      diagnostics: pipelineResult?.diagnostics || {},
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
    return recommendationErrorResponse(res, error, { requestId, endpoint: 'GET /api/recommendations', stage: 'route_handler' });
  }
});

// Generate new recommendations - same as GET but forces refresh
router.post('/generate', authenticate, async (req, res) => {
  const requestId = createRequestId();
  const startedAt = Date.now();
  try {
    const requestedLimit = Number.parseInt(String(req.query.limit ?? 250), 10);
    const safeLimit = Number.isFinite(requestedLimit) ? Math.min(500, Math.max(25, requestedLimit)) : 250;
    const { user, profile: userProfile } = await fetchUserProfile(req.user.userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found', recommendations: [], metadata: { requestId }, diagnostics: {} });
    }

    if (!userProfile) {
      return res.status(400).json({ success: false, message: 'Please complete your academic profile first', recommendations: [], metadata: { requestId }, diagnostics: {} });
    }

    const { generateRecommendationsV2 } = require('../services/recommendation/recommendationPipelineService');
    let sessionId = null;
    try {
      sessionId = await createSession({
        userId: req.user.userId,
        requestContext: {
          endpoint: 'POST /api/recommendations/generate',
          limit: safeLimit,
        },
        profileSnapshot: userProfile,
        modelVersion: 'ranker-v2',
        retrievalVersion: 'hybrid-v2',
      });
    } catch (sessionError) {
      logRecommendationPipelineError(sessionError, { requestId, endpoint: 'POST /api/recommendations/generate', stage: 'create_session' });
    }

    const pipelineResult = await generateRecommendationsV2(userProfile, { limit: safeLimit, candidateLimit: 260, userId: req.user.userId });
    const recs = Array.isArray(pipelineResult?.recommendations) ? pipelineResult.recommendations : [];

    try {
      await trackEvent({
        sessionId,
        userId: req.user.userId,
        eventType: 'time_spent',
        eventValue: recs.length,
        dwellMs: Date.now() - startedAt,
        metadata: { requestId, regenerated: true },
      });
    } catch (trackError) {
      logRecommendationPipelineError(trackError, { requestId, endpoint: 'POST /api/recommendations/generate', stage: 'track_event' });
    }

    res.json({
      success: true,
      message: `Generated ${recs.length} personalized recommendations`,
      count: recs.length,
      generated_at: new Date().toISOString(),
      recommendations: recs,
      metadata: pipelineResult?.metadata || {},
      diagnostics: pipelineResult?.diagnostics || {},
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
    return recommendationErrorResponse(res, error, { requestId, endpoint: 'POST /api/recommendations/generate', stage: 'route_handler' });
  }
});

router.post('/events', authenticate, async (req, res) => {
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
    return recommendationErrorResponse(res, error, { endpoint: 'POST /api/recommendations/events', stage: 'events_handler' });
  }
});

router.post('/feedback', authenticate, async (req, res) => {
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
    return recommendationErrorResponse(res, error, { endpoint: 'POST /api/recommendations/feedback', stage: 'feedback_handler' });
  }
});

module.exports = router;

// ============================================
// FILE: backend/src/routes/recommendations.js
// ============================================
const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const User = require('../models/User');
const config = require('../config/env');
const { hashIdentifier, safeError, safeLog, sanitizeForLog } = require('../utils/safeLogger');
const { createSession, trackEvent, upsertFeedback } = require('../services/feedback/telemetryService');

function createRequestId() {
  return crypto.randomUUID();
}

async function fetchUserProfile(userId) {
  const user = await User.findById(userId);
  if (!user) return { user: null, profile: null };
  const profile = await User.getAcademicProfile(userId);
  return { user, profile };
}

function logRecommendationPipelineError(err, context = {}) {
  safeError('recommendations.pipeline_error', {
    context: sanitizeForLog(context),
    error: err,
  });
}

function recommendationErrorResponse(res, err, context = {}) {
  logRecommendationPipelineError(err, context);
  return res.status(500).json({
    success: false,
    error: config.nodeEnv === 'production' ? 'Internal server error' : sanitizeForLog(err?.message || 'Internal server error'),
    recommendations: [],
    metadata: {
      requestId: context.requestId || null,
      endpoint: context.endpoint || null,
    },
    diagnostics: config.nodeEnv === 'production'
      ? {}
      : {
        stage: sanitizeForLog(context.stage || 'route_handler'),
        timestamp: new Date().toISOString(),
        code: sanitizeForLog(err?.code),
      },
  });
}

// Get recommendations for user - uses recommendationEngine service
router.get('/', authenticate, async (req, res) => {
  const requestId = req.requestId || createRequestId();
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
          requestId,
          pipeline: 'v3',
        },
        profileSnapshot: userProfile,
        modelVersion: 'ranker-v2',
        retrievalVersion: 'hybrid-v2',
      });
    } catch (sessionError) {
      safeLog('recommendations.session_create_failed', {
        requestId,
        endpoint: 'GET /api/recommendations',
        stage: 'create_session',
        error: sessionError,
      }, 'warn');
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
        metadata: { requestId, returned: recs.length, source: 'GET /api/recommendations' },
      });
    } catch (trackError) {
      safeLog('recommendations.track_event_failed', {
        requestId,
        endpoint: 'GET /api/recommendations',
        stage: 'track_event',
        error: trackError,
      }, 'warn');
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
    safeLog('recommendations.generated', {
      requestId,
      durationMs: Date.now() - startedAt,
      evaluated: safeLimit,
      returned: recs.length,
      missingRankings,
      malformedMajors,
      sessionId: sessionId ? hashIdentifier(sessionId) : null,
      userHash: hashIdentifier(req.user.userId),
    });
  } catch (error) {
    safeError('recommendations.get_failed', {
      requestId,
      endpoint: 'GET /api/recommendations',
      error,
    });
    return recommendationErrorResponse(res, error, { requestId, endpoint: 'GET /api/recommendations', stage: 'route_handler' });
  }
});

// Generate new recommendations - same as GET but forces refresh
router.post('/generate', authenticate, async (req, res) => {
  const requestId = req.requestId || createRequestId();
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
          requestId,
          pipeline: 'v3',
        },
        profileSnapshot: userProfile,
        modelVersion: 'ranker-v2',
        retrievalVersion: 'hybrid-v2',
      });
    } catch (sessionError) {
      safeLog('recommendations.generate_session_create_failed', {
        requestId,
        endpoint: 'POST /api/recommendations/generate',
        stage: 'create_session',
        error: sessionError,
      }, 'warn');
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
        metadata: { requestId, regenerated: true, source: 'POST /api/recommendations/generate' },
      });
    } catch (trackError) {
      safeLog('recommendations.generate_track_event_failed', {
        requestId,
        endpoint: 'POST /api/recommendations/generate',
        stage: 'track_event',
        error: trackError,
      }, 'warn');
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
    safeLog('recommendations.regenerated', {
      requestId,
      durationMs: Date.now() - startedAt,
      evaluated: safeLimit,
      returned: recs.length,
      sessionId: sessionId ? hashIdentifier(sessionId) : null,
      userHash: hashIdentifier(req.user.userId),
    });
  } catch (error) {
    safeError('recommendations.generate_failed', {
      requestId,
      endpoint: 'POST /api/recommendations/generate',
      error,
    });
    return recommendationErrorResponse(res, error, { requestId, endpoint: 'POST /api/recommendations/generate', stage: 'route_handler' });
  }
});

router.post('/events', authenticate, async (req, res) => {
  const requestId = req.requestId || createRequestId();
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
      metadata: { ...metadata, requestId, source: 'POST /api/recommendations/events' },
    });

    return res.json({ success: true });
  } catch (error) {
    safeError('recommendations.events_failed', {
      requestId,
      endpoint: 'POST /api/recommendations/events',
      error,
    });
    return recommendationErrorResponse(res, error, { requestId, endpoint: 'POST /api/recommendations/events', stage: 'events_handler' });
  }
});

router.post('/feedback', authenticate, async (req, res) => {
  const requestId = req.requestId || createRequestId();
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
    safeError('recommendations.feedback_failed', {
      requestId,
      endpoint: 'POST /api/recommendations/feedback',
      error,
    });
    return recommendationErrorResponse(res, error, { requestId, endpoint: 'POST /api/recommendations/feedback', stage: 'feedback_handler' });
  }
});

module.exports = router;

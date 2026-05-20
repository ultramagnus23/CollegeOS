// ============================================
// FILE: backend/src/routes/recommendations.js
// ============================================
const crypto = require('crypto');
const express = require('express');
const { z } = require('zod');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const User = require('../models/User');
const config = require('../config/env');
const { hashIdentifier, safeError, safeLog, sanitizeForLog } = require('../utils/safeLogger');
const { createSession, trackEvent, upsertFeedback } = require('../services/feedback/telemetryService');
const {
  assertJsonSerializable,
  elapsedMs,
  errorSummary,
  logStageComplete,
  logStageFailure,
  logStageStart,
  nowMs,
} = require('../services/recommendation/pipelineDiagnostics');

const RecommendationRequestSchema = z.object({
  major: z.string().trim().min(1).optional(),
  intendedMajors: z.array(z.string().trim().min(1)).optional(),
  gpa: z.number().nullable().optional(),
  satScore: z.number().nullable().optional(),
  actScore: z.number().nullable().optional(),
  budget: z.number().nullable().optional(),
  preferredCountries: z.array(z.string().trim().min(1)).optional(),
  degreeLevel: z.string().trim().min(1).optional(),
  countryFilter: z.string().trim().min(1).optional(),
}).strict();

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
  const summarized = errorSummary(err);
  return res.status(500).json({
    success: false,
    stage: context.stage || 'route_handler',
    error: sanitizeForLog(err?.message || 'Internal server error'),
    errorCode: sanitizeForLog(err?.code || null),
    location: {
      file: sanitizeForLog(summarized.file),
      line: summarized.line,
      column: summarized.column,
    },
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

function mergeRecommendationPayloadIntoProfile(profile = {}, payload = {}) {
  const merged = { ...(profile || {}) };
  const intendedMajors = Array.isArray(payload.intendedMajors)
    ? payload.intendedMajors
    : payload.major ? [payload.major] : null;
  if (intendedMajors) merged.intended_majors = intendedMajors;
  if (Object.prototype.hasOwnProperty.call(payload, 'gpa')) merged.gpa = payload.gpa;
  if (Object.prototype.hasOwnProperty.call(payload, 'satScore')) merged.sat_score = payload.satScore;
  if (Object.prototype.hasOwnProperty.call(payload, 'actScore')) merged.act_score = payload.actScore;
  if (Object.prototype.hasOwnProperty.call(payload, 'preferredCountries')) {
    merged.preferences = {
      ...(merged.preferences || {}),
      preferred_countries: payload.preferredCountries || [],
    };
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'degreeLevel')) {
    merged.preferences = {
      ...(merged.preferences || {}),
      degree_level: payload.degreeLevel || null,
    };
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'budget')) {
    merged.financial = {
      ...(merged.financial || {}),
      max_budget_per_year_usd: payload.budget,
    };
  }
  return merged;
}

// Get recommendations for user - uses recommendationEngine service
router.get('/', authenticate, async (req, res) => {
  const requestId = req.requestId || createRequestId();
  const startedAt = Date.now();
  const enableTraceLogs = config.nodeEnv !== 'production' || process.env.RECOMMENDATION_TRACE === 'true';
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

    const response = {
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
    };
    if (enableTraceLogs) {
      console.log('[API] final:', response?.recommendations?.length);
      console.log('FINAL RECOMMENDATIONS SERIALIZED', JSON.stringify(response?.recommendations || []));
      console.log('FINAL RESPONSE', JSON.stringify(response, null, 2));
    }
    res.json(response);
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
  const startedAt = nowMs();
  const enableTraceLogs = config.nodeEnv !== 'production' || process.env.RECOMMENDATION_TRACE === 'true';
  const stageTimings = {};
  let currentStage = 'request_received';
  try {
    currentStage = 'request_received';
    const s1 = nowMs();
    logStageStart('[1] request received', { requestId, endpoint: 'POST /api/recommendations/generate' });
    const requestedLimit = Number.parseInt(String(req.query.limit ?? 250), 10);
    const safeLimit = Number.isFinite(requestedLimit) ? Math.min(500, Math.max(25, requestedLimit)) : 250;
    stageTimings.request_received_ms = elapsedMs(s1);
    logStageComplete('[1] request received', s1, { requestId });

    currentStage = 'payload_validation';
    const s2 = nowMs();
    logStageStart('[2] validating payload', { requestId });
    const payloadValidation = RecommendationRequestSchema.safeParse(req.body || {});
    if (!payloadValidation.success) {
      stageTimings.payload_validation_ms = elapsedMs(s2);
      logStageFailure('[2] validating payload', payloadValidation.error, { requestId, endpoint: 'POST /api/recommendations/generate' });
      return res.status(400).json({
        success: false,
        stage: 'payload_validation',
        error: 'Invalid recommendation request payload',
        requestId,
        validationErrors: payloadValidation.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        })),
      });
    }
    stageTimings.payload_validation_ms = elapsedMs(s2);
    logStageComplete('[2] validating payload', s2, { requestId });

    currentStage = 'loading_student_profile';
    const s3 = nowMs();
    logStageStart('[3] loading student profile', { requestId });
    const { user, profile: persistedProfile } = await fetchUserProfile(req.user.userId);
    const userProfile = mergeRecommendationPayloadIntoProfile(persistedProfile || {}, payloadValidation.data || {});
    stageTimings.loading_student_profile_ms = elapsedMs(s3);
    logStageComplete('[3] loading student profile', s3, { requestId, userFound: Boolean(user) });

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

    const pipelineResult = await generateRecommendationsV2(userProfile, {
      limit: safeLimit,
      candidateLimit: 260,
      userId: req.user.userId,
      requestId,
      countryFilter: payloadValidation.data.countryFilter || null,
      runInfraDiagnostics: true,
    });
    const recs = Array.isArray(pipelineResult?.recommendations) ? pipelineResult.recommendations : [];

    try {
      await trackEvent({
        sessionId,
        userId: req.user.userId,
        eventType: 'time_spent',
        eventValue: recs.length,
        dwellMs: nowMs() - startedAt,
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

    currentStage = 'response_serialization';
    const s9 = nowMs();
    logStageStart('[9] serialization', { requestId, recommendationCount: recs.length });
    const responsePayload = assertJsonSerializable({
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
      meta: {
        requestId,
        durationMs: nowMs() - startedAt,
        evaluated: safeLimit,
        pipeline: 'v3',
        sessionId,
        stageTimings: {
          ...stageTimings,
          ...(pipelineResult?.metadata?.stageTimings || {}),
        },
      },
    });
    stageTimings.serialization_ms = elapsedMs(s9);
    logStageComplete('[9] serialization', s9, { requestId });

    if (enableTraceLogs) {
      console.log('[API] final:', responsePayload?.recommendations?.length);
      console.log('FINAL RECOMMENDATIONS SERIALIZED', JSON.stringify(responsePayload?.recommendations || []));
      console.log('FINAL RESPONSE', JSON.stringify(responsePayload, null, 2));
    }
    res.json(responsePayload);
    currentStage = 'response_sent';
    const s10 = nowMs();
    logStageStart('[10] response sent', { requestId });
    stageTimings.response_sent_ms = elapsedMs(s10);
    logStageComplete('[10] response sent', s10, { requestId, count: recs.length });
    safeLog('recommendations.regenerated', {
      requestId,
      durationMs: nowMs() - startedAt,
      evaluated: safeLimit,
      returned: recs.length,
      sessionId: sessionId ? hashIdentifier(sessionId) : null,
      userHash: hashIdentifier(req.user.userId),
      stageTimings,
    });
  } catch (error) {
    logStageFailure(currentStage, error, { requestId, endpoint: 'POST /api/recommendations/generate' });
    safeError('recommendations.generate_failed', {
      requestId,
      endpoint: 'POST /api/recommendations/generate',
      stage: currentStage,
      error,
    });
    return recommendationErrorResponse(res, error, {
      requestId,
      endpoint: 'POST /api/recommendations/generate',
      stage: currentStage,
    });
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

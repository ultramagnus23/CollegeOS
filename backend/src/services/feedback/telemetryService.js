'use strict';

const dbManager = require('../../config/database');
const { hashIdentifier, safeError, safeLog, sanitizeForLog } = require('../../utils/safeLogger');

const ALLOWED_EVENTS = new Set([
  'recommendation_click',
  'recommendation_save',
  'recommendation_compare',
  'application_added',
  'recommendation_dismiss',
  'time_spent',
  'shortlist_add',
  'profile_edit_after_recommendation',
]);

function scoreBucketFromProfile(profileSnapshot = {}) {
  const gpa = Number(profileSnapshot?.gpa || profileSnapshot?.academic?.gpa || 0);
  const sat = Number(profileSnapshot?.sat_score || profileSnapshot?.academic?.sat_score || 0);
  const act = Number(profileSnapshot?.act_score || profileSnapshot?.academic?.act_score || 0);

  if (gpa >= 3.8 || sat >= 1450 || act >= 32) return 'high';
  if (gpa >= 3.3 || sat >= 1200 || act >= 25) return 'medium';
  if (gpa > 0 || sat > 0 || act > 0) return 'emerging';
  return 'unknown';
}

function summarizeProfileSnapshot(userId, profileSnapshot = {}) {
  const intendedMajorCategory = Array.isArray(profileSnapshot?.intended_majors) && profileSnapshot.intended_majors.length > 0
    ? sanitizeForLog(profileSnapshot.intended_majors[0])
    : sanitizeForLog(profileSnapshot?.preferences?.intended_major || profileSnapshot?.intendedMajor || 'unknown');
  const preferredCountries = profileSnapshot?.preferences?.preferred_countries || profileSnapshot?.target_countries || [];
  return {
    userHash: hashIdentifier(userId),
    countryCode: sanitizeForLog(Array.isArray(preferredCountries) ? preferredCountries[0] : preferredCountries || profileSnapshot?.country_code || 'unknown'),
    intendedMajorCategory,
    scoreBucket: scoreBucketFromProfile(profileSnapshot),
  };
}

function sanitizeRequestContext(userId, requestContext = {}) {
  return {
    userHash: hashIdentifier(userId),
    endpoint: sanitizeForLog(requestContext?.endpoint || 'unknown'),
    limit: Number(requestContext?.limit) || null,
    requestId: sanitizeForLog(requestContext?.requestId || null),
    pipeline: sanitizeForLog(requestContext?.pipeline || null),
  };
}

function sanitizeEventMetadata(metadata = {}) {
  return {
    requestId: sanitizeForLog(metadata?.requestId || null),
    returned: Number(metadata?.returned) || null,
    regenerated: Boolean(metadata?.regenerated),
    source: sanitizeForLog(metadata?.source || null),
  };
}

function logTelemetryQuery(event, details = {}, level = 'info') {
  safeLog(event, details, level);
}

async function createSession({ userId, requestContext = {}, profileSnapshot = {}, modelVersion = null, retrievalVersion = null }) {
  const pool = dbManager.getDatabase();
  const sanitizedRequestContext = sanitizeRequestContext(userId, requestContext);
  const summarizedProfileSnapshot = summarizeProfileSnapshot(userId, profileSnapshot);
  const sql = `INSERT INTO canonical.recommendation_sessions
       (user_id, request_context, profile_snapshot, recommendation_model_version, retrieval_version)
     VALUES ($1, $2::jsonb, $3::jsonb, $4, $5)
     RETURNING id`;
  const params = [userId, JSON.stringify(sanitizedRequestContext), JSON.stringify(summarizedProfileSnapshot), modelVersion, retrievalVersion];

  logTelemetryQuery('telemetry.create_session.start', {
    queryName: 'recommendation_sessions.insert',
    requestContext: sanitizedRequestContext,
    profileSummary: summarizedProfileSnapshot,
  });

  try {
    const { rows } = await pool.query(sql, params);
    logTelemetryQuery('telemetry.create_session.success', {
      queryName: 'recommendation_sessions.insert',
      rowCount: rows?.length || 0,
      userHash: hashIdentifier(userId),
    });
    return rows[0]?.id || null;
  } catch (error) {
    safeError('telemetry.create_session.failed', {
      queryName: 'recommendation_sessions.insert',
      userHash: hashIdentifier(userId),
      requestContext: sanitizedRequestContext,
      error,
    });
    throw error;
  }
}

async function trackEvent({ sessionId = null, userId, institutionId = null, eventType, eventValue = null, dwellMs = null, position = null, metadata = {} }) {
  if (!ALLOWED_EVENTS.has(eventType)) {
    throw new Error('Unsupported recommendation event type');
  }

  const pool = dbManager.getDatabase();
  const sql = `INSERT INTO canonical.user_recommendation_events
       (session_id, user_id, institution_id, event_type, event_value, dwell_ms, position, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`;
  const sanitizedMetadata = sanitizeEventMetadata(metadata);
  const params = [sessionId, userId, institutionId, eventType, eventValue, dwellMs, position, JSON.stringify(sanitizedMetadata)];

  logTelemetryQuery('telemetry.track_event.start', {
    queryName: 'user_recommendation_events.insert',
    userHash: hashIdentifier(userId),
    sessionId: sessionId ? hashIdentifier(sessionId) : null,
    institutionId: institutionId ? sanitizeForLog(institutionId) : null,
    eventType: sanitizeForLog(eventType),
    metadata: sanitizedMetadata,
  });

  try {
    await pool.query(sql, params);
    logTelemetryQuery('telemetry.track_event.success', {
      queryName: 'user_recommendation_events.insert',
      userHash: hashIdentifier(userId),
      eventType: sanitizeForLog(eventType),
    });
  } catch (error) {
    safeError('telemetry.track_event.failed', {
      queryName: 'user_recommendation_events.insert',
      userHash: hashIdentifier(userId),
      eventType: sanitizeForLog(eventType),
      error,
    });
    throw error;
  }
}

async function upsertFeedback({ sessionId = null, userId, institutionId, explicitRating = null, fitRating = null, affordabilityRating = null, reasonCodes = [], notes = null, confidence = null }) {
  const pool = dbManager.getDatabase();
  const sql = `INSERT INTO canonical.recommendation_feedback
      (session_id, user_id, institution_id, explicit_rating, fit_rating, affordability_rating, reason_codes, notes, confidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9)
     ON CONFLICT (user_id, institution_id)
     DO UPDATE SET
       session_id = EXCLUDED.session_id,
       explicit_rating = EXCLUDED.explicit_rating,
       fit_rating = EXCLUDED.fit_rating,
       affordability_rating = EXCLUDED.affordability_rating,
       reason_codes = EXCLUDED.reason_codes,
       notes = EXCLUDED.notes,
       confidence = EXCLUDED.confidence,
       updated_at = NOW()`;
  const params = [sessionId, userId, institutionId, explicitRating, fitRating, affordabilityRating, reasonCodes, notes, confidence];
  logTelemetryQuery('telemetry.feedback.start', {
    queryName: 'recommendation_feedback.upsert',
    userHash: hashIdentifier(userId),
    sessionId: sessionId ? hashIdentifier(sessionId) : null,
    institutionId: sanitizeForLog(institutionId),
    explicitRating: Number(explicitRating) || null,
    fitRating: Number(fitRating) || null,
    affordabilityRating: Number(affordabilityRating) || null,
    reasonCodeCount: Array.isArray(reasonCodes) ? reasonCodes.length : 0,
    hasNotes: Boolean(notes),
    confidence: Number(confidence) || null,
  });

  try {
    await pool.query(sql, params);
    logTelemetryQuery('telemetry.feedback.success', {
      queryName: 'recommendation_feedback.upsert',
      userHash: hashIdentifier(userId),
      institutionId: sanitizeForLog(institutionId),
    });
  } catch (error) {
    safeError('telemetry.feedback.failed', {
      queryName: 'recommendation_feedback.upsert',
      userHash: hashIdentifier(userId),
      institutionId: sanitizeForLog(institutionId),
      error,
    });
    throw error;
  }
}

module.exports = {
  createSession,
  trackEvent,
  upsertFeedback,
  ALLOWED_EVENTS,
};

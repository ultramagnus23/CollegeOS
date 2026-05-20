'use strict';

const dbManager = require('../../config/database');

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

async function createSession({ userId, requestContext = {}, profileSnapshot = {}, modelVersion = null, retrievalVersion = null }) {
  const pool = dbManager.getDatabase();
  const sql = `INSERT INTO canonical.recommendation_sessions
       (user_id, request_context, profile_snapshot, recommendation_model_version, retrieval_version)
     VALUES ($1, $2::jsonb, $3::jsonb, $4, $5)
     RETURNING id`;
  const params = [userId, JSON.stringify(requestContext), JSON.stringify(profileSnapshot), modelVersion, retrievalVersion];
  console.log('SQL:', sql);
  console.log('PARAMS:', params);
  const { rows } = await pool.query(sql, params);
  console.log('QUERY RESULT:', { count: rows?.length || 0, error: null });
  return rows[0]?.id || null;
}

async function trackEvent({ sessionId = null, userId, institutionId = null, eventType, eventValue = null, dwellMs = null, position = null, metadata = {} }) {
  if (!ALLOWED_EVENTS.has(eventType)) {
    throw new Error(`Unsupported recommendation event type: ${eventType}`);
  }

  const pool = dbManager.getDatabase();
  const sql = `INSERT INTO canonical.user_recommendation_events
      (session_id, user_id, institution_id, event_type, event_value, dwell_ms, position, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`;
  const params = [sessionId, userId, institutionId, eventType, eventValue, dwellMs, position, JSON.stringify(metadata)];
  console.log('SQL:', sql);
  console.log('PARAMS:', params);
  await pool.query(sql, params);
  console.log('QUERY RESULT:', { count: null, error: null });
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
  console.log('SQL:', sql);
  console.log('PARAMS:', params);
  await pool.query(sql, params);
  console.log('QUERY RESULT:', { count: null, error: null });
}

module.exports = {
  createSession,
  trackEvent,
  upsertFeedback,
  ALLOWED_EVENTS,
};

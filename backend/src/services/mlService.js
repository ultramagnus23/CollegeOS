// backend/src/services/mlService.js
// Calls the HuggingFace Spaces chancing model, caches results in Redis
// (falls back to an in-process Map when REDIS_URL is not set), and returns
// a DB-based fallback when the Space is unreachable.

'use strict';

const logger = require('../utils/logger');
const dbManager = require('../config/database');
const cache = require('./cacheService');

// ── Configuration ──────────────────────────────────────────────────────────

const HF_SPACE_URL = process.env.HF_SPACE_URL || '';
// HuggingFace Spaces can have 30–60 s cold starts — use a generous timeout
const HF_TIMEOUT_MS = parseInt(process.env.HF_TIMEOUT_MS || '90000', 10);
const CACHE_TTL_SEC = 24 * 60 * 60;  // 24 hours (Redis TTL, in seconds)
const FALLBACK_TTL_SEC = 60 * 60;    // 1 hour for DB fallback (retry HF sooner)
const MIN_RESULTS = 5; // reject HF response if fewer than this

// ── Persist suggestions to user_suggestions table ────────────────────────

/**
 * Upsert ML suggestions for a user into the user_suggestions table.
 * Fire-and-forget: errors are logged but never propagated to callers.
 *
 * @param {string|number} userId
 * @param {Array}  results
 * @param {boolean} isFallback
 */
async function _persistSuggestions(userId, results, isFallback) {
  try {
    const pool = dbManager.getDatabase();
    await pool.query(
      `INSERT INTO user_suggestions (user_id, suggestions, generated_at, is_fallback)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT (user_id) DO UPDATE SET
         suggestions  = EXCLUDED.suggestions,
         generated_at = EXCLUDED.generated_at,
         is_fallback  = EXCLUDED.is_fallback`,
      [String(userId), JSON.stringify(results), isFallback],
    );
  } catch (err) {
    logger.warn('mlService: failed to persist suggestions to DB', { error: err.message });
  }
}

/**
 * Upsert a student profile into the user_profiles table.
 * Fire-and-forget: errors are logged but never propagated.
 *
 * @param {string|number} userId
 * @param {Object} studentProfile
 */
async function upsertUserProfile(userId, studentProfile) {
  try {
    const pool = dbManager.getDatabase();
    await pool.query(
      `INSERT INTO user_profiles (user_id, student_profile, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         student_profile = EXCLUDED.student_profile,
         updated_at      = NOW()`,
      [String(userId), JSON.stringify(studentProfile)],
    );
  } catch (err) {
    logger.warn('mlService: failed to upsert user profile', { error: err.message });
  }
}

// ── Fallback: top colleges from DB by popularity_score ────────────────────

/**
 * Return the top 10 colleges ordered by popularity_score (or ranking_us_news)
 * as a fallback when the HuggingFace Space is unreachable.
 * Never returns an empty list — it falls back further to any 10 colleges.
 *
 * @returns {Promise<Array<{college_id, college_name, probability, label, acceptance_rate, isFallback}>>}
 */
async function _fallbackColleges() {
  const pool = dbManager.getDatabase();

  const queries = [
    // Attempt 1: colleges with popularity_score
    `SELECT id, name, acceptance_rate
       FROM colleges_comprehensive
      WHERE acceptance_rate IS NOT NULL
      ORDER BY COALESCE(popularity_score, 0) DESC NULLS LAST
      LIMIT 10`,
    // Attempt 2: colleges by US News ranking
    `SELECT id, name, acceptance_rate
       FROM colleges_comprehensive
      WHERE acceptance_rate IS NOT NULL
      ORDER BY ranking_us_news ASC NULLS LAST
      LIMIT 10`,
    // Attempt 3: any 10 colleges
    `SELECT id, name, acceptance_rate
       FROM colleges_comprehensive
      LIMIT 10`,
  ];

  for (const sql of queries) {
    try {
      const { rows } = await pool.query(sql);
      if (rows.length > 0) {
        return rows.map(r => ({
          college_id: r.id,
          college_name: r.name,
          probability: null,
          label: 'Unknown',
          acceptance_rate: r.acceptance_rate,
          isFallback: true,
        }));
      }
    } catch (err) {
      logger.warn('mlService fallback query failed:', { error: err.message });
    }
  }

  return [];
}

// ── HuggingFace call ──────────────────────────────────────────────────────

/**
 * Call the HuggingFace Space with the student profile.
 * Returns the parsed results array on success, throws on failure.
 *
 * @param {Object} studentProfile
 * @returns {Promise<Array>}
 */
async function _callHuggingFace(studentProfile) {
  if (!HF_SPACE_URL) {
    throw new Error('HF_SPACE_URL is not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HF_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(HF_SPACE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Gradio API format: {"data": [<arg1>, <arg2>, ...]}
      body: JSON.stringify({ data: [JSON.stringify(studentProfile)] }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`HuggingFace returned HTTP ${response.status}`);
  }

  const json = await response.json();

  // Gradio wraps the return value in {"data": [<output>]}
  // Our app returns a JSON string inside data[0]
  const raw = json?.data?.[0];
  if (typeof raw !== 'string') {
    throw new Error('Unexpected HuggingFace response shape');
  }

  const parsed = JSON.parse(raw);
  if (parsed.error) {
    throw new Error(`HuggingFace app error: ${parsed.error}`);
  }

  const results = parsed.results;
  if (!Array.isArray(results)) {
    throw new Error('HuggingFace response missing results array');
  }
  if (results.length < MIN_RESULTS) {
    throw new Error(
      `HuggingFace returned only ${results.length} results (min ${MIN_RESULTS})`
    );
  }

  return results;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Get admission chances for a student.
 *
 * Flow:
 *   1. Check in-memory cache (TTL: 24 hours).
 *   2. Call HuggingFace Space with 90-second timeout.
 *   3. On HF failure, return DB-based fallback with isFallback: true.
 *   4. Never return an empty list.
 *
 * @param {string|number} userId
 * @param {Object} studentProfile  Student feature fields for the ML model.
 * @returns {Promise<{results: Array, isFallback: boolean, source: string}>}
 */
async function getChances(userId, studentProfile) {
  const cacheKey = `chances:${userId}`;

  // 1. Redis cache hit
  const cached = await cache.get(cacheKey);
  if (cached) {
    logger.debug(`mlService cache hit for user ${userId}`);
    return { results: cached, isFallback: false, source: 'cache' };
  }

  // 2. Live HuggingFace call
  try {
    const results = await _callHuggingFace(studentProfile);
    await cache.set(cacheKey, results, CACHE_TTL_SEC);
    await _persistSuggestions(userId, results, false);
    logger.info(`mlService HF success for user ${userId}: ${results.length} results`);
    return { results, isFallback: false, source: 'huggingface' };
  } catch (hfErr) {
    logger.error('mlService HuggingFace call failed — using DB fallback', {
      error: hfErr.message,
      userId,
    });
  }

  // 3. DB fallback
  const fallback = await _fallbackColleges();
  logger.info(`mlService DB fallback for user ${userId}: ${fallback.length} colleges`);
  if (fallback.length > 0) {
    await cache.set(cacheKey, fallback, FALLBACK_TTL_SEC);
    await _persistSuggestions(userId, fallback, true);
  }
  return { results: fallback, isFallback: true, source: 'db_fallback' };
}

/**
 * Invalidate the cached chances for a user (e.g., after profile update).
 *
 * @param {string|number} userId
 */
async function invalidateCache(userId) {
  await cache.del(`chances:${userId}`);
}

module.exports = { getChances, invalidateCache, upsertUserProfile };

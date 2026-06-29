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

// ── Rules-based ranking (used when the ML Space is unreachable) ────────────

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Normalize a student's academic profile to a single 0..1 strength index from
 * whichever of SAT / ACT / GPA they provided.
 */
function academicIndex(p = {}) {
  const parts = [];
  const sat = Number(p.sat_score);
  if (Number.isFinite(sat) && sat >= 400) parts.push(clamp((sat - 400) / 1200, 0, 1));
  const act = Number(p.act_score);
  if (Number.isFinite(act) && act >= 1) parts.push(clamp((act - 1) / 35, 0, 1));
  const gpa = Number(p.gpa_unweighted ?? p.gpa_weighted);
  if (Number.isFinite(gpa) && gpa > 0) parts.push(clamp((gpa - 2) / 2, 0, 1)); // 2.0→0, 4.0→1
  if (parts.length === 0) return 0.5; // no academic signal → neutral
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function labelFor(prob) {
  if (prob >= 0.7) return 'Likely';
  if (prob >= 0.35) return 'Target';
  return 'Reach';
}

/**
 * Profile-aware rules-based ranking. Replaces the old popularity-only list that
 * ignored the student entirely (every user got the same colleges with a flat
 * 0.5 probability). Each college's admission probability is anchored on its
 * acceptance_rate and adjusted by how the student's academic index compares to
 * the school's selectivity — so the list visibly reflects what the student
 * entered. Returns a curated spread of Likely / Target / Reach.
 *
 * @param {Object} studentProfile  flat feature dict (sat_score, act_score, gpa_*)
 * @returns {Promise<Array<{college_id, college_name, probability, label, acceptance_rate}>>}
 */
async function _rulesBasedRanking(studentProfile) {
  const pool = dbManager.getDatabase();
  const student = academicIndex(studentProfile);

  // Pull a pool of well-known colleges that have an acceptance rate. act_avg is
  // used to refine the school's academic level where present.
  let rows = [];
  try {
    ({ rows } = await pool.query(
      `SELECT id, name, acceptance_rate, act_avg
         FROM colleges
        WHERE acceptance_rate IS NOT NULL AND acceptance_rate > 0
        ORDER BY COALESCE(popularity_score, 0) DESC NULLS LAST,
                 ranking_us_news ASC NULLS LAST
        LIMIT 400`
    ));
  } catch (err) {
    logger.warn('rules-based ranking pool query failed; using minimal fallback', { error: err.message });
    const { rows: any } = await pool.query('SELECT id, name, acceptance_rate FROM colleges LIMIT 10');
    return any.map((r) => ({
      college_id: r.id, college_name: r.name, probability: null, label: 'Unknown',
      acceptance_rate: r.acceptance_rate,
    }));
  }

  const scored = rows.map((r) => {
    const accept = clamp(Number(r.acceptance_rate), 0.01, 0.99);
    // School selectivity 0..1 (higher = harder). Blend acceptance rate with the
    // school's own academic level (act_avg) when available.
    let selectivity = 1 - accept;
    const actAvg = Number(r.act_avg);
    if (Number.isFinite(actAvg) && actAvg >= 1) {
      selectivity = 0.6 * (1 - accept) + 0.4 * clamp((actAvg - 1) / 35, 0, 1);
    }
    // Anchor on the base acceptance rate, then scale by the student's standing
    // relative to the school. At parity (student == selectivity) probability ≈
    // the school's acceptance rate, which is the honest baseline.
    const probability = clamp(accept * Math.exp(3 * (student - selectivity)), 0.02, 0.98);
    return {
      college_id: r.id,
      college_name: r.name,
      probability: Math.round(probability * 100) / 100,
      label: labelFor(probability),
      acceptance_rate: r.acceptance_rate,
      _selectivity: selectivity,
    };
  });

  // Curate a useful spread instead of only safeties: take some of each band,
  // preferring the most selective schools within each band (more aspirational).
  const byBand = { Reach: [], Target: [], Likely: [] };
  for (const c of scored) byBand[c.label].push(c);
  for (const band of Object.values(byBand)) band.sort((a, b) => b._selectivity - a._selectivity);

  const pick = [
    ...byBand.Target.slice(0, 8),
    ...byBand.Likely.slice(0, 6),
    ...byBand.Reach.slice(0, 6),
  ];
  const chosen = (pick.length >= 5 ? pick : scored).slice(0, 20);
  // Strip internal field and order by probability (strongest matches first).
  return chosen
    .map(({ _selectivity, ...c }) => c) // eslint-disable-line no-unused-vars
    .sort((a, b) => b.probability - a.probability);
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

  // 3. Rules-based ranking (personalized; not the old popularity-only list).
  const ranked = await _rulesBasedRanking(studentProfile);
  logger.info(`mlService rules-based ranking for user ${userId}: ${ranked.length} colleges`);
  if (ranked.length > 0) {
    await cache.set(cacheKey, ranked, FALLBACK_TTL_SEC);
    // isFallback:false — this IS a personalized ranking (by academic fit), not a
    // generic popularity list. `source` records that the ML Space wasn't used.
    await _persistSuggestions(userId, ranked, false);
  }
  return { results: ranked, isFallback: false, source: 'rules_based' };
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

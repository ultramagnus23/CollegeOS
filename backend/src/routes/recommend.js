/**
 * backend/src/routes/recommend.js
 * ─────────────────────────────────
 * ML-grade cosine-similarity recommendation + major-recommendation endpoints.
 *
 * Routes
 * ──────
 *   POST /api/recommend
 *     Body: { filters?: { maxCostUsd, country } }
 *     → Top 50 colleges ranked by cosine similarity + admit chance
 *
 *   GET  /api/recommend/majors
 *     → Top major categories + 3 specific majors per category,
 *       filtered to majors offered by the user's top colleges
 *
 * Both routes require authentication (JWT via authenticate middleware).
 */

'use strict';

const crypto = require('crypto');
const express = require('express');
const router  = express.Router();
const config = require('../config/env');
const { authenticate } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const db = require('../config/database');
const { hashIdentifier, safeError, safeLog, sanitizeForLog } = require('../utils/safeLogger');
const {
  buildUserVector,
  buildCollegeVector,
  cosineSimilarity,
  applySignalAdjustments,
} = require('../services/vectorService');
const { computeAdmitChance } = require('../services/chancingService');

router.use(apiLimiter);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function createRequestId() {
  return crypto.randomUUID();
}

function logRecommendationPipelineError(err, context = {}) {
  safeError('recommend.pipeline_error', {
    context: sanitizeForLog(context),
    error: err,
  });
}

async function runQueryWithLogs(pool, sql, params, context = {}) {
  safeLog('recommend.query.start', {
    requestId: sanitizeForLog(context?.requestId || null),
    stage: sanitizeForLog(context?.stage || 'unknown'),
    queryName: sanitizeForLog(context?.queryName || 'unknown_query'),
    paramCount: Array.isArray(params) ? params.length : 0,
  }, 'debug');
  try {
    const result = await pool.query(sql, params);
    safeLog('recommend.query.success', {
      requestId: sanitizeForLog(context?.requestId || null),
      stage: sanitizeForLog(context?.stage || 'unknown'),
      queryName: sanitizeForLog(context?.queryName || 'unknown_query'),
      count: result?.rows?.length || 0,
    }, 'debug');
    return result;
  } catch (error) {
    safeError('recommend.query.failed', {
      requestId: sanitizeForLog(context?.requestId || null),
      stage: sanitizeForLog(context?.stage || 'unknown'),
      queryName: sanitizeForLog(context?.queryName || 'unknown_query'),
      error,
    });
    logRecommendationPipelineError(error, context);
    throw error;
  }
}

/**
 * Fetch the user's onboarding / profile data from the DB.
 * Merges users + student_profiles rows into a flat object.
 */
async function fetchUserProfile(userId, pool) {
  const sql = `SELECT u.*, sp.*
     FROM   users u
     LEFT   JOIN student_profiles sp ON sp.user_id = u.id
     WHERE  u.id = $1`;
  const { rows: users } = await runQueryWithLogs(pool, sql, [userId], {
    stage: 'fetch_user_profile',
    queryName: 'fetch_user_profile',
    userHash: hashIdentifier(userId),
  });
  return users[0] || null;
}

/**
 * Fetch the 20 most-recent signals for a user, joining in the college
 * feature_vector so we can apply signal adjustments.
 */
async function fetchSignals(userId, pool) {
  const sql = `SELECT us.signal_type, c.feature_vector
     FROM   user_signals us
     JOIN colleges_full c ON c.id = us.college_id
     WHERE  us.user_id = $1
       AND  c.feature_vector IS NOT NULL
     ORDER  BY us.created_at DESC
     LIMIT  20`;
  const { rows } = await runQueryWithLogs(pool, sql, [userId], {
    stage: 'fetch_signals',
    queryName: 'fetch_signals',
    userHash: hashIdentifier(userId),
  });
  return rows.map(r => ({
    signal_type:     r.signal_type,
    college_vector:  Array.isArray(r.feature_vector)
      ? r.feature_vector
      : Object.values(r.feature_vector || {}),
  }));
}

/**
 * Build and return a user's (optionally signal-adjusted) vector.
 */
async function buildAdjustedUserVector(userProfile, userId, pool, requestId) {
  const baseVector = buildUserVector(userProfile);
  try {
    const signals = await fetchSignals(userId, pool);
    if (signals.length > 0) {
      return applySignalAdjustments(baseVector, signals);
    }
  } catch (err) {
    safeLog('recommend.signal_fetch_failed_base_vector_used', {
      requestId,
      userHash: hashIdentifier(userId),
      message: sanitizeForLog(err?.message),
      code: sanitizeForLog(err?.code),
    }, 'warn');
  }
  return baseVector;
}

// ─── POST /api/recommend ──────────────────────────────────────────────────────

/**
 * @route  POST /api/recommend
 * @access Authenticated
 * @body   { filters?: { maxCostUsd, country } }
 *
 * Returns top 50 colleges ordered by overall fit (cosine similarity),
 * each augmented with an admit chance calculation.
 */
router.post('/', authenticate, async (req, res) => {
  const requestId = req.requestId || createRequestId();
  const requestStarted = Date.now();
  try {
    const userId  = req.user.userId;
    const filters = req.body?.filters || {};
    const pool    = db.getDatabase();
    safeLog('recommend.pipeline_step', {
      requestId,
      step: 'loading_student_profile',
      userHash: hashIdentifier(userId),
      filters: {
        hasCountry: Boolean(filters?.country),
        hasMaxCostUsd: Boolean(filters?.maxCostUsd),
      },
    }, 'debug');

    // ── 1. Fetch user profile ─────────────────────────────────────────────
    const userProfile = await fetchUserProfile(userId, pool);
    if (!userProfile) {
      return res.status(404).json({ success: false, message: 'User profile not found' });
    }
    if (!userProfile.onboarding_complete) {
      return res.status(400).json({
        success: false,
        message: 'Please complete onboarding first',
        redirect: '/onboarding',
      });
    }

    // ── 2. Build user vector (with signal adjustments) ────────────────────
    safeLog('recommend.pipeline_step', { requestId, step: 'candidate_retrieval' }, 'debug');
    const userVector = await buildAdjustedUserVector(userProfile, userId, pool, requestId);
    if (!Array.isArray(userVector) || userVector.length === 0) {
      safeLog('recommend.empty_user_vector', {
        requestId,
        userHash: hashIdentifier(userId),
      }, 'warn');
    }

    // ── 3. Fetch college candidates ───────────────────────────────────────
    // Two modes:
    //   a) Colleges with pre-computed feature_vector (fast path)
    //   b) Fallback: build vectors on-the-fly (slower, used while vectors are
    //      still being computed by precomputeCollegeVectors.js)

    const conditions = ['1=1'];
    const params     = [];
    let   idx        = 1;

    if (filters.country) {
      conditions.push(`c.country = $${idx++}`);
      params.push(filters.country);
    }
    if (filters.maxCostUsd) {
      conditions.push(`(c.tuition_cost IS NULL OR c.tuition_cost <= $${idx++})`);
      params.push(parseFloat(filters.maxCostUsd));
    }

    const where = conditions.join(' AND ');

    safeLog('recommend.pipeline_step', { requestId, step: 'embedding_search' }, 'debug');
    const queryStarted = Date.now();
    const sql = `SELECT
         c.id,
         c.name,
         c.country,
         c.city,
         c.state,
         COALESCE(
           to_jsonb(c) ->> 'type',
           to_jsonb(c) ->> 'institution_type'
         ) AS type,
         c.acceptance_rate,
         c.act_avg,
         c.tuition_cost,
         c.popularity_score,
         c.median_earnings_6yr,
         c.description,
         c.feature_vector
        FROM colleges_full c
       WHERE  ${where}
       LIMIT  2000`;
    const { rows: colleges } = await runQueryWithLogs(pool, sql, params, {
      stage: 'fetch_college_candidates',
      queryName: 'fetch_college_candidates',
      requestId,
    });
    const queryDuration = Date.now() - queryStarted;
    safeLog('recommend.query_timing', { requestId, ms: queryDuration, rows: colleges.length });
    if (queryDuration > 800) {
      safeLog('recommend.slow_query', { requestId, ms: queryDuration, rows: colleges.length }, 'warn');
    }

    if (!colleges.length) {
      return res.json({ success: true, colleges: [], vectors_used: false });
    }

    // ── 4. Score each college ─────────────────────────────────────────────
    safeLog('recommend.pipeline_step', { requestId, step: 'ranking_feature_engineering' }, 'debug');
    const scored = [];
    let vectorsUsed = 0;
    let missingPopularityCount = 0;

    for (const college of colleges) {
      let colVec;

      if (Array.isArray(college.feature_vector) && college.feature_vector.length === 28) {
        colVec = college.feature_vector;
        vectorsUsed++;
      } else if (college.feature_vector && typeof college.feature_vector === 'object') {
        const vals = Object.values(college.feature_vector);
        if (vals.length === 28) {
          colVec = vals;
          vectorsUsed++;
        }
      }

      if (!colVec) {
        // Build on-the-fly (slower)
        colVec = buildCollegeVector(college);
      }

      const overallFit = cosineSimilarity(userVector, colVec);
      if (college.popularity_score == null) {
        missingPopularityCount++;
      }

      scored.push({
        college,
        collegeVector: colVec,
        overallFit,
      });
    }

    // ── 5. Sort by fit, take top 50 ───────────────────────────────────────
    safeLog('recommend.pipeline_step', { requestId, step: 'ltr_scoring' }, 'debug');
    scored.sort((a, b) => b.overallFit - a.overallFit);
    const top50 = scored.slice(0, 50);

    // ── 6. Add admit chance to each ───────────────────────────────────────
    safeLog('recommend.pipeline_step', { requestId, step: 'portfolio_diversification' }, 'debug');
    const results = top50.map(({ college, collegeVector, overallFit }) => {
      const chancing = computeAdmitChance(userVector, collegeVector, college, userProfile);
      const { feature_vector: _fv, ...colWithoutVec } = college;

      return {
        ...colWithoutVec,
        overall_fit:         chancing.overall_fit,
        admit_chance:        chancing.chance,
        tier:                chancing.tier,
        reasoning:           chancing.reasoning,
        academic_similarity: chancing.academic_similarity,
      };
    });

    safeLog('recommend.pipeline_step', { requestId, step: 'final_serialization' }, 'debug');
    res.json({
      success:       true,
      count:         results.length,
      vectors_used:  vectorsUsed > 0,
      colleges:      results,
      recommendations: results,
      metadata: { requestId, durationMs: Date.now() - requestStarted },
      diagnostics: {},
      meta: {
        requestId,
        durationMs: Date.now() - requestStarted,
        missingPopularityCount,
      },
    });
  } catch (err) {
    safeError('recommend.post_failed', {
      requestId,
      endpoint: 'POST /api/recommend',
      error: err,
    });
    logRecommendationPipelineError(err, { requestId, endpoint: 'POST /api/recommend' });
    return res.status(500).json({
      success: false,
      error: config.nodeEnv === 'production' ? 'Internal server error' : sanitizeForLog(err?.message || 'Internal server error'),
      recommendations: [],
      metadata: { requestId, endpoint: 'POST /api/recommend' },
      diagnostics: config.nodeEnv === 'production'
        ? {}
        : { stage: 'route_handler', code: sanitizeForLog(err?.code), details: sanitizeForLog(err?.details) },
    });
  }
});

// ─── GET /api/recommend/majors ────────────────────────────────────────────────

/**
 * @route  GET /api/recommend/majors
 * @access Authenticated
 *
 * Returns top major categories that match the user's interest dimensions,
 * plus up to 3 specific majors per category drawn from the majors table.
 */
router.get('/majors', authenticate, async (req, res) => {
  const requestId = req.requestId || createRequestId();
  try {
    const userId = req.user.userId;
    const pool   = db.getDatabase();

    // ── 1. User vector ────────────────────────────────────────────────────
    const userProfile = await fetchUserProfile(userId, pool);
    if (!userProfile) {
      return res.status(404).json({ success: false, message: 'User profile not found' });
    }

    const userVector = buildUserVector(userProfile);

    // ── 2. Map interest dims (18–24) to categories ────────────────────────
    const INTEREST_DIMS = [
      { dim: 18, categories: ['Computer & Information Sciences', 'Engineering', 'Mathematics & Statistics', 'Biological Sciences', 'Physical Sciences', 'Natural Resources', 'Agriculture'] },
      { dim: 19, categories: ['Business'] },
      { dim: 20, categories: ['Visual & Performing Arts', 'English & Literature', 'Foreign Languages'] },
      { dim: 21, categories: ['Social Sciences', 'Psychology', 'Philosophy & Religion', 'History', 'Area & Ethnic Studies'] },
      { dim: 22, categories: ['Health Professions'] },
      { dim: 23, categories: ['Law & Legal Studies', 'Public Administration'] },
      { dim: 24, categories: ['Education'] },
    ];

    // Score each category group by the corresponding user vector dimension
    const categoryScores = [];
    for (const { dim, categories } of INTEREST_DIMS) {
      const score = userVector[dim];
      for (const cat of categories) {
        categoryScores.push({ category: cat, score });
      }
    }
    categoryScores.sort((a, b) => b.score - a.score);
    const topCategories = categoryScores.slice(0, 5).map(c => c.category);

    // ── 3. Fetch specific majors per top category ─────────────────────────
    let recommended_majors = [];
    try {
      const sql = `SELECT
           m.cip_code,
           m.name,
           m.broad_category,
           m.is_stem,
           COUNT(cm.college_id) AS offered_by_count
         FROM   majors m
         LEFT   JOIN college_majors cm ON cm.major_id = m.id AND cm.offered = true
         WHERE  m.broad_category = ANY($1)
         GROUP  BY m.id
         ORDER  BY m.broad_category, offered_by_count DESC`;
      const { rows: majors } = await runQueryWithLogs(pool, sql, [topCategories], {
        stage: 'recommend_majors',
        queryName: 'recommend_majors',
        userHash: hashIdentifier(userId),
        requestId,
      });

      // Group by category, take top 3 per category
      const grouped = {};
      for (const major of majors) {
        const cat = major.broad_category;
        if (!grouped[cat]) grouped[cat] = [];
        if (grouped[cat].length < 3) grouped[cat].push(major);
      }

      for (const [cat, items] of Object.entries(grouped)) {
        for (const item of items) {
          recommended_majors.push({
            cip_code:         item.cip_code,
            name:             item.name,
            category:         cat,
            is_stem:          item.is_stem,
            offered_by_count: parseInt(item.offered_by_count) || 0,
          });
        }
      }
    } catch (majorErr) {
      // majors table may not be populated yet — return empty gracefully
      safeLog('recommend.majors_query_failed', {
        requestId,
        userHash: hashIdentifier(userId),
        message: sanitizeForLog(majorErr?.message),
        code: sanitizeForLog(majorErr?.code),
      }, 'warn');
    }

    res.json({
      success: true,
      top_interest_categories: topCategories,
      recommended_majors,
      recommendations: [],
      metadata: { requestId },
      diagnostics: {},
    });
  } catch (err) {
    safeError('recommend.majors_failed', {
      requestId,
      endpoint: 'GET /api/recommend/majors',
      error: err,
    });
    logRecommendationPipelineError(err, { requestId, endpoint: 'GET /api/recommend/majors' });
    return res.status(500).json({
      success: false,
      error: config.nodeEnv === 'production' ? 'Internal server error' : sanitizeForLog(err?.message || 'Internal server error'),
      recommendations: [],
      metadata: { requestId, endpoint: 'GET /api/recommend/majors' },
      diagnostics: config.nodeEnv === 'production'
        ? {}
        : { stage: 'route_handler', code: sanitizeForLog(err?.code), details: sanitizeForLog(err?.details) },
    });
  }
});

module.exports = router;

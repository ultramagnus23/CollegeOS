/**
 * backend/src/routes/recommend.js
 * ─────────────────────────────────
 * ML-grade cosine-similarity recommendation + major-recommendation endpoints.
 *
 * Routes
 * ──────
 *   POST /api/recommend
 *     Body: { filters?: { maxCostUsd, country, size } }
 *     → Top 50 colleges ranked by cosine similarity + admit chance
 *
 *   GET  /api/recommend/majors
 *     → Top major categories + 3 specific majors per category,
 *       filtered to majors offered by the user's top colleges
 *
 * Both routes require authentication (JWT via authenticate middleware).
 */

'use strict';

const express = require('express');
const router  = express.Router();
const logger  = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');
const {
  buildUserVector,
  buildCollegeVector,
  cosineSimilarity,
  applySignalAdjustments,
} = require('../services/vectorService');
const { computeAdmitChance } = require('../services/chancingService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch the user's onboarding / profile data from the DB.
 * Merges users + student_profiles rows into a flat object.
 */
async function fetchUserProfile(userId, pool) {
  const { rows: users } = await pool.query(
    `SELECT u.*, sp.*
     FROM   users u
     LEFT   JOIN student_profiles sp ON sp.user_id = u.id
     WHERE  u.id = $1`,
    [userId]
  );
  return users[0] || null;
}

/**
 * Fetch the 20 most-recent signals for a user, joining in the college
 * feature_vector so we can apply signal adjustments.
 */
async function fetchSignals(userId, pool) {
  const { rows } = await pool.query(
    `SELECT us.signal_type, cc.feature_vector
     FROM   user_signals us
     JOIN   colleges_comprehensive cc ON cc.id = us.college_id
     WHERE  us.user_id = $1
       AND  cc.feature_vector IS NOT NULL
     ORDER  BY us.created_at DESC
     LIMIT  20`,
    [userId]
  );
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
async function buildAdjustedUserVector(userProfile, userId, pool) {
  const baseVector = buildUserVector(userProfile);
  try {
    const signals = await fetchSignals(userId, pool);
    if (signals.length > 0) {
      return applySignalAdjustments(baseVector, signals);
    }
  } catch (err) {
    logger.warn('Signal fetch failed, using base vector: %s', err.message);
  }
  return baseVector;
}

// ─── POST /api/recommend ──────────────────────────────────────────────────────

/**
 * @route  POST /api/recommend
 * @access Authenticated
 * @body   { filters?: { maxCostUsd, country, size } }
 *
 * Returns top 50 colleges ordered by overall fit (cosine similarity),
 * each augmented with an admit chance calculation.
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const userId  = req.user.userId;
    const filters = req.body?.filters || {};
    const pool    = db.getDatabase();

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
    const userVector = await buildAdjustedUserVector(userProfile, userId, pool);

    // ── 3. Fetch college candidates ───────────────────────────────────────
    // Two modes:
    //   a) Colleges with pre-computed feature_vector (fast path)
    //   b) Fallback: build vectors on-the-fly (slower, used while vectors are
    //      still being computed by precomputeCollegeVectors.js)

    const conditions = ['1=1'];
    const params     = [];
    let   idx        = 1;

    if (filters.country) {
      conditions.push(`cc.country = $${idx++}`);
      params.push(filters.country);
    }
    if (filters.maxCostUsd) {
      conditions.push(`(cfd.avg_net_price IS NULL OR cfd.avg_net_price <= $${idx++})`);
      params.push(parseFloat(filters.maxCostUsd));
    }
    if (filters.size) {
      // Map 'small' | 'medium' | 'large' to enrollment ranges
      const sizeMap = { small: [0, 5000], medium: [5000, 15000], large: [15001, 9999999] };
      const [lo, hi] = sizeMap[filters.size] || [0, 9999999];
      conditions.push(`(cc.enrollment IS NULL OR (cc.enrollment >= $${idx++} AND cc.enrollment <= $${idx++}))`);
      params.push(lo, hi);
    }

    const where = conditions.join(' AND ');

    const { rows: colleges } = await pool.query(
      `SELECT
         cc.*,
         ca.acceptance_rate,
         ca.sat_avg,
         ca.act_avg,
         ca.gpa_50,
         ca.sat_25,
         ca.sat_75,
         cfd.avg_net_price,
         cfd.avg_financial_aid,
         cfd.tuition_international,
         ad.graduation_rate_4yr,
         ad.retention_rate,
         ad.median_salary_6yr,
         cc.feature_vector
       FROM   colleges_comprehensive cc
       LEFT   JOIN college_admissions ca  ON ca.college_id  = cc.id
       LEFT   JOIN college_financial_data cfd ON cfd.college_id = cc.id
       LEFT   JOIN academic_details ad       ON ad.college_id   = cc.id
       WHERE  ${where}
       LIMIT  2000`,
      params
    );

    if (!colleges.length) {
      return res.json({ success: true, colleges: [], vectors_used: false });
    }

    // ── 4. Score each college ─────────────────────────────────────────────
    const scored = [];
    let vectorsUsed = 0;

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

      scored.push({
        college,
        collegVector: colVec,
        overallFit,
      });
    }

    // ── 5. Sort by fit, take top 50 ───────────────────────────────────────
    scored.sort((a, b) => b.overallFit - a.overallFit);
    const top50 = scored.slice(0, 50);

    // ── 6. Add admit chance to each ───────────────────────────────────────
    const results = top50.map(({ college, collegVector, overallFit }) => {
      const chancing = computeAdmitChance(userVector, collegVector, college, userProfile);
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

    res.json({
      success:       true,
      count:         results.length,
      vectors_used:  vectorsUsed > 0,
      colleges:      results,
    });
  } catch (err) {
    logger.error('POST /api/recommend error: %s', err.message);
    next(err);
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
router.get('/majors', authenticate, async (req, res, next) => {
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
      const { rows: majors } = await pool.query(
        `SELECT
           m.cip_code,
           m.name,
           m.broad_category,
           m.is_stem,
           COUNT(cm.college_id) AS offered_by_count
         FROM   majors m
         LEFT   JOIN college_majors cm ON cm.major_id = m.id AND cm.offered = true
         WHERE  m.broad_category = ANY($1)
         GROUP  BY m.id
         ORDER  BY m.broad_category, offered_by_count DESC`,
        [topCategories]
      );

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
      logger.warn('Major recommendations query failed: %s', majorErr.message);
    }

    res.json({
      success: true,
      top_interest_categories: topCategories,
      recommended_majors,
    });
  } catch (err) {
    logger.error('GET /api/recommend/majors error: %s', err.message);
    next(err);
  }
});

module.exports = router;

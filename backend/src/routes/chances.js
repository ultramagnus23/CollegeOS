// backend/src/routes/chances.js
// GET  /api/chances          — return ML-powered admission chances for the authenticated user.
// POST /api/chances/invalidate — clear the cached chances for the authenticated user.
// POST /api/chances/predict  — accept a student profile in the request body, call the ML
//                              service, persist profile + suggestions, and return results.

'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const StudentProfile = require('../models/StudentProfile');
const { getChances, invalidateCache, upsertUserProfile } = require('../services/mlService');
const logger = require('../utils/logger');

/**
 * Map a student profile row from the DB to the flat feature dict
 * expected by the HuggingFace app / predict.py.
 *
 * @param {Object} profile  Row from student_profiles.
 * @returns {Object}
 */
function buildStudentFeatures(profile) {
  return {
    sat_score:            profile.sat_total   ?? profile.sat_score   ?? null,
    act_score:            profile.act_composite ?? profile.act_score  ?? null,
    gpa_unweighted:       profile.gpa_unweighted ?? profile.gpa       ?? null,
    gpa_weighted:         profile.gpa_weighted   ?? null,
    // extracurriculars may be stored as a count (int) or as an array of activity
    // objects depending on which profile route wrote it.  Handle both forms.
    extracurriculars:     Array.isArray(profile.extracurriculars)
                            ? profile.extracurriculars.length
                            : (typeof profile.extracurriculars === 'number'
                                ? profile.extracurriculars
                                : 5),
    leadership_positions: profile.leadership_roles ?? profile.leadership_positions ?? 1,
    essays_quality:       profile.essays_quality ?? 3,
    first_gen:            profile.first_gen ?? false,
    legacy:               profile.legacy     ?? false,
    recruited_athlete:    profile.recruited_athlete ?? false,
    income_bracket:       profile.income_bracket ?? 2,
  };
}

/**
 * GET /api/chances
 *
 * Returns a ranked list of colleges with admission probabilities for the
 * authenticated student.  Results are cached in-process for 24 hours.
 *
 * Response shape:
 * {
 *   success: true,
 *   isFallback: false,
 *   source: "huggingface" | "cache" | "db_fallback",
 *   data: [
 *     {
 *       college_id, college_name, probability, label, acceptance_rate
 *     },
 *     ...
 *   ]
 * }
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;

    // Load the student profile
    const profile = await StudentProfile.getCompleteProfile(userId);
    if (!profile) {
      return res.status(400).json({
        success: false,
        message: 'Student profile not found. Complete onboarding to get chancing results.',
      });
    }

    const studentFeatures = buildStudentFeatures(profile);

    const { results, isFallback, source } = await getChances(userId, studentFeatures);

    return res.json({
      success: true,
      isFallback,
      source,
      data: results,
    });
  } catch (err) {
    logger.error('GET /api/chances failed:', { error: err.message });
    next(err);
  }
});

/**
 * POST /api/chances/invalidate
 *
 * Invalidates the cached chances for the authenticated user.
 * Call this after updating a student profile so the next GET returns fresh data.
 */
router.post('/invalidate', authenticate, async (req, res) => {
  await invalidateCache(req.user.userId);
  res.json({ success: true, message: 'Chances cache cleared' });
});

// ── Validation helper ────────────────────────────────────────────────────────

/**
 * Validate the student profile fields required by the ML model.
 * Returns an error message string on failure, or null on success.
 *
 * @param {Object} p  Student profile object from the request body.
 * @returns {string|null}
 */
function validateStudentProfile(p) {
  if (!p || typeof p !== 'object') return 'studentProfile must be an object';

  const hasSat = p.satScore !== undefined && p.satScore !== null;
  const hasAct = p.actScore !== undefined && p.actScore !== null;

  if (!hasSat && !hasAct) {
    return 'At least one of satScore or actScore is required';
  }
  if (hasSat && (typeof p.satScore !== 'number' || p.satScore < 400 || p.satScore > 1600)) {
    return 'satScore must be a number between 400 and 1600';
  }
  if (hasAct && (typeof p.actScore !== 'number' || p.actScore < 1 || p.actScore > 36)) {
    return 'actScore must be a number between 1 and 36';
  }

  const gpa = p.gpaUnweighted;
  if (typeof gpa !== 'number' || gpa < 1.5 || gpa > 4.0) {
    return 'gpaUnweighted must be a number between 1.5 and 4.0';
  }

  return null;
}

/**
 * POST /api/chances/predict
 *
 * Accepts a student profile in the request body, calls the ML service
 * (with Redis cache + DB fallback), persists the profile and results,
 * and returns a ranked list of college recommendations.
 *
 * Request body:
 * {
 *   studentProfile: {
 *     satScore:            number | null,
 *     actScore:            number | null,
 *     gpaUnweighted:       number,          // 1.5–4.0, required
 *     gpaWeighted:         number,
 *     essayQuality:        number,          // 1–5
 *     extracurriculars:    number,
 *     leadershipPositions: number,
 *     firstGen:            boolean,
 *     legacy:              boolean,
 *     recruitedAthlete:    boolean,
 *     incomeLevel:         number,          // 1–4
 *     maxTuition:          number
 *   }
 * }
 *
 * Response:
 * {
 *   success:         true,
 *   recommendations: [...],
 *   count:           N,
 *   isFallback:      bool,
 *   generatedAt:     ISO string
 * }
 */
router.post('/predict', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { studentProfile } = req.body;

    // Validate the incoming profile
    const validationError = validateStudentProfile(studentProfile);
    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
        errorCode: 'VALIDATION_ERROR',
      });
    }

    // Map camelCase frontend fields → snake_case ML feature dict
    const studentFeatures = {
      sat_score:            studentProfile.satScore   ?? null,
      act_score:            studentProfile.actScore   ?? null,
      gpa_unweighted:       studentProfile.gpaUnweighted,
      gpa_weighted:         studentProfile.gpaWeighted ?? studentProfile.gpaUnweighted,
      extracurriculars:     studentProfile.extracurriculars ?? 5,
      leadership_positions: studentProfile.leadershipPositions ?? 1,
      essays_quality:       studentProfile.essayQuality ?? 3,
      first_gen:            studentProfile.firstGen   ?? false,
      legacy:               studentProfile.legacy     ?? false,
      recruited_athlete:    studentProfile.recruitedAthlete ?? false,
      income_bracket:       studentProfile.incomeLevel ?? 2,
    };

    // Persist the raw student profile (fire-and-forget)
    await upsertUserProfile(userId, studentProfile);

    // Call ML service (Redis cache → HuggingFace → DB fallback)
    const { results, isFallback, source } = await getChances(userId, studentFeatures);

    logger.info('POST /api/chances/predict success', {
      userId,
      count: results.length,
      isFallback,
      source,
    });

    return res.json({
      success: true,
      recommendations: results,
      count: results.length,
      isFallback,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('POST /api/chances/predict failed:', { error: err.message });
    // Return 503 (not 500) so the frontend can show a "try again" message
    return res.status(503).json({
      success: false,
      error: 'ML service temporarily unavailable. Please try again.',
      errorCode: 'ML_UNAVAILABLE',
    });
  }
});

module.exports = router;

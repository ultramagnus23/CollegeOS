// backend/src/routes/chances.js
// GET /api/chances — return ML-powered admission chances for the authenticated user.

'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const StudentProfile = require('../models/StudentProfile');
const mlService = require('../services/mlService');
const { invalidateCache } = require('../services/mlService');
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

    const { results, isFallback, source } = await mlService.getChances(userId, studentFeatures);

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
router.post('/invalidate', authenticate, (req, res) => {
  invalidateCache(req.user.userId);
  res.json({ success: true, message: 'Chances cache cleared' });
});

module.exports = router;

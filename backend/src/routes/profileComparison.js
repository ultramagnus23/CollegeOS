// backend/src/routes/profileComparison.js
// API routes for college profile comparison / chancing breakdown
//
// CONSTRAINTS (as per requirements):
// ❌ No ML predictions
// ❌ No acceptance probabilities  
// ❌ No fabricated numbers
// ✅ All data is sourced from official sources
// ✅ Explanatory language, not predictions

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const profileComparisonService = require('../../services/profileComparisonService');
const cdsProfileComparisonService = require('../../services/cdsProfileComparisonService');
const collegeScorecardService = require('../../services/collegeScorecardService');
const User = require('../models/User');
const College = require('../models/College');
const logger = require('../utils/logger');

/**
 * GET /api/profile-comparison/college/:collegeId
 * 
 * Get profile comparison for authenticated user against a specific college.
 * Returns dimension-by-dimension comparison with sourced data.
 * 
 * Response format:
 * {
 *   success: true,
 *   college: { name, location, acceptance_rate },
 *   comparison: {
 *     dimensions: [
 *       { dimension_name: "SAT Math", user_value: 750, typical_range: { min: 720, max: 800 }, status: "About average" }
 *     ],
 *     overall_context: "Your metrics compare favorably...",
 *     data_sources: ["US Department of Education College Scorecard"],
 *     disclaimer: "..."
 *   }
 * }
 */
router.get('/college/:collegeId', authenticate, async (req, res, next) => {
  try {
    const collegeId = parseInt(req.params.collegeId);
    const userId = req.user.userId;

    // Get user profile
    const userProfile = User.getAcademicProfile(userId);
    if (!userProfile) {
      return res.status(404).json({
        success: false,
        error: 'User profile not found. Please complete your profile first.'
      });
    }

    // Get college from database
    const college = College.findById(collegeId);
    if (!college) {
      return res.status(404).json({
        success: false,
        error: 'College not found'
      });
    }

    // Parse college admissions stats if available
    let collegeData = {
      name: college.name,
      city: college.location?.split(',')[0] || null,
      state: college.location?.split(',')[1]?.trim() || null,
      official_website: college.official_website,
      type: college.type,
      admissions_stats: {}
    };

    // Parse stored admissions stats
    if (college.requirements) {
      try {
        const stats = typeof college.requirements === 'string' 
          ? JSON.parse(college.requirements) 
          : college.requirements;
        
        collegeData.admissions_stats = {
          ...collegeData.admissions_stats,
          ...stats,
          acceptance_rate: college.acceptance_rate
        };
      } catch (e) {
        logger.warn(`Could not parse requirements for college ${collegeId}`);
      }
    }

    // If US college and we have insufficient data, try Scorecard API
    if (college.country === 'US' && !collegeData.admissions_stats.sat_math_25) {
      try {
        const scorecardData = await collegeScorecardService.searchByName(college.name);
        if (scorecardData) {
          collegeData.admissions_stats = {
            ...collegeData.admissions_stats,
            ...scorecardData.admissions_stats
          };
        }
      } catch (e) {
        logger.warn(`Could not fetch Scorecard data for ${college.name}`);
      }
    }

    // Build user profile for comparison
    const userComparisonProfile = buildUserComparisonProfile(userProfile);

    // Perform comparison
    const comparison = profileComparisonService.compareProfile(userComparisonProfile, collegeData);

    res.json({
      success: true,
      college: {
        id: college.id,
        name: college.name,
        location: college.location,
        type: college.type,
        acceptance_rate: college.acceptance_rate,
        website: college.official_website
      },
      comparison: comparison,
      user_metrics_used: {
        gpa: userComparisonProfile.gpa,
        sat_total: userComparisonProfile.sat_total,
        act_composite: userComparisonProfile.act_composite
      }
    });

  } catch (error) {
    logger.error('Profile comparison failed:', error);
    next(error);
  }
});

/**
 * POST /api/profile-comparison/search
 * 
 * Search for a college and get comparison in one request
 * Body: { collegeName: "MIT" }
 */
router.post('/search', authenticate, async (req, res, next) => {
  try {
    const { collegeName } = req.body;
    const userId = req.user.userId;

    if (!collegeName) {
      return res.status(400).json({
        success: false,
        error: 'College name is required'
      });
    }

    // Get user profile
    const userProfile = User.getAcademicProfile(userId);
    if (!userProfile) {
      return res.status(404).json({
        success: false,
        error: 'User profile not found'
      });
    }

    // Build user comparison profile
    const userComparisonProfile = buildUserComparisonProfile(userProfile);

    // Get comparison from service (uses Scorecard API)
    const result = await profileComparisonService.getCollegeComparison(
      userComparisonProfile,
      collegeName
    );

    res.json(result);

  } catch (error) {
    logger.error('Profile comparison search failed:', error);
    next(error);
  }
});

/**
 * GET /api/profile-comparison/scorecard/:collegeName
 * 
 * Get raw College Scorecard data for a college
 * Useful for displaying official statistics
 */
router.get('/scorecard/:collegeName', async (req, res, next) => {
  try {
    const { collegeName } = req.params;

    const data = await collegeScorecardService.searchByName(collegeName);

    if (!data) {
      return res.status(404).json({
        success: false,
        error: `No data found for "${collegeName}" in College Scorecard database`
      });
    }

    res.json({
      success: true,
      data: data,
      source: 'US Department of Education College Scorecard',
      disclaimer: 'Data is provided by the US Department of Education and may be 1-2 years behind current statistics.'
    });

  } catch (error) {
    logger.error('Scorecard lookup failed:', error);
    next(error);
  }
});

/**
 * GET /api/profile-comparison/health
 * 
 * Check if external data sources are accessible
 */
router.get('/health', async (req, res) => {
  const health = {
    scorecard_api: false,
    timestamp: new Date().toISOString()
  };

  try {
    health.scorecard_api = await collegeScorecardService.checkHealth();
  } catch (e) {
    health.scorecard_api = false;
  }

  res.json(health);
});

/**
 * Helper: Build user comparison profile from academic profile
 */
function buildUserComparisonProfile(userProfile) {
  const profile = {
    gpa: null,
    sat_total: null,
    sat_math: null,
    sat_reading: null,
    act_composite: null
  };

  // Extract GPA
  if (userProfile.gpa) {
    profile.gpa = parseFloat(userProfile.gpa);
  } else if (userProfile.percentage) {
    // Convert percentage to 4.0 GPA (rough conversion)
    // This is a common approximation used by many institutions
    profile.gpa = Math.min(4.0, (userProfile.percentage / 100) * 4.0);
  }

  // Extract SAT scores from exams
  const exams = userProfile.exams || {};
  
  if (exams.SAT) {
    if (exams.SAT.total) {
      profile.sat_total = parseInt(exams.SAT.total);
    }
    if (exams.SAT.math) {
      profile.sat_math = parseInt(exams.SAT.math);
    }
    if (exams.SAT.reading || exams.SAT.verbal || exams.SAT.ebrw) {
      profile.sat_reading = parseInt(exams.SAT.reading || exams.SAT.verbal || exams.SAT.ebrw);
    }
    // Calculate total if we have sections but not total
    if (!profile.sat_total && profile.sat_math && profile.sat_reading) {
      profile.sat_total = profile.sat_math + profile.sat_reading;
    }
  }

  // Extract ACT score
  if (exams.ACT) {
    if (exams.ACT.composite) {
      profile.act_composite = parseInt(exams.ACT.composite);
    } else if (exams.ACT.score) {
      profile.act_composite = parseInt(exams.ACT.score);
    }
  }

  return profile;
}

/**
 * GET /api/profile-comparison/cds/:collegeId
 * 
 * Get CDS-based profile comparison for authenticated user
 * Uses Common Data Set information for detailed comparison
 * 
 * Response includes:
 * - Dimension-by-dimension comparison (GPA, SAT, ACT, Course Rigor, Extracurriculars)
 * - Admission factor importance from CDS
 * - Overall fit category (Reach/Match/Safety based on data, not probability)
 */
router.get('/cds/:collegeId', authenticate, async (req, res, next) => {
  try {
    const collegeId = parseInt(req.params.collegeId);
    const userId = req.user.userId;

    // Use CDS-specific comparison service
    const comparison = cdsProfileComparisonService.getProfileComparisonForCollege(userId, collegeId);

    if (!comparison.success) {
      return res.status(404).json(comparison);
    }

    res.json(comparison);

  } catch (error) {
    logger.error('CDS profile comparison failed:', error);
    next(error);
  }
});

/**
 * POST /api/profile-comparison/cds/batch
 * 
 * Get CDS-based profile comparison for multiple colleges
 * Body: { collegeIds: [1, 2, 3] }
 */
router.post('/cds/batch', authenticate, async (req, res, next) => {
  try {
    const { collegeIds } = req.body;
    const userId = req.user.userId;

    if (!collegeIds || !Array.isArray(collegeIds) || collegeIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'collegeIds array is required'
      });
    }

    // Limit to 20 colleges per request
    const limitedIds = collegeIds.slice(0, 20);

    const comparisons = cdsProfileComparisonService.getProfileComparisonForColleges(userId, limitedIds);

    res.json({
      success: true,
      comparisons,
      count: comparisons.length
    });

  } catch (error) {
    logger.error('CDS batch comparison failed:', error);
    next(error);
  }
});

module.exports = router;

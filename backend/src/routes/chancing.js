// backend/src/routes/chancing.js
// API routes for admission chancing calculator with LDA ML integration

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

// Use consolidated chancing service (P3 consolidation)
const consolidatedChancingService = require('../services/consolidatedChancingService');
// cdsChancingService has been removed; all chancing is now handled by consolidatedChancingService

const StudentProfile = require('../models/StudentProfile');
const College = require('../models/College');
const dbManager = require('../config/database');
const logger = require('../utils/logger');
const { sanitizeForLog, sanitizeObject } = require('../utils/security');

const TIER_RANK = {
  'Safety': 5,
  'Match': 4,
  'Reach': 3,
  'Long Shot': 2,
  'Extreme Reach': 1,
  'Unknown': 0,
};

/**
 * Local helper: replicate getChancingForStudent using consolidatedChancingService
 * Returns { results, grouped, summary } or { error, message }
 */
async function getChancingResults(userId, colleges) {
  const profile = await StudentProfile.getCompleteProfile(userId);
  if (!profile) {
    return { error: 'Profile not found', message: 'Please complete your student profile to get chancing results.' };
  }
  const results = [];
  for (const college of colleges) {
    const chancing = await consolidatedChancingService.calculateChance(profile, college);

    // Count how many chancing factors had real data (from the service's own tracking)
    const studentSAT = profile?.sat_total ?? profile?.sat_score ?? null;
    const studentGPA = profile?.gpa_unweighted ?? profile?.gpa_weighted ?? profile?.gpa ?? null;
    const collegeSAT = college?.sat_avg ?? college?.sat_total_50 ?? college?.median_sat ?? null;
    const collegeGPA = college?.gpa_50 ?? college?.median_gpa ?? null;
    // Use number of active factorScores keys as factorsUsed for accurate UI signal
    const factorsUsed = chancing.factorScores
      ? Object.values(chancing.factorScores).filter(f => f && f.score != null).length
      : (studentSAT != null && collegeSAT != null ? 1 : 0) + (studentGPA != null && collegeGPA != null ? 1 : 0);

    results.push({
      college: {
        id: college.id,
        name: college.name,
        location: [college.location_city || college.city, college.location_state || college.state_region].filter(Boolean).join(', '),
        acceptanceRate: college.acceptance_rate
      },
      chancing: {
        ...chancing,
        studentSAT,
        collegeSAT,
        studentGPA,
        collegeGPA,
        factorsUsed,
      }
    });
  }
  results.sort((a, b) => (TIER_RANK[b.chancing.tier] ?? 0) - (TIER_RANK[a.chancing.tier] ?? 0));
  const safety = results.filter(r => r.chancing.tier === 'Safety');
  const target = results.filter(r => r.chancing.tier === 'Match');
  const reach = results.filter(r => r.chancing.tier === 'Reach' || r.chancing.tier === 'Long Shot' || r.chancing.tier === 'Extreme Reach');
  return {
    results,
    grouped: { safety, target, reach },
    summary: { total: results.length, safetyCount: safety.length, targetCount: target.length, reachCount: reach.length }
  };
}

/**
 * POST /api/chancing/calculate
 * Calculate admission chance for a specific college
 * Uses ML-based LDA prediction when available, falls back to rule-based
 */
router.post('/calculate', authenticate, async (req, res, next) => {
  try {
    const { collegeId, decision_type, demonstrated_interest, intended_major } = req.body;
    
    if (!collegeId) {
      return res.status(400).json({
        success: false,
        message: 'collegeId is required'
      });
    }
    
    // Get student profile
    const profile = await StudentProfile.getCompleteProfile(req.user.userId);
    
    if (!profile) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your student profile first',
        code: 'PROFILE_REQUIRED'
      });
    }
    
    // Get college
    const college = await College.findById(collegeId);
    
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'College not found'
      });
    }

    // Build application context from request body
    const application = {
      decision_type:          decision_type          ?? null,
      demonstrated_interest:  demonstrated_interest  ?? null,
      intended_major:         intended_major         ?? profile.intended_major ?? null,
    };
    
    const country = college.location_country || college.country || 'USA';
    const chancing = await consolidatedChancingService.calculateChance(profile, college, application);
    const predictionType = 'deterministic';
    
    // Log prediction for analytics
    try {
      const pool = dbManager.getDatabase();
      await pool.query(
        `INSERT INTO prediction_audit_log (user_id, college_id, prediction_type, probability, category, confidence, factors_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          req.user.userId,
          collegeId,
          predictionType,
          chancing.probability ?? null,
          chancing.category,
          chancing.confidence,
          JSON.stringify(chancing.factorScores ?? [])
        ]
      );
    } catch (auditError) {
      // Non-critical - don't fail if audit logging fails
      logger.debug('Prediction audit log failed:', auditError.message);
    }
    
    res.json({
      success: true,
      data: {
        college: {
          id: college.id,
          name: college.name,
          location: `${college.location_city || ''}, ${college.location_state || ''}`.trim(),
          country: country,
          acceptanceRate: college.acceptance_rate
        },
        chancing: {
          tier:               chancing.tier,
          probability:        chancing.probability,
          confidence:         chancing.confidence,
          explanation:        chancing.explanation,
          studentSAT:         chancing.studentSAT,
          collegeSAT:         chancing.collegeSAT,
          studentGPA:         chancing.studentGPA,
          collegeGPA:         chancing.collegeGPA,
          probabilityRange:   chancing.probabilityRange,
          factorScores:       chancing.factorScores,
          missingDataFields:  chancing.missingDataFields,
          recommendedActions: chancing.recommendedActions,
        },
        predictionType: predictionType,
        profile: {
          gpa: profile.gpa_unweighted || profile.gpa_weighted,
          sat: profile.sat_total,
          act: profile.act_composite,
          activitiesCount: (profile.activities || []).length
        }
      }
    });
  } catch (error) {
    logger.error('Chancing calculation failed:', error);
    next(error);
  }
});

/**
 * POST /api/chancing/batch
 * Calculate chances for multiple colleges at once
 */
router.post('/batch', authenticate, async (req, res, next) => {
  try {
    const { collegeIds } = req.body;
    
    if (!Array.isArray(collegeIds) || collegeIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'collegeIds must be a non-empty array'
      });
    }
    
    const MAX_BATCH_SIZE = 50;
    const wasTruncated = collegeIds.length > MAX_BATCH_SIZE;
    const limitedIds = collegeIds.slice(0, MAX_BATCH_SIZE);
    
    // Get colleges
    const colleges = (await Promise.all(limitedIds.map(id => College.findById(id)))).filter(c => c);
    
    // Get chancing results
    const results = await getChancingResults(req.user.userId, colleges);
    
    if (results.error) {
      return res.status(400).json({
        success: false,
        message: results.message,
        code: 'PROFILE_REQUIRED'
      });
    }
    
    res.json({
      success: true,
      data: results,
      meta: {
        requested: collegeIds.length,
        processed: limitedIds.length,
        maxBatchSize: MAX_BATCH_SIZE,
        wasTruncated: wasTruncated
      }
    });
  } catch (error) {
    logger.error('Batch chancing failed:', error);
    next(error);
  }
});

/**
 * GET /api/chancing/my-list
 * Get chancing for all colleges in user's application list
 */
router.get('/my-list', authenticate, async (req, res, next) => {
  try {
    const Application = require('../models/Application');
    
    // Get user's applications
    const applications = await Application.findByUser(req.user.userId);
    
    if (!applications || applications.length === 0) {
      return res.json({
        success: true,
        data: {
          results: [],
          summary: {
            total: 0,
            safetyCount: 0,
            targetCount: 0,
            reachCount: 0
          }
        },
        message: 'No colleges in your list. Add colleges to see chancing.'
      });
    }
    
    // Get colleges from applications
    const collegeIds = applications.map(a => a.college_id);
    const colleges = (await Promise.all(collegeIds.map(id => College.findById(id)))).filter(c => c);
    
    // Get chancing results
    const results = await getChancingResults(req.user.userId, colleges);
    
    if (results.error) {
      return res.status(400).json({
        success: false,
        message: results.message,
        code: 'PROFILE_REQUIRED'
      });
    }
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error('My list chancing failed:', error);
    next(error);
  }
});

/**
 * GET /api/chancing/recommendations
 * Get college recommendations based on profile
 */
router.get('/recommendations', authenticate, async (req, res, next) => {
  try {
    const { limit = 20, country } = req.query;
    
    // Get student profile
    const profile = await StudentProfile.getCompleteProfile(req.user.userId);
    
    if (!profile) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your student profile first',
        code: 'PROFILE_REQUIRED'
      });
    }
    
    // Get colleges - filter by preferred countries if set
    let colleges;
    const preferredCountries = profile.preferredCountries || profile.preferred_countries || [];
    
    if (country) {
      colleges = await College.search({ country: country, limit: parseInt(limit) * 3 });
    } else if (preferredCountries.length > 0) {
      // Get colleges from all preferred countries
      const nested = await Promise.all(
        preferredCountries.map(c => College.search({ country: c, limit: parseInt(limit) }))
      );
      colleges = nested.flat();
    } else {
      colleges = await College.search({ limit: parseInt(limit) * 3 });
    }
    
    // Get chancing results
    const results = await getChancingResults(req.user.userId, colleges || []);
    
    if (results.error) {
      return res.status(400).json({
        success: false,
        message: results.message,
        code: 'PROFILE_REQUIRED'
      });
    }
    
    // Limit results
    results.results = results.results.slice(0, parseInt(limit));
    
    // Recalculate grouped
    results.grouped = {
      safety: results.results.filter(r => r.chancing.tier === 'Safety'),
      target: results.results.filter(r => r.chancing.tier === 'Match'),
      reach: results.results.filter(r => r.chancing.tier === 'Reach' || r.chancing.tier === 'Long Shot' || r.chancing.tier === 'Extreme Reach')
    };
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error('Recommendations failed:', error);
    next(error);
  }
});

/**
 * GET /api/chancing/profile-strength
 * Get profile strength analysis
 */
router.get('/profile-strength', authenticate, async (req, res, next) => {
  try {
    const profile = await StudentProfile.getCompleteProfile(req.user.userId);
    
    if (!profile) {
      return res.json({
        success: true,
        data: {
          overallStrength: 0,
          sections: [],
          recommendations: ['Complete your profile to see strength analysis']
        }
      });
    }
    
    const sections = [];
    let totalScore = 0;
    let maxScore = 0;
    
    // Academic section
    let academicScore = 0;
    let academicMax = 30;
    
    if (profile.gpa_unweighted || profile.gpa_weighted) {
      const gpa = profile.gpa_unweighted || profile.gpa_weighted;
      if (gpa >= 3.9) academicScore += 10;
      else if (gpa >= 3.7) academicScore += 8;
      else if (gpa >= 3.5) academicScore += 6;
      else if (gpa >= 3.0) academicScore += 4;
      else academicScore += 2;
    }
    
    if (profile.sat_total) {
      if (profile.sat_total >= 1500) academicScore += 10;
      else if (profile.sat_total >= 1400) academicScore += 8;
      else if (profile.sat_total >= 1300) academicScore += 6;
      else if (profile.sat_total >= 1200) academicScore += 4;
      else academicScore += 2;
    } else if (profile.act_composite) {
      if (profile.act_composite >= 34) academicScore += 10;
      else if (profile.act_composite >= 32) academicScore += 8;
      else if (profile.act_composite >= 30) academicScore += 6;
      else if (profile.act_composite >= 28) academicScore += 4;
      else academicScore += 2;
    }
    
    if (profile.class_rank_percentile && profile.class_rank_percentile >= 90) {
      academicScore += 10;
    } else if (profile.class_rank_percentile && profile.class_rank_percentile >= 75) {
      academicScore += 5;
    }
    
    sections.push({
      name: 'Academics',
      score: academicScore,
      maxScore: academicMax,
      percentage: Math.round((academicScore / academicMax) * 100)
    });
    totalScore += academicScore;
    maxScore += academicMax;
    
    // Activities section
    const activities = profile.activities || [];
    let activityScore = 0;
    let activityMax = 30;
    
    const tier1 = activities.filter(a => a.tier_rating === 1).length;
    const tier2 = activities.filter(a => a.tier_rating === 2).length;
    const tier3 = activities.filter(a => a.tier_rating === 3).length;
    
    activityScore += Math.min(15, tier1 * 5);
    activityScore += Math.min(10, tier2 * 3);
    activityScore += Math.min(5, tier3 * 1);
    
    sections.push({
      name: 'Extracurriculars',
      score: activityScore,
      maxScore: activityMax,
      percentage: Math.round((activityScore / activityMax) * 100)
    });
    totalScore += activityScore;
    maxScore += activityMax;
    
    // Course rigor section
    const coursework = profile.coursework || [];
    let rigorScore = 0;
    let rigorMax = 20;
    
    const apIb = coursework.filter(c => c.course_level === 'AP' || c.course_level === 'IB').length;
    rigorScore = Math.min(20, apIb * 2);
    
    sections.push({
      name: 'Course Rigor',
      score: rigorScore,
      maxScore: rigorMax,
      percentage: Math.round((rigorScore / rigorMax) * 100)
    });
    totalScore += rigorScore;
    maxScore += rigorMax;
    
    // Profile completeness
    let completenessScore = 0;
    let completenessMax = 20;
    
    if (profile.first_name) completenessScore += 2;
    if (profile.gpa_unweighted || profile.gpa_weighted) completenessScore += 3;
    if (profile.sat_total || profile.act_composite) completenessScore += 3;
    if (activities.length > 0) completenessScore += 4;
    if (coursework.length > 0) completenessScore += 3;
    if (profile.intendedMajors && profile.intendedMajors.length > 0) completenessScore += 2;
    if (profile.preferredCountries && profile.preferredCountries.length > 0) completenessScore += 3;
    
    sections.push({
      name: 'Profile Completeness',
      score: completenessScore,
      maxScore: completenessMax,
      percentage: Math.round((completenessScore / completenessMax) * 100)
    });
    totalScore += completenessScore;
    maxScore += completenessMax;
    
    // Generate recommendations
    const recommendations = [];
    
    if (!profile.sat_total && !profile.act_composite) {
      recommendations.push('Add your SAT or ACT scores to improve chancing accuracy');
    }
    if (activities.length < 5) {
      recommendations.push('Add more extracurricular activities (aim for 8-10)');
    }
    if (tier1 === 0 && tier2 === 0) {
      recommendations.push('Focus on achieving state/national recognition in your activities');
    }
    if (coursework.length < 3) {
      recommendations.push('Add your coursework, especially AP/IB classes');
    }
    if (!profile.intendedMajors || profile.intendedMajors.length === 0) {
      recommendations.push('Add your intended major(s) to get better college matches');
    }
    
    res.json({
      success: true,
      data: {
        overallStrength: Math.round((totalScore / maxScore) * 100),
        sections: sections,
        recommendations: recommendations,
        profile: {
          gpa: profile.gpa_unweighted || profile.gpa_weighted,
          sat: profile.sat_total,
          act: profile.act_composite,
          activitiesCount: activities.length,
          tier1Count: tier1,
          courseworkCount: coursework.length
        }
      }
    });
  } catch (error) {
    logger.error('Profile strength failed:', error);
    next(error);
  }
});

/**
 * POST /api/chancing/scenario
 * Test what-if scenario without saving changes
 */
router.post('/scenario', authenticate, async (req, res, next) => {
  try {
    const { profileChanges, collegeIds } = req.body;
    
    if (!profileChanges || !collegeIds || !Array.isArray(collegeIds)) {
      return res.status(400).json({
        success: false,
        message: 'profileChanges and collegeIds (array) are required'
      });
    }
    
    // Get current profile
    const currentProfile = await StudentProfile.getCompleteProfile(req.user.userId);
    
    if (!currentProfile) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your student profile first',
        code: 'PROFILE_REQUIRED'
      });
    }
    
    // Create temporary merged profile with changes
    const scenarioProfile = { ...currentProfile };
    
    // Apply changes to the scenario profile (sanitize to prevent prototype pollution)
    const safeChanges = sanitizeObject(profileChanges);
    for (const [key, value] of Object.entries(safeChanges)) {
      scenarioProfile[key] = value;
    }
    
    // Get colleges
    const colleges = (await Promise.all(collegeIds.map(id => College.findById(id)))).filter(c => c);
    
    // Calculate chances with both profiles
    const currentResults = [];
    const scenarioResults = [];
    
    for (const college of colleges) {
      // Current chances
      const currentChancing = await consolidatedChancingService.calculateChance(currentProfile, college);
      
      // Scenario chances
      const scenarioChancing = await consolidatedChancingService.calculateChance(scenarioProfile, college);
      
      currentResults.push({
        college: { id: college.id, name: college.name },
        chancing: currentChancing
      });
      
      scenarioResults.push({
        college: { id: college.id, name: college.name },
        chancing: scenarioChancing
      });
    }
    
    // Calculate comparison
    const comparison = colleges.map((college, idx) => {
      const oldTier = currentResults[idx].chancing.tier;
      const newTier = scenarioResults[idx].chancing.tier;
      const change = (TIER_RANK[newTier] || -1) - (TIER_RANK[oldTier] || -1);
      const oldCategory = currentResults[idx].chancing.category;
      const newCategory = scenarioResults[idx].chancing.category;
      
      return {
        college: { id: college.id, name: college.name },
        oldTier,
        newTier,
        change,
        oldCategory,
        newCategory,
        categoryChanged: oldTier !== newTier,
        improved: change > 0
      };
    });
    
    const improved = comparison.filter(c => c.improved).length;
    const decreased = comparison.filter(c => c.change < 0).length;
    const stayed = comparison.filter(c => c.change === 0).length;
    
    res.json({
      success: true,
      data: {
        scenarioChanges: profileChanges,
        comparison: comparison,
        summary: {
          improved,
          decreased,
          stayed,
          avgChange: comparison.length > 0
            ? Math.round(comparison.reduce((sum, c) => sum + c.change, 0) / comparison.length)
            : 0,
          categoryChanges: comparison.filter(c => c.categoryChanged).map(c => ({
            college: c.college.name,
            from: c.oldTier,
            to: c.newTier
          }))
        }
      }
    });
  } catch (error) {
    logger.error('Scenario calculation failed:', error);
    next(error);
  }
});

/**
 * POST /api/chancing/save-history
 * Save chancing snapshot to history
 */
router.post('/save-history', authenticate, async (req, res, next) => {
  try {
    const { collegeId, chance, category, tier, factors } = req.body;
    
    if (!collegeId || (!category && !tier)) {
      return res.status(400).json({
        success: false,
        message: 'collegeId and tier/category are required'
      });
    }
    
    const profile = await StudentProfile.getCompleteProfile(req.user.userId);
    
    const pool = dbManager.getDatabase();
    
    // Create profile snapshot
    const profileSnapshot = profile ? {
      gpa: profile.gpa_unweighted || profile.gpa_weighted,
      sat: profile.sat_total,
      act: profile.act_composite,
      activitiesCount: (profile.activities || []).length,
      tier1Count: (profile.activities || []).filter(a => a.tier_rating === 1).length
    } : {};
    
    const resolvedCategory = category
      || (tier === 'Safety' ? 'safety' : tier === 'Match' ? 'target' : 'reach');

    const result = await pool.query(
      `INSERT INTO chancing_history (
        user_id, college_id, chance_percentage, category, profile_snapshot, factors
      ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        req.user.userId,
        collegeId,
        typeof chance === 'number' ? chance : null,
        resolvedCategory,
        JSON.stringify(profileSnapshot),
        JSON.stringify(factors || [])
      ]
    );
    
    res.status(201).json({
      success: true,
      message: 'Chancing history saved',
      data: { id: result.rows[0].id }
    });
  } catch (error) {
    logger.error('Save history failed:', error);
    next(error);
  }
});

/**
 * GET /api/chancing/history
 * Get user's chancing history
 */
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const { collegeId, limit = 50 } = req.query;
    
    // Validate and bound limit
    const boundedLimit = Math.min(Math.max(1, parseInt(limit) || 50), 1000);
    
    const pool = dbManager.getDatabase();
    
    let paramIndex = 1;
    let query = `
      SELECT ch.*, c.name as college_name
      FROM chancing_history ch
      JOIN colleges c ON ch.college_id = c.id
      WHERE ch.user_id = $${paramIndex++}
    `;
    const params = [req.user.userId];
    
    if (collegeId) {
      query += ` AND ch.college_id = $${paramIndex++}`;
      params.push(parseInt(collegeId));
    }
    
    query += ` ORDER BY ch.calculated_at DESC LIMIT $${paramIndex++}`;
    params.push(boundedLimit);
    
    const history = (await pool.query(query, params)).rows;
    
    // Parse JSON fields with error handling
    const parsedHistory = history.map(h => {
      let profileSnapshot = {};
      let factors = [];
      
      try {
        profileSnapshot = JSON.parse(h.profile_snapshot || '{}');
      } catch (e) {
        logger.warn(`Invalid JSON in profile_snapshot for history id ${h.id}`);
      }
      
      try {
        factors = JSON.parse(h.factors || '[]');
      } catch (e) {
        logger.warn(`Invalid JSON in factors for history id ${h.id}`);
      }
      
      return {
        ...h,
        profileSnapshot,
        factors
      };
    });
    
    res.json({
      success: true,
      data: parsedHistory
    });
  } catch (error) {
    logger.error('Get history failed:', error);
    next(error);
  }
});

/**
 * POST /api/chancing/compare
 * Compare old profile vs new profile chances
 */
router.post('/compare', authenticate, async (req, res, next) => {
  try {
    // Get current profile and all colleges in list
    const Application = require('../models/Application');
    const applications = await Application.findByUser(req.user.userId);
    
    if (!applications || applications.length === 0) {
      return res.json({
        success: true,
        data: {
          results: [],
          summary: { improved: 0, decreased: 0, stayed: 0 }
        },
        message: 'No colleges in your list'
      });
    }
    
    const collegeIds = applications.map(a => a.college_id);
    const results = await getChancingResults(req.user.userId,
      (await Promise.all(collegeIds.map(id => College.findById(id)))).filter(c => c)
    );
    
    if (results.error) {
      return res.status(400).json({
        success: false,
        message: results.message,
        code: 'PROFILE_REQUIRED'
      });
    }
    
    // Get previous history entries for comparison
    const pool = dbManager.getDatabase();
    
    const historyRows = (await pool.query(
      `SELECT DISTINCT ON (college_id) *
      FROM chancing_history
      WHERE user_id = $1 AND college_id = ANY($2::int[])
      ORDER BY college_id, calculated_at DESC`,
      [req.user.userId, collegeIds]
    )).rows;
    const historyByCollege = Object.fromEntries(historyRows.map(h => [h.college_id, h]));

    const comparison = results.results.map(r => {
      const lastHistory = historyByCollege[r.college.id];
      const oldTier = lastHistory?.category === 'safety' ? 'Safety'
        : lastHistory?.category === 'target' ? 'Match'
        : lastHistory?.category === 'reach' ? 'Reach'
        : null;
      const newTier = r.chancing.tier;
      const change = oldTier ? (TIER_RANK[newTier] || -1) - (TIER_RANK[oldTier] || -1) : null;
      
      return {
        college: r.college,
        oldTier,
        newTier,
        change,
        oldCategory: lastHistory?.category || null,
        newCategory: r.chancing.category,
        improved: change !== null ? change > 0 : null
      };
    });
    
    const withHistory = comparison.filter(c => c.oldTier !== null);
    
    res.json({
      success: true,
      data: {
        comparison,
        summary: {
          total: comparison.length,
          withHistory: withHistory.length,
          improved: withHistory.filter(c => c.improved).length,
          decreased: withHistory.filter(c => c.change < 0).length,
          stayed: withHistory.filter(c => c.change === 0).length,
          avgChange: withHistory.length > 0
            ? Math.round(withHistory.reduce((sum, c) => sum + (c.change || 0), 0) / withHistory.length)
            : null
        }
      }
    });
  } catch (error) {
    logger.error('Compare failed:', error);
    next(error);
  }
});

/**
 * GET /api/chancing/:collegeId/cds
 * Get CDS-based chancing for a specific college
 */
router.get('/:collegeId/cds', authenticate, async (req, res, next) => {
  try {
    const { collegeId } = req.params;
    
    // Get student profile
    const profile = await StudentProfile.getCompleteProfile(req.user.userId);
    
    if (!profile) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your student profile first',
        code: 'PROFILE_REQUIRED'
      });
    }
    
    // Get college
    const college = await College.findById(collegeId);
    
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'College not found'
      });
    }
    
    // Get CDS data for this college
    const pool = dbManager.getDatabase();
    const cdsData = (await pool.query(
      `SELECT * FROM college_cds_data WHERE college_id = $1`,
      [collegeId]
    )).rows[0];
    
    // Get admitted student samples
    const samples = (await pool.query(
      `SELECT * FROM admitted_student_samples 
      WHERE college_id = $1 
      ORDER BY admission_year DESC 
      LIMIT 5`,
      [collegeId]
    )).rows;
    
    // Calculate CDS-based chance using consolidated service
    const chancing = await consolidatedChancingService.calculateChance(profile, college, { preferCDS: true });
    
    // Comparison with admitted samples (null since getAdmittedSampleComparison removed with deprecated import)
    const comparison = null;
    
    res.json({
      success: true,
      data: {
        college: {
          id: college.id,
          name: college.name,
          country: college.country,
          acceptanceRate: college.acceptance_rate
        },
        chancing,
        cdsData: cdsData ? {
          available: true,
          year: cdsData.data_year,
          satRange: cdsData.sat_25th_percentile && cdsData.sat_75th_percentile 
            ? `${cdsData.sat_25th_percentile}-${cdsData.sat_75th_percentile}` 
            : null,
          actRange: cdsData.act_25th_percentile && cdsData.act_75th_percentile
            ? `${cdsData.act_25th_percentile}-${cdsData.act_75th_percentile}`
            : null
        } : { available: false },
        admittedComparison: comparison,
        profile: {
          gpa: profile.gpa_unweighted || profile.gpa_weighted,
          sat: profile.sat_total,
          act: profile.act_composite,
          activitiesCount: (profile.activities || []).length
        }
      }
    });
  } catch (error) {
    logger.error('CDS chancing failed:', error);
    next(error);
  }
});

/**
 * GET /api/chancing/:collegeId/admitted-samples
 * Get admitted student samples for comparison
 */
router.get('/:collegeId/admitted-samples', authenticate, async (req, res, next) => {
  try {
    const { collegeId } = req.params;
    
    const pool = dbManager.getDatabase();
    
    // Get admitted student samples
    const samples = (await pool.query(
      `SELECT * FROM admitted_student_samples 
      WHERE college_id = $1 
      ORDER BY admission_year DESC 
      LIMIT 10`,
      [collegeId]
    )).rows;
    
    // Get college info
    const college = await College.findById(collegeId);
    
    res.json({
      success: true,
      data: {
        college: college ? {
          id: college.id,
          name: college.name
        } : null,
        samples: samples.map(s => ({
          year: s.admission_year,
          gpa: s.student_gpa,
          sat: s.student_sat_total,
          act: s.student_act_composite,
          classRank: s.class_rank_percentile,
          apCourses: s.num_ap_courses,
          activities: {
            tier1: s.tier_1_activities,
            tier2: s.tier_2_activities,
            tier3: s.tier_3_activities,
            summary: s.activity_summary
          },
          demographics: {
            isFirstGen: !!s.is_first_gen,
            isLegacy: !!s.is_legacy,
            state: s.state_of_residence,
            intendedMajor: s.intended_major
          },
          source: s.source,
          essayQuality: s.essay_quality_rating,
          achievements: s.notable_achievements
        })),
        count: samples.length
      }
    });
  } catch (error) {
    logger.error('Get admitted samples failed:', error);
    next(error);
  }
});

/**
 * GET /api/chancing/region/:region
 * Get region-specific chancing requirements info
 */
router.get('/region/:region', authenticate, async (req, res, next) => {
  try {
    const { region } = req.params;
    const validRegions = ['us', 'india', 'uk', 'germany', 'eu'];
    
    if (!validRegions.includes(region.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid region. Valid regions: ${validRegions.join(', ')}`
      });
    }
    
    const regionInfo = {
      us: {
        name: 'United States',
        method: 'CDS-based holistic review',
        primaryFactors: ['GPA', 'SAT/ACT', 'Essays', 'Extracurriculars', 'Recommendations'],
        secondaryFactors: ['Class Rank', 'Course Rigor', 'Interview', 'Legacy', 'First-Gen'],
        description: 'US colleges use holistic admissions based on Common Data Set factors. Each college weighs factors differently.',
        profileRequired: ['gpa_unweighted', 'sat_total OR act_composite', 'activities'],
        testOptional: 'Many colleges are test-optional. Check individual college policies.'
      },
      india: {
        name: 'India',
        method: 'Entrance exam-based',
        primaryFactors: ['JEE Rank (for IITs)', 'CAT Percentile (for IIMs)', 'NEET Score (for Medical)'],
        secondaryFactors: ['12th Board Marks', 'Category (Reservation)', 'State Quota'],
        description: 'Indian colleges primarily use entrance exam ranks and cutoffs. Category-wise reservations apply.',
        profileRequired: ['jee_advanced_rank OR jee_main_percentile OR cat_percentile', 'board_12th_percentage'],
        testOptional: 'Entrance exams are mandatory for most top institutions.'
      },
      uk: {
        name: 'United Kingdom',
        method: 'Predicted grades + Personal Statement',
        primaryFactors: ['Predicted A-Levels/IB', 'Personal Statement', 'Admissions Tests (Oxbridge)'],
        secondaryFactors: ['Reference Letter', 'Interview (Oxbridge)', 'Contextual Offers'],
        description: 'UK universities focus on predicted grades and personal statement. Oxbridge requires additional tests.',
        profileRequired: ['predicted_a_levels OR ib_predicted_score', 'ucas_points'],
        testOptional: 'Admissions tests required for Oxford, Cambridge, Medicine, Law.'
      },
      germany: {
        name: 'Germany',
        method: 'Abitur/NC-based',
        primaryFactors: ['Abitur Grade', 'NC Cutoff (for restricted programs)', 'German Proficiency'],
        secondaryFactors: ['Waiting Semesters', 'Motivation Letter', 'Aptitude Test'],
        description: 'German universities use Abitur grades. NC (Numerus Clausus) applies to competitive programs.',
        profileRequired: ['abitur_grade', 'german_proficiency_level'],
        testOptional: 'DSH or TestDaF required for German-taught programs.'
      },
      eu: {
        name: 'European Union (Other)',
        method: 'Varies by country',
        primaryFactors: ['Secondary School Grades', 'Entrance Exams (varies)', 'Language Proficiency'],
        secondaryFactors: ['Motivation Letter', 'Portfolio (for arts)', 'Work Experience'],
        description: 'EU admission requirements vary significantly by country and institution.',
        profileRequired: ['secondary_school_average', 'language_certificates'],
        testOptional: 'Depends on specific country and program.'
      }
    };
    
    res.json({
      success: true,
      data: regionInfo[region.toLowerCase()]
    });
  } catch (error) {
    logger.error('Get region info failed:', error);
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════
// CHANCING ENGINE STATUS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/chancing/ml/status
 * Returns deterministic engine status (no external ML service).
 */
router.get('/ml/status', authenticate, async (req, res) => {
  res.json({
    success: true,
    data: {
      serviceAvailable: true,
      engine: 'deterministic-sigmoid',
      message: 'Chancing uses a deterministic sigmoid model — no external ML service required.',
    },
  });
});

/**
 * GET /api/chancing/ml/models
 * Returns deterministic model description.
 */
router.get('/ml/models', authenticate, async (req, res) => {
  res.json({
    success: true,
    data: {
      models: [{ id: 'sigmoid-v1', type: 'deterministic', description: 'Sigmoid probability model using SAT/GPA delta vs college medians' }],
      count: 1,
    },
  });
});

/**
 * GET /api/chancing/ml/model/:collegeId
 * Returns per-college model info using the deterministic engine.
 */
router.get('/ml/model/:collegeId', authenticate, async (req, res) => {
  res.json({
    success: true,
    data: {
      hasModel: true,
      model: { type: 'deterministic', description: 'SAT/GPA sigmoid model' },
    },
  });
});

/**
 * POST /api/chancing/ml/batch
 * Batch chancing using deterministic engine.
 */
router.post('/ml/batch', authenticate, async (req, res, next) => {
  try {
    const { collegeIds } = req.body;
    if (!Array.isArray(collegeIds) || collegeIds.length === 0) {
      return res.status(400).json({ success: false, message: 'collegeIds must be a non-empty array' });
    }
    const profile = await StudentProfile.getCompleteProfile(req.user.userId);
    if (!profile) {
      return res.status(400).json({ success: false, message: 'Please complete your student profile first', code: 'PROFILE_REQUIRED' });
    }
    const MAX_BATCH = 50;
    const limitedIds = collegeIds.slice(0, MAX_BATCH);
    const colleges = (await Promise.all(limitedIds.map(id => College.findById(id)))).filter(c => c);
    const predictions = await Promise.all(
      colleges.map(async c => ({ collegeId: c.id, collegeName: c.name, ...(await consolidatedChancingService.calculateChance(profile, c)) }))
    );
    res.json({ success: true, data: { predictions, predictionType: 'deterministic', count: predictions.length } });
  } catch (error) {
    logger.error('Batch chancing failed:', error);
    next(error);
  }
});

/**
 * POST /api/chancing/outcome
 * Submit admission outcome for Brier Score tracking.
 */
router.post('/outcome', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const {
      collegeId,
      decision,
      applicationYear,
      major
    } = req.body;
    
    if (!collegeId || !decision) {
      return res.status(400).json({
        success: false,
        message: 'collegeId and decision are required'
      });
    }
    
    const validDecisions = ['accepted', 'rejected', 'waitlisted', 'deferred'];
    if (!validDecisions.includes(decision)) {
      return res.status(400).json({
        success: false,
        message: `decision must be one of: ${validDecisions.join(', ')}`
      });
    }
    
    // Get user's profile
    const profile = await StudentProfile.getCompleteProfile(userId);
    if (!profile) {
      return res.status(400).json({
        success: false,
        message: 'Profile required to submit outcome'
      });
    }
    
    // Get college
    const college = await College.findById(collegeId);
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'College not found'
      });
    }
    
    const pool = dbManager.getDatabase();
    
    // Count activity tiers
    const activities = profile.activities || [];
    const tier1Count = activities.filter(a => a.tier_rating === 1).length;
    const tier2Count = activities.filter(a => a.tier_rating === 2).length;
    const tier3Count = activities.filter(a => a.tier_rating === 3 || a.tier_rating === 4).length;
    
    // Insert training data with high confidence (user-verified)
    const result = await pool.query(
      `INSERT INTO ml_training_data (
        student_id, college_id, gpa, sat_total, act_composite,
        class_rank_percentile, num_ap_courses, activity_tier_1_count,
        activity_tier_2_count, activity_tier_3_count, is_first_gen, is_legacy,
        state, college_acceptance_rate, decision, application_year,
        source, is_verified, confidence_score, major_applied
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING id`,
      [
        userId,
        collegeId,
        profile.gpa_unweighted || profile.gpa_weighted || null,
        profile.sat_total || null,
        profile.act_composite || null,
        profile.class_rank_percentile || null,
        profile.num_ap_courses || 0,
        tier1Count,
        tier2Count,
        tier3Count,
        !!profile.is_first_generation,
        !!profile.is_legacy,
        profile.state_province || null,
        college.acceptance_rate || null,
        decision,
        applicationYear || new Date().getFullYear(),
        'user_verified',
        true,
        0.95,
        major || null
      ]
    );
    
    const trainingDataId = result.rows[0].id;
    
    // Write to prediction_logs for Brier Score tracking
    try {
      const chancing = await consolidatedChancingService.calculateChance(profile, college);
      const actualOutcome = decision === 'accepted' ? 1 : 0;
      await pool.query(
        `INSERT INTO prediction_logs (user_id, college_id, predicted_probability, actual_outcome, engine)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, college_id) DO UPDATE SET
           predicted_probability = EXCLUDED.predicted_probability,
           actual_outcome = EXCLUDED.actual_outcome,
           updated_at = NOW()`,
        [userId, collegeId, chancing.probability ?? null, actualOutcome, 'deterministic-sigmoid']
      );
    } catch (brierErr) {
      logger.debug('Prediction log insert failed (non-critical):', brierErr.message);
    }

    // Track contribution for gamification
    try {
      await pool.query(
        `INSERT INTO user_outcome_contributions (user_id, training_data_id, college_id, decision, points_awarded)
        VALUES ($1, $2, $3, $4, $5)`,
        [userId, trainingDataId, collegeId, decision, OUTCOME_CONTRIBUTION_POINTS]
      );
      
      // Update or insert user stats
      await pool.query(
        `INSERT INTO user_ml_stats (user_id, total_contributions, verified_contributions, total_points, last_contribution_at)
        VALUES ($1, 1, 1, $2, NOW())
        ON CONFLICT(user_id) DO UPDATE SET
          total_contributions = user_ml_stats.total_contributions + 1,
          verified_contributions = user_ml_stats.verified_contributions + 1,
          total_points = user_ml_stats.total_points + $3,
          last_contribution_at = NOW(),
          updated_at = NOW()`,
        [userId, OUTCOME_CONTRIBUTION_POINTS, OUTCOME_CONTRIBUTION_POINTS]
      );
    } catch (statsError) {
      // Non-critical - contribution tracking is optional
      logger.debug('Stats tracking failed:', statsError.message);
    }
    
    logger.info(`Outcome submitted: user ${userId}, college ${sanitizeForLog(collegeId)}, decision: ${sanitizeForLog(decision)}`);
    
    res.status(201).json({
      success: true,
      message: 'Thank you for contributing! Your outcome helps improve predictions for everyone.',
      data: {
        trainingDataId: trainingDataId,
        pointsEarned: OUTCOME_CONTRIBUTION_POINTS,
        decision: decision
      }
    });
  } catch (error) {
    logger.error('Outcome submission failed:', error);
    next(error);
  }
});

/**
 * GET /api/chancing/contribution-stats
 * Get user's ML contribution statistics
 */
router.get('/contribution-stats', authenticate, async (req, res, next) => {
  try {
    const pool = dbManager.getDatabase();
    
    const stats = (await pool.query(
      `SELECT 
        total_contributions,
        verified_contributions,
        total_points,
        contribution_rank,
        models_improved,
        last_contribution_at
      FROM user_ml_stats
      WHERE user_id = $1`,
      [req.user.userId]
    )).rows[0];
    
    if (!stats) {
      return res.json({
        success: true,
        data: {
          totalContributions: 0,
          verifiedContributions: 0,
          totalPoints: 0,
          rank: 'newcomer',
          modelsImproved: 0,
          lastContribution: null,
          nextRank: { name: 'contributor', pointsNeeded: 10 }
        }
      });
    }
    
    // Calculate rank and next rank
    const ranks = [
      { name: 'newcomer', minPoints: 0 },
      { name: 'contributor', minPoints: 10 },
      { name: 'helper', minPoints: 50 },
      { name: 'supporter', minPoints: 100 },
      { name: 'champion', minPoints: 250 },
      { name: 'legend', minPoints: 500 }
    ];
    
    let currentRank = ranks[0];
    let nextRank = ranks[1];
    
    for (let i = 0; i < ranks.length; i++) {
      if (stats.total_points >= ranks[i].minPoints) {
        currentRank = ranks[i];
        nextRank = ranks[i + 1] || null;
      }
    }
    
    res.json({
      success: true,
      data: {
        totalContributions: stats.total_contributions,
        verifiedContributions: stats.verified_contributions,
        totalPoints: stats.total_points,
        rank: currentRank.name,
        modelsImproved: stats.models_improved,
        lastContribution: stats.last_contribution_at,
        nextRank: nextRank ? {
          name: nextRank.name,
          pointsNeeded: nextRank.minPoints - stats.total_points
        } : null
      }
    });
  } catch (error) {
    logger.error('Get contribution stats failed:', error);
    next(error);
  }
});

/**
 * GET /api/chancing/ml/data-needs
 * Get colleges that need more data for ML training
 */
router.get('/ml/data-needs', authenticate, async (req, res, next) => {
  try {
    const pool = dbManager.getDatabase();
    const minSamples = 30;  // Minimum samples needed for training
    
    // Get colleges with some data but not enough for training
    const collegesNeedingData = (await pool.query(
      `SELECT 
        t.college_id,
        c.name as college_name,
        COUNT(*)::int as current_samples,
        SUM(CASE WHEN t.decision = 'accepted' THEN 1 ELSE 0 END)::int as accepted_count,
        SUM(CASE WHEN t.decision = 'rejected' THEN 1 ELSE 0 END)::int as rejected_count,
        ($1 - COUNT(*))::int as samples_needed
      FROM ml_training_data t
      LEFT JOIN colleges c ON t.college_id = c.id
      WHERE t.decision IN ('accepted', 'rejected')
      GROUP BY t.college_id, c.name
      HAVING COUNT(*) < $2
      ORDER BY current_samples DESC
      LIMIT 20`,
      [minSamples, minSamples]
    )).rows;
    
    res.json({
      success: true,
      data: {
        collegesNeedingData: collegesNeedingData,
        minSamplesRequired: minSamples
      }
    });
  } catch (error) {
    logger.error('Get data needs failed:', error);
    next(error);
  }
});

/**
 * GET /api/chancing/brier-score
 * Compute Brier Score for this user's predictions (requires outcome submissions).
 * Brier Score = mean((p_i - o_i)^2) where p_i = predicted probability, o_i = actual outcome (0/1).
 * Lower is better; 0 = perfect, 0.25 = no-skill.
 */
router.get('/brier-score', authenticate, async (req, res, next) => {
  try {
    const pool = dbManager.getDatabase();

    // Join prediction_logs with ml_training_data (user outcomes) to get paired predictions
    const rows = (await pool.query(
      `SELECT pl.predicted_probability, pl.actual_outcome
       FROM prediction_logs pl
       WHERE pl.user_id = $1
         AND pl.predicted_probability IS NOT NULL
         AND pl.actual_outcome IS NOT NULL`,
      [req.user.userId]
    )).rows;

    if (rows.length === 0) {
      return res.json({
        success: true,
        data: {
          score: null,
          calibration: 'No outcomes submitted yet',
          count: 0,
          message: 'Submit admission outcomes via POST /api/chancing/outcome to track Brier Score.',
        },
      });
    }

    const brierSum = rows.reduce((sum, r) => {
      const p = parseFloat(r.predicted_probability);
      const o = parseInt(r.actual_outcome, 10);
      return sum + Math.pow(p - o, 2);
    }, 0);
    const score = Math.round((brierSum / rows.length) * 10000) / 10000;

    let calibration;
    if (score <= 0.10) calibration = 'excellent';
    else if (score <= 0.20) calibration = 'good';
    else if (score <= 0.25) calibration = 'decent';
    else calibration = 'needs more data';

    res.json({
      success: true,
      data: { score, calibration, count: rows.length },
    });
  } catch (error) {
    logger.error('Brier score computation failed:', error);
    next(error);
  }
});

module.exports = router;

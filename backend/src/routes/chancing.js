// backend/src/routes/chancing.js
// API routes for admission chancing calculator with LDA ML integration

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { 
  calculateAdmissionChance, 
  calculateJEEChance, 
  calculateUKChance, 
  calculateGermanChance,
  getChancingForStudent 
} = require('../services/chancingCalculator');
const StudentProfile = require('../models/StudentProfile');
const College = require('../models/College');
const mlPredictionService = require('../services/mlPredictionService');
const dbManager = require('../config/database');
const logger = require('../utils/logger');

// ML Configuration Constants
const ML_CONTRIBUTION_SCALE_FACTOR = 10; // Factor to convert LDA coefficients to percentage impacts
const OUTCOME_CONTRIBUTION_POINTS = 10;  // Points awarded for submitting an admission outcome

/**
 * POST /api/chancing/calculate
 * Calculate admission chance for a specific college
 * Uses ML-based LDA prediction when available, falls back to rule-based
 */
router.post('/calculate', authenticate, async (req, res, next) => {
  try {
    const { collegeId, useML = true } = req.body;
    
    if (!collegeId) {
      return res.status(400).json({
        success: false,
        message: 'collegeId is required'
      });
    }
    
    // Get student profile
    const profile = StudentProfile.getCompleteProfile(req.user.userId);
    
    if (!profile) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your student profile first',
        code: 'PROFILE_REQUIRED'
      });
    }
    
    // Get college
    const college = College.findById(collegeId);
    
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'College not found'
      });
    }
    
    const country = college.location_country || college.country || 'USA';
    let chancing;
    let predictionType = 'rule_based';
    
    // Try ML prediction first if enabled
    if (useML) {
      const mlResult = await mlPredictionService.predict(
        profile, 
        profile.activities || [], 
        college
      );
      
      if (mlResult.success && mlResult.prediction_type === 'ml_lda') {
        // Use ML prediction
        chancing = {
          percentage: mlResult.percentage,
          category: mlResult.category,
          confidence: mlResult.confidence,
          confidenceLevel: mlResult.confidence_level,
          factors: mlResult.factors.map(f => ({
            name: f.factor,
            impact: f.impact === 'positive' ? `+${Math.abs(f.contribution * ML_CONTRIBUTION_SCALE_FACTOR).toFixed(0)}%` : 
                   f.impact === 'negative' ? `-${Math.abs(f.contribution * ML_CONTRIBUTION_SCALE_FACTOR).toFixed(0)}%` : '0%',
            details: f.impact_level,
            positive: f.impact === 'positive'
          })),
          modelInfo: mlResult.model_info
        };
        predictionType = 'ml_lda';
      }
    }
    
    // Fall back to rule-based if ML not available/successful
    if (!chancing) {
      if (country === 'India' && (profile.jee_main_percentile || profile.jee_advanced_rank)) {
        chancing = calculateJEEChance(profile, college);
      } else if (country === 'UK' && (profile.predicted_a_levels || profile.ib_predicted_score)) {
        chancing = calculateUKChance(profile, college);
      } else if (country === 'Germany' && profile.abitur_grade) {
        chancing = calculateGermanChance(profile, college);
      } else {
        chancing = calculateAdmissionChance(profile, college);
      }
    }
    
    // Log prediction for analytics
    try {
      const db = dbManager.getDatabase();
      db.prepare(`
        INSERT INTO prediction_audit_log (user_id, college_id, prediction_type, probability, category, confidence, factors_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.user.userId,
        collegeId,
        predictionType,
        chancing.percentage / 100,
        chancing.category,
        chancing.confidence || null,
        JSON.stringify(chancing.factors || [])
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
        chancing: chancing,
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
    const colleges = limitedIds.map(id => College.findById(id)).filter(c => c);
    
    // Get chancing results
    const results = getChancingForStudent(req.user.userId, colleges);
    
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
    const applications = Application.findByUserId(req.user.userId);
    
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
    const colleges = collegeIds.map(id => College.findById(id)).filter(c => c);
    
    // Get chancing results
    const results = getChancingForStudent(req.user.userId, colleges);
    
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
    const profile = StudentProfile.getCompleteProfile(req.user.userId);
    
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
      colleges = College.search({ country: country, limit: parseInt(limit) * 3 });
    } else if (preferredCountries.length > 0) {
      // Get colleges from all preferred countries
      colleges = [];
      for (const c of preferredCountries) {
        const countryColleges = College.search({ country: c, limit: parseInt(limit) });
        colleges = colleges.concat(countryColleges);
      }
    } else {
      colleges = College.search({ limit: parseInt(limit) * 3 });
    }
    
    // Get chancing results
    const results = getChancingForStudent(req.user.userId, colleges);
    
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
      safety: results.results.filter(r => r.chancing.category === 'Safety'),
      target: results.results.filter(r => r.chancing.category === 'Target'),
      reach: results.results.filter(r => r.chancing.category === 'Reach')
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
    const profile = StudentProfile.getCompleteProfile(req.user.userId);
    
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
    const currentProfile = StudentProfile.getCompleteProfile(req.user.userId);
    
    if (!currentProfile) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your student profile first',
        code: 'PROFILE_REQUIRED'
      });
    }
    
    // Create temporary merged profile with changes
    const scenarioProfile = { ...currentProfile };
    
    // Apply changes to the scenario profile
    for (const [key, value] of Object.entries(profileChanges)) {
      scenarioProfile[key] = value;
    }
    
    // Get colleges
    const colleges = collegeIds.map(id => College.findById(id)).filter(c => c);
    
    // Calculate chances with both profiles
    const currentResults = [];
    const scenarioResults = [];
    
    for (const college of colleges) {
      const country = college.location_country || college.country || 'USA';
      
      // Current chances
      let currentChancing;
      if (country === 'India' && (currentProfile.jee_main_percentile || currentProfile.jee_advanced_rank)) {
        currentChancing = calculateJEEChance(currentProfile, college);
      } else if (country === 'UK' && (currentProfile.predicted_a_levels || currentProfile.ib_predicted_score)) {
        currentChancing = calculateUKChance(currentProfile, college);
      } else if (country === 'Germany' && currentProfile.abitur_grade) {
        currentChancing = calculateGermanChance(currentProfile, college);
      } else {
        currentChancing = calculateAdmissionChance(currentProfile, college);
      }
      
      // Scenario chances
      let scenarioChancing;
      if (country === 'India' && (scenarioProfile.jee_main_percentile || scenarioProfile.jee_advanced_rank)) {
        scenarioChancing = calculateJEEChance(scenarioProfile, college);
      } else if (country === 'UK' && (scenarioProfile.predicted_a_levels || scenarioProfile.ib_predicted_score)) {
        scenarioChancing = calculateUKChance(scenarioProfile, college);
      } else if (country === 'Germany' && scenarioProfile.abitur_grade) {
        scenarioChancing = calculateGermanChance(scenarioProfile, college);
      } else {
        scenarioChancing = calculateAdmissionChance(scenarioProfile, college);
      }
      
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
      const oldChance = currentResults[idx].chancing.chance;
      const newChance = scenarioResults[idx].chancing.chance;
      const change = newChance - oldChance;
      const oldCategory = currentResults[idx].chancing.category;
      const newCategory = scenarioResults[idx].chancing.category;
      
      return {
        college: { id: college.id, name: college.name },
        oldChance,
        newChance,
        change,
        oldCategory,
        newCategory,
        categoryChanged: oldCategory !== newCategory,
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
            from: c.oldCategory,
            to: c.newCategory
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
    const { collegeId, chance, category, factors } = req.body;
    
    if (!collegeId || chance === undefined || !category) {
      return res.status(400).json({
        success: false,
        message: 'collegeId, chance, and category are required'
      });
    }
    
    const profile = StudentProfile.getCompleteProfile(req.user.userId);
    
    const dbManager = require('../config/database');
    const db = dbManager.getDatabase();
    
    // Create profile snapshot
    const profileSnapshot = profile ? {
      gpa: profile.gpa_unweighted || profile.gpa_weighted,
      sat: profile.sat_total,
      act: profile.act_composite,
      activitiesCount: (profile.activities || []).length,
      tier1Count: (profile.activities || []).filter(a => a.tier_rating === 1).length
    } : {};
    
    const stmt = db.prepare(`
      INSERT INTO chancing_history (
        user_id, college_id, chance_percentage, category, profile_snapshot, factors
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      req.user.userId,
      collegeId,
      chance,
      category,
      JSON.stringify(profileSnapshot),
      JSON.stringify(factors || [])
    );
    
    res.status(201).json({
      success: true,
      message: 'Chancing history saved',
      data: { id: result.lastInsertRowid }
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
    
    const dbManager = require('../config/database');
    const db = dbManager.getDatabase();
    
    let query = `
      SELECT ch.*, c.name as college_name
      FROM chancing_history ch
      JOIN colleges c ON ch.college_id = c.id
      WHERE ch.user_id = ?
    `;
    const params = [req.user.userId];
    
    if (collegeId) {
      query += ' AND ch.college_id = ?';
      params.push(parseInt(collegeId));
    }
    
    query += ' ORDER BY ch.calculated_at DESC LIMIT ?';
    params.push(boundedLimit);
    
    const history = db.prepare(query).all(...params);
    
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
    const applications = Application.findByUser(req.user.userId);
    
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
    const results = getChancingForStudent(req.user.userId, 
      collegeIds.map(id => College.findById(id)).filter(c => c)
    );
    
    if (results.error) {
      return res.status(400).json({
        success: false,
        message: results.message,
        code: 'PROFILE_REQUIRED'
      });
    }
    
    // Get previous history entries for comparison
    const dbManager = require('../config/database');
    const db = dbManager.getDatabase();
    
    const comparison = results.results.map(r => {
      const lastHistory = db.prepare(`
        SELECT * FROM chancing_history 
        WHERE user_id = ? AND college_id = ?
        ORDER BY calculated_at DESC LIMIT 1
      `).get(req.user.userId, r.college.id);
      
      const oldChance = lastHistory?.chance_percentage || null;
      const newChance = r.chancing.chance;
      const change = oldChance !== null ? newChance - oldChance : null;
      
      return {
        college: r.college,
        oldChance,
        newChance,
        change,
        oldCategory: lastHistory?.category || null,
        newCategory: r.chancing.category,
        improved: change !== null ? change > 0 : null
      };
    });
    
    const withHistory = comparison.filter(c => c.oldChance !== null);
    
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
            ? Math.round(withHistory.reduce((sum, c) => sum + c.change, 0) / withHistory.length)
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
    const { calculateCDSBasedChance, getAdmittedSampleComparison } = require('../services/chancingCalculator');
    const dbManager = require('../config/database');
    
    // Get student profile
    const profile = StudentProfile.getCompleteProfile(req.user.userId);
    
    if (!profile) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your student profile first',
        code: 'PROFILE_REQUIRED'
      });
    }
    
    // Get college
    const college = College.findById(collegeId);
    
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'College not found'
      });
    }
    
    // Get CDS data for this college
    const db = dbManager.getDatabase();
    const cdsData = db.prepare(`
      SELECT * FROM college_cds_data WHERE college_id = ?
    `).get(collegeId);
    
    // Get admitted student samples
    const samples = db.prepare(`
      SELECT * FROM admitted_student_samples 
      WHERE college_id = ? 
      ORDER BY admission_year DESC 
      LIMIT 5
    `).all(collegeId);
    
    // Calculate CDS-based chance
    const chancing = calculateCDSBasedChance(profile, college, cdsData);
    
    // Get comparison with admitted students
    const comparison = getAdmittedSampleComparison(profile, samples);
    
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
    const dbManager = require('../config/database');
    
    const db = dbManager.getDatabase();
    
    // Get admitted student samples
    const samples = db.prepare(`
      SELECT * FROM admitted_student_samples 
      WHERE college_id = ? 
      ORDER BY admission_year DESC 
      LIMIT 10
    `).all(collegeId);
    
    // Get college info
    const college = College.findById(collegeId);
    
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
// ML-BASED CHANCING ROUTES
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/chancing/ml/status
 * Get ML prediction service status and statistics
 */
router.get('/ml/status', authenticate, async (req, res, next) => {
  try {
    const stats = await mlPredictionService.getStats();
    
    res.json({
      success: true,
      data: {
        serviceAvailable: stats.available,
        stats: stats.stats || null,
        config: stats.config || null
      }
    });
  } catch (error) {
    logger.error('ML status check failed:', error);
    next(error);
  }
});

/**
 * GET /api/chancing/ml/models
 * Get list of available ML models
 */
router.get('/ml/models', authenticate, async (req, res, next) => {
  try {
    const models = await mlPredictionService.listModels();
    
    res.json({
      success: true,
      data: {
        models: models,
        count: models.length
      }
    });
  } catch (error) {
    logger.error('ML models list failed:', error);
    next(error);
  }
});

/**
 * GET /api/chancing/ml/model/:collegeId
 * Get ML model information for a specific college
 */
router.get('/ml/model/:collegeId', authenticate, async (req, res, next) => {
  try {
    const collegeId = parseInt(req.params.collegeId);
    const modelInfo = await mlPredictionService.getModelInfo(collegeId);
    
    if (!modelInfo) {
      return res.json({
        success: true,
        data: {
          hasModel: false,
          message: 'No ML model available for this college. Using rule-based predictions.'
        }
      });
    }
    
    res.json({
      success: true,
      data: {
        hasModel: true,
        model: modelInfo
      }
    });
  } catch (error) {
    logger.error('ML model info failed:', error);
    next(error);
  }
});

/**
 * POST /api/chancing/ml/batch
 * Get ML predictions for multiple colleges
 */
router.post('/ml/batch', authenticate, async (req, res, next) => {
  try {
    const { collegeIds } = req.body;
    
    if (!Array.isArray(collegeIds) || collegeIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'collegeIds must be a non-empty array'
      });
    }
    
    // Get student profile
    const profile = StudentProfile.getCompleteProfile(req.user.userId);
    
    if (!profile) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your student profile first',
        code: 'PROFILE_REQUIRED'
      });
    }
    
    // Get colleges
    const MAX_BATCH = 50;
    const limitedIds = collegeIds.slice(0, MAX_BATCH);
    const colleges = limitedIds.map(id => College.findById(id)).filter(c => c);
    
    // Get ML predictions
    const result = await mlPredictionService.batchPredict(
      profile,
      profile.activities || [],
      colleges
    );
    
    res.json({
      success: true,
      data: {
        predictions: result.predictions || [],
        predictionType: result.prediction_type || 'ml_lda',
        count: (result.predictions || []).length
      }
    });
  } catch (error) {
    logger.error('ML batch prediction failed:', error);
    next(error);
  }
});

/**
 * POST /api/chancing/outcome
 * Submit admission outcome for ML training
 * This is the user feedback loop for continuous model improvement
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
    const profile = StudentProfile.getCompleteProfile(userId);
    if (!profile) {
      return res.status(400).json({
        success: false,
        message: 'Profile required to submit outcome'
      });
    }
    
    // Get college
    const college = College.findById(collegeId);
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'College not found'
      });
    }
    
    const db = dbManager.getDatabase();
    
    // Count activity tiers
    const activities = profile.activities || [];
    const tier1Count = activities.filter(a => a.tier_rating === 1).length;
    const tier2Count = activities.filter(a => a.tier_rating === 2).length;
    const tier3Count = activities.filter(a => a.tier_rating === 3 || a.tier_rating === 4).length;
    
    // Insert training data with high confidence (user-verified)
    const stmt = db.prepare(`
      INSERT INTO ml_training_data (
        student_id, college_id, gpa, sat_total, act_composite,
        class_rank_percentile, num_ap_courses, activity_tier_1_count,
        activity_tier_2_count, activity_tier_3_count, is_first_gen, is_legacy,
        state, college_acceptance_rate, decision, application_year,
        source, is_verified, confidence_score, major_applied
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
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
      profile.is_first_generation ? 1 : 0,
      profile.is_legacy ? 1 : 0,
      profile.state_province || null,
      college.acceptance_rate || null,
      decision,
      applicationYear || new Date().getFullYear(),
      'user_verified',
      1,  // is_verified = true
      0.95,  // High confidence for user-submitted
      major || null
    );
    
    const trainingDataId = result.lastInsertRowid;
    
    // Track contribution for gamification
    try {
      db.prepare(`
        INSERT INTO user_outcome_contributions (user_id, training_data_id, college_id, decision, points_awarded)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, trainingDataId, collegeId, decision, OUTCOME_CONTRIBUTION_POINTS);
      
      // Update or insert user stats
      db.prepare(`
        INSERT INTO user_ml_stats (user_id, total_contributions, verified_contributions, total_points, last_contribution_at)
        VALUES (?, 1, 1, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
          total_contributions = total_contributions + 1,
          verified_contributions = verified_contributions + 1,
          total_points = total_points + ?,
          last_contribution_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      `).run(userId, OUTCOME_CONTRIBUTION_POINTS, OUTCOME_CONTRIBUTION_POINTS);
    } catch (statsError) {
      // Non-critical - contribution tracking is optional
      logger.debug('Stats tracking failed:', statsError.message);
    }
    
    logger.info(`Outcome submitted: user ${userId}, college ${collegeId}, decision: ${decision}`);
    
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
    const db = dbManager.getDatabase();
    
    const stats = db.prepare(`
      SELECT 
        total_contributions,
        verified_contributions,
        total_points,
        contribution_rank,
        models_improved,
        last_contribution_at
      FROM user_ml_stats
      WHERE user_id = ?
    `).get(req.user.userId);
    
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
    const db = dbManager.getDatabase();
    const minSamples = 30;  // Minimum samples needed for training
    
    // Get colleges with some data but not enough for training
    const collegesNeedingData = db.prepare(`
      SELECT 
        t.college_id,
        c.name as college_name,
        COUNT(*) as current_samples,
        SUM(CASE WHEN t.decision = 'accepted' THEN 1 ELSE 0 END) as accepted_count,
        SUM(CASE WHEN t.decision = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
        ? - COUNT(*) as samples_needed
      FROM ml_training_data t
      LEFT JOIN colleges c ON t.college_id = c.id
      WHERE t.decision IN ('accepted', 'rejected')
      GROUP BY t.college_id
      HAVING current_samples < ?
      ORDER BY current_samples DESC
      LIMIT 20
    `).all(minSamples, minSamples);
    
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

module.exports = router;

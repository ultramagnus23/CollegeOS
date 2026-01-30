// backend/src/routes/chancing.js
// API routes for admission chancing calculator

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
const logger = require('../utils/logger');

/**
 * POST /api/chancing/calculate
 * Calculate admission chance for a specific college
 */
router.post('/calculate', authenticate, async (req, res, next) => {
  try {
    const { collegeId } = req.body;
    
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
    
    // Determine which calculator to use
    const country = college.location_country || college.country || 'USA';
    let chancing;
    
    if (country === 'India' && (profile.jee_main_percentile || profile.jee_advanced_rank)) {
      chancing = calculateJEEChance(profile, college);
    } else if (country === 'UK' && (profile.predicted_a_levels || profile.ib_predicted_score)) {
      chancing = calculateUKChance(profile, college);
    } else if (country === 'Germany' && profile.abitur_grade) {
      chancing = calculateGermanChance(profile, college);
    } else {
      chancing = calculateAdmissionChance(profile, college);
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
    
    // Limit batch size
    const limitedIds = collegeIds.slice(0, 50);
    
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
      data: results
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

module.exports = router;

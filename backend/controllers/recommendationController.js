const { generateRecommendations, filterRecommendations } = require('../services/recommendationEngine');
const College = require('../models/College');
const User = require('../models/User');
const db = require('../config/database');

exports.generate = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Get user profile
    const userProfile = await User.getAcademicProfile(userId);
    if (!userProfile || !userProfile.academic_board) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your profile first',
        redirect: '/onboarding'
      });
    }
    
    // Get all colleges
    const allColleges = await College.findAll();
    
    // Generate recommendations
    const recommendations = generateRecommendations(userProfile, allColleges);
    
    // Cache in database
    await cacheRecommendations(userId, recommendations);
    
    res.json({
      success: true,
      message: `Generated ${recommendations.length} personalized recommendations`,
      data: {
        total: recommendations.length,
        reach: recommendations.filter(r => r.classification === 'REACH').length,
        target: recommendations.filter(r => r.classification === 'TARGET').length,
        safety: recommendations.filter(r => r.classification === 'SAFETY').length
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getAll = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const filters = {
      classification: req.query.classification || 'all',
      country: req.query.country || 'all',
      within_budget: req.query.within_budget === 'true',
      eligibility: req.query.eligibility || 'all',
      sort: req.query.sort || 'fit'
    };
    
    // Get cached recommendations
    let recommendations = await getCachedRecommendations(userId);
    
    // If no cache, generate fresh
    if (!recommendations || recommendations.length === 0) {
      const userProfile = await User.getAcademicProfile(userId);
      const allColleges = await College.findAll();
      recommendations = generateRecommendations(userProfile, allColleges);
      await cacheRecommendations(userId, recommendations);
    }
    
    // Apply filters
    const filtered = filterRecommendations(recommendations, filters);
    
    res.json({
      success: true,
      data: filtered,
      total: recommendations.length,
      filtered: filtered.length
    });
  } catch (error) {
    next(error);
  }
};

exports.getStats = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const recommendations = await getCachedRecommendations(userId);
    
    if (!recommendations || recommendations.length === 0) {
      return res.json({
        success: true,
        data: {
          total: 0,
          reach: 0,
          target: 0,
          safety: 0,
          within_budget: 0,
          countries: {}
        }
      });
    }
    
    const stats = {
      total: recommendations.length,
      reach: recommendations.filter(r => r.classification === 'REACH').length,
      target: recommendations.filter(r => r.classification === 'TARGET').length,
      safety: recommendations.filter(r => r.classification === 'SAFETY').length,
      within_budget: recommendations.filter(r => r.financial_fit.within_budget).length,
      fully_eligible: recommendations.filter(r => r.eligibility.status === 'eligible').length,
      conditional: recommendations.filter(r => r.eligibility.status === 'conditional').length,
      avg_fit_score: Math.round(
        recommendations.reduce((sum, r) => sum + r.overall_fit_score, 0) / recommendations.length
      ),
      countries: {}
    };
    
    recommendations.forEach(r => {
      const country = r.college.country;
      stats.countries[country] = (stats.countries[country] || 0) + 1;
    });
    
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
};

exports.getForCollege = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { collegeId } = req.params;
    
    const recommendations = await getCachedRecommendations(userId);
    const recommendation = recommendations.find(r => r.college.id == collegeId);
    
    if (!recommendation) {
      return res.status(404).json({
        success: false,
        message: 'Recommendation not found'
      });
    }
    
    res.json({ success: true, data: recommendation });
  } catch (error) {
    next(error);
  }
};

// Helper functions
async function cacheRecommendations(userId, recommendations) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM recommendation_cache WHERE user_id = ?', [userId], (err) => {
      if (err) return reject(err);
      
      const recommendationsJson = JSON.stringify(recommendations);
      db.run(
        'INSERT INTO recommendation_cache (user_id, recommendations, generated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [userId, recommendationsJson],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });
}

async function getCachedRecommendations(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT recommendations FROM recommendation_cache 
       WHERE user_id = ? AND generated_at > datetime('now', '-24 hours')`,
      [userId],
      (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve(null);
        try {
          resolve(JSON.parse(row.recommendations));
        } catch (e) {
          resolve(null);
        }
      }
    );
  });
}
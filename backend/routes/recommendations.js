// backend/routes/recommendations.js
// API endpoints for generating and retrieving personalized recommendations

const express = require('express');
const router = express.Router();
const { generateRecommendations, filterRecommendations } = require('../services/recommendationEngine');
const College = require('../models/College');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

/**
 * POST /api/recommendations/generate
 * Generate fresh recommendations based on current profile
 * Call this after onboarding or when profile changes significantly
 */
router.post('/generate', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's complete profile
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
    
    // Store recommendations in database (cache for fast retrieval)
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
    console.error('Error generating recommendations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate recommendations',
      error: error.message
    });
  }
});

/**
 * GET /api/recommendations
 * Get cached recommendations with optional filtering
 * Query params: classification, country, within_budget, eligibility, sort
 */
router.get('/', async (req, res) => {
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
    console.error('Error fetching recommendations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recommendations',
      error: error.message
    });
  }
});

/**
 * GET /api/recommendations/stats
 * Get recommendation statistics
 */
router.get('/stats', async (req, res) => {
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
    
    // Compute statistics
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
    
    // Count by country
    recommendations.forEach(r => {
      const country = r.college.country;
      stats.countries[country] = (stats.countries[country] || 0) + 1;
    });
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
});

/**
 * GET /api/recommendations/:collegeId
 * Get recommendation details for a specific college
 */
router.get('/:collegeId', async (req, res) => {
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
    
    res.json({
      success: true,
      data: recommendation
    });
    
  } catch (error) {
    console.error('Error fetching recommendation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recommendation details',
      error: error.message
    });
  }
});

// Helper functions for caching
async function cacheRecommendations(userId, recommendations) {
  const db = require('../config/database');
  
  // Delete old cache
  await new Promise((resolve, reject) => {
    db.run('DELETE FROM recommendation_cache WHERE user_id = ?', [userId], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  // Insert new cache
  const recommendationsJson = JSON.stringify(recommendations);
  
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT INTO recommendation_cache (user_id, recommendations, generated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `, [userId, recommendationsJson], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function getCachedRecommendations(userId) {
  const db = require('../config/database');
  
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT recommendations, generated_at FROM recommendation_cache
      WHERE user_id = ?
      AND generated_at > datetime('now', '-24 hours')
    `, [userId], (err, row) => {
      if (err) {
        reject(err);
      } else if (!row) {
        resolve(null);
      } else {
        try {
          const recommendations = JSON.parse(row.recommendations);
          resolve(recommendations);
        } catch (e) {
          resolve(null);
        }
      }
    });
  });
}

module.exports = router;
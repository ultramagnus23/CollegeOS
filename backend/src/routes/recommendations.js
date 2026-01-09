// ============================================
// FILE: backend/src/routes/recommendations.js
// ============================================
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const College = require('../models/College');
const User = require('../models/User');
const logger = require('../utils/logger');

// Get recommendations for user - uses recommendationEngine service
router.get('/', authenticate, async (req, res, next) => {
  try {
    const user = User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user's academic profile
    const userProfile = await User.getAcademicProfile(req.user.userId);
    
    if (!userProfile || !userProfile.academic_board) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your academic profile first',
        redirect: '/onboarding'
      });
    }

    // Get all colleges
    const College = require('../models/College');
    const allColleges = await College.findAll({ limit: 1000 }); // Get all for recommendations
    
    // Use recommendation engine service
    const { generateRecommendations } = require('../../services/recommendationEngine');
    const recommendations = generateRecommendations(userProfile, allColleges);

    res.json({
      success: true,
      count: recommendations.length,
      data: recommendations
    });
  } catch (error) {
    logger.error('Get recommendations failed:', error);
    next(error);
  }
});

// Generate new recommendations - same as GET but forces refresh
router.post('/generate', authenticate, async (req, res, next) => {
  try {
    const user = User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userProfile = await User.getAcademicProfile(req.user.userId);
    
    if (!userProfile || !userProfile.academic_board) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your academic profile first'
      });
    }

    const College = require('../models/College');
    const allColleges = await College.findAll({ limit: 1000 });
    
    const { generateRecommendations } = require('../../services/recommendationEngine');
    const recommendations = generateRecommendations(userProfile, allColleges);

    res.json({
      success: true,
      message: `Generated ${recommendations.length} personalized recommendations`,
      count: recommendations.length,
      data: recommendations
    });
  } catch (error) {
    logger.error('Generate recommendations failed:', error);
    next(error);
  }
});

// Helper function
function determineClassification(college, user) {
  // Simple logic - in real app this would be more sophisticated
  const acceptanceRate = college.acceptance_rate || 50;
  
  if (acceptanceRate < 20) return 'REACH';
  if (acceptanceRate < 50) return 'TARGET';
  return 'SAFETY';
}

module.exports = router;
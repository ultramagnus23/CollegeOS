// backend/src/services/consolidatedChancingService.js
// Unified chancing and fit classification service
// Consolidates: chancingCalculator, improvedChancingService, fitClassificationService,
//               smartRecommendationService, collegeListOptimizerService, cdsChancingService

const chancingCalculator = require('./chancingCalculator');
const improvedChancingService = require('./improvedChancingService');
const fitClassificationService = require('./fitClassificationService');
const smartRecommendationService = require('./smartRecommendationService');
const collegeListOptimizerService = require('./collegeListOptimizerService');
const cdsChancingService = require('./cdsChancingService');
const logger = require('../utils/logger');

/**
 * Consolidated Chancing Service
 * 
 * This service consolidates 6 overlapping chancing/fit/recommendation services
 * into a single interface, delegating to the most appropriate implementation.
 * 
 * Priority order:
 * 1. CDS-based chancing (most accurate, uses Common Data Set)
 * 2. Improved chancing service (enhanced algorithm)
 * 3. Base chancing calculator (fallback)
 */

/**
 * Calculate admission chance for a student at a college
 * Uses the best available algorithm based on data availability
 * 
 * @param {Object} studentProfile - Student profile data
 * @param {Object} college - College data
 * @param {Object} options - Calculation options
 * @returns {Object} Chancing result with percentage, category, factors
 */
async function calculateChance(studentProfile, college, options = {}) {
  const { preferML = true, preferCDS = true } = options;
  
  try {
    // Try CDS-based chancing first (most accurate)
    if (preferCDS && cdsChancingService.hasCDSData && college.name && await cdsChancingService.hasCDSData(college.name)) {
      logger.info(`Using CDS-based chancing for ${college.name}`);
      return await cdsChancingService.calculateCDSChance(studentProfile, college);
    }
    
    // Try improved chancing service (enhanced algorithm)
    if (preferML && improvedChancingService.calculateEnhancedChance) {
      logger.info(`Using improved chancing for ${college.name}`);
      return await improvedChancingService.calculateEnhancedChance(studentProfile, college);
    }
    
    // Fallback to base calculator
    logger.info(`Using base chancing calculator for ${college.name}`);
    return chancingCalculator.calculateAdmissionChance(studentProfile, college);
    
  } catch (error) {
    logger.error('Error in consolidated chancing:', error);
    
    // Ultimate fallback to base calculator
    return chancingCalculator.calculateAdmissionChance(studentProfile, college);
  }
}

/**
 * Classify college fit (Reach/Target/Safety)
 * 
 * @param {number} userId - User ID
 * @param {number} collegeId - College ID
 * @returns {Object} Fit classification with category and reasoning
 */
async function classifyFit(userId, collegeId) {
  try {
    // Delegate to fit classification service
    return await fitClassificationService.calculateFit(userId, collegeId);
  } catch (error) {
    logger.error('Error in fit classification:', error);
    
    // Fallback: Simple classification based on acceptance rate
    const StudentProfile = require('../models/StudentProfile');
    const College = require('../models/College');
    
    const profile = await StudentProfile.findByUserId(userId);
    const college = await College.findById(collegeId);
    
    const chance = await calculateChance(profile, college);
    
    return {
      category: chance.chance > 70 ? 'safety' : 
                chance.chance > 30 ? 'target' : 'reach',
      fit: chance.chance > 70 ? 'safety' : 
           chance.chance > 30 ? 'target' : 'reach',
      academicFit: chance.chance,
      culturalFit: 50, // Default
      financialFit: 50, // Default
      overall: chance.chance,
      reasoning: [`Based on ${chance.chance}% admission chance`]
    };
  }
}

/**
 * Get college recommendations for a student
 * 
 * @param {Object} studentProfile - Student profile
 * @param {Object} preferences - Search preferences
 * @returns {Array} Recommended colleges with scores
 */
async function getRecommendations(studentProfile, preferences = {}) {
  try {
    // Delegate to smart recommendation service
    return await smartRecommendationService.getSmartRecommendations(studentProfile, preferences);
  } catch (error) {
    logger.error('Error getting recommendations:', error);
    return [];
  }
}

/**
 * Analyze and optimize college list
 * 
 * @param {number} userId - User ID
 * @param {Array} collegeIds - College IDs in list
 * @returns {Object} Analysis with suggestions
 */
async function analyzeCollegeList(userId, collegeIds) {
  try {
    // Delegate to college list optimizer
    return await collegeListOptimizerService.analyzeCollegeList(userId, collegeIds);
  } catch (error) {
    logger.error('Error analyzing college list:', error);
    return {
      balance: 'unknown',
      reachCount: 0,
      targetCount: 0,
      safetyCount: 0,
      suggestions: []
    };
  }
}

/**
 * Suggest additions to improve college list balance
 * 
 * @param {number} userId - User ID
 * @param {Array} currentList - Current college IDs
 * @returns {Array} Suggested colleges to add
 */
async function suggestAdditions(userId, currentList) {
  try {
    // Delegate to college list optimizer
    return await collegeListOptimizerService.suggestAdditions(userId, currentList);
  } catch (error) {
    logger.error('Error suggesting additions:', error);
    return [];
  }
}

/**
 * Batch calculate chances for multiple colleges
 * 
 * @param {Object} studentProfile - Student profile
 * @param {Array} colleges - Array of college objects
 * @returns {Array} Array of chancing results
 */
async function batchCalculate(studentProfile, colleges) {
  const results = [];
  
  for (const college of colleges) {
    try {
      const result = await calculateChance(studentProfile, college);
      results.push({
        collegeId: college.id,
        collegeName: college.name,
        ...result
      });
    } catch (error) {
      logger.error(`Error calculating chance for ${college.name}:`, error);
      results.push({
        collegeId: college.id,
        collegeName: college.name,
        error: error.message,
        chance: null
      });
    }
  }
  
  return results;
}

/**
 * Get chancing for all colleges in student's list
 * 
 * @param {number} userId - User ID
 * @returns {Array} Chancing results for all applications
 */
async function getChancingForStudent(userId) {
  try {
    const Application = require('../models/Application');
    const College = require('../models/College');
    const StudentProfile = require('../models/StudentProfile');
    
    const profile = await StudentProfile.findByUserId(userId);
    const applications = await Application.findByUserId(userId);
    
    const results = [];
    
    for (const app of applications) {
      const college = await College.findById(app.college_id);
      if (college) {
        const chancing = await calculateChance(profile, college);
        results.push({
          applicationId: app.id,
          collegeId: college.id,
          collegeName: college.name,
          ...chancing
        });
      }
    }
    
    return results;
  } catch (error) {
    logger.error('Error getting student chancing:', error);
    return [];
  }
}

// Export consolidated interface
module.exports = {
  // Primary methods
  calculateChance,
  classifyFit,
  getRecommendations,
  analyzeCollegeList,
  suggestAdditions,
  batchCalculate,
  getChancingForStudent,
  
  // Legacy method names for backward compatibility
  calculateAdmissionChance: calculateChance,
  calculateFit: classifyFit,
  getSmartRecommendations: getRecommendations,
  
  // Direct access to underlying services (for migration)
  _services: {
    chancingCalculator,
    improvedChancingService,
    fitClassificationService,
    smartRecommendationService,
    collegeListOptimizerService,
    cdsChancingService
  }
};

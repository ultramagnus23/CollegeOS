// backend/src/services/consolidatedChancingService.js
// Unified chancing service — delegates to the synthetic LDA /predict endpoint.

const axios = require('axios');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/security');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5050';
const ML_TIMEOUT = parseInt(process.env.ML_SERVICE_TIMEOUT || '8000', 10);

/**
 * Classify an admission probability percentage into a fit category.
 */
function classifyChance(probability) {
  if (probability >= 65) return 'safety';
  if (probability >= 30) return 'target';
  return 'reach';
}

/**
 * Call the synthetic LDA /predict endpoint.
 * Returns a normalised result object regardless of whether the call succeeds.
 *
 * @param {Object} studentProfile - Student data (sat_total, gpa_unweighted, etc.)
 * @param {Object} college - College data (name, sat_total_25th/75th, etc.)
 * @returns {Promise<Object>} { chance, category, probability, distance, method, factors }
 */
async function calculateChance(studentProfile, college) {
  try {
    const response = await axios.post(
      `${ML_SERVICE_URL}/predict`,
      { student: studentProfile, college, cds_data: {} },
      { timeout: ML_TIMEOUT }
    );

    const data = response?.data;
    if (data?.success && typeof data.probability === 'number') {
      const probability = Math.round(data.probability);
      return {
        chance: probability,
        category: classifyChance(probability),
        probability,
        distance: data.distance ?? null,
        method: data.method || 'synthetic_lda',
        features_used: data.features_used || [],
        factors: []
      };
    }
  } catch (error) {
    logger.warn('ML /predict call failed; using acceptance-rate fallback', {
      college: sanitizeForLog(college?.name),
      error: sanitizeForLog(error?.message)
    });
  }

  // Acceptance-rate fallback when ML service is unavailable
  const acceptanceRate = college.acceptance_rate ?? 0.5;
  const probability = Math.round(acceptanceRate * 100);
  return {
    chance: probability,
    category: classifyChance(probability),
    probability,
    distance: null,
    method: 'acceptance_rate_fallback',
    features_used: [],
    factors: [{ name: 'Acceptance Rate', impact: `${probability}%`, details: `Based on ${(acceptanceRate * 100).toFixed(1)}% institutional acceptance rate`, positive: true }]
  };
}

/**
 * Classify college fit (Reach/Target/Safety) for a specific user+college pair.
 */
async function classifyFit(userId, collegeId) {
  try {
    const StudentProfile = require('../models/StudentProfile');
    const College = require('../models/College');

    const profile = await StudentProfile.findByUserId(userId);
    const college = await College.findById(collegeId);

    if (!profile || !college) {
      throw new Error('Profile or college not found');
    }

    const result = await calculateChance(profile, college);

    return {
      category: result.category,
      fit: result.category,
      academicFit: result.chance,
      culturalFit: 50,
      financialFit: 50,
      overall: result.chance,
      reasoning: [`Admission probability: ${result.chance}% (${result.method})`]
    };
  } catch (error) {
    logger.error('Error in fit classification:', { error: sanitizeForLog(error?.message) });
    return {
      category: 'target',
      fit: 'target',
      academicFit: 50,
      culturalFit: 50,
      financialFit: 50,
      overall: 50,
      reasoning: ['Fit classification unavailable']
    };
  }
}

/**
 * Get college recommendations using the recommendation engine.
 */
async function getRecommendations(studentProfile, preferences = {}) {
  try {
    const { generateRecommendations } = require('./recommendationEngine');
    const College = require('../models/College');
    const colleges = await College.findAll({ limit: 200 });
    return await generateRecommendations(studentProfile, colleges || []);
  } catch (error) {
    logger.error('Error getting recommendations:', { error: sanitizeForLog(error?.message) });
    return [];
  }
}

/**
 * Analyse college list balance.
 */
async function analyzeCollegeList(userId, collegeIds) {
  try {
    const StudentProfile = require('../models/StudentProfile');
    const College = require('../models/College');

    const profile = await StudentProfile.findByUserId(userId);
    const counts = { reach: 0, target: 0, safety: 0 };

    for (const id of collegeIds) {
      const college = await College.findById(id);
      if (!college) continue;
      const result = await calculateChance(profile, college);
      counts[result.category] = (counts[result.category] || 0) + 1;
    }

    const total = collegeIds.length;
    const suggestions = [];
    if (counts.safety < 2) suggestions.push('Add at least 2 safety schools');
    if (counts.reach < 2) suggestions.push('Consider adding reach schools');
    if (counts.target < 3) suggestions.push('Aim for 3-5 target schools');

    return {
      balance: counts.reach <= counts.safety ? 'balanced' : 'reach-heavy',
      reachCount: counts.reach,
      targetCount: counts.target,
      safetyCount: counts.safety,
      total,
      suggestions
    };
  } catch (error) {
    logger.error('Error analyzing college list:', { error: sanitizeForLog(error?.message) });
    return { balance: 'unknown', reachCount: 0, targetCount: 0, safetyCount: 0, suggestions: [] };
  }
}

/**
 * Suggest colleges to improve list balance.
 */
async function suggestAdditions(userId, currentList) {
  try {
    const StudentProfile = require('../models/StudentProfile');
    const College = require('../models/College');

    const profile = await StudentProfile.findByUserId(userId);
    const analysis = await analyzeCollegeList(userId, currentList);
    const currentSet = new Set(currentList.map(String));

    const candidates = await College.findAll({ limit: 50 });
    const suggestions = [];

    for (const college of (candidates || [])) {
      if (currentSet.has(String(college.id))) continue;
      const result = await calculateChance(profile, college);
      if (analysis.safetyCount < 2 && result.category === 'safety') {
        suggestions.push({ college, reason: 'Improves safety school balance', ...result });
      } else if (analysis.targetCount < 3 && result.category === 'target') {
        suggestions.push({ college, reason: 'Good target school', ...result });
      }
      if (suggestions.length >= 5) break;
    }

    return suggestions;
  } catch (error) {
    logger.error('Error suggesting additions:', { error: sanitizeForLog(error?.message) });
    return [];
  }
}

/**
 * Batch calculate chances for multiple colleges.
 */
async function batchCalculate(studentProfile, colleges) {
  const results = [];
  for (const college of colleges) {
    try {
      const result = await calculateChance(studentProfile, college);
      results.push({ collegeId: college.id, collegeName: college.name, ...result });
    } catch (error) {
      logger.error('Error calculating chance', { college: sanitizeForLog(college?.name), error: sanitizeForLog(error?.message) });
      results.push({ collegeId: college.id, collegeName: college.name, error: 'An internal error occurred', chance: null });
    }
  }
  return results;
}

/**
 * Get chancing for all colleges in a student's application list.
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
        results.push({ applicationId: app.id, collegeId: college.id, collegeName: college.name, ...chancing });
      }
    }

    return results;
  } catch (error) {
    logger.error('Error getting student chancing:', { error: sanitizeForLog(error?.message) });
    return [];
  }
}

module.exports = {
  calculateChance,
  classifyFit,
  getRecommendations,
  analyzeCollegeList,
  suggestAdditions,
  batchCalculate,
  getChancingForStudent,
  // Legacy aliases
  calculateAdmissionChance: calculateChance,
  calculateFit: classifyFit,
  getSmartRecommendations: getRecommendations
};

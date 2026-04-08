// backend/src/services/consolidatedChancingService.js
// Unified chancing service — delegates to the synthetic LDA /predict endpoint.

const axios = require('axios');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/security');

const CHANCING_SERVICE_URL = process.env.CHANCING_SERVICE_URL || 'http://127.0.0.1:8001';
const CHANCING_TIMEOUT = parseInt(process.env.CHANCING_SERVICE_TIMEOUT || '8000', 10);

function normalizeTier(tier) {
  if (!tier) return 'Unknown';
  const normalized = String(tier).trim().toLowerCase();
  if (normalized === 'safety') return 'Safety';
  if (normalized === 'match' || normalized === 'target') return 'Match';
  if (normalized === 'reach') return 'Reach';
  if (normalized === 'long shot' || normalized === 'longshot') return 'Long Shot';
  return 'Unknown';
}

function tierBucket(tier) {
  const normalized = normalizeTier(tier);
  if (normalized === 'Safety') return 'safety';
  if (normalized === 'Match') return 'target';
  if (normalized === 'Reach') return 'reach';
  if (normalized === 'Long Shot') return 'reach';
  return 'unknown';
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function callChancingService(payload, attempt = 1) {
  try {
    const response = await axios.post(
      `${CHANCING_SERVICE_URL}/chance`,
      payload,
      { timeout: CHANCING_TIMEOUT }
    );
    return response?.data;
  } catch (error) {
    if (attempt < 2) {
      await wait(3000);
      return callChancingService(payload, attempt + 1);
    }
    throw error;
  }
}

/**
 * Call the Python chancing service.
 *
 * @param {Object} studentProfile - Student data (sat_total, gpa_unweighted, etc.)
 * @param {Object} college - College data (acceptance_rate, sat_avg, etc.)
 * @returns {Promise<Object>} { tier, confidence, explanation }
 */
async function calculateChance(studentProfile, college) {
  try {
    const payload = {
      gpa: studentProfile?.gpa_unweighted ?? studentProfile?.gpa_weighted ?? studentProfile?.gpa ?? null,
      sat_score: studentProfile?.sat_total ?? studentProfile?.sat_score ?? null,
      act_score: studentProfile?.act_composite ?? studentProfile?.act_score ?? null,
      ap_courses: studentProfile?.num_ap_courses ?? studentProfile?.ap_courses ?? 0,
      extracurriculars: Array.isArray(studentProfile?.activities) ? studentProfile.activities.length : 0,
      college_acceptance_rate: college?.acceptance_rate ?? 0.5,
      college_median_gpa: college?.gpa_50 ?? college?.median_gpa ?? null,
      college_median_sat: college?.sat_avg ?? college?.sat_total_50 ?? college?.median_sat ?? null,
      is_international: true,
      intended_major: studentProfile?.intended_major ?? studentProfile?.preferences?.intended_major ?? null,
    };

    const data = await callChancingService(payload);
    const tier = normalizeTier(data?.tier);
    return {
      tier,
      category: tierBucket(tier),
      confidence: data?.confidence ?? 'Medium',
      explanation: data?.explanation ?? 'Based on your academic profile compared with reported college medians.',
    };
  } catch (error) {
    logger.warn('Chancing service call failed', {
      college: sanitizeForLog(college?.name),
      error: sanitizeForLog(error?.message),
    });
  }

  return {
    tier: 'Unknown',
    category: tierBucket('Unknown'),
    confidence: 'Low',
    explanation: 'Chancing service is warming up — please try again in 30 seconds.',
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
      tier: result.tier,
      confidence: result.confidence,
      explanation: result.explanation,
      academicFit: null,
      culturalFit: null,
      financialFit: null,
      overall: null,
      reasoning: [`Chancing tier: ${result.tier}`],
    };
  } catch (error) {
    logger.error('Error in fit classification:', { error: sanitizeForLog(error?.message) });
    return {
      category: 'target',
      fit: 'target',
      tier: 'Unknown',
      confidence: 'Low',
      explanation: 'Fit classification unavailable',
      academicFit: null,
      culturalFit: null,
      financialFit: null,
      overall: null,
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
      results.push({
        collegeId: college.id,
        collegeName: college.name,
        error: 'An internal error occurred',
        tier: 'Unknown',
        category: 'unknown',
        confidence: 'Low',
        explanation: 'Chancing unavailable at the moment.',
      });
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

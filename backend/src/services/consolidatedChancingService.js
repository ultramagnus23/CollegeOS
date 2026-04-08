// backend/src/services/consolidatedChancingService.js
// Unified chancing service — deterministic sigmoid-based model (no external sidecar).

const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/security');

// ── Sigmoid helper ────────────────────────────────────────────────────────────
function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

// ── Tier/bucket helpers ───────────────────────────────────────────────────────
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

/**
 * Pure-JS deterministic chancing calculation.
 *
 * Algorithm:
 *   1. Compute a z-score from SAT and GPA deltas vs college medians.
 *   2. Pass through sigmoid to get a raw probability (0–1).
 *   3. International penalty applied (–15 pp) because international pools are smaller.
 *   4. Map probability to tier: Safety ≥ 0.65, Match 0.35–0.65, Reach 0.15–0.35, Long Shot < 0.15.
 *
 * @param {Object} studentProfile
 * @param {Object} college
 * @returns {{ tier, category, confidence, explanation, probability }}
 */
async function calculateChance(studentProfile, college) {
  try {
    const studentSAT = studentProfile?.sat_total ?? studentProfile?.sat_score ?? null;
    const studentGPA = studentProfile?.gpa_unweighted ?? studentProfile?.gpa_weighted ?? studentProfile?.gpa ?? null;

    const collegeSAT = college?.sat_avg ?? college?.sat_total_50 ?? college?.median_sat ?? null;
    const collegeGPA = college?.gpa_50 ?? college?.median_gpa ?? null;
    const acceptanceRate = college?.acceptance_rate ?? 0.5; // fraction (0–1)

    let z = 0;
    let factorsUsed = 0;

    if (studentSAT !== null && collegeSAT !== null && collegeSAT > 0) {
      z += (studentSAT - collegeSAT) / 100;
      factorsUsed++;
    }

    if (studentGPA !== null && collegeGPA !== null && collegeGPA > 0) {
      z += (studentGPA - collegeGPA) * 2.5;
      factorsUsed++;
    }

    // If no student/college data for comparison, anchor to college acceptance rate
    let rawProb;
    if (factorsUsed === 0) {
      rawProb = Math.min(acceptanceRate * 0.5, 0.80); // international discount on raw rate
    } else {
      // Anchor sigmoid around the college's own selectivity
      const selectivityBias = Math.log(acceptanceRate / (1 - Math.max(acceptanceRate, 0.01)));
      rawProb = sigmoid(z + selectivityBias);
    }

    // International applicant penalty (–15 percentage points, clamped)
    const probability = Math.max(0.01, Math.min(0.95, rawProb - 0.15));

    let tier;
    if (probability >= 0.65) tier = 'Safety';
    else if (probability >= 0.35) tier = 'Match';
    else if (probability >= 0.15) tier = 'Reach';
    else tier = 'Long Shot';

    const confidence = factorsUsed >= 2 ? 'High' : factorsUsed === 1 ? 'Medium' : 'Low';

    const pct = Math.round(probability * 100);
    const explanation = `Estimated ${pct}% admission probability as an international student. ` +
      (studentSAT && collegeSAT
        ? `Your SAT (${studentSAT}) vs college median (${collegeSAT}). `
        : '') +
      (studentGPA && collegeGPA
        ? `Your GPA (${studentGPA}) vs college median (${collegeGPA}). `
        : '') +
      'International pools are more competitive than domestic averages.';

    return { tier, category: tierBucket(tier), confidence, explanation, probability };
  } catch (error) {
    logger.warn('Chancing calculation failed', {
      college: sanitizeForLog(college?.name),
      error: sanitizeForLog(error?.message),
    });
    return {
      tier: 'Unknown',
      category: 'unknown',
      confidence: 'Low',
      explanation: 'Unable to calculate chancing — please ensure your profile is complete.',
      probability: null,
    };
  }
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
    const applications = await Application.findByUser(userId);
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

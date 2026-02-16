// DEPRECATED: This service is now part of consolidatedChancingService.js (P3 consolidation)
/**
 * improvedChancingService.js
 * 
 * Enhanced college admission chance calculator using Bayesian inference
 * and proper acceptance rate scaling based on CDS data.
 * 
 * Key improvements over previous version:
 * 1. Proper Bayesian approach with acceptance rate as prior
 * 2. Realistic scaling based on selectivity tier
 * 3. Activities properly weighted
 * 4. Maximum achievable chance capped by acceptance rate tier
 * 5. Ensemble scoring combining multiple methods
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Load CDS data
let cdsData = null;
let factorScale = null;

function loadCDSData() {
  if (cdsData) return cdsData;
  
  try {
    const dataPath = path.join(__dirname, '..', '..', 'data', 'cds_data.json');
    const rawData = fs.readFileSync(dataPath, 'utf8');
    const parsed = JSON.parse(rawData);
    cdsData = parsed.cds_data;
    factorScale = parsed.factor_importance_scale;
    logger.info(`ImprovedChancing: Loaded CDS data for ${Object.keys(cdsData).length} colleges`);
    return cdsData;
  } catch (error) {
    logger.warn('Could not load CDS data:', error.message);
    return {};
  }
}

// Factor importance scale
const IMPORTANCE_WEIGHTS = {
  very_important: 1.0,
  important: 0.75,
  considered: 0.5,
  not_considered: 0.0
};

/**
 * Get CDS key from college name with improved matching
 */
function getCDSKey(collegeName) {
  const data = loadCDSData();
  
  if (!collegeName) return null;
  
  const normalizeForKey = (str) => str.toLowerCase()
    .replace(/university of /g, '')
    .replace(/university/g, '')
    .replace(/ college/g, '')
    .replace(/the /g, '')
    .replace(/ at /g, '_')
    .replace(/-/g, '_')
    .replace(/ /g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .trim();
  
  const normalizedInput = normalizeForKey(collegeName);
  const inputLower = collegeName.toLowerCase();
  
  // Direct key match
  if (data[normalizedInput]) return normalizedInput;
  
  // Exact college_name match first (highest priority)
  for (const key of Object.keys(data)) {
    if (data[key].college_name.toLowerCase() === inputLower) {
      return key;
    }
  }
  
  // Check for key matches
  for (const key of Object.keys(data)) {
    const cdsName = normalizeForKey(data[key].college_name);
    if (cdsName === normalizedInput || key === normalizedInput) return key;
  }
  
  // Only do partial matching if input is long enough (avoid false positives)
  // and prefer longer matches
  if (normalizedInput.length >= 8) {
    let bestMatch = null;
    let bestMatchLength = 0;
    
    for (const key of Object.keys(data)) {
      const cdsName = normalizeForKey(data[key].college_name);
      
      // Check if key contains normalized or vice versa
      if (key === normalizedInput || cdsName === normalizedInput) {
        return key; // Exact match takes priority
      }
      
      // For partial matches, prefer the one with more overlap
      if (cdsName.includes(normalizedInput) && normalizedInput.length > bestMatchLength) {
        bestMatch = key;
        bestMatchLength = normalizedInput.length;
      } else if (normalizedInput.includes(cdsName) && cdsName.length > bestMatchLength) {
        bestMatch = key;
        bestMatchLength = cdsName.length;
      }
    }
    
    if (bestMatch) return bestMatch;
  }
  
  return null;
}

/**
 * Calculate percentile position within admitted student range
 * Returns 0-100 scale where 50 = median of admitted students
 */
function calculatePercentilePosition(studentValue, p25, p75, min = null, max = null) {
  if (!studentValue || !p25 || !p75) return 50;
  
  const range = p75 - p25;
  const median = (p75 + p25) / 2;
  
  if (studentValue >= p75) {
    // Above 75th percentile of admitted students
    const maxPossible = max || p75 + range;
    const extraRange = maxPossible - p75;
    const extraPosition = Math.min(1, (studentValue - p75) / extraRange);
    return 75 + (extraPosition * 25);
  } else if (studentValue >= median) {
    // Between median and 75th percentile
    return 50 + ((studentValue - median) / (p75 - median)) * 25;
  } else if (studentValue >= p25) {
    // Between 25th and median
    return 25 + ((studentValue - p25) / (median - p25)) * 25;
  } else {
    // Below 25th percentile
    const minPossible = min || p25 - range;
    const belowRange = p25 - minPossible;
    const belowPosition = Math.max(0, 1 - (p25 - studentValue) / belowRange);
    return belowPosition * 25;
  }
}

/**
 * Get the maximum achievable chance based on acceptance rate tier
 * 
 * Key insight: Even with perfect stats, you can't have 95% chance at Harvard
 * because so many perfect candidates apply. However, a truly exceptional
 * candidate (perfect GPA, perfect SAT, national achievements) should have
 * meaningfully better odds than the base rate.
 * 
 * BALANCED CAPS - Based on realistic admissions outcomes:
 * - At 3% schools (Harvard), perfect stats + major spike = ~12-15% real chance
 * - A perfect profile should feel "meaningfully better" than average
 * - Middle schools are kept at realistic levels
 */
function getMaxChanceByTier(acceptanceRate) {
  if (acceptanceRate <= 0.05) {
    // Ultra-selective (≤5%): Harvard, Stanford, MIT
    // Perfect profile: ~12-15% (about 4x base rate)
    // Research shows recruited athletes/legacies at ~20-30%, but regular perfect = ~12-15%
    return 15;
  } else if (acceptanceRate <= 0.10) {
    // Highly selective (5-10%): Yale, Princeton, Duke  
    // Perfect profile: ~20-28% (about 3-4x base rate)
    return 28;
  } else if (acceptanceRate <= 0.15) {
    // Very selective (10-15%): Northwestern, Vanderbilt
    // Max achievable: ~35-42%
    return 42;
  } else if (acceptanceRate <= 0.25) {
    // Selective (15-25%): UCLA, Berkeley, USC
    // Max achievable: ~50-58%
    return 58;
  } else if (acceptanceRate <= 0.40) {
    // Moderately selective (25-40%): Boston U, Northeastern
    // Max achievable: ~68-75%
    return 75;
  } else if (acceptanceRate <= 0.60) {
    // Less selective (40-60%): Many state schools
    // Max achievable: ~82%
    return 82;
  } else {
    // Least selective (>60%)
    // Max achievable: ~92%
    return 92;
  }
}

/**
 * Get the minimum floor chance based on acceptance rate tier
 * Even a weak candidate has some chance at high acceptance rate schools
 */
function getMinChanceByTier(acceptanceRate) {
  if (acceptanceRate <= 0.10) return 1;
  if (acceptanceRate <= 0.25) return 3;
  if (acceptanceRate <= 0.50) return 8;
  return 15;
}

/**
 * Calculate activity score with proper weighting
 * International/national achievements should make a BIG difference at selective schools
 */
function calculateActivityScore(activities, cdsNonacademicFactors) {
  if (!activities || activities.length === 0) {
    return { score: 20, details: 'No activities reported' };
  }
  
  // Count activities by tier in a single pass for performance
  const tierCounts = activities.reduce((acc, a) => {
    const tier = a.tier_rating || a.tier;
    if (tier === 1 || tier === 'tier1') acc.tier1++;
    else if (tier === 2 || tier === 'tier2') acc.tier2++;
    else if (tier === 3 || tier === 'tier3') acc.tier3++;
    else if (tier === 4 || tier === 'tier4') acc.tier4++;
    return acc;
  }, { tier1: 0, tier2: 0, tier3: 0, tier4: 0 });
  
  const { tier1, tier2, tier3, tier4 } = tierCounts;
  
  // Calculate weighted score
  // Tier 1 (National/International): Major impact
  // Tier 2 (State/Regional): Moderate impact
  // Tier 3 (School leadership): Minor impact
  // Tier 4 (Club membership): Minimal impact
  
  let score = 15; // Base score (lowered from 20)
  
  // BALANCED activity scoring - activities SHOULD meaningfully differentiate
  // Tier 1 activities (national/international) make a real difference
  // 3 tier 1 activities = exceptional candidate, should get strong boost
  if (tier1 >= 4) {
    score = 95; // Truly exceptional - USAMO winner + RSI + IMO level
  } else if (tier1 >= 3) {
    score = 88; // Outstanding - multiple national/international achievements
  } else if (tier1 >= 2) {
    score = 80; // Very strong - 2 national/international
  } else if (tier1 >= 1) {
    score = 70 + Math.min(10, tier2 * 3); // Strong + boost from tier 2
  } else if (tier2 >= 4) {
    score = 65; // Very strong regional presence
  } else if (tier2 >= 2) {
    score = 55 + Math.min(10, tier3 * 2); // Good regional
  } else if (tier2 >= 1) {
    score = 45 + Math.min(12, tier3 * 3); // Some regional
  } else if (tier3 >= 5) {
    score = 42; // Strong school involvement
  } else if (tier3 >= 3) {
    score = 35 + Math.min(8, tier4 * 2); // Good school involvement
  } else if (tier3 >= 1) {
    score = 28 + Math.min(10, tier4 * 2); // Some school involvement
  } else if (tier4 >= 3) {
    score = 25; // Basic participation
  } else {
    score = 18 + Math.min(7, tier4 * 2); // Minimal involvement
  }
  
  // Cap at 100
  score = Math.min(100, score);
  
  // Get importance weight from CDS
  const ecImportance = cdsNonacademicFactors?.extracurricular_activities || 'important';
  const talentImportance = cdsNonacademicFactors?.talent_ability || 'important';
  
  // Combine importance weights
  const avgImportance = (IMPORTANCE_WEIGHTS[ecImportance] + IMPORTANCE_WEIGHTS[talentImportance]) / 2;
  
  return {
    score,
    importance: avgImportance,
    tier1Count: tier1,
    tier2Count: tier2,
    tier3Count: tier3,
    tier4Count: tier4,
    details: `${tier1} national/international, ${tier2} state/regional, ${tier3} school-level`
  };
}

/**
 * Calculate academic score based on GPA and test scores
 */
function calculateAcademicScore(studentProfile, cds) {
  let totalScore = 0;
  let totalWeight = 0;
  const components = [];
  
  // 1. GPA Analysis
  const studentGPA = studentProfile.gpa_unweighted || studentProfile.gpa_weighted || studentProfile.gpa;
  if (studentGPA && cds.gpa_data?.average_gpa) {
    const avgGPA = cds.gpa_data.average_gpa;
    
    // More nuanced GPA scoring
    let gpaPercentile;
    if (studentGPA >= 4.0) {
      gpaPercentile = 95;
    } else if (studentGPA >= avgGPA + 0.1) {
      gpaPercentile = 70 + Math.min(25, (studentGPA - avgGPA) * 100);
    } else if (studentGPA >= avgGPA - 0.1) {
      gpaPercentile = 50 + ((studentGPA - (avgGPA - 0.1)) / 0.2) * 20;
    } else if (studentGPA >= avgGPA - 0.3) {
      gpaPercentile = 30 + ((studentGPA - (avgGPA - 0.3)) / 0.2) * 20;
    } else {
      gpaPercentile = Math.max(5, 30 - (avgGPA - studentGPA - 0.3) * 50);
    }
    
    const gpaWeight = IMPORTANCE_WEIGHTS[cds.academic_factors?.academic_gpa || 'very_important'];
    totalScore += gpaPercentile * gpaWeight;
    totalWeight += gpaWeight;
    
    components.push({
      name: 'GPA',
      score: Math.round(gpaPercentile),
      weight: gpaWeight,
      value: studentGPA,
      comparison: avgGPA
    });
  }
  
  // 2. SAT Analysis
  if (studentProfile.sat_total && cds.test_scores?.sat_25th && cds.test_scores?.sat_75th) {
    const satPercentile = calculatePercentilePosition(
      studentProfile.sat_total,
      cds.test_scores.sat_25th,
      cds.test_scores.sat_75th,
      1000,
      1600
    );
    
    const satWeight = IMPORTANCE_WEIGHTS[cds.academic_factors?.standardized_test_scores || 'important'];
    totalScore += satPercentile * satWeight;
    totalWeight += satWeight;
    
    components.push({
      name: 'SAT',
      score: Math.round(satPercentile),
      weight: satWeight,
      value: studentProfile.sat_total,
      comparison: `${cds.test_scores.sat_25th}-${cds.test_scores.sat_75th}`
    });
  }
  
  // 3. ACT Analysis (only if no SAT)
  if (!studentProfile.sat_total && studentProfile.act_composite && cds.test_scores?.act_25th) {
    const actPercentile = calculatePercentilePosition(
      studentProfile.act_composite,
      cds.test_scores.act_25th,
      cds.test_scores.act_75th,
      1,
      36
    );
    
    const actWeight = IMPORTANCE_WEIGHTS[cds.academic_factors?.standardized_test_scores || 'important'];
    totalScore += actPercentile * actWeight;
    totalWeight += actWeight;
    
    components.push({
      name: 'ACT',
      score: Math.round(actPercentile),
      weight: actWeight,
      value: studentProfile.act_composite,
      comparison: `${cds.test_scores.act_25th}-${cds.test_scores.act_75th}`
    });
  }
  
  // 4. Course Rigor
  const coursework = studentProfile.coursework || studentProfile.courses;
  let apIbCount;
  
  if (Array.isArray(coursework) && coursework.length > 0) {
    // If we have detailed coursework, count AP/IB courses
    apIbCount = coursework.filter(c => 
      c.course_level === 'AP' || c.course_level === 'IB' || c.course_level === 'Dual Enrollment' ||
      c.level === 'AP' || c.level === 'IB'
    ).length;
  } else {
    // Fall back to simple count if provided
    apIbCount = studentProfile.ap_courses || studentProfile.ap_count || 0;
  }
  
  let rigorPercentile;
  if (apIbCount >= 12) rigorPercentile = 95;
  else if (apIbCount >= 10) rigorPercentile = 88;
  else if (apIbCount >= 8) rigorPercentile = 80;
  else if (apIbCount >= 6) rigorPercentile = 70;
  else if (apIbCount >= 4) rigorPercentile = 55;
  else if (apIbCount >= 2) rigorPercentile = 40;
  else rigorPercentile = 25;
  
  const rigorWeight = IMPORTANCE_WEIGHTS[cds.academic_factors?.rigor_of_secondary_school || 'very_important'];
  totalScore += rigorPercentile * rigorWeight;
  totalWeight += rigorWeight;
  
  components.push({
    name: 'Course Rigor',
    score: Math.round(rigorPercentile),
    weight: rigorWeight,
    value: apIbCount,
    details: `${apIbCount} AP/IB courses`
  });
  
  const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 50;
  
  return {
    score: normalizedScore,
    components
  };
}

/**
 * Bayesian probability calculation
 * 
 * Uses acceptance rate as prior and student profile quality to calculate posterior
 * 
 * BALANCED APPROACH:
 * - Quality score 0-100 where:
 *   - 0-40: Below average applicant
 *   - 40-55: Average applicant (around base acceptance rate)
 *   - 55-70: Good candidate (above base rate)
 *   - 70-85: Strong candidate (approaching max)
 *   - 85-100: Excellent candidate (near tier maximum)
 * - Perfect profiles (quality 90+) should approach the tier maximum
 * - Uses a hybrid linear-Bayesian approach for better differentiation
 */
function bayesianChanceCalculation(qualityScore, acceptanceRate) {
  // Determine tier and max chance
  let maxChance, minMultiplier;
  
  if (acceptanceRate <= 0.05) {
    // Ultra-selective: max 15%, but a 90+ quality should get ~12%
    maxChance = 15;
    minMultiplier = 0.3; // Minimum multiplier of base rate
  } else if (acceptanceRate <= 0.10) {
    // Highly selective: max 28%
    maxChance = 28;
    minMultiplier = 0.4;
  } else if (acceptanceRate <= 0.20) {
    // Very selective: max 42%
    maxChance = 42;
    minMultiplier = 0.5;
  } else if (acceptanceRate <= 0.40) {
    // Selective: max 75%
    maxChance = 75;
    minMultiplier = 0.6;
  } else {
    // Less selective: max 92%
    maxChance = 92;
    minMultiplier = 0.7;
  }
  
  // Hybrid approach with smooth interpolation:
  // Quality < 40:  Below base rate (weak candidates)
  // Quality 40-55: Around base rate (average applicants)
  // Quality 55-70: 0-35% toward max (good candidates)
  // Quality 70-85: 35-70% toward max (strong candidates)
  // Quality 85+:   70-95% toward max (excellent candidates)
  
  const baseRate = acceptanceRate * 100;
  const minChance = baseRate * minMultiplier;
  
  // Ensure startBelow doesn't go below minChance
  const startBelow = Math.max(minChance, baseRate * 0.7);
  
  let probability;
  
  if (qualityScore < 40) {
    // Below average: between minChance and 70% of base rate
    const t = qualityScore / 40;
    probability = minChance + (startBelow - minChance) * t;
  } else if (qualityScore < 55) {
    // Average: around base rate (70% to 100% of base rate)
    const t = (qualityScore - 40) / 15;
    probability = startBelow + (baseRate - startBelow) * t;
  } else if (qualityScore < 70) {
    // Good: above base rate, approaching 35% toward max
    const t = (qualityScore - 55) / 15;
    const targetAtGood = baseRate + (maxChance - baseRate) * 0.35;
    probability = baseRate + (targetAtGood - baseRate) * t;
  } else if (qualityScore < 85) {
    // Strong: between 35% and 70% toward max
    const t = (qualityScore - 70) / 15;
    const startPoint = baseRate + (maxChance - baseRate) * 0.35;
    const targetAtStrong = baseRate + (maxChance - baseRate) * 0.70;
    probability = startPoint + (targetAtStrong - startPoint) * t;
  } else {
    // Excellent (85+): approach max (70% to 95% of max)
    const t = Math.min(1, (qualityScore - 85) / 15);
    const startPoint = baseRate + (maxChance - baseRate) * 0.70;
    const finalTarget = maxChance * 0.95;
    probability = startPoint + (finalTarget - startPoint) * t;
  }
  
  // Ensure within bounds
  probability = Math.max(minChance, Math.min(maxChance, probability));
  
  return probability;
}

/**
 * Main enhanced chancing calculation
 */
function calculateEnhancedChance(studentProfile, college) {
  const collegeName = college.name || college.college_name;
  const cdsKey = getCDSKey(collegeName);
  
  // If no CDS data available, return null to trigger fallback
  if (!cdsKey) {
    logger.debug(`No CDS data for: ${collegeName}`);
    return null;
  }
  
  const data = loadCDSData();
  const cds = data[cdsKey];
  
  if (!cds) return null;
  
  const acceptanceRate = cds.acceptance_rate || 0.5;
  const factors = [];
  const improvements = [];
  
  // ==========================================
  // CALCULATE COMPONENT SCORES
  // ==========================================
  
  // 1. Academic Score (40% weight for holistic schools, higher for others)
  const academicResult = calculateAcademicScore(studentProfile, cds);
  const academicWeight = cds.weights?.academic || 0.40;
  
  factors.push({
    name: 'Academics',
    category: 'academic',
    score: Math.round(academicResult.score),
    weight: academicWeight,
    impact: academicResult.score >= 60 ? 'positive' : academicResult.score >= 40 ? 'neutral' : 'negative',
    components: academicResult.components,
    details: `Academic profile strength: ${Math.round(academicResult.score)}/100`
  });
  
  // 2. Activity Score (25-30% weight at selective schools)
  const activityResult = calculateActivityScore(studentProfile.activities, cds.nonacademic_factors);
  const activityWeight = cds.weights?.extracurricular || 0.25;
  
  factors.push({
    name: 'Extracurriculars',
    category: 'extracurricular',
    score: Math.round(activityResult.score),
    weight: activityWeight,
    impact: activityResult.score >= 70 ? 'positive' : activityResult.score >= 40 ? 'neutral' : 'negative',
    tier1Count: activityResult.tier1Count,
    tier2Count: activityResult.tier2Count,
    tier3Count: activityResult.tier3Count,
    details: activityResult.details
  });
  
  // Add improvement suggestion for activities
  if (activityResult.score < 70 && activityResult.tier1Count < 2) {
    improvements.push({
      area: 'Extracurriculars',
      impact: 'High',
      suggestion: activityResult.tier1Count === 0 
        ? 'Pursue national/international level achievements (competitions, research, publications)'
        : 'Continue building on your national-level achievements'
    });
  }
  
  // 3. Essays Score (estimated - using placeholder)
  // Default to 50 (average) - don't inflate with assumptions
  const essayScore = studentProfile.essay_quality || 50; // Neutral default, not inflated
  const essayWeight = cds.weights?.essays || 0.15;
  
  factors.push({
    name: 'Essays',
    category: 'essays',
    score: essayScore,
    weight: essayWeight,
    impact: essayScore >= 70 ? 'positive' : 'neutral',
    details: 'Essay strength (self-assessed or default)'
  });
  
  // 4. Recommendations Score (estimated)
  // Default to 50 (average) - don't inflate with assumptions  
  const recScore = studentProfile.recommendation_quality || 50; // Neutral default
  const recWeight = cds.weights?.recommendations || 0.10;
  
  factors.push({
    name: 'Recommendations',
    category: 'recommendations',
    score: recScore,
    weight: recWeight,
    impact: recScore >= 70 ? 'positive' : 'neutral',
    details: 'Recommendation strength (estimated)'
  });
  
  // 5. Demographic Hooks
  const demoWeight = cds.weights?.demographics || 0.10;
  let demoScore = 50; // Baseline
  const hooks = [];
  
  // CONSERVATIVE hook scoring - hooks help but don't dramatically change odds
  if (studentProfile.is_first_generation) {
    const fgImportance = IMPORTANCE_WEIGHTS[cds.nonacademic_factors?.first_generation || 'considered'];
    demoScore += 8 * fgImportance; // Reduced from 15
    hooks.push('First-generation');
  }
  
  if (studentProfile.is_legacy) {
    const legacyImportance = IMPORTANCE_WEIGHTS[cds.nonacademic_factors?.alumni_relation || 'considered'];
    demoScore += 12 * legacyImportance; // Reduced from 20
    hooks.push('Legacy');
  }
  
  if (studentProfile.is_urm) {
    const urmImportance = IMPORTANCE_WEIGHTS[cds.nonacademic_factors?.racial_ethnic_status || 'considered'];
    demoScore += 6 * urmImportance; // Reduced from 10
    hooks.push('URM status');
  }
  
  demoScore = Math.min(100, demoScore);
  
  factors.push({
    name: 'Demographics',
    category: 'demographics',
    score: demoScore,
    weight: demoWeight,
    impact: hooks.length > 0 ? 'positive' : 'neutral',
    hooks,
    details: hooks.length > 0 ? `Hooks: ${hooks.join(', ')}` : 'No special hooks'
  });
  
  // ==========================================
  // CALCULATE WEIGHTED QUALITY SCORE
  // ==========================================
  
  let totalWeightedScore = 0;
  let totalWeight = 0;
  
  for (const factor of factors) {
    totalWeightedScore += factor.score * factor.weight;
    totalWeight += factor.weight;
  }
  
  const qualityScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 50;
  
  // ==========================================
  // BAYESIAN PROBABILITY CALCULATION
  // ==========================================
  
  let probability = bayesianChanceCalculation(qualityScore, acceptanceRate);
  
  // Apply tier-based bounds
  const maxChance = getMaxChanceByTier(acceptanceRate);
  const minChance = getMinChanceByTier(acceptanceRate);
  
  probability = Math.max(minChance, Math.min(maxChance, probability));
  
  // ==========================================
  // CATEGORIZATION
  // ==========================================
  
  let category;
  if (probability >= 65) {
    category = 'safety';
  } else if (probability >= 30) {
    category = 'target';
  } else if (probability >= 15) {
    category = 'reach';
  } else {
    category = 'far_reach';
  }
  
  // ==========================================
  // CONFIDENCE CALCULATION
  // ==========================================
  
  let dataCompleteness = 0;
  const possibleFields = 6;
  
  if (studentProfile.sat_total || studentProfile.act_composite) dataCompleteness++;
  if (studentProfile.gpa_unweighted || studentProfile.gpa_weighted || studentProfile.gpa) dataCompleteness++;
  if (studentProfile.activities?.length > 0) dataCompleteness++;
  if (studentProfile.coursework?.length > 0 || studentProfile.ap_courses) dataCompleteness++;
  if (studentProfile.essay_quality) dataCompleteness++;
  if (studentProfile.recommendation_quality) dataCompleteness++;
  
  const confidence = dataCompleteness / possibleFields;
  
  return {
    percentage: Math.round(probability),
    category,
    qualityScore: Math.round(qualityScore),
    confidence,
    confidenceLevel: confidence >= 0.7 ? 'high' : confidence >= 0.4 ? 'medium' : 'low',
    factors: factors.sort((a, b) => b.weight - a.weight),
    cdsBasedCalculation: true,
    cdsYear: cds.year,
    collegeName: cds.college_name,
    collegeAcceptanceRate: (acceptanceRate * 100).toFixed(1) + '%',
    maxAchievableChance: maxChance,
    improvements: improvements.slice(0, 3),
    methodology: 'Bayesian inference with CDS data',
    strengthAreas: factors.filter(f => f.impact === 'positive').map(f => f.name),
    improvementAreas: factors.filter(f => f.impact === 'negative').map(f => f.name)
  };
}

/**
 * Check if CDS data is available for a college
 */
function hasCDSData(collegeName) {
  return getCDSKey(collegeName) !== null;
}

/**
 * Get list of colleges with CDS data
 */
function getCollegesWithCDS() {
  const data = loadCDSData();
  return Object.values(data).map(c => ({
    name: c.college_name,
    acceptanceRate: c.acceptance_rate,
    year: c.year
  }));
}

/**
 * Get CDS data summary
 */
function getCDSSummary() {
  const data = loadCDSData();
  const colleges = Object.values(data);
  
  return {
    totalColleges: colleges.length,
    dataYear: colleges[0]?.year || 'Unknown',
    acceptanceRateRange: {
      min: Math.min(...colleges.map(c => c.acceptance_rate)),
      max: Math.max(...colleges.map(c => c.acceptance_rate))
    },
    colleges: colleges.map(c => c.college_name).sort()
  };
}

module.exports = {
  calculateEnhancedChance,
  hasCDSData,
  getCollegesWithCDS,
  getCDSKey,
  loadCDSData,
  getCDSSummary,
  getMaxChanceByTier,
  bayesianChanceCalculation
};

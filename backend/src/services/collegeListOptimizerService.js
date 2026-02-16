// DEPRECATED: This service is now part of consolidatedChancingService.js (P3 consolidation)
/**
 * collegeListOptimizerService.js
 * 
 * Portfolio optimization for college application lists.
 * Implements Monte Carlo simulation, strategic analysis, and recommendations.
 * 
 * Features:
 * 1. Reach/Match/Safety distribution analysis
 * 2. Probability of at least one acceptance
 * 3. Expected number of acceptances
 * 4. Redundancy detection
 * 5. Gap analysis and recommendations
 * 6. Monte Carlo outcome simulation
 */

const logger = require('../utils/logger');
const { calculateEnhancedChance } = require('./improvedChancingService');

/**
 * Helper function to calculate chance
 * Falls back to rule-based calculation when CDS data isn't available
 */
function calculateChance(profile, college) {
  // Try CDS-based calculation first
  const cdsResult = calculateEnhancedChance(profile, college);
  
  if (cdsResult) {
    return {
      chance: cdsResult.percentage,
      category: cdsResult.category,
      cdsAvailable: true
    };
  }
  
  // Fallback: Rule-based calculation for non-CDS colleges
  const acceptanceRate = college.acceptance_rate || 50;
  const baseChance = acceptanceRate;
  
  // Calculate profile strength modifier
  let modifier = 1.0;
  
  // GPA modifier
  const gpa = profile.gpa_weighted || profile.gpa_unweighted || profile.gpa || 3.0;
  if (gpa >= 3.9) modifier += 0.15;
  else if (gpa >= 3.7) modifier += 0.10;
  else if (gpa >= 3.5) modifier += 0.05;
  else if (gpa < 3.0) modifier -= 0.15;
  else if (gpa < 3.3) modifier -= 0.05;
  
  // Test score modifier
  const sat = profile.sat_total || 0;
  const act = profile.act_composite || 0;
  
  if (sat >= 1500 || act >= 34) modifier += 0.15;
  else if (sat >= 1400 || act >= 31) modifier += 0.10;
  else if (sat >= 1300 || act >= 28) modifier += 0.05;
  else if (sat > 0 && sat < 1100) modifier -= 0.10;
  
  // Activity modifier
  const activities = profile.activities || [];
  const tier1Count = activities.filter(a => a.tier_rating === 1).length;
  const tier2Count = activities.filter(a => a.tier_rating === 2).length;
  
  if (tier1Count >= 2) modifier += 0.10;
  else if (tier1Count >= 1) modifier += 0.05;
  if (tier2Count >= 3) modifier += 0.05;
  
  // Calculate final chance
  let chance = baseChance * modifier;
  
  // Apply tier-based caps
  if (acceptanceRate <= 5) chance = Math.min(chance, 15);
  else if (acceptanceRate <= 10) chance = Math.min(chance, 28);
  else if (acceptanceRate <= 20) chance = Math.min(chance, 45);
  else if (acceptanceRate <= 40) chance = Math.min(chance, 75);
  else chance = Math.min(chance, 92);
  
  // Ensure reasonable bounds
  chance = Math.max(1, Math.min(92, chance));
  
  // Categorize
  let category;
  if (chance >= 65) category = 'safety';
  else if (chance >= 35) category = 'target';
  else if (chance >= 15) category = 'reach';
  else category = 'far_reach';
  
  return {
    chance: Math.round(chance),
    category,
    cdsAvailable: false
  };
}

// Ideal distribution targets
const IDEAL_DISTRIBUTION = {
  reach: { min: 2, max: 4, ideal: 3 },
  target: { min: 3, max: 5, ideal: 4 },
  safety: { min: 2, max: 3, ideal: 2 }
};

// Acceptance rate thresholds for categorization
const CATEGORY_THRESHOLDS = {
  far_reach: 10,    // < 10% chance
  reach: 25,        // 10-25% chance
  target: 50,       // 25-50% chance
  likely: 75,       // 50-75% chance
  safety: 100       // > 75% chance
};

/**
 * Categorize a college based on admission chance
 */
function categorizeChance(chance) {
  if (chance < CATEGORY_THRESHOLDS.far_reach) return 'far_reach';
  if (chance < CATEGORY_THRESHOLDS.reach) return 'reach';
  if (chance < CATEGORY_THRESHOLDS.target) return 'target';
  if (chance < CATEGORY_THRESHOLDS.likely) return 'likely';
  return 'safety';
}

/**
 * Calculate probability of at least one acceptance using inclusion-exclusion
 * For independent events: P(at least one) = 1 - P(none) = 1 - Π(1-p_i)
 */
function calculateAtLeastOneAcceptance(chances) {
  if (chances.length === 0) return 0;
  
  // Probability of rejection from all
  const probAllRejected = chances.reduce((prod, chance) => {
    return prod * (1 - chance / 100);
  }, 1);
  
  return Math.round((1 - probAllRejected) * 100 * 10) / 10;
}

/**
 * Calculate expected number of acceptances
 */
function calculateExpectedAcceptances(chances) {
  return chances.reduce((sum, chance) => sum + chance / 100, 0);
}

/**
 * Calculate variance of acceptances
 */
function calculateAcceptanceVariance(chances) {
  // Variance of sum of independent Bernoulli = sum of variances
  return chances.reduce((sum, chance) => {
    const p = chance / 100;
    return sum + p * (1 - p);
  }, 0);
}

/**
 * Run Monte Carlo simulation for admission outcomes
 * @param {Array} collegeChances - Array of {college, chance} objects
 * @param {number} iterations - Number of simulation runs
 * @returns {Object} Simulation results
 */
function runMonteCarloSimulation(collegeChances, iterations = 10000) {
  const outcomes = {
    acceptedCounts: new Array(collegeChances.length + 1).fill(0),
    atLeastOne: 0,
    allRejected: 0,
    topSchoolAccepted: 0,
    onlySafeties: 0,
    scenarios: []
  };
  
  // Sort by chance ascending (lower chance = more selective = harder to get in)
  const collegesBySelectivity = [...collegeChances].sort((a, b) => a.chance - b.chance);
  
  // Identify top schools (far_reach and reach - hardest to get into)
  const topSchoolIndices = collegesBySelectivity
    .map((c, i) => ({ ...c, originalIndex: i }))
    .filter(c => c.chance < 25)
    .map(c => c.originalIndex);
  
  // Identify safety schools (easiest to get into)
  const safetyIndices = collegesBySelectivity
    .map((c, i) => ({ ...c, originalIndex: i }))
    .filter(c => c.chance >= 75)
    .map(c => c.originalIndex);
  
  for (let i = 0; i < iterations; i++) {
    let acceptedCount = 0;
    let topAccepted = false;
    const acceptedIndices = [];
    
    // Simulate each college
    collegesBySelectivity.forEach((college, idx) => {
      const random = Math.random() * 100;
      if (random < college.chance) {
        acceptedCount++;
        acceptedIndices.push(idx);
        if (topSchoolIndices.includes(idx)) topAccepted = true;
      }
    });
    
    outcomes.acceptedCounts[acceptedCount]++;
    
    if (acceptedCount >= 1) outcomes.atLeastOne++;
    if (acceptedCount === 0) outcomes.allRejected++;
    if (topAccepted) outcomes.topSchoolAccepted++;
    
    // Check if only safeties accepted
    if (acceptedCount > 0 && 
        acceptedIndices.every(idx => safetyIndices.includes(idx))) {
      outcomes.onlySafeties++;
    }
  }
  
  // Calculate percentages
  const results = {
    atLeastOneAcceptance: Math.round((outcomes.atLeastOne / iterations) * 100 * 10) / 10,
    allRejected: Math.round((outcomes.allRejected / iterations) * 100 * 10) / 10,
    topSchoolAccepted: Math.round((outcomes.topSchoolAccepted / iterations) * 100 * 10) / 10,
    onlySafeties: Math.round((outcomes.onlySafeties / iterations) * 100 * 10) / 10,
    acceptanceDistribution: outcomes.acceptedCounts.map((count, numAccepted) => ({
      acceptances: numAccepted,
      probability: Math.round((count / iterations) * 100 * 10) / 10
    })),
    expectedAcceptances: calculateExpectedAcceptances(collegeChances.map(c => c.chance)),
    iterations
  };
  
  // Calculate confidence interval for expected acceptances
  const variance = calculateAcceptanceVariance(collegeChances.map(c => c.chance));
  const stdDev = Math.sqrt(variance);
  results.acceptanceInterval = {
    lower: Math.max(0, Math.round((results.expectedAcceptances - 1.96 * stdDev) * 10) / 10),
    upper: Math.round((results.expectedAcceptances + 1.96 * stdDev) * 10) / 10
  };
  
  return results;
}

/**
 * Detect redundant colleges in the list
 * Colleges that don't add strategic value
 */
function detectRedundancy(collegeChances) {
  const redundancies = [];
  
  // Group by category
  const byCategory = {};
  collegeChances.forEach(cc => {
    const category = categorizeChance(cc.chance);
    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push(cc);
  });
  
  // Check for too many in same category
  Object.entries(byCategory).forEach(([category, colleges]) => {
    if (category === 'far_reach' && colleges.length > 4) {
      redundancies.push({
        type: 'too_many_far_reach',
        message: `You have ${colleges.length} far-reach schools. Consider dropping ${colleges.length - 3} to save application fees.`,
        colleges: colleges.slice(3).map(c => c.college?.name || 'Unknown'),
        severity: 'medium'
      });
    }
    
    if (category === 'safety' && colleges.length > 3) {
      redundancies.push({
        type: 'too_many_safeties',
        message: `You have ${colleges.length} safety schools. 2-3 is usually sufficient.`,
        colleges: colleges.slice(3).map(c => c.college?.name || 'Unknown'),
        severity: 'low'
      });
    }
  });
  
  // Check for similar colleges (same acceptance rate range)
  const sorted = [...collegeChances].sort((a, b) => a.chance - b.chance);
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    
    // If two colleges have very similar chances
    if (Math.abs(current.chance - next.chance) < 3) {
      // Could be redundant unless they serve different purposes
      // (e.g., different locations, different programs)
    }
  }
  
  return redundancies;
}

/**
 * Identify gaps in the college list
 */
function identifyGaps(distribution) {
  const gaps = [];
  
  // Check reach schools
  const reachCount = (distribution.far_reach || 0) + (distribution.reach || 0);
  const maxReachRecommended = IDEAL_DISTRIBUTION.reach.max + 2;
  if (reachCount < IDEAL_DISTRIBUTION.reach.min) {
    gaps.push({
      type: 'insufficient_reach',
      message: `Consider adding ${IDEAL_DISTRIBUTION.reach.min - reachCount} more reach school(s) to aim high.`,
      severity: 'low'
    });
  } else if (reachCount > maxReachRecommended) {
    gaps.push({
      type: 'too_many_reach',
      message: `You have ${reachCount} reach schools (recommended max: ${maxReachRecommended}). This may lead to more rejections than necessary.`,
      severity: 'medium'
    });
  }
  
  // Check target schools
  const targetCount = (distribution.target || 0) + (distribution.likely || 0);
  if (targetCount < IDEAL_DISTRIBUTION.target.min) {
    gaps.push({
      type: 'insufficient_target',
      message: `Add ${IDEAL_DISTRIBUTION.target.min - targetCount} more target/match school(s). These are your most likely acceptances.`,
      severity: 'high'
    });
  }
  
  // Check safety schools
  const safetyCount = distribution.safety || 0;
  if (safetyCount < IDEAL_DISTRIBUTION.safety.min) {
    gaps.push({
      type: 'insufficient_safety',
      message: `Add ${IDEAL_DISTRIBUTION.safety.min - safetyCount} more safety school(s) to ensure you have options.`,
      severity: 'high'
    });
  }
  
  return gaps;
}

/**
 * Calculate list balance score (0-100)
 */
function calculateBalanceScore(distribution, totalColleges) {
  let score = 100;
  let deductions = [];
  
  const reachCount = (distribution.far_reach || 0) + (distribution.reach || 0);
  const targetCount = (distribution.target || 0) + (distribution.likely || 0);
  const safetyCount = distribution.safety || 0;
  
  // Deduct for missing safeties
  if (safetyCount < 2) {
    const deduction = (2 - safetyCount) * 15;
    score -= deduction;
    deductions.push(`-${deduction} for insufficient safety schools`);
  }
  
  // Deduct for missing targets
  if (targetCount < 3) {
    const deduction = (3 - targetCount) * 10;
    score -= deduction;
    deductions.push(`-${deduction} for insufficient target schools`);
  }
  
  // Deduct for too many reaches
  if (reachCount > 6) {
    const deduction = (reachCount - 6) * 5;
    score -= deduction;
    deductions.push(`-${deduction} for too many reach schools`);
  }
  
  // Deduct for too few total schools
  if (totalColleges < 6) {
    const deduction = (6 - totalColleges) * 8;
    score -= deduction;
    deductions.push(`-${deduction} for too few total schools`);
  }
  
  // Deduct for too many total schools
  if (totalColleges > 15) {
    const deduction = (totalColleges - 15) * 3;
    score -= deduction;
    deductions.push(`-${deduction} for too many total schools`);
  }
  
  return {
    score: Math.max(0, Math.min(100, score)),
    deductions,
    breakdown: {
      reach: reachCount,
      target: targetCount,
      safety: safetyCount
    }
  };
}

/**
 * Generate optimization recommendations
 */
function generateOptimizationRecommendations(analysis) {
  const recommendations = [];
  
  // Based on gaps
  analysis.gaps.forEach(gap => {
    recommendations.push({
      priority: gap.severity === 'high' ? 1 : gap.severity === 'medium' ? 2 : 3,
      action: gap.message,
      reason: gap.type,
      category: 'list_balance'
    });
  });
  
  // Based on simulation results
  if (analysis.simulation.allRejected > 5) {
    recommendations.push({
      priority: 1,
      action: 'Add more safety schools to reduce risk of no acceptances',
      reason: `${analysis.simulation.allRejected}% chance of all rejections`,
      category: 'risk_reduction'
    });
  }
  
  if (analysis.simulation.onlySafeties > 40) {
    recommendations.push({
      priority: 2,
      action: 'Add more target schools for better expected outcomes',
      reason: `${analysis.simulation.onlySafeties}% chance of only safety acceptances`,
      category: 'outcome_improvement'
    });
  }
  
  if (analysis.simulation.topSchoolAccepted < 10 && 
      (analysis.distribution.far_reach || 0) + (analysis.distribution.reach || 0) > 0) {
    recommendations.push({
      priority: 3,
      action: 'Consider whether reach schools are worth the application effort',
      reason: `Only ${analysis.simulation.topSchoolAccepted}% chance of top school acceptance`,
      category: 'strategy'
    });
  }
  
  // Sort by priority
  recommendations.sort((a, b) => a.priority - b.priority);
  
  return recommendations.slice(0, 5);
}

/**
 * Main function: Analyze and optimize college list
 * @param {Object} profile - Student profile
 * @param {Array} colleges - Array of college objects
 * @returns {Object} Analysis and recommendations
 */
function analyzeCollegeList(profile, colleges) {
  if (!profile || !colleges || colleges.length === 0) {
    return {
      success: false,
      error: 'Profile and at least one college are required'
    };
  }
  
  try {
    // Calculate chances for each college
    const collegeChances = colleges.map(college => {
      const chancingResult = calculateChance(profile, college);
      return {
        college: {
          id: college.id,
          name: college.name,
          acceptanceRate: college.acceptance_rate
        },
        chance: chancingResult.chance || 0,
        category: chancingResult.category || categorizeChance(chancingResult.chance || 0),
        cdsAvailable: chancingResult.cdsAvailable || false
      };
    });
    
    // Calculate distribution
    const distribution = {};
    collegeChances.forEach(cc => {
      const cat = cc.category;
      distribution[cat] = (distribution[cat] || 0) + 1;
    });
    
    // Calculate aggregate statistics
    const chances = collegeChances.map(cc => cc.chance);
    const atLeastOne = calculateAtLeastOneAcceptance(chances);
    const expected = calculateExpectedAcceptances(chances);
    
    // Run Monte Carlo simulation
    const simulation = runMonteCarloSimulation(collegeChances);
    
    // Detect redundancies
    const redundancies = detectRedundancy(collegeChances);
    
    // Identify gaps
    const gaps = identifyGaps(distribution);
    
    // Calculate balance score
    const balance = calculateBalanceScore(distribution, colleges.length);
    
    // Build analysis object
    const analysis = {
      distribution,
      simulation,
      gaps,
      redundancies,
      balance
    };
    
    // Generate recommendations
    const recommendations = generateOptimizationRecommendations(analysis);
    
    return {
      success: true,
      summary: {
        totalColleges: colleges.length,
        atLeastOneAcceptance: atLeastOne,
        expectedAcceptances: Math.round(expected * 10) / 10,
        balanceScore: balance.score,
        listHealth: balance.score >= 80 ? 'Excellent' : 
                    balance.score >= 60 ? 'Good' : 
                    balance.score >= 40 ? 'Needs Work' : 'Poor'
      },
      distribution: {
        far_reach: distribution.far_reach || 0,
        reach: distribution.reach || 0,
        target: distribution.target || 0,
        likely: distribution.likely || 0,
        safety: distribution.safety || 0
      },
      colleges: collegeChances.sort((a, b) => a.chance - b.chance),
      simulation: {
        atLeastOneAcceptance: simulation.atLeastOneAcceptance,
        topSchoolAccepted: simulation.topSchoolAccepted,
        onlySafeties: simulation.onlySafeties,
        allRejected: simulation.allRejected,
        expectedAcceptances: simulation.expectedAcceptances,
        acceptanceInterval: simulation.acceptanceInterval,
        acceptanceDistribution: simulation.acceptanceDistribution.filter(d => d.probability > 0.5)
      },
      balance,
      gaps,
      redundancies,
      recommendations,
      idealDistribution: IDEAL_DISTRIBUTION,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('College list analysis failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Suggest colleges to add to improve list balance
 */
function suggestAdditions(profile, currentColleges, availableColleges, distribution) {
  const suggestions = [];
  
  const reachCount = (distribution.far_reach || 0) + (distribution.reach || 0);
  const targetCount = (distribution.target || 0) + (distribution.likely || 0);
  const safetyCount = distribution.safety || 0;
  
  // Get colleges not already in list
  const currentIds = new Set(currentColleges.map(c => c.id));
  const candidates = availableColleges.filter(c => !currentIds.has(c.id));
  
  // Calculate chances for all candidates
  const candidateChances = candidates.map(college => {
    const chancingResult = calculateChance(profile, college);
    return {
      college,
      chance: chancingResult.chance || 0,
      category: chancingResult.category || categorizeChance(chancingResult.chance || 0)
    };
  });
  
  // Sort by chance
  candidateChances.sort((a, b) => a.chance - b.chance);
  
  // Recommend safeties if needed
  if (safetyCount < 2) {
    const safeties = candidateChances.filter(c => c.category === 'safety');
    suggestions.push(...safeties.slice(0, 2 - safetyCount).map(c => ({
      college: c.college,
      chance: c.chance,
      reason: 'Add safety school to ensure you have backup options'
    })));
  }
  
  // Recommend targets if needed
  if (targetCount < 3) {
    const targets = candidateChances.filter(c => 
      c.category === 'target' || c.category === 'likely'
    );
    suggestions.push(...targets.slice(0, 3 - targetCount).map(c => ({
      college: c.college,
      chance: c.chance,
      reason: 'Add target school for better expected outcomes'
    })));
  }
  
  return suggestions;
}

/**
 * Calculate what-if scenarios for adding/removing colleges
 */
function calculateWhatIf(profile, currentColleges, change) {
  const { action, college } = change;
  
  let modifiedColleges;
  if (action === 'add') {
    modifiedColleges = [...currentColleges, college];
  } else if (action === 'remove') {
    modifiedColleges = currentColleges.filter(c => c.id !== college.id);
  } else {
    return { success: false, error: 'Invalid action. Use "add" or "remove".' };
  }
  
  const currentAnalysis = analyzeCollegeList(profile, currentColleges);
  const newAnalysis = analyzeCollegeList(profile, modifiedColleges);
  
  if (!currentAnalysis.success || !newAnalysis.success) {
    return { success: false, error: 'Could not analyze one or both scenarios' };
  }
  
  return {
    success: true,
    action,
    college: college.name,
    current: {
      atLeastOne: currentAnalysis.summary.atLeastOneAcceptance,
      expected: currentAnalysis.summary.expectedAcceptances,
      balanceScore: currentAnalysis.balance.score
    },
    after: {
      atLeastOne: newAnalysis.summary.atLeastOneAcceptance,
      expected: newAnalysis.summary.expectedAcceptances,
      balanceScore: newAnalysis.balance.score
    },
    delta: {
      atLeastOne: Math.round((newAnalysis.summary.atLeastOneAcceptance - currentAnalysis.summary.atLeastOneAcceptance) * 10) / 10,
      expected: Math.round((newAnalysis.summary.expectedAcceptances - currentAnalysis.summary.expectedAcceptances) * 10) / 10,
      balanceScore: newAnalysis.balance.score - currentAnalysis.balance.score
    },
    recommendation: action === 'add' ? 
      (newAnalysis.balance.score >= currentAnalysis.balance.score ? 'Recommended' : 'Consider alternatives') :
      (newAnalysis.balance.score >= currentAnalysis.balance.score ? 'Safe to remove' : 'Keep this college')
  };
}

module.exports = {
  analyzeCollegeList,
  suggestAdditions,
  calculateWhatIf,
  runMonteCarloSimulation,
  categorizeChance,
  calculateAtLeastOneAcceptance,
  IDEAL_DISTRIBUTION
};

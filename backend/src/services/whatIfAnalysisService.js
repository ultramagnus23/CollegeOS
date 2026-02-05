/**
 * whatIfAnalysisService.js
 * 
 * What-If Scenario Analysis for college admissions.
 * Allows students to see how profile changes would affect their chances.
 * 
 * Features:
 * 1. Hypothetical GPA/test score changes
 * 2. Activity additions/improvements
 * 3. Multi-variable sensitivity analysis
 * 4. ROI calculation (effort vs. chance improvement)
 * 5. Threshold detection (minimum needed for category change)
 */

const logger = require('../utils/logger');
const { calculateEnhancedChance } = require('./improvedChancingService');
const { calculateProfileStrength } = require('./profileStrengthService');

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

/**
 * Apply hypothetical changes to a profile
 * @param {Object} originalProfile - Original student profile
 * @param {Object} changes - Object with hypothetical changes
 * @returns {Object} Modified profile
 */
function applyChanges(originalProfile, changes) {
  // Deep clone the profile
  const modifiedProfile = JSON.parse(JSON.stringify(originalProfile));
  
  // Apply each change
  Object.entries(changes).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      // Handle nested paths like 'sat_ebrw' or 'gpa_weighted'
      modifiedProfile[key] = value;
      
      // Recalculate derived values
      if (key === 'sat_ebrw' || key === 'sat_math') {
        modifiedProfile.sat_total = 
          (modifiedProfile.sat_ebrw || 0) + (modifiedProfile.sat_math || 0);
      }
      
      if (key === 'act_english' || key === 'act_math' || 
          key === 'act_reading' || key === 'act_science') {
        modifiedProfile.act_composite = Math.round(
          ((modifiedProfile.act_english || 0) + 
           (modifiedProfile.act_math || 0) + 
           (modifiedProfile.act_reading || 0) + 
           (modifiedProfile.act_science || 0)) / 4
        );
      }
    }
  });
  
  return modifiedProfile;
}

/**
 * Calculate the impact of a single change
 * @param {Object} originalProfile - Original student profile
 * @param {Object} change - Single change to apply
 * @param {Array} colleges - Colleges to calculate chances for
 * @returns {Object} Impact analysis
 */
function calculateSingleChangeImpact(originalProfile, change, colleges) {
  const { field, newValue, description } = change;
  
  const modifiedProfile = applyChanges(originalProfile, { [field]: newValue });
  
  // Calculate original and new profile strength
  const originalStrength = calculateProfileStrength(originalProfile);
  const newStrength = calculateProfileStrength(modifiedProfile);
  
  // Calculate chances for each college
  const collegeImpacts = colleges.map(college => {
    const originalChance = calculateChance(originalProfile, college);
    const newChance = calculateChance(modifiedProfile, college);
    
    return {
      college: {
        id: college.id,
        name: college.name
      },
      originalChance: originalChance.chance || 0,
      newChance: newChance.chance || 0,
      delta: (newChance.chance || 0) - (originalChance.chance || 0),
      originalCategory: originalChance.category,
      newCategory: newChance.category,
      categoryChanged: originalChance.category !== newChance.category
    };
  });
  
  // Calculate summary statistics
  const avgDelta = collegeImpacts.length > 0 ?
    collegeImpacts.reduce((sum, c) => sum + c.delta, 0) / collegeImpacts.length : 0;
  
  const categoryChanges = collegeImpacts.filter(c => c.categoryChanged);
  
  return {
    change: {
      field,
      originalValue: originalProfile[field],
      newValue,
      description: description || `Change ${field} to ${newValue}`
    },
    profileStrength: {
      original: originalStrength.success ? originalStrength.overallScore : null,
      new: newStrength.success ? newStrength.overallScore : null,
      delta: (newStrength.success && originalStrength.success) ? 
        Math.round((newStrength.overallScore - originalStrength.overallScore) * 10) / 10 : null
    },
    collegeImpacts,
    summary: {
      averageChanceChange: Math.round(avgDelta * 10) / 10,
      collegesImproved: collegeImpacts.filter(c => c.delta > 0).length,
      collegesDeclined: collegeImpacts.filter(c => c.delta < 0).length,
      categoryUpgrades: categoryChanges.filter(c => c.delta > 0).length,
      categoryDowngrades: categoryChanges.filter(c => c.delta < 0).length
    }
  };
}

/**
 * Analyze multiple hypothetical scenarios
 */
function analyzeScenarios(originalProfile, scenarios, colleges) {
  if (!originalProfile || !scenarios || !Array.isArray(scenarios)) {
    return {
      success: false,
      error: 'Profile and scenarios array are required'
    };
  }
  
  try {
    const results = scenarios.map(scenario => {
      const modifiedProfile = applyChanges(originalProfile, scenario.changes);
      
      const collegeImpacts = colleges.map(college => {
        const originalChance = calculateChance(originalProfile, college);
        const newChance = calculateChance(modifiedProfile, college);
        
        return {
          college: college.name,
          originalChance: originalChance.chance || 0,
          newChance: newChance.chance || 0,
          delta: (newChance.chance || 0) - (originalChance.chance || 0)
        };
      });
      
      const avgDelta = collegeImpacts.reduce((sum, c) => sum + c.delta, 0) / 
        (collegeImpacts.length || 1);
      
      return {
        scenario: scenario.name || 'Unnamed Scenario',
        description: scenario.description,
        changes: scenario.changes,
        averageChanceImprovement: Math.round(avgDelta * 10) / 10,
        collegeImpacts,
        effort: scenario.effort || 'unknown',
        roi: scenario.effort ? calculateROI(avgDelta, scenario.effort) : null
      };
    });
    
    // Sort by ROI or average improvement
    results.sort((a, b) => (b.averageChanceImprovement) - (a.averageChanceImprovement));
    
    return {
      success: true,
      scenarios: results,
      bestScenario: results[0]?.scenario,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Scenario analysis failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Calculate ROI based on effort level
 */
function calculateROI(improvement, effort) {
  const effortMultiplier = {
    low: 3,
    medium: 2,
    high: 1,
    very_high: 0.5
  };
  
  const multiplier = effortMultiplier[effort] || 1;
  return Math.round(improvement * multiplier * 10) / 10;
}

/**
 * Find thresholds - minimum values needed to change admission category
 */
function findThresholds(originalProfile, college, fieldToAnalyze) {
  const originalChance = calculateChance(originalProfile, college);
  const originalCategory = originalChance.category;
  
  const thresholds = {
    toTarget: null,  // What's needed to become a target
    toSafety: null,  // What's needed to become a safety
    toReach: null    // What would drop to reach
  };
  
  // Define field ranges for binary search
  const fieldRanges = {
    gpa_weighted: { min: 2.0, max: 4.5, step: 0.1 },
    gpa_unweighted: { min: 2.0, max: 4.0, step: 0.05 },
    sat_total: { min: 800, max: 1600, step: 10 },
    act_composite: { min: 12, max: 36, step: 1 },
    sat_ebrw: { min: 400, max: 800, step: 10 },
    sat_math: { min: 400, max: 800, step: 10 }
  };
  
  const range = fieldRanges[fieldToAnalyze];
  if (!range) {
    return { error: `Unknown field: ${fieldToAnalyze}` };
  }
  
  const currentValue = originalProfile[fieldToAnalyze] || range.min;
  
  // Search upward for improvement thresholds
  for (let value = currentValue; value <= range.max; value += range.step) {
    const modified = applyChanges(originalProfile, { [fieldToAnalyze]: value });
    const newChance = calculateChance(modified, college);
    
    // Check for category transitions
    if (originalCategory === 'far_reach' && newChance.category === 'reach' && !thresholds.toReach) {
      thresholds.toReach = { value: Math.round(value * 100) / 100, chance: newChance.chance };
    }
    if ((originalCategory === 'far_reach' || originalCategory === 'reach') && 
        newChance.category === 'target' && !thresholds.toTarget) {
      thresholds.toTarget = { value: Math.round(value * 100) / 100, chance: newChance.chance };
    }
    if (newChance.category === 'safety' && !thresholds.toSafety) {
      thresholds.toSafety = { value: Math.round(value * 100) / 100, chance: newChance.chance };
    }
    
    if (thresholds.toSafety) break; // Found all upward thresholds
  }
  
  // Calculate improvements needed
  const improvementsNeeded = {};
  if (thresholds.toTarget) {
    improvementsNeeded.toTarget = {
      field: fieldToAnalyze,
      from: currentValue,
      to: thresholds.toTarget.value,
      improvement: Math.round((thresholds.toTarget.value - currentValue) * 100) / 100
    };
  }
  if (thresholds.toSafety) {
    improvementsNeeded.toSafety = {
      field: fieldToAnalyze,
      from: currentValue,
      to: thresholds.toSafety.value,
      improvement: Math.round((thresholds.toSafety.value - currentValue) * 100) / 100
    };
  }
  
  return {
    college: college.name,
    currentCategory: originalCategory,
    currentChance: originalChance.chance,
    field: fieldToAnalyze,
    currentValue,
    thresholds,
    improvementsNeeded
  };
}

/**
 * Sensitivity analysis - how much each factor affects chances
 */
function sensitivityAnalysis(originalProfile, colleges) {
  const factors = [
    { field: 'gpa_weighted', increment: 0.1, label: 'GPA +0.1' },
    { field: 'sat_total', increment: 50, label: 'SAT +50' },
    { field: 'act_composite', increment: 2, label: 'ACT +2' }
  ];
  
  const results = factors.map(factor => {
    const currentValue = originalProfile[factor.field] || 0;
    const newValue = currentValue + factor.increment;
    
    // Skip if already at max or no current value
    if (currentValue === 0 || 
        (factor.field === 'gpa_weighted' && newValue > 4.5) ||
        (factor.field === 'sat_total' && newValue > 1600) ||
        (factor.field === 'act_composite' && newValue > 36)) {
      return null;
    }
    
    const modified = applyChanges(originalProfile, { [factor.field]: newValue });
    
    const impacts = colleges.map(college => {
      const originalChance = calculateChance(originalProfile, college);
      const newChance = calculateChance(modified, college);
      return (newChance.chance || 0) - (originalChance.chance || 0);
    });
    
    const avgImpact = impacts.reduce((sum, i) => sum + i, 0) / (impacts.length || 1);
    
    return {
      factor: factor.label,
      field: factor.field,
      currentValue,
      newValue,
      averageChanceImpact: Math.round(avgImpact * 10) / 10,
      maxImpact: Math.max(...impacts),
      minImpact: Math.min(...impacts)
    };
  }).filter(r => r !== null);
  
  // Sort by impact
  results.sort((a, b) => b.averageChanceImpact - a.averageChanceImpact);
  
  return {
    success: true,
    factors: results,
    mostImpactful: results[0]?.factor,
    recommendation: results[0] ? 
      `Focus on improving ${results[0].factor} for maximum impact (avg +${results[0].averageChanceImpact}%)` : 
      'Profile is already optimized'
  };
}

/**
 * Recommend specific improvements based on profile gaps
 */
function recommendImprovements(originalProfile, colleges) {
  const recommendations = [];
  
  const currentStrength = calculateProfileStrength(originalProfile);
  
  if (!currentStrength.success) {
    return { success: false, error: 'Could not analyze profile' };
  }
  
  // GPA improvement scenarios
  const gpa = originalProfile.gpa_weighted || originalProfile.gpa_unweighted;
  if (gpa && gpa < 4.0) {
    const gpaImprovement = calculateSingleChangeImpact(
      originalProfile,
      { field: 'gpa_weighted', newValue: Math.min(4.0, gpa + 0.2) },
      colleges
    );
    
    if (gpaImprovement.summary.averageChanceChange > 1) {
      recommendations.push({
        priority: 1,
        action: 'Improve GPA by 0.2 points',
        expectedImpact: `+${gpaImprovement.summary.averageChanceChange}% average chance`,
        effort: 'high',
        timeframe: '1-2 semesters',
        details: gpaImprovement
      });
    }
  }
  
  // Test score improvements
  const sat = originalProfile.sat_total;
  if (sat && sat < 1550) {
    const satImprovement = calculateSingleChangeImpact(
      originalProfile,
      { field: 'sat_total', newValue: Math.min(1600, sat + 100) },
      colleges
    );
    
    if (satImprovement.summary.averageChanceChange > 1) {
      recommendations.push({
        priority: 2,
        action: 'Improve SAT by 100 points',
        expectedImpact: `+${satImprovement.summary.averageChanceChange}% average chance`,
        effort: 'medium',
        timeframe: '2-3 months with prep',
        details: satImprovement
      });
    }
  }
  
  const act = originalProfile.act_composite;
  if (act && act < 34) {
    const actImprovement = calculateSingleChangeImpact(
      originalProfile,
      { field: 'act_composite', newValue: Math.min(36, act + 3) },
      colleges
    );
    
    if (actImprovement.summary.averageChanceChange > 1) {
      recommendations.push({
        priority: 2,
        action: 'Improve ACT by 3 points',
        expectedImpact: `+${actImprovement.summary.averageChanceChange}% average chance`,
        effort: 'medium',
        timeframe: '2-3 months with prep',
        details: actImprovement
      });
    }
  }
  
  // Activity tier improvement
  if (currentStrength.componentScores.extracurricular.tierBreakdown.tier1 === 0) {
    recommendations.push({
      priority: 3,
      action: 'Develop a Tier 1 (national/international) achievement',
      expectedImpact: '+3-8% at selective schools',
      effort: 'very_high',
      timeframe: '6-12 months',
      details: {
        examples: [
          'National competition placement',
          'Published research',
          'Significant community impact',
          'State/national recognition'
        ]
      }
    });
  }
  
  // Sort by priority
  recommendations.sort((a, b) => a.priority - b.priority);
  
  return {
    success: true,
    currentStrength: currentStrength.overallScore,
    recommendations,
    summary: `${recommendations.length} improvement opportunities identified`
  };
}

/**
 * Main what-if analysis function
 */
function analyzeWhatIf(originalProfile, changes, colleges) {
  if (!originalProfile) {
    return {
      success: false,
      error: 'Profile is required'
    };
  }
  
  if (!changes || Object.keys(changes).length === 0) {
    return {
      success: false,
      error: 'At least one change is required'
    };
  }
  
  if (!colleges || colleges.length === 0) {
    return {
      success: false,
      error: 'At least one college is required'
    };
  }
  
  try {
    const modifiedProfile = applyChanges(originalProfile, changes);
    
    const originalStrength = calculateProfileStrength(originalProfile);
    const newStrength = calculateProfileStrength(modifiedProfile);
    
    const collegeImpacts = colleges.map(college => {
      const originalChance = calculateChance(originalProfile, college);
      const newChance = calculateChance(modifiedProfile, college);
      
      return {
        college: {
          id: college.id,
          name: college.name,
          acceptanceRate: college.acceptance_rate
        },
        original: {
          chance: originalChance.chance || 0,
          category: originalChance.category
        },
        after: {
          chance: newChance.chance || 0,
          category: newChance.category
        },
        delta: (newChance.chance || 0) - (originalChance.chance || 0),
        categoryChanged: originalChance.category !== newChance.category,
        improved: (newChance.chance || 0) > (originalChance.chance || 0)
      };
    });
    
    const improved = collegeImpacts.filter(c => c.improved).length;
    const avgDelta = collegeImpacts.reduce((sum, c) => sum + c.delta, 0) / collegeImpacts.length;
    
    return {
      success: true,
      changes: Object.entries(changes).map(([field, value]) => ({
        field,
        originalValue: originalProfile[field],
        newValue: value
      })),
      profileStrength: {
        original: originalStrength.success ? originalStrength.overallScore : null,
        after: newStrength.success ? newStrength.overallScore : null,
        delta: (originalStrength.success && newStrength.success) ?
          Math.round((newStrength.overallScore - originalStrength.overallScore) * 10) / 10 : null
      },
      collegeImpacts,
      summary: {
        totalColleges: colleges.length,
        collegesImproved: improved,
        collegesUnchanged: collegeImpacts.filter(c => c.delta === 0).length,
        collegesDeclined: collegeImpacts.filter(c => c.delta < 0).length,
        averageChanceChange: Math.round(avgDelta * 10) / 10,
        categoryUpgrades: collegeImpacts.filter(c => c.categoryChanged && c.improved).length
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('What-if analysis failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  analyzeWhatIf,
  analyzeScenarios,
  calculateSingleChangeImpact,
  findThresholds,
  sensitivityAnalysis,
  recommendImprovements,
  applyChanges
};

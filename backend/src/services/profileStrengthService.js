/**
 * profileStrengthService.js
 * 
 * Comprehensive profile strength calculation using multi-factor weighted scoring.
 * Computes overall applicant strength, component breakdowns, percentile rankings,
 * and personalized improvement recommendations.
 * 
 * Components:
 * 1. Academic Metrics (40%) - GPA, test scores, course rigor, class rank
 * 2. Extracurricular Strength (25%) - Activities, leadership, impact
 * 3. Personal Narrative Quality (20%) - Essays, recommendations (estimated)
 * 4. Demographic/Contextual Factors (15%) - First-gen, hooks, geographic diversity
 */

const logger = require('../utils/logger');

// Component weights for overall score
const COMPONENT_WEIGHTS = {
  academic: 0.40,
  extracurricular: 0.25,
  personalNarrative: 0.20,
  demographic: 0.15
};

// States that are underrepresented in college applicant pools
// These states often provide geographic diversity value at selective schools
const UNDERREPRESENTED_STATES = [
  'wyoming', 'montana', 'north dakota', 'south dakota', 
  'alaska', 'vermont', 'maine', 'idaho', 'west virginia', 'mississippi',
  'arkansas', 'nebraska', 'new mexico', 'hawaii'
];

// National percentile distribution parameters (approximate)
const PERCENTILE_PARAMS = {
  gpa: { mean: 3.0, stdDev: 0.5 },
  sat: { mean: 1060, stdDev: 210 },
  act: { mean: 21, stdDev: 5.5 },
  activities: { mean: 3, stdDev: 2.5 }
};

/**
 * Calculate z-score for percentile estimation
 */
function calculateZScore(value, mean, stdDev) {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

/**
 * Convert z-score to percentile using normal distribution approximation
 */
function zToPercentile(z) {
  // Approximation of the cumulative distribution function
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  
  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z) / Math.sqrt(2);
  
  const t = 1.0 / (1.0 + p * z);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  
  const percentile = (1 + sign * y) / 2 * 100;
  return Math.min(99.9, Math.max(0.1, percentile));
}

/**
 * Calculate academic component score (0-100)
 */
function calculateAcademicScore(profile) {
  const scores = {
    gpa: 0,
    testScore: 0,
    courseRigor: 0,
    classRank: 0
  };
  const weights = {
    gpa: 0.35,
    testScore: 0.30,
    courseRigor: 0.20,
    classRank: 0.15
  };
  
  // GPA scoring (using the best available)
  const gpa = profile.gpa_weighted || profile.gpa_unweighted || 0;
  const gpaScale = parseFloat(profile.gpa_scale) || 4.0;
  const normalizedGpa = gpaScale > 0 ? (gpa / gpaScale) * 4.0 : 0;
  
  if (normalizedGpa >= 3.9) scores.gpa = 95 + (normalizedGpa - 3.9) * 50;
  else if (normalizedGpa >= 3.7) scores.gpa = 85 + (normalizedGpa - 3.7) * 50;
  else if (normalizedGpa >= 3.5) scores.gpa = 75 + (normalizedGpa - 3.5) * 50;
  else if (normalizedGpa >= 3.3) scores.gpa = 65 + (normalizedGpa - 3.3) * 50;
  else if (normalizedGpa >= 3.0) scores.gpa = 50 + (normalizedGpa - 3.0) * 50;
  else if (normalizedGpa >= 2.5) scores.gpa = 30 + (normalizedGpa - 2.5) * 40;
  else scores.gpa = normalizedGpa * 12;
  
  scores.gpa = Math.min(100, Math.max(0, scores.gpa));
  
  // Test scores (SAT or ACT, whichever is higher percentile-wise)
  const sat = profile.sat_total || 0;
  const act = profile.act_composite || 0;
  
  let satScore = 0;
  let actScore = 0;
  
  if (sat > 0) {
    if (sat >= 1550) satScore = 98;
    else if (sat >= 1500) satScore = 95 + (sat - 1500) * 0.06;
    else if (sat >= 1400) satScore = 88 + (sat - 1400) * 0.07;
    else if (sat >= 1300) satScore = 78 + (sat - 1300) * 0.10;
    else if (sat >= 1200) satScore = 65 + (sat - 1200) * 0.13;
    else if (sat >= 1100) satScore = 50 + (sat - 1100) * 0.15;
    else if (sat >= 1000) satScore = 35 + (sat - 1000) * 0.15;
    else satScore = sat / 1000 * 35;
  }
  
  if (act > 0) {
    if (act >= 35) actScore = 98;
    else if (act >= 33) actScore = 95 + (act - 33) * 1.5;
    else if (act >= 30) actScore = 88 + (act - 30) * 2.33;
    else if (act >= 27) actScore = 78 + (act - 27) * 3.33;
    else if (act >= 24) actScore = 65 + (act - 24) * 4.33;
    else if (act >= 21) actScore = 50 + (act - 21) * 5;
    else actScore = act / 21 * 50;
  }
  
  scores.testScore = Math.max(satScore, actScore);
  
  // Course rigor scoring based on AP/IB/Honors courses
  const coursework = profile.coursework || [];
  const apIbCount = coursework.filter(c => 
    c.course_level === 'AP' || c.course_level === 'IB_HL' || c.course_level === 'IB_SL'
  ).length;
  const honorsCount = coursework.filter(c => c.course_level === 'Honors').length;
  
  // Also count from activities if ap_courses is a number
  const totalApIb = apIbCount + (typeof profile.ap_courses === 'number' ? profile.ap_courses : 0);
  
  if (totalApIb >= 12) scores.courseRigor = 95;
  else if (totalApIb >= 10) scores.courseRigor = 88;
  else if (totalApIb >= 8) scores.courseRigor = 80;
  else if (totalApIb >= 6) scores.courseRigor = 70;
  else if (totalApIb >= 4) scores.courseRigor = 60;
  else if (totalApIb >= 2) scores.courseRigor = 45;
  else if (totalApIb >= 1) scores.courseRigor = 35;
  else scores.courseRigor = 20 + honorsCount * 3;
  
  // Class rank
  const classRankPercentile = profile.class_rank_percentile;
  if (classRankPercentile) {
    // class_rank_percentile is already 0-100, higher is better
    scores.classRank = classRankPercentile;
  } else if (profile.class_rank && profile.class_size) {
    // Calculate percentile (top 1 = 99th percentile)
    scores.classRank = Math.max(0, Math.min(100, 
      (1 - (profile.class_rank / profile.class_size)) * 100
    ));
  } else {
    // Estimate from GPA if rank not available
    scores.classRank = scores.gpa * 0.85; // Slight discount for unknown
  }
  
  // Calculate weighted academic score
  const academicScore = 
    scores.gpa * weights.gpa +
    scores.testScore * weights.testScore +
    scores.courseRigor * weights.courseRigor +
    scores.classRank * weights.classRank;
  
  return {
    total: Math.round(academicScore * 10) / 10,
    components: {
      gpa: Math.round(scores.gpa * 10) / 10,
      testScore: Math.round(scores.testScore * 10) / 10,
      courseRigor: Math.round(scores.courseRigor * 10) / 10,
      classRank: Math.round(scores.classRank * 10) / 10
    },
    rawData: {
      gpa: gpa,
      gpaScale: gpaScale,
      sat: sat,
      act: act,
      apIbCourses: totalApIb,
      honorsCourses: honorsCount,
      classRankPercentile: profile.class_rank_percentile
    }
  };
}

/**
 * Calculate extracurricular component score (0-100)
 */
function calculateExtracurricularScore(profile) {
  const activities = profile.activities || [];
  
  const scores = {
    leadership: 0,
    depth: 0,
    breadth: 0,
    impact: 0
  };
  const weights = {
    leadership: 0.30,
    depth: 0.30,
    breadth: 0.15,
    impact: 0.25
  };
  
  if (activities.length === 0) {
    return {
      total: 20, // Base score for no activities
      components: scores,
      tierBreakdown: { tier1: 0, tier2: 0, tier3: 0, tier4: 0 },
      totalActivities: 0,
      totalHours: 0
    };
  }
  
  // Tier breakdown
  const tier1 = activities.filter(a => a.tier_rating === 1).length;
  const tier2 = activities.filter(a => a.tier_rating === 2).length;
  const tier3 = activities.filter(a => a.tier_rating === 3).length;
  const tier4 = activities.filter(a => a.tier_rating === 4 || !a.tier_rating).length;
  
  // Leadership scoring - based on position levels
  const leadershipPositions = activities.filter(a => 
    a.position_title && 
    (a.position_title.toLowerCase().includes('president') ||
     a.position_title.toLowerCase().includes('founder') ||
     a.position_title.toLowerCase().includes('captain') ||
     a.position_title.toLowerCase().includes('head') ||
     a.position_title.toLowerCase().includes('chair') ||
     a.position_title.toLowerCase().includes('director') ||
     a.position_title.toLowerCase().includes('editor'))
  ).length;
  
  const officerPositions = activities.filter(a => 
    a.position_title && 
    (a.position_title.toLowerCase().includes('vice') ||
     a.position_title.toLowerCase().includes('secretary') ||
     a.position_title.toLowerCase().includes('treasurer') ||
     a.position_title.toLowerCase().includes('officer') ||
     a.position_title.toLowerCase().includes('manager'))
  ).length;
  
  scores.leadership = Math.min(100,
    leadershipPositions * 25 + officerPositions * 15
  );
  
  // Depth scoring - based on years and hours
  const avgYears = activities.reduce((sum, a) => sum + (a.years_participated || 1), 0) / activities.length;
  const totalHours = activities.reduce((sum, a) => {
    const hoursPerWeek = a.hours_per_week || 2;
    const weeksPerYear = a.weeks_per_year || 30;
    const years = a.years_participated || 1;
    return sum + (hoursPerWeek * weeksPerYear * years);
  }, 0);
  
  // Score based on commitment
  if (avgYears >= 3.5 && totalHours >= 2000) scores.depth = 95;
  else if (avgYears >= 3 && totalHours >= 1500) scores.depth = 85;
  else if (avgYears >= 2.5 && totalHours >= 1000) scores.depth = 75;
  else if (avgYears >= 2 && totalHours >= 600) scores.depth = 65;
  else if (avgYears >= 1.5 && totalHours >= 300) scores.depth = 55;
  else scores.depth = Math.min(50, totalHours / 10 + avgYears * 10);
  
  // Breadth scoring - based on variety of activity types
  const activityTypes = new Set(activities.map(a => a.activity_type));
  const typeCount = activityTypes.size;
  
  if (typeCount >= 5) scores.breadth = 90;
  else if (typeCount >= 4) scores.breadth = 80;
  else if (typeCount >= 3) scores.breadth = 70;
  else if (typeCount >= 2) scores.breadth = 55;
  else scores.breadth = 40;
  
  // Impact scoring - based on tier ratings and scope
  scores.impact = Math.min(100,
    tier1 * 30 + tier2 * 18 + tier3 * 8 + tier4 * 3
  );
  
  // Boost for national/international recognition
  const hasNational = activities.some(a => 
    a.recognition_level === 'national' || a.recognition_level === 'international'
  );
  if (hasNational) scores.impact = Math.min(100, scores.impact + 15);
  
  const extracurricularScore = 
    scores.leadership * weights.leadership +
    scores.depth * weights.depth +
    scores.breadth * weights.breadth +
    scores.impact * weights.impact;
  
  return {
    total: Math.round(extracurricularScore * 10) / 10,
    components: {
      leadership: Math.round(scores.leadership * 10) / 10,
      depth: Math.round(scores.depth * 10) / 10,
      breadth: Math.round(scores.breadth * 10) / 10,
      impact: Math.round(scores.impact * 10) / 10
    },
    tierBreakdown: { tier1, tier2, tier3, tier4 },
    totalActivities: activities.length,
    totalHours: Math.round(totalHours)
  };
}

/**
 * Estimate personal narrative quality (essays, recommendations)
 * Since we don't have essay analysis, we estimate based on profile completeness
 * and other indicators
 */
function estimatePersonalNarrativeScore(profile) {
  const scores = {
    essayReadiness: 50, // Default neutral
    recommendationStrength: 50,
    profileCompleteness: 0,
    storyCoherence: 50
  };
  const weights = {
    essayReadiness: 0.35,
    recommendationStrength: 0.30,
    profileCompleteness: 0.20,
    storyCoherence: 0.15
  };
  
  // Profile completeness scoring
  const fields = [
    profile.gpa_weighted || profile.gpa_unweighted,
    profile.sat_total || profile.act_composite,
    profile.high_school_name,
    profile.graduation_year,
    profile.intended_majors,
    profile.country,
    (profile.activities || []).length > 0,
    (profile.coursework || []).length > 0,
    profile.first_name,
    profile.last_name
  ];
  
  const filledFields = fields.filter(f => f).length;
  scores.profileCompleteness = (filledFields / fields.length) * 100;
  
  // Story coherence - estimated from activity alignment with intended major
  const intendedMajors = profile.intended_majors || [];
  const activities = profile.activities || [];
  
  if (intendedMajors.length > 0 && activities.length > 0) {
    // Check if activities align with major (simplified check)
    const majorKeywords = intendedMajors.join(' ').toLowerCase().split(/\s+/);
    const activityDescriptions = activities.map(a => 
      `${a.activity_name || ''} ${a.description || ''} ${a.activity_type || ''}`
    ).join(' ').toLowerCase();
    
    const alignedCount = majorKeywords.filter(keyword => 
      keyword.length > 3 && activityDescriptions.includes(keyword)
    ).length;
    
    scores.storyCoherence = Math.min(90, 50 + alignedCount * 10);
  }
  
  // Estimate essay readiness based on GPA and writing indicators
  // Higher achieving students tend to have better essays
  const gpa = profile.gpa_weighted || profile.gpa_unweighted || 0;
  if (gpa >= 3.9) scores.essayReadiness = 70;
  else if (gpa >= 3.7) scores.essayReadiness = 60;
  else if (gpa >= 3.5) scores.essayReadiness = 55;
  else scores.essayReadiness = 45;
  
  // Estimate recommendation strength based on profile strength
  if (profile.is_legacy) scores.recommendationStrength += 10;
  if ((profile.activities || []).some(a => a.tier_rating === 1)) {
    scores.recommendationStrength += 15;
  }
  
  const narrativeScore = 
    scores.essayReadiness * weights.essayReadiness +
    scores.recommendationStrength * weights.recommendationStrength +
    scores.profileCompleteness * weights.profileCompleteness +
    scores.storyCoherence * weights.storyCoherence;
  
  return {
    total: Math.round(narrativeScore * 10) / 10,
    components: {
      essayReadiness: Math.round(scores.essayReadiness * 10) / 10,
      recommendationStrength: Math.round(scores.recommendationStrength * 10) / 10,
      profileCompleteness: Math.round(scores.profileCompleteness * 10) / 10,
      storyCoherence: Math.round(scores.storyCoherence * 10) / 10
    },
    note: 'Essay and recommendation scores are estimates. Complete your essays for accurate assessment.'
  };
}

/**
 * Calculate demographic and contextual factors score
 */
function calculateDemographicScore(profile) {
  const scores = {
    firstGeneration: 0,
    legacyStatus: 0,
    geographicDiversity: 0,
    specialCircumstances: 0
  };
  
  // First generation boost
  if (profile.is_first_generation) {
    scores.firstGeneration = 80;
  } else {
    scores.firstGeneration = 50; // Neutral
  }
  
  // Legacy status
  if (profile.is_legacy) {
    scores.legacyStatus = 85;
  } else {
    scores.legacyStatus = 50; // Neutral
  }
  
  // Geographic diversity (for US schools, out of state can be valuable)
  // This is simplified - ideally would check against specific college locations
  const state = profile.state_province;
  const country = profile.country;
  
  if (country && country.toLowerCase() !== 'usa' && country.toLowerCase() !== 'united states') {
    scores.geographicDiversity = 70; // International students add diversity
  } else if (state) {
    // Some states are underrepresented at selective colleges
    if (UNDERREPRESENTED_STATES.includes(state.toLowerCase())) {
      scores.geographicDiversity = 75;
    } else {
      scores.geographicDiversity = 50;
    }
  } else {
    scores.geographicDiversity = 50;
  }
  
  // Special circumstances and hooks
  const hooks = profile.hooks || [];
  const specialCircumstances = profile.special_circumstances || '';
  
  if (hooks.length > 0 || specialCircumstances) {
    scores.specialCircumstances = 60 + Math.min(30, hooks.length * 10);
  } else {
    scores.specialCircumstances = 50;
  }
  
  // Calculate weighted average
  const demographicScore = 
    scores.firstGeneration * 0.30 +
    scores.legacyStatus * 0.25 +
    scores.geographicDiversity * 0.25 +
    scores.specialCircumstances * 0.20;
  
  return {
    total: Math.round(demographicScore * 10) / 10,
    components: scores,
    factors: {
      isFirstGen: profile.is_first_generation || false,
      isLegacy: profile.is_legacy || false,
      country: profile.country,
      state: profile.state_province,
      hasHooks: (profile.hooks || []).length > 0
    }
  };
}

/**
 * Generate personalized improvement recommendations
 */
function generateRecommendations(profile, academic, extracurricular, narrative, demographic) {
  const recommendations = [];
  
  // Academic recommendations
  if (academic.components.gpa < 80) {
    recommendations.push({
      category: 'Academic',
      priority: 'high',
      action: 'Focus on raising your GPA',
      impact: 'high',
      details: 'Every 0.1 GPA point improvement can significantly increase your chances at competitive schools.'
    });
  }
  
  if (academic.components.testScore < 70 && academic.components.testScore > 0) {
    // Use proper SAT/ACT concordance: ACT 21 ≈ SAT 1060, so multiply ACT by ~50
    const satEquivalent = academic.rawData.act * 50;
    const recommendTest = academic.rawData.sat > satEquivalent ? 'SAT' : 'ACT';
    recommendations.push({
      category: 'Academic',
      priority: 'high',
      action: 'Consider retaking standardized tests',
      impact: 'medium',
      details: `Your current score leaves room for improvement. Consider focused prep for ${recommendTest}.`
    });
  }
  
  if (academic.components.testScore === 0) {
    recommendations.push({
      category: 'Academic',
      priority: 'medium',
      action: 'Take SAT or ACT',
      impact: 'high',
      details: 'Even for test-optional schools, strong test scores can boost your application.'
    });
  }
  
  if (academic.components.courseRigor < 60) {
    recommendations.push({
      category: 'Academic',
      priority: 'medium',
      action: 'Take more challenging courses',
      impact: 'medium',
      details: 'Consider adding AP, IB, or Honors courses to demonstrate academic rigor.'
    });
  }
  
  // Extracurricular recommendations
  if (extracurricular.totalActivities < 4) {
    recommendations.push({
      category: 'Extracurricular',
      priority: 'high',
      action: 'Expand your activities list',
      impact: 'medium',
      details: 'Aim for 5-8 meaningful activities that showcase your interests and leadership.'
    });
  }
  
  if (extracurricular.components.leadership < 50) {
    recommendations.push({
      category: 'Extracurricular',
      priority: 'medium',
      action: 'Seek leadership positions',
      impact: 'high',
      details: 'Leadership roles in existing activities are more valuable than joining new clubs.'
    });
  }
  
  if (extracurricular.tierBreakdown.tier1 === 0 && extracurricular.tierBreakdown.tier2 === 0) {
    recommendations.push({
      category: 'Extracurricular',
      priority: 'medium',
      action: 'Develop a standout achievement',
      impact: 'high',
      details: 'Work toward a state/regional/national-level accomplishment in your strongest area.'
    });
  }
  
  // Narrative recommendations
  if (narrative.components.profileCompleteness < 80) {
    recommendations.push({
      category: 'Profile',
      priority: 'high',
      action: 'Complete your profile',
      impact: 'medium',
      details: 'Fill in all profile sections to get more accurate chancing and recommendations.'
    });
  }
  
  if (narrative.components.storyCoherence < 60) {
    recommendations.push({
      category: 'Narrative',
      priority: 'medium',
      action: 'Align activities with intended major',
      impact: 'medium',
      details: 'Ensure your activities tell a coherent story that supports your academic interests.'
    });
  }
  
  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  return recommendations.slice(0, 5); // Top 5 recommendations
}

/**
 * Calculate national percentile ranking
 */
function calculatePercentileRanking(overallScore) {
  // Map overall score to approximate percentile
  // This uses a simplified model where score roughly correlates with percentile
  // with some compression at the extremes
  
  if (overallScore >= 95) return 99;
  if (overallScore >= 90) return 97;
  if (overallScore >= 85) return 94;
  if (overallScore >= 80) return 90;
  if (overallScore >= 75) return 85;
  if (overallScore >= 70) return 78;
  if (overallScore >= 65) return 70;
  if (overallScore >= 60) return 60;
  if (overallScore >= 55) return 50;
  if (overallScore >= 50) return 40;
  if (overallScore >= 45) return 30;
  if (overallScore >= 40) return 20;
  if (overallScore >= 35) return 12;
  return Math.max(1, Math.round(overallScore / 4));
}

/**
 * Main function: Calculate comprehensive profile strength
 */
function calculateProfileStrength(profile) {
  if (!profile) {
    return {
      success: false,
      error: 'No profile data provided'
    };
  }
  
  try {
    // Calculate each component
    const academic = calculateAcademicScore(profile);
    const extracurricular = calculateExtracurricularScore(profile);
    const narrative = estimatePersonalNarrativeScore(profile);
    const demographic = calculateDemographicScore(profile);
    
    // Calculate overall score
    const overallScore = 
      academic.total * COMPONENT_WEIGHTS.academic +
      extracurricular.total * COMPONENT_WEIGHTS.extracurricular +
      narrative.total * COMPONENT_WEIGHTS.personalNarrative +
      demographic.total * COMPONENT_WEIGHTS.demographic;
    
    // Calculate confidence interval
    const confidenceMargin = 5; // ±5 points
    const lowerBound = Math.max(0, overallScore - confidenceMargin);
    const upperBound = Math.min(100, overallScore + confidenceMargin);
    
    // Calculate percentile
    const percentile = calculatePercentileRanking(overallScore);
    
    // Generate recommendations
    const recommendations = generateRecommendations(
      profile, academic, extracurricular, narrative, demographic
    );
    
    // Determine strength tier
    let tier;
    if (overallScore >= 85) tier = 'Elite';
    else if (overallScore >= 75) tier = 'Very Strong';
    else if (overallScore >= 65) tier = 'Strong';
    else if (overallScore >= 55) tier = 'Above Average';
    else if (overallScore >= 45) tier = 'Average';
    else if (overallScore >= 35) tier = 'Below Average';
    else tier = 'Needs Improvement';
    
    return {
      success: true,
      overallScore: Math.round(overallScore * 10) / 10,
      tier,
      confidenceInterval: {
        lower: Math.round(lowerBound * 10) / 10,
        upper: Math.round(upperBound * 10) / 10
      },
      nationalPercentile: percentile,
      componentScores: {
        academic: {
          weight: `${COMPONENT_WEIGHTS.academic * 100}%`,
          ...academic
        },
        extracurricular: {
          weight: `${COMPONENT_WEIGHTS.extracurricular * 100}%`,
          ...extracurricular
        },
        personalNarrative: {
          weight: `${COMPONENT_WEIGHTS.personalNarrative * 100}%`,
          ...narrative
        },
        demographic: {
          weight: `${COMPONENT_WEIGHTS.demographic * 100}%`,
          ...demographic
        }
      },
      recommendations,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Profile strength calculation failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Compare two profiles and show improvements
 */
function compareProfiles(oldProfile, newProfile) {
  const oldStrength = calculateProfileStrength(oldProfile);
  const newStrength = calculateProfileStrength(newProfile);
  
  if (!oldStrength.success || !newStrength.success) {
    return {
      success: false,
      error: 'Could not calculate one or both profiles'
    };
  }
  
  const delta = {
    overall: Math.round((newStrength.overallScore - oldStrength.overallScore) * 10) / 10,
    academic: Math.round((newStrength.componentScores.academic.total - oldStrength.componentScores.academic.total) * 10) / 10,
    extracurricular: Math.round((newStrength.componentScores.extracurricular.total - oldStrength.componentScores.extracurricular.total) * 10) / 10,
    narrative: Math.round((newStrength.componentScores.personalNarrative.total - oldStrength.componentScores.personalNarrative.total) * 10) / 10,
    demographic: Math.round((newStrength.componentScores.demographic.total - oldStrength.componentScores.demographic.total) * 10) / 10
  };
  
  const improvements = [];
  if (delta.academic > 0) improvements.push(`Academic improved by ${delta.academic} points`);
  if (delta.extracurricular > 0) improvements.push(`Extracurricular improved by ${delta.extracurricular} points`);
  if (delta.narrative > 0) improvements.push(`Narrative improved by ${delta.narrative} points`);
  
  const declines = [];
  if (delta.academic < 0) declines.push(`Academic declined by ${Math.abs(delta.academic)} points`);
  if (delta.extracurricular < 0) declines.push(`Extracurricular declined by ${Math.abs(delta.extracurricular)} points`);
  
  return {
    success: true,
    oldStrength,
    newStrength,
    delta,
    improvements,
    declines,
    netChange: delta.overall > 0 ? 'improved' : delta.overall < 0 ? 'declined' : 'unchanged'
  };
}

module.exports = {
  calculateProfileStrength,
  compareProfiles,
  calculateAcademicScore,
  calculateExtracurricularScore,
  estimatePersonalNarrativeScore,
  calculateDemographicScore
};

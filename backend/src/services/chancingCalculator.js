// backend/src/services/chancingCalculator.js
// Comprehensive admission chancing calculator

const StudentProfile = require('../models/StudentProfile');

/**
 * Calculate admission chance for a student at a specific college
 * 
 * @param {Object} studentProfile - Complete student profile with activities and coursework
 * @param {Object} college - College data with stats
 * @returns {Object} Chancing result with percentage, category, and factors
 */
function calculateAdmissionChance(studentProfile, college) {
  let baseChance = 50;
  const factors = [];
  
  // ==========================================
  // FACTOR 1: SAT/ACT Score Match (30% weight)
  // ==========================================
  if (studentProfile.sat_total && college.sat_total_25th && college.sat_total_75th) {
    const satPercentile = calculatePercentile(
      studentProfile.sat_total,
      college.sat_total_25th,
      college.sat_total_75th
    );
    
    if (satPercentile >= 75) {
      baseChance += 15;
      factors.push({ 
        name: 'SAT Score', 
        impact: '+15%', 
        details: `${studentProfile.sat_total} is above 75th percentile (${college.sat_total_75th})`,
        positive: true
      });
    } else if (satPercentile >= 50) {
      baseChance += 5;
      factors.push({ 
        name: 'SAT Score', 
        impact: '+5%', 
        details: `${studentProfile.sat_total} is in middle 50% (${college.sat_total_25th}-${college.sat_total_75th})`,
        positive: true
      });
    } else if (satPercentile >= 25) {
      baseChance += 0;
      factors.push({ 
        name: 'SAT Score', 
        impact: '0%', 
        details: `${studentProfile.sat_total} is at 25th percentile (${college.sat_total_25th})`,
        positive: false
      });
    } else {
      baseChance -= 10;
      factors.push({ 
        name: 'SAT Score', 
        impact: '-10%', 
        details: `${studentProfile.sat_total} is below 25th percentile (${college.sat_total_25th})`,
        positive: false
      });
    }
  } else if (studentProfile.act_composite && college.act_composite_25th && college.act_composite_75th) {
    // Use ACT if SAT not available
    const actPercentile = calculatePercentile(
      studentProfile.act_composite,
      college.act_composite_25th,
      college.act_composite_75th
    );
    
    if (actPercentile >= 75) {
      baseChance += 15;
      factors.push({ 
        name: 'ACT Score', 
        impact: '+15%', 
        details: `${studentProfile.act_composite} is above 75th percentile`,
        positive: true
      });
    } else if (actPercentile >= 50) {
      baseChance += 5;
      factors.push({ 
        name: 'ACT Score', 
        impact: '+5%', 
        details: `${studentProfile.act_composite} is in middle 50%`,
        positive: true
      });
    } else if (actPercentile >= 25) {
      baseChance += 0;
      factors.push({ 
        name: 'ACT Score', 
        impact: '0%', 
        details: `${studentProfile.act_composite} is at 25th percentile`,
        positive: false
      });
    } else {
      baseChance -= 10;
      factors.push({ 
        name: 'ACT Score', 
        impact: '-10%', 
        details: `${studentProfile.act_composite} is below 25th percentile`,
        positive: false
      });
    }
  }
  
  // ==========================================
  // FACTOR 2: GPA Match (25% weight)
  // ==========================================
  const studentGPA = studentProfile.gpa_unweighted || studentProfile.gpa_weighted;
  const collegeAvgGPA = college.average_gpa || college.avg_gpa;
  
  if (studentGPA && collegeAvgGPA) {
    const gpaDiff = studentGPA - collegeAvgGPA;
    
    if (gpaDiff >= 0.3) {
      baseChance += 12;
      factors.push({ 
        name: 'GPA', 
        impact: '+12%', 
        details: `${studentGPA.toFixed(2)} is well above average (${collegeAvgGPA.toFixed(2)})`,
        positive: true
      });
    } else if (gpaDiff >= 0) {
      baseChance += 5;
      factors.push({ 
        name: 'GPA', 
        impact: '+5%', 
        details: `${studentGPA.toFixed(2)} is above average (${collegeAvgGPA.toFixed(2)})`,
        positive: true
      });
    } else if (gpaDiff >= -0.2) {
      baseChance += 0;
      factors.push({ 
        name: 'GPA', 
        impact: '0%', 
        details: `${studentGPA.toFixed(2)} is near average (${collegeAvgGPA.toFixed(2)})`,
        positive: false
      });
    } else {
      baseChance -= 8;
      factors.push({ 
        name: 'GPA', 
        impact: '-8%', 
        details: `${studentGPA.toFixed(2)} is below average (${collegeAvgGPA.toFixed(2)})`,
        positive: false
      });
    }
  }
  
  // ==========================================
  // FACTOR 3: Class Rank (15% weight)
  // ==========================================
  if (studentProfile.class_rank_percentile) {
    const percentile = studentProfile.class_rank_percentile;
    
    if (percentile >= 95) {
      baseChance += 10;
      factors.push({ 
        name: 'Class Rank', 
        impact: '+10%', 
        details: `Top ${100 - percentile}% of class`,
        positive: true
      });
    } else if (percentile >= 90) {
      baseChance += 5;
      factors.push({ 
        name: 'Class Rank', 
        impact: '+5%', 
        details: `Top 10% of class`,
        positive: true
      });
    } else if (percentile >= 75) {
      baseChance += 0;
      factors.push({ 
        name: 'Class Rank', 
        impact: '0%', 
        details: `Top 25% of class`,
        positive: false
      });
    } else {
      baseChance -= 5;
      factors.push({ 
        name: 'Class Rank', 
        impact: '-5%', 
        details: `Below top 25% of class`,
        positive: false
      });
    }
  } else if (studentProfile.class_rank && studentProfile.class_size) {
    // Calculate percentile from rank
    const percentile = ((studentProfile.class_size - studentProfile.class_rank) / studentProfile.class_size) * 100;
    
    if (percentile >= 95) {
      baseChance += 10;
      factors.push({ name: 'Class Rank', impact: '+10%', details: `Rank ${studentProfile.class_rank}/${studentProfile.class_size}`, positive: true });
    } else if (percentile >= 90) {
      baseChance += 5;
      factors.push({ name: 'Class Rank', impact: '+5%', details: `Top 10%`, positive: true });
    } else if (percentile >= 75) {
      baseChance += 0;
      factors.push({ name: 'Class Rank', impact: '0%', details: `Top 25%`, positive: false });
    } else {
      baseChance -= 5;
      factors.push({ name: 'Class Rank', impact: '-5%', details: `Below top 25%`, positive: false });
    }
  }
  
  // ==========================================
  // FACTOR 4: Course Rigor (10% weight)
  // ==========================================
  const coursework = studentProfile.coursework || [];
  const apIbCount = coursework.filter(c => 
    c.course_level === 'AP' || c.course_level === 'IB' || c.course_level === 'Dual Enrollment'
  ).length;
  
  if (apIbCount >= 10) {
    baseChance += 8;
    factors.push({ 
      name: 'Course Rigor', 
      impact: '+8%', 
      details: `${apIbCount} AP/IB/DE courses - Exceptional rigor`,
      positive: true
    });
  } else if (apIbCount >= 6) {
    baseChance += 4;
    factors.push({ 
      name: 'Course Rigor', 
      impact: '+4%', 
      details: `${apIbCount} AP/IB/DE courses - Strong rigor`,
      positive: true
    });
  } else if (apIbCount >= 3) {
    baseChance += 0;
    factors.push({ 
      name: 'Course Rigor', 
      impact: '0%', 
      details: `${apIbCount} AP/IB/DE courses - Average rigor`,
      positive: false
    });
  } else {
    baseChance -= 5;
    factors.push({ 
      name: 'Course Rigor', 
      impact: '-5%', 
      details: `${apIbCount} AP/IB/DE courses - Limited rigor`,
      positive: false
    });
  }
  
  // ==========================================
  // FACTOR 5: Extracurriculars (10% weight)
  // ==========================================
  const activities = studentProfile.activities || [];
  const tier1Activities = activities.filter(a => a.tier_rating === 1).length;
  const tier2Activities = activities.filter(a => a.tier_rating === 2).length;
  const tier3Activities = activities.filter(a => a.tier_rating === 3).length;
  
  if (tier1Activities >= 2) {
    baseChance += 10;
    factors.push({ 
      name: 'Extracurriculars', 
      impact: '+10%', 
      details: `${tier1Activities} national/international level achievements`,
      positive: true
    });
  } else if (tier1Activities >= 1 || tier2Activities >= 2) {
    baseChance += 5;
    factors.push({ 
      name: 'Extracurriculars', 
      impact: '+5%', 
      details: `Strong state/regional achievements`,
      positive: true
    });
  } else if (tier2Activities >= 1 || tier3Activities >= 3) {
    baseChance += 2;
    factors.push({ 
      name: 'Extracurriculars', 
      impact: '+2%', 
      details: `Good leadership and involvement`,
      positive: true
    });
  } else {
    baseChance += 0;
    factors.push({ 
      name: 'Extracurriculars', 
      impact: '0%', 
      details: `Standard participation`,
      positive: false
    });
  }
  
  // ==========================================
  // FACTOR 6: In-State Advantage (5% weight)
  // ==========================================
  const collegeType = college.institution_type || college.type;
  if (collegeType === 'Public' && studentProfile.state_province === college.location_state) {
    baseChance += 5;
    factors.push({ 
      name: 'In-State', 
      impact: '+5%', 
      details: `In-state applicant advantage`,
      positive: true
    });
  }
  
  // ==========================================
  // FACTOR 7: Demographics (5% weight)
  // ==========================================
  if (studentProfile.is_first_generation) {
    baseChance += 3;
    factors.push({ 
      name: 'First-Gen', 
      impact: '+3%', 
      details: `First-generation college student`,
      positive: true
    });
  }
  
  if (studentProfile.is_legacy) {
    baseChance += 5;
    factors.push({ 
      name: 'Legacy', 
      impact: '+5%', 
      details: `Legacy applicant advantage`,
      positive: true
    });
  }
  
  // ==========================================
  // ADJUSTMENT: Overall Acceptance Rate
  // ==========================================
  const acceptanceRate = college.acceptance_rate || 0.5;
  
  // Lower acceptance rate = multiply by difficulty factor
  const difficultyMultiplier = Math.max(0.3, Math.min(1.5, acceptanceRate / 0.5));
  baseChance = baseChance * difficultyMultiplier;
  
  // Add acceptance rate context
  if (acceptanceRate < 0.10) {
    factors.push({ 
      name: 'Selectivity', 
      impact: 'Very High', 
      details: `${(acceptanceRate * 100).toFixed(1)}% acceptance rate - Highly selective`,
      positive: false
    });
  } else if (acceptanceRate < 0.25) {
    factors.push({ 
      name: 'Selectivity', 
      impact: 'High', 
      details: `${(acceptanceRate * 100).toFixed(1)}% acceptance rate - Selective`,
      positive: false
    });
  } else if (acceptanceRate > 0.60) {
    factors.push({ 
      name: 'Selectivity', 
      impact: 'Low', 
      details: `${(acceptanceRate * 100).toFixed(1)}% acceptance rate - More accessible`,
      positive: true
    });
  }
  
  // Clamp between 5% and 95%
  const finalChance = Math.max(5, Math.min(95, Math.round(baseChance)));
  
  // Determine category
  let category;
  if (finalChance >= 60) {
    category = 'Safety';
  } else if (finalChance >= 30) {
    category = 'Target';
  } else {
    category = 'Reach';
  }
  
  // Generate recommendation text
  const recommendation = category === 'Safety' 
    ? 'Good fit - likely acceptance. Consider this a solid option.'
    : category === 'Target' 
    ? 'Competitive - you have a reasonable chance. Strong application can make the difference.'
    : 'Challenging - lower chance but worth applying if it\'s your dream school.';
  
  return {
    chance: finalChance,
    category: category,
    factors: factors,
    recommendation: recommendation,
    acceptanceRate: acceptanceRate,
    debug: {
      baseChance: 50,
      adjustedChance: baseChance,
      difficultyMultiplier: difficultyMultiplier
    }
  };
}

/**
 * Calculate percentile within a range
 */
function calculatePercentile(value, low, high) {
  if (value <= low) return 0;
  if (value >= high) return 100;
  return ((value - low) / (high - low)) * 100;
}

/**
 * Calculate JEE-based chances for Indian colleges
 */
function calculateJEEChance(studentProfile, college) {
  // Get JEE cutoffs from college data
  const cutoffs = college.jee_cutoffs || {};
  const studentCategory = studentProfile.category || 'general';
  const cutoff = cutoffs[studentCategory] || cutoffs.general || 10000;
  
  let predictedRank;
  
  if (studentProfile.jee_advanced_rank) {
    predictedRank = studentProfile.jee_advanced_rank;
  } else if (studentProfile.jee_main_percentile) {
    // Estimate rank from percentile
    // Approximate: 100 - percentile gives top X%, 10 lakh candidates
    predictedRank = Math.round((100 - studentProfile.jee_main_percentile) * 10000);
  } else {
    return { chance: 50, category: 'Unknown', factors: [{ name: 'JEE Data', impact: 'Missing', details: 'JEE score not provided' }] };
  }
  
  const factors = [];
  let chance;
  let category;
  
  if (predictedRank <= cutoff * 0.5) {
    chance = 90;
    category = 'Safety';
    factors.push({ name: 'JEE Rank', impact: '+40%', details: `Rank ${predictedRank} is well within cutoff ${cutoff}`, positive: true });
  } else if (predictedRank <= cutoff * 0.8) {
    chance = 70;
    category = 'Target';
    factors.push({ name: 'JEE Rank', impact: '+20%', details: `Rank ${predictedRank} is within safe range`, positive: true });
  } else if (predictedRank <= cutoff) {
    chance = 50;
    category = 'Target';
    factors.push({ name: 'JEE Rank', impact: '0%', details: `Rank ${predictedRank} is near cutoff ${cutoff}`, positive: false });
  } else if (predictedRank <= cutoff * 1.2) {
    chance = 20;
    category = 'Reach';
    factors.push({ name: 'JEE Rank', impact: '-30%', details: `Rank ${predictedRank} is above cutoff ${cutoff}`, positive: false });
  } else {
    chance = 5;
    category = 'Reach';
    factors.push({ name: 'JEE Rank', impact: '-45%', details: `Rank ${predictedRank} is significantly above cutoff`, positive: false });
  }
  
  return { chance, category, factors, recommendation: getRecommendation(category) };
}

/**
 * Calculate UK university chances
 */
function calculateUKChance(studentProfile, college) {
  const factors = [];
  let chance = 50;
  
  // A-Levels to UCAS points conversion (rough)
  const aLevelPoints = {
    'A*': 56, 'A': 48, 'B': 40, 'C': 32, 'D': 24, 'E': 16
  };
  
  if (studentProfile.predicted_a_levels) {
    const grades = studentProfile.predicted_a_levels.replace(/\s/g, '').match(/A\*|[A-E]/g) || [];
    const totalPoints = grades.reduce((sum, g) => sum + (aLevelPoints[g] || 0), 0);
    const requiredPoints = college.typical_ucas_points || 128;
    
    if (totalPoints >= requiredPoints + 20) {
      chance = 75;
      factors.push({ name: 'A-Levels', impact: '+25%', details: `${grades.join('')} exceeds typical offer`, positive: true });
    } else if (totalPoints >= requiredPoints) {
      chance = 50;
      factors.push({ name: 'A-Levels', impact: '0%', details: `${grades.join('')} meets typical offer`, positive: false });
    } else if (totalPoints >= requiredPoints - 16) {
      chance = 30;
      factors.push({ name: 'A-Levels', impact: '-20%', details: `${grades.join('')} slightly below typical offer`, positive: false });
    } else {
      chance = 10;
      factors.push({ name: 'A-Levels', impact: '-40%', details: `${grades.join('')} below typical offer`, positive: false });
    }
  } else if (studentProfile.ib_predicted_score) {
    const ibScore = studentProfile.ib_predicted_score;
    const requiredIB = college.typical_ib_score || 36;
    
    if (ibScore >= requiredIB + 3) {
      chance = 75;
      factors.push({ name: 'IB Score', impact: '+25%', details: `${ibScore} exceeds typical offer (${requiredIB})`, positive: true });
    } else if (ibScore >= requiredIB) {
      chance = 50;
      factors.push({ name: 'IB Score', impact: '0%', details: `${ibScore} meets typical offer`, positive: false });
    } else if (ibScore >= requiredIB - 2) {
      chance = 30;
      factors.push({ name: 'IB Score', impact: '-20%', details: `${ibScore} slightly below typical offer`, positive: false });
    } else {
      chance = 10;
      factors.push({ name: 'IB Score', impact: '-40%', details: `${ibScore} below typical offer`, positive: false });
    }
  }
  
  // Determine category
  let category;
  if (chance >= 60) category = 'Target';
  else if (chance >= 30) category = 'Reach';
  else category = 'Reach';
  
  return { chance, category, factors, recommendation: getRecommendation(category) };
}

/**
 * Calculate German university chances
 */
function calculateGermanChance(studentProfile, college) {
  const factors = [];
  let chance = 50;
  
  // Check if NC (Numerus Clausus) restricted
  if (!college.has_nc) {
    return { 
      chance: 95, 
      category: 'Safety', 
      factors: [{ name: 'No NC', impact: '+45%', details: 'No Numerus Clausus restriction', positive: true }],
      recommendation: 'Open admission - high chance of acceptance'
    };
  }
  
  if (studentProfile.abitur_grade) {
    const studentGrade = studentProfile.abitur_grade;
    const ncGrade = college.nc_grade || 2.0;
    
    // In German grades, lower is better (1.0 = perfect, 4.0 = passing)
    if (studentGrade <= ncGrade - 0.5) {
      chance = 90;
      factors.push({ name: 'Abitur', impact: '+40%', details: `${studentGrade} is well above NC (${ncGrade})`, positive: true });
    } else if (studentGrade <= ncGrade) {
      chance = 70;
      factors.push({ name: 'Abitur', impact: '+20%', details: `${studentGrade} meets NC (${ncGrade})`, positive: true });
    } else if (studentGrade <= ncGrade + 0.3) {
      chance = 30;
      factors.push({ name: 'Abitur', impact: '-20%', details: `${studentGrade} is slightly below NC (${ncGrade})`, positive: false });
    } else {
      chance = 5;
      factors.push({ name: 'Abitur', impact: '-45%', details: `${studentGrade} is below NC (${ncGrade})`, positive: false });
    }
  }
  
  // Check German proficiency
  if (studentProfile.german_proficiency) {
    const level = studentProfile.german_proficiency.toUpperCase();
    if (['C1', 'C2'].includes(level)) {
      factors.push({ name: 'German Level', impact: '+5%', details: `${level} - Native-like proficiency`, positive: true });
      chance += 5;
    } else if (level === 'B2') {
      factors.push({ name: 'German Level', impact: '0%', details: `${level} - University level`, positive: false });
    } else {
      factors.push({ name: 'German Level', impact: '-10%', details: `${level} - May need to improve`, positive: false });
      chance -= 10;
    }
  }
  
  chance = Math.max(5, Math.min(95, chance));
  
  let category;
  if (chance >= 60) category = 'Safety';
  else if (chance >= 30) category = 'Target';
  else category = 'Reach';
  
  return { chance, category, factors, recommendation: getRecommendation(category) };
}

/**
 * Get recommendation text based on category
 */
function getRecommendation(category) {
  switch(category) {
    case 'Safety':
      return 'Good fit - likely acceptance. Consider this a solid option.';
    case 'Target':
      return 'Competitive - you have a reasonable chance. Strong application can make the difference.';
    case 'Reach':
      return 'Challenging - lower chance but worth applying if it\'s your dream school.';
    default:
      return 'Unable to calculate - please complete your profile.';
  }
}

/**
 * Get chancing for a student across multiple colleges
 */
function getChancingForStudent(userId, colleges) {
  const profile = StudentProfile.getCompleteProfile(userId);
  
  if (!profile) {
    return {
      error: 'Profile not found',
      message: 'Please complete your student profile to get chancing results.'
    };
  }
  
  const results = [];
  
  for (const college of colleges) {
    const country = college.location_country || college.country || 'USA';
    let chancing;
    
    // Use country-specific calculator
    if (country === 'India' && (profile.jee_main_percentile || profile.jee_advanced_rank)) {
      chancing = calculateJEEChance(profile, college);
    } else if (country === 'UK' && (profile.predicted_a_levels || profile.ib_predicted_score)) {
      chancing = calculateUKChance(profile, college);
    } else if (country === 'Germany' && profile.abitur_grade) {
      chancing = calculateGermanChance(profile, college);
    } else {
      // Default to US-style calculator
      chancing = calculateAdmissionChance(profile, college);
    }
    
    results.push({
      college: {
        id: college.id,
        name: college.name,
        location: `${college.location_city || ''}, ${college.location_state || ''} ${country}`.trim(),
        acceptanceRate: college.acceptance_rate
      },
      chancing: chancing
    });
  }
  
  // Sort by chance (descending)
  results.sort((a, b) => b.chancing.chance - a.chancing.chance);
  
  // Group by category
  const grouped = {
    safety: results.filter(r => r.chancing.category === 'Safety'),
    target: results.filter(r => r.chancing.category === 'Target'),
    reach: results.filter(r => r.chancing.category === 'Reach')
  };
  
  return {
    profile: {
      name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Student',
      gpa: profile.gpa_unweighted || profile.gpa_weighted,
      sat: profile.sat_total,
      act: profile.act_composite,
      activitiesCount: (profile.activities || []).length,
      tier1Count: (profile.activities || []).filter(a => a.tier_rating === 1).length
    },
    results: results,
    grouped: grouped,
    summary: {
      total: results.length,
      safetyCount: grouped.safety.length,
      targetCount: grouped.target.length,
      reachCount: grouped.reach.length,
      averageChance: Math.round(results.reduce((sum, r) => sum + r.chancing.chance, 0) / results.length) || 0
    }
  };
}

module.exports = {
  calculateAdmissionChance,
  calculateJEEChance,
  calculateUKChance,
  calculateGermanChance,
  getChancingForStudent
};

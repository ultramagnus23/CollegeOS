/**
 * CDSChancingService.js
 * Enhanced chancing calculator using Common Data Set (CDS) information
 * Provides more accurate admissions probability based on actual institutional data
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
    logger.info(`Loaded CDS data for ${Object.keys(cdsData).length} colleges`);
    return cdsData;
  } catch (error) {
    logger.warn('Could not load CDS data:', error.message);
    return {};
  }
}

/**
 * Get CDS key from college name
 * @param {string} collegeName - College name
 * @returns {string|null} CDS key or null
 */
function getCDSKey(collegeName) {
  const data = loadCDSData();
  
  // Direct match
  const normalized = collegeName.toLowerCase()
    .replace(/university of /g, '')
    .replace(/university/g, '')
    .replace(/ college/g, '')
    .replace(/ /g, '_')
    .replace(/[^a-z_]/g, '')
    .trim();
  
  // Try direct lookup
  for (const key of Object.keys(data)) {
    if (key === normalized) return key;
    if (data[key].college_name.toLowerCase() === collegeName.toLowerCase()) return key;
    if (key.includes(normalized) || normalized.includes(key)) return key;
  }
  
  return null;
}

/**
 * Calculate percentile position in admitted student range
 * @param {number} studentValue - Student's value
 * @param {number} p25 - 25th percentile
 * @param {number} p75 - 75th percentile
 * @returns {number} Percentile position (0-100)
 */
function calculatePercentilePosition(studentValue, p25, p75) {
  if (!studentValue || !p25 || !p75) return 50;
  
  if (studentValue >= p75) {
    // Above 75th percentile
    const extraPercent = Math.min(25, ((studentValue - p75) / (p75 - p25)) * 50);
    return 75 + extraPercent;
  } else if (studentValue >= p25) {
    // Between 25th and 75th
    const position = ((studentValue - p25) / (p75 - p25)) * 50;
    return 25 + position;
  } else {
    // Below 25th percentile
    const deficit = Math.min(25, ((p25 - studentValue) / (p75 - p25)) * 50);
    return Math.max(0, 25 - deficit);
  }
}

/**
 * Convert CDS factor importance to numeric weight
 * @param {string} importance - CDS importance value
 * @returns {number} Numeric weight
 */
function getFactorWeight(importance) {
  if (!factorScale) loadCDSData();
  return factorScale?.[importance] || 0.5;
}

/**
 * Calculate admission chances using CDS data
 * @param {Object} studentProfile - Complete student profile
 * @param {Object} college - College data
 * @returns {Object} Chancing result with detailed breakdown
 */
function calculateCDSChance(studentProfile, college) {
  const collegeName = college.name;
  const cdsKey = getCDSKey(collegeName);
  
  // If no CDS data available, return null to trigger fallback
  if (!cdsKey) {
    return null;
  }
  
  const data = loadCDSData();
  const cds = data[cdsKey];
  
  if (!cds) return null;
  
  const factors = [];
  let totalScore = 0;
  let totalWeight = 0;
  const improvements = [];
  const comparisonToAdmitted = {};
  
  // ==========================================
  // ACADEMIC FACTORS
  // ==========================================
  
  // 1. SAT Score Analysis
  if (studentProfile.sat_total && cds.test_scores.sat_25th) {
    const satPercentile = calculatePercentilePosition(
      studentProfile.sat_total,
      cds.test_scores.sat_25th,
      cds.test_scores.sat_75th
    );
    
    const satWeight = getFactorWeight(cds.academic_factors.standardized_test_scores) * 0.3;
    const satScore = satPercentile;
    
    totalScore += satScore * satWeight;
    totalWeight += satWeight;
    
    comparisonToAdmitted.sat = {
      student: studentProfile.sat_total,
      p25: cds.test_scores.sat_25th,
      p75: cds.test_scores.sat_75th,
      percentile: satPercentile
    };
    
    factors.push({
      name: 'SAT Score',
      importance: cds.academic_factors.standardized_test_scores,
      score: Math.round(satScore),
      weight: satWeight,
      impact: satPercentile >= 50 ? 'positive' : satPercentile >= 25 ? 'neutral' : 'negative',
      details: `Your SAT (${studentProfile.sat_total}) is at the ${Math.round(satPercentile)}th percentile of admitted students (${cds.test_scores.sat_25th}-${cds.test_scores.sat_75th})`,
      improvementPotential: satPercentile < 75 ? Math.round((cds.test_scores.sat_75th - studentProfile.sat_total)) : 0
    });
    
    if (satPercentile < 50) {
      improvements.push({
        area: 'SAT Score',
        currentValue: studentProfile.sat_total,
        targetValue: cds.test_scores.sat_75th,
        impact: 'Raising your SAT to 75th percentile would significantly improve your chances',
        pointsNeeded: cds.test_scores.sat_75th - studentProfile.sat_total
      });
    }
  }
  
  // 2. ACT Score Analysis
  if (studentProfile.act_composite && cds.test_scores.act_25th) {
    const actPercentile = calculatePercentilePosition(
      studentProfile.act_composite,
      cds.test_scores.act_25th,
      cds.test_scores.act_75th
    );
    
    const actWeight = getFactorWeight(cds.academic_factors.standardized_test_scores) * 0.3;
    const actScore = actPercentile;
    
    // Only add if SAT wasn't already counted
    if (!studentProfile.sat_total) {
      totalScore += actScore * actWeight;
      totalWeight += actWeight;
    }
    
    comparisonToAdmitted.act = {
      student: studentProfile.act_composite,
      p25: cds.test_scores.act_25th,
      p75: cds.test_scores.act_75th,
      percentile: actPercentile
    };
    
    factors.push({
      name: 'ACT Score',
      importance: cds.academic_factors.standardized_test_scores,
      score: Math.round(actScore),
      weight: actWeight,
      impact: actPercentile >= 50 ? 'positive' : actPercentile >= 25 ? 'neutral' : 'negative',
      details: `Your ACT (${studentProfile.act_composite}) is at the ${Math.round(actPercentile)}th percentile of admitted students (${cds.test_scores.act_25th}-${cds.test_scores.act_75th})`
    });
  }
  
  // 3. GPA Analysis
  const studentGPA = studentProfile.gpa_unweighted || studentProfile.gpa_weighted;
  if (studentGPA && cds.gpa_data.average_gpa) {
    // Estimate percentile based on average GPA and distributions
    let gpaPercentile;
    if (studentGPA >= cds.gpa_data.average_gpa + 0.1) {
      gpaPercentile = 60 + Math.min(35, (studentGPA - cds.gpa_data.average_gpa) * 70);
    } else if (studentGPA >= cds.gpa_data.average_gpa - 0.1) {
      gpaPercentile = 50;
    } else {
      gpaPercentile = Math.max(10, 50 - (cds.gpa_data.average_gpa - studentGPA) * 70);
    }
    
    const gpaWeight = getFactorWeight(cds.academic_factors.academic_gpa) * 0.35;
    
    totalScore += gpaPercentile * gpaWeight;
    totalWeight += gpaWeight;
    
    comparisonToAdmitted.gpa = {
      student: studentGPA,
      average: cds.gpa_data.average_gpa,
      percentile: gpaPercentile
    };
    
    factors.push({
      name: 'GPA',
      importance: cds.academic_factors.academic_gpa,
      score: Math.round(gpaPercentile),
      weight: gpaWeight,
      impact: gpaPercentile >= 50 ? 'positive' : 'negative',
      details: `Your GPA (${studentGPA.toFixed(2)}) vs average admitted (${cds.gpa_data.average_gpa.toFixed(2)})`,
      improvementPotential: gpaPercentile < 60 ? 'GPA improvement would strengthen your application' : null
    });
    
    if (gpaPercentile < 40) {
      improvements.push({
        area: 'GPA',
        currentValue: studentGPA,
        targetValue: cds.gpa_data.average_gpa,
        impact: 'Improving your GPA to match the average admitted student would help'
      });
    }
  }
  
  // 4. Course Rigor Analysis
  const coursework = studentProfile.coursework || [];
  const apIbCount = coursework.filter(c => 
    c.course_level === 'AP' || c.course_level === 'IB' || c.course_level === 'Dual Enrollment'
  ).length;
  
  const rigorWeight = getFactorWeight(cds.academic_factors.rigor_of_secondary_school) * 0.2;
  let rigorScore;
  
  if (apIbCount >= 12) {
    rigorScore = 95;
  } else if (apIbCount >= 8) {
    rigorScore = 80;
  } else if (apIbCount >= 5) {
    rigorScore = 65;
  } else if (apIbCount >= 3) {
    rigorScore = 50;
  } else {
    rigorScore = 30;
  }
  
  totalScore += rigorScore * rigorWeight;
  totalWeight += rigorWeight;
  
  factors.push({
    name: 'Course Rigor',
    importance: cds.academic_factors.rigor_of_secondary_school,
    score: rigorScore,
    weight: rigorWeight,
    impact: rigorScore >= 60 ? 'positive' : 'neutral',
    details: `${apIbCount} AP/IB/DE courses - ${rigorScore >= 80 ? 'Exceptional' : rigorScore >= 60 ? 'Strong' : 'Could be stronger'}`
  });
  
  // ==========================================
  // NONACADEMIC FACTORS
  // ==========================================
  
  // 5. Extracurricular Activities
  const activities = studentProfile.activities || [];
  const tier1Activities = activities.filter(a => a.tier_rating === 1).length;
  const tier2Activities = activities.filter(a => a.tier_rating === 2).length;
  const tier3Activities = activities.filter(a => a.tier_rating === 3).length;
  
  const ecWeight = getFactorWeight(cds.nonacademic_factors.extracurricular_activities) * 0.25;
  let ecScore;
  
  if (tier1Activities >= 2) {
    ecScore = 95;
  } else if (tier1Activities >= 1 || tier2Activities >= 3) {
    ecScore = 80;
  } else if (tier2Activities >= 2 || tier3Activities >= 5) {
    ecScore = 65;
  } else if (tier2Activities >= 1 || tier3Activities >= 3) {
    ecScore = 50;
  } else {
    ecScore = 30;
  }
  
  totalScore += ecScore * ecWeight;
  totalWeight += ecWeight;
  
  factors.push({
    name: 'Extracurriculars',
    importance: cds.nonacademic_factors.extracurricular_activities,
    score: ecScore,
    weight: ecWeight,
    impact: ecScore >= 60 ? 'positive' : 'neutral',
    details: `${tier1Activities} national, ${tier2Activities} state/regional, ${tier3Activities} school-level achievements`
  });
  
  if (ecScore < 65) {
    improvements.push({
      area: 'Extracurriculars',
      impact: 'Developing stronger extracurricular involvement or achieving higher-tier recognition would help'
    });
  }
  
  // 6. First-Generation Status
  if (studentProfile.is_first_generation) {
    const fgWeight = getFactorWeight(cds.nonacademic_factors.first_generation) * 0.1;
    totalScore += 70 * fgWeight;
    totalWeight += fgWeight;
    
    factors.push({
      name: 'First-Generation',
      importance: cds.nonacademic_factors.first_generation,
      score: 70,
      weight: fgWeight,
      impact: 'positive',
      details: 'First-generation status is a hook at this college'
    });
  }
  
  // 7. Legacy Status
  if (studentProfile.is_legacy) {
    const legacyWeight = getFactorWeight(cds.nonacademic_factors.alumni_relation) * 0.1;
    totalScore += 75 * legacyWeight;
    totalWeight += legacyWeight;
    
    factors.push({
      name: 'Legacy',
      importance: cds.nonacademic_factors.alumni_relation,
      score: 75,
      weight: legacyWeight,
      impact: 'positive',
      details: 'Legacy connection can provide an advantage'
    });
  }
  
  // ==========================================
  // CALCULATE FINAL PROBABILITY
  // ==========================================
  
  // Normalize score
  const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 50;
  
  // Apply acceptance rate adjustment
  // Lower acceptance rate = harder to get in
  const acceptanceRate = cds.acceptance_rate || 0.5;
  
  // Use logistic-like curve to map normalized score to probability
  // Adjust based on acceptance rate
  let probability;
  
  if (acceptanceRate < 0.10) {
    // Ultra-selective (Ivy League level)
    probability = normalizedScore * 0.4 * (acceptanceRate / 0.05);
  } else if (acceptanceRate < 0.25) {
    // Very selective
    probability = normalizedScore * 0.6 * (acceptanceRate / 0.15);
  } else if (acceptanceRate < 0.50) {
    // Selective
    probability = normalizedScore * 0.8 * (acceptanceRate / 0.30);
  } else {
    // Less selective
    probability = normalizedScore * (acceptanceRate / 0.50);
  }
  
  // Cap at realistic ranges
  probability = Math.max(1, Math.min(95, probability));
  
  // Determine category
  let category;
  if (probability >= 65) {
    category = 'safety';
  } else if (probability >= 25) {
    category = 'target';
  } else {
    category = 'reach';
  }
  
  // Calculate confidence based on data completeness
  let dataPoints = 0;
  let availablePoints = 0;
  
  if (studentProfile.sat_total || studentProfile.act_composite) { dataPoints++; availablePoints++; }
  else { dataPoints++; }
  
  if (studentGPA) { dataPoints++; availablePoints++; }
  else { dataPoints++; }
  
  if (activities.length > 0) { dataPoints++; availablePoints++; }
  else { dataPoints++; }
  
  const confidence = availablePoints / dataPoints;
  
  return {
    percentage: Math.round(probability),
    category,
    confidence,
    confidenceLevel: confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low',
    factors: factors.sort((a, b) => b.weight - a.weight),
    cdsBasedCalculation: true,
    cdsYear: cds.year,
    collegeAcceptanceRate: (cds.acceptance_rate * 100).toFixed(1) + '%',
    comparisonToAdmitted,
    improvements: improvements.slice(0, 3),
    strengthAreas: factors.filter(f => f.impact === 'positive').map(f => f.name),
    improvementAreas: factors.filter(f => f.impact === 'negative').map(f => f.name)
  };
}

/**
 * Check if CDS data is available for a college
 * @param {string} collegeName - College name
 * @returns {boolean} True if CDS data exists
 */
function hasCDSData(collegeName) {
  return getCDSKey(collegeName) !== null;
}

/**
 * Get list of colleges with CDS data
 * @returns {string[]} List of college names
 */
function getCollegesWithCDS() {
  const data = loadCDSData();
  return Object.values(data).map(c => c.college_name);
}

module.exports = {
  calculateCDSChance,
  hasCDSData,
  getCollegesWithCDS,
  getCDSKey,
  loadCDSData
};

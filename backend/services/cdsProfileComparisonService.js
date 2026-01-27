// backend/services/cdsProfileComparisonService.js
// CDS (Common Data Set) Profile Comparison Service
// Compares user profile against official CDS admission data
// NO ML, NO PROBABILITY PREDICTIONS - Only factual comparisons

const dbManager = require('../src/config/database');

/**
 * Status labels for profile comparison
 */
const STATUS_LABELS = {
  WELL_ABOVE: 'Well above average',
  ABOVE: 'Above average',
  AVERAGE: 'About average',
  BELOW: 'Below average',
  WELL_BELOW: 'Well below average',
  UNAVAILABLE: 'Data unavailable'
};

/**
 * Compare user profile against a college's CDS data
 * Returns dimension-by-dimension comparison without probability predictions
 * 
 * @param {Object} userProfile - User's academic profile
 * @param {Object} college - College object with CDS data
 * @returns {Object} Profile comparison result
 */
function compareProfile(userProfile, college) {
  if (!college) {
    return {
      success: false,
      error: 'College not found',
      collegeName: null,
      comparisons: [],
      overallFit: null
    };
  }

  const comparisons = [];
  let matchingDimensions = 0;
  let totalDimensions = 0;

  // 1. GPA Comparison
  const gpaComparison = compareGPA(userProfile, college);
  if (gpaComparison) {
    comparisons.push(gpaComparison);
    totalDimensions++;
    if (['WELL_ABOVE', 'ABOVE', 'AVERAGE'].includes(gpaComparison.statusKey)) {
      matchingDimensions++;
    }
  }

  // 2. SAT Comparison
  const satComparison = compareSAT(userProfile, college);
  if (satComparison) {
    comparisons.push(satComparison);
    totalDimensions++;
    if (['WELL_ABOVE', 'ABOVE', 'AVERAGE'].includes(satComparison.statusKey)) {
      matchingDimensions++;
    }
  }

  // 3. ACT Comparison
  const actComparison = compareACT(userProfile, college);
  if (actComparison) {
    comparisons.push(actComparison);
    totalDimensions++;
    if (['WELL_ABOVE', 'ABOVE', 'AVERAGE'].includes(actComparison.statusKey)) {
      matchingDimensions++;
    }
  }

  // 4. Class Rigor Assessment (if available)
  const rigorComparison = assessRigor(userProfile, college);
  if (rigorComparison) {
    comparisons.push(rigorComparison);
  }

  // 5. Extracurricular Assessment
  const ecComparison = assessExtracurriculars(userProfile, college);
  if (ecComparison) {
    comparisons.push(ecComparison);
  }

  // Calculate overall fit category (not probability!)
  const overallFit = calculateOverallFit(matchingDimensions, totalDimensions, college);

  return {
    success: true,
    collegeName: college.name,
    collegeId: college.id,
    acceptanceRate: college.acceptance_rate,
    dataSource: college.admission_data_source || 'Common Data Set',
    dataYear: college.admission_data_year || college.cds_year || 2024,
    comparisons,
    overallFit,
    admissionFactors: getAdmissionFactors(college),
    disclaimer: 'This comparison shows how your profile compares to typical admitted students. It is not a prediction of admission probability.'
  };
}

/**
 * Compare user's GPA against college's admitted student GPA
 */
function compareGPA(userProfile, college) {
  const userGPA = userProfile.gpa || 
                  userProfile.academic?.gpa || 
                  (userProfile.percentage ? userProfile.percentage / 25 : null);
  
  if (!userGPA) {
    return null;
  }

  const collegeGPA = {
    avg: college.gpa_avg,
    percentile25: college.gpa_25 || (college.gpa_avg ? college.gpa_avg - 0.1 : null),
    percentile75: college.gpa_75 || (college.gpa_avg ? Math.min(4.0, college.gpa_avg + 0.05) : null),
    percent375Plus: college.percent_gpa_375_plus
  };

  if (!collegeGPA.avg && !collegeGPA.percentile25 && !collegeGPA.percentile75) {
    return {
      dimension: 'GPA',
      userValue: userGPA.toFixed(2),
      collegeRange: 'Not reported',
      status: STATUS_LABELS.UNAVAILABLE,
      statusKey: 'UNAVAILABLE',
      explanation: 'This college does not report GPA statistics in their Common Data Set.'
    };
  }

  // Determine status based on percentiles
  let status, statusKey, explanation;
  
  if (collegeGPA.percentile75 && userGPA >= collegeGPA.percentile75) {
    status = STATUS_LABELS.WELL_ABOVE;
    statusKey = 'WELL_ABOVE';
    explanation = `Your GPA of ${userGPA.toFixed(2)} is at or above the 75th percentile (${collegeGPA.percentile75?.toFixed(2)}) of admitted students.`;
  } else if (collegeGPA.avg && userGPA >= collegeGPA.avg) {
    status = STATUS_LABELS.ABOVE;
    statusKey = 'ABOVE';
    explanation = `Your GPA of ${userGPA.toFixed(2)} is above the average (${collegeGPA.avg?.toFixed(2)}) of admitted students.`;
  } else if (collegeGPA.percentile25 && userGPA >= collegeGPA.percentile25) {
    status = STATUS_LABELS.AVERAGE;
    statusKey = 'AVERAGE';
    explanation = `Your GPA of ${userGPA.toFixed(2)} falls within the typical range (${collegeGPA.percentile25?.toFixed(2)}-${collegeGPA.percentile75?.toFixed(2)}) of admitted students.`;
  } else if (collegeGPA.percentile25 && userGPA >= collegeGPA.percentile25 - 0.2) {
    status = STATUS_LABELS.BELOW;
    statusKey = 'BELOW';
    explanation = `Your GPA of ${userGPA.toFixed(2)} is slightly below the 25th percentile (${collegeGPA.percentile25?.toFixed(2)}) of admitted students.`;
  } else {
    status = STATUS_LABELS.WELL_BELOW;
    statusKey = 'WELL_BELOW';
    explanation = `Your GPA of ${userGPA.toFixed(2)} is significantly below the typical range of admitted students.`;
  }

  // Format college range string
  let collegeRange;
  if (collegeGPA.percentile25 && collegeGPA.percentile75) {
    collegeRange = `${collegeGPA.percentile25.toFixed(2)}–${collegeGPA.percentile75.toFixed(2)}`;
  } else if (collegeGPA.avg) {
    collegeRange = `~${collegeGPA.avg.toFixed(2)} average`;
  } else {
    collegeRange = 'Not reported';
  }

  // Add GPA distribution info if available
  let distribution = null;
  if (college.percent_gpa_375_plus) {
    distribution = {
      '3.75+': college.percent_gpa_375_plus,
      '3.50-3.74': college.percent_gpa_350_374,
      '3.25-3.49': college.percent_gpa_325_349,
      '3.00-3.24': college.percent_gpa_300_324
    };
  }

  return {
    dimension: 'GPA',
    userValue: userGPA.toFixed(2),
    collegeRange,
    collegeAverage: collegeGPA.avg?.toFixed(2),
    status,
    statusKey,
    explanation,
    distribution
  };
}

/**
 * Compare user's SAT score against college's admitted student SAT range
 */
function compareSAT(userProfile, college) {
  // Get user's SAT score (composite)
  const userSAT = userProfile.exams?.SAT?.score || 
                  userProfile.testStatus?.satScore ||
                  userProfile.sat_score ||
                  null;
  
  if (!userSAT) {
    return null;
  }

  // Get college's SAT data
  const collegeSAT = {
    reading25: college.sat_reading_25,
    reading75: college.sat_reading_75,
    math25: college.sat_math_25,
    math75: college.sat_math_75,
    total25: (college.sat_reading_25 || 0) + (college.sat_math_25 || 0),
    total75: (college.sat_reading_75 || 0) + (college.sat_math_75 || 0),
    percentSubmitting: college.percent_submitting_sat
  };

  if (!collegeSAT.reading25 && !collegeSAT.math25) {
    return {
      dimension: 'SAT',
      userValue: userSAT.toString(),
      collegeRange: 'Not reported',
      status: STATUS_LABELS.UNAVAILABLE,
      statusKey: 'UNAVAILABLE',
      explanation: 'This college does not report SAT statistics.'
    };
  }

  const total25 = collegeSAT.total25 || 1200;
  const total75 = collegeSAT.total75 || 1500;
  const midpoint = (total25 + total75) / 2;

  let status, statusKey, explanation;

  if (userSAT >= total75) {
    status = STATUS_LABELS.WELL_ABOVE;
    statusKey = 'WELL_ABOVE';
    explanation = `Your SAT score of ${userSAT} is at or above the 75th percentile (${total75}) of admitted students.`;
  } else if (userSAT >= midpoint) {
    status = STATUS_LABELS.ABOVE;
    statusKey = 'ABOVE';
    explanation = `Your SAT score of ${userSAT} is above the midpoint of admitted students.`;
  } else if (userSAT >= total25) {
    status = STATUS_LABELS.AVERAGE;
    statusKey = 'AVERAGE';
    explanation = `Your SAT score of ${userSAT} falls within the middle 50% (${total25}–${total75}) of admitted students.`;
  } else if (userSAT >= total25 - 50) {
    status = STATUS_LABELS.BELOW;
    statusKey = 'BELOW';
    explanation = `Your SAT score of ${userSAT} is slightly below the 25th percentile (${total25}) of admitted students.`;
  } else {
    status = STATUS_LABELS.WELL_BELOW;
    statusKey = 'WELL_BELOW';
    explanation = `Your SAT score of ${userSAT} is significantly below the typical range of admitted students.`;
  }

  return {
    dimension: 'SAT',
    userValue: userSAT.toString(),
    collegeRange: `${total25}–${total75}`,
    collegeSections: {
      readingRange: collegeSAT.reading25 && collegeSAT.reading75 
        ? `${collegeSAT.reading25}–${collegeSAT.reading75}` 
        : null,
      mathRange: collegeSAT.math25 && collegeSAT.math75 
        ? `${collegeSAT.math25}–${collegeSAT.math75}` 
        : null
    },
    percentSubmitting: collegeSAT.percentSubmitting 
      ? `${Math.round(collegeSAT.percentSubmitting * 100)}%` 
      : null,
    status,
    statusKey,
    explanation
  };
}

/**
 * Compare user's ACT score against college's admitted student ACT range
 */
function compareACT(userProfile, college) {
  const userACT = userProfile.exams?.ACT?.score || 
                  userProfile.testStatus?.actScore ||
                  userProfile.act_score ||
                  null;
  
  if (!userACT) {
    return null;
  }

  const collegeACT = {
    composite25: college.act_composite_25,
    composite75: college.act_composite_75,
    english25: college.act_english_25,
    english75: college.act_english_75,
    math25: college.act_math_25,
    math75: college.act_math_75,
    percentSubmitting: college.percent_submitting_act
  };

  if (!collegeACT.composite25 && !collegeACT.composite75) {
    return {
      dimension: 'ACT',
      userValue: userACT.toString(),
      collegeRange: 'Not reported',
      status: STATUS_LABELS.UNAVAILABLE,
      statusKey: 'UNAVAILABLE',
      explanation: 'This college does not report ACT statistics.'
    };
  }

  const act25 = collegeACT.composite25 || 28;
  const act75 = collegeACT.composite75 || 34;
  const midpoint = (act25 + act75) / 2;

  let status, statusKey, explanation;

  if (userACT >= act75) {
    status = STATUS_LABELS.WELL_ABOVE;
    statusKey = 'WELL_ABOVE';
    explanation = `Your ACT score of ${userACT} is at or above the 75th percentile (${act75}) of admitted students.`;
  } else if (userACT >= midpoint) {
    status = STATUS_LABELS.ABOVE;
    statusKey = 'ABOVE';
    explanation = `Your ACT score of ${userACT} is above the midpoint of admitted students.`;
  } else if (userACT >= act25) {
    status = STATUS_LABELS.AVERAGE;
    statusKey = 'AVERAGE';
    explanation = `Your ACT score of ${userACT} falls within the middle 50% (${act25}–${act75}) of admitted students.`;
  } else if (userACT >= act25 - 2) {
    status = STATUS_LABELS.BELOW;
    statusKey = 'BELOW';
    explanation = `Your ACT score of ${userACT} is slightly below the 25th percentile (${act25}) of admitted students.`;
  } else {
    status = STATUS_LABELS.WELL_BELOW;
    statusKey = 'WELL_BELOW';
    explanation = `Your ACT score of ${userACT} is significantly below the typical range of admitted students.`;
  }

  return {
    dimension: 'ACT',
    userValue: userACT.toString(),
    collegeRange: `${act25}–${act75}`,
    collegeSections: {
      englishRange: collegeACT.english25 && collegeACT.english75 
        ? `${collegeACT.english25}–${collegeACT.english75}` 
        : null,
      mathRange: collegeACT.math25 && collegeACT.math75 
        ? `${collegeACT.math25}–${collegeACT.math75}` 
        : null
    },
    percentSubmitting: collegeACT.percentSubmitting 
      ? `${Math.round(collegeACT.percentSubmitting * 100)}%` 
      : null,
    status,
    statusKey,
    explanation
  };
}

/**
 * Assess course rigor based on user's subjects
 */
function assessRigor(userProfile, college) {
  const subjects = userProfile.subjects || 
                   userProfile.academic?.subjects || 
                   [];
  
  if (!subjects || subjects.length === 0) {
    return null;
  }

  // Check for AP/IB/Honors courses
  const advancedCourses = subjects.filter(s => 
    s && (
      s.toLowerCase().includes('ap ') ||
      s.toLowerCase().includes('ib ') ||
      s.toLowerCase().includes('honors') ||
      s.toLowerCase().includes('advanced')
    )
  );

  const factorRigor = college.factor_rigor;
  const isRigorImportant = factorRigor === 'Very Important' || factorRigor === 'Important';

  let status, explanation;
  
  if (advancedCourses.length >= 8) {
    status = STATUS_LABELS.WELL_ABOVE;
    explanation = `You have ${advancedCourses.length} advanced courses (AP/IB/Honors), demonstrating very strong academic rigor.`;
  } else if (advancedCourses.length >= 5) {
    status = STATUS_LABELS.ABOVE;
    explanation = `You have ${advancedCourses.length} advanced courses, showing good academic rigor.`;
  } else if (advancedCourses.length >= 3) {
    status = STATUS_LABELS.AVERAGE;
    explanation = `You have ${advancedCourses.length} advanced courses.${isRigorImportant ? ' Consider adding more if possible, as rigor is important to this college.' : ''}`;
  } else if (advancedCourses.length >= 1) {
    status = STATUS_LABELS.BELOW;
    explanation = `You have ${advancedCourses.length} advanced course(s).${isRigorImportant ? ' This college values academic rigor highly.' : ''}`;
  } else {
    status = STATUS_LABELS.WELL_BELOW;
    explanation = `No advanced courses identified.${isRigorImportant ? ' Consider taking AP/IB courses if available.' : ''}`;
  }

  return {
    dimension: 'Course Rigor',
    userValue: `${advancedCourses.length} AP/IB/Honors`,
    collegeExpectation: isRigorImportant ? 'Highly valued' : 'Considered',
    factorImportance: factorRigor || 'Not specified',
    status,
    statusKey: Object.keys(STATUS_LABELS).find(k => STATUS_LABELS[k] === status),
    explanation
  };
}

/**
 * Assess extracurricular activities
 */
function assessExtracurriculars(userProfile, college) {
  const activities = userProfile.extracurriculars || 
                     userProfile.activities || 
                     [];
  
  if (!activities || activities.length === 0) {
    return null;
  }

  const factorEC = college.factor_extracurricular;
  const isECImportant = factorEC === 'Very Important' || factorEC === 'Important';

  // Count leadership positions
  const leadershipKeywords = ['president', 'captain', 'founder', 'leader', 'head', 'editor', 'chair'];
  const leadershipCount = activities.filter(a => 
    leadershipKeywords.some(k => (a.role || a.name || a).toLowerCase().includes(k))
  ).length;

  let status, explanation;
  
  if (activities.length >= 10 && leadershipCount >= 3) {
    status = STATUS_LABELS.WELL_ABOVE;
    explanation = `Strong extracurricular profile with ${activities.length} activities and ${leadershipCount} leadership positions.`;
  } else if (activities.length >= 7 || leadershipCount >= 2) {
    status = STATUS_LABELS.ABOVE;
    explanation = `Good extracurricular involvement with ${activities.length} activities.`;
  } else if (activities.length >= 4) {
    status = STATUS_LABELS.AVERAGE;
    explanation = `Moderate extracurricular involvement with ${activities.length} activities.`;
  } else if (activities.length >= 2) {
    status = STATUS_LABELS.BELOW;
    explanation = `Limited extracurricular involvement.${isECImportant ? ' This college values activities highly.' : ''}`;
  } else {
    status = STATUS_LABELS.WELL_BELOW;
    explanation = `Few extracurriculars listed.${isECImportant ? ' Consider strengthening this area.' : ''}`;
  }

  return {
    dimension: 'Extracurriculars',
    userValue: `${activities.length} activities`,
    leadershipCount,
    collegeExpectation: isECImportant ? 'Highly valued' : 'Considered',
    factorImportance: factorEC || 'Not specified',
    status,
    statusKey: Object.keys(STATUS_LABELS).find(k => STATUS_LABELS[k] === status),
    explanation
  };
}

/**
 * Calculate overall fit category (NOT probability!)
 */
function calculateOverallFit(matchingDimensions, totalDimensions, college) {
  if (totalDimensions === 0) {
    return {
      category: 'Unknown',
      explanation: 'Insufficient data to determine fit.',
      matchingDimensions: 0,
      totalDimensions: 0,
      acceptanceRate: 'Not reported'
    };
  }

  const matchRatio = matchingDimensions / totalDimensions;
  const acceptanceRate = college.acceptance_rate || 0.5;

  // Determine category based on match ratio AND selectivity
  let category, explanation;

  if (matchRatio >= 0.8 && acceptanceRate >= 0.4) {
    category = 'Safety';
    explanation = 'Your profile is strong for this college, and it has a reasonable acceptance rate.';
  } else if (matchRatio >= 0.6 || (matchRatio >= 0.5 && acceptanceRate >= 0.3)) {
    category = 'Match';
    explanation = 'Your profile aligns well with typical admitted students.';
  } else if (acceptanceRate < 0.15) {
    category = 'Reach';
    explanation = 'This is a highly selective institution. All applicants face significant competition.';
  } else if (matchRatio < 0.4) {
    category = 'Reach';
    explanation = 'Your profile is below typical admitted student benchmarks in some areas.';
  } else {
    category = 'Match';
    explanation = 'Your profile shows a reasonable fit with this college.';
  }

  return {
    category,
    explanation,
    matchingDimensions,
    totalDimensions,
    acceptanceRate: acceptanceRate ? `${Math.round(acceptanceRate * 100)}%` : 'Not reported'
  };
}

/**
 * Get admission factors importance from CDS
 */
function getAdmissionFactors(college) {
  const factors = {};
  
  const factorMap = {
    'Academic Rigor': college.factor_rigor,
    'Class Rank': college.factor_class_rank,
    'GPA': college.factor_gpa,
    'Test Scores': college.factor_test_scores,
    'Essay': college.factor_essay,
    'Recommendations': college.factor_recommendation,
    'Interview': college.factor_interview,
    'Extracurriculars': college.factor_extracurricular,
    'Talent/Ability': college.factor_talent,
    'Character': college.factor_character,
    'First Generation': college.factor_first_gen,
    'Legacy': college.factor_alumni,
    'Volunteer Work': college.factor_volunteer,
    'Work Experience': college.factor_work_experience
  };

  for (const [name, importance] of Object.entries(factorMap)) {
    if (importance) {
      factors[name] = importance;
    }
  }

  return Object.keys(factors).length > 0 ? factors : null;
}

/**
 * Get comparison for a specific college by ID
 */
function getProfileComparisonForCollege(userId, collegeId) {
  const db = dbManager.getDatabase();
  const User = require('../src/models/User');
  
  // Get user profile
  const userProfile = User.getAcademicProfile(userId);
  if (!userProfile) {
    return {
      success: false,
      error: 'User profile not found'
    };
  }

  // Get college with all CDS data
  const college = db.prepare(`
    SELECT * FROM colleges WHERE id = ?
  `).get(collegeId);

  if (!college) {
    return {
      success: false,
      error: 'College not found'
    };
  }

  return compareProfile(userProfile, college);
}

/**
 * Get comparison for multiple colleges
 */
function getProfileComparisonForColleges(userId, collegeIds) {
  return collegeIds.map(id => getProfileComparisonForCollege(userId, id));
}

module.exports = {
  compareProfile,
  getProfileComparisonForCollege,
  getProfileComparisonForColleges,
  STATUS_LABELS
};

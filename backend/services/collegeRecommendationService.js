// backend/services/collegeRecommendationService.js
// Lean, deterministic college recommendation system
// Rule-based scoring engine with full explainability

/**
 * SCORING WEIGHTS - All weights are explicit and adjustable
 * These can be tuned without changing the algorithm
 */
const SCORING_WEIGHTS = {
  MAJOR_ALIGNMENT: 0.25,      // High weight - program match is critical
  ACADEMIC_FIT: 0.20,         // High weight - academic strength alignment
  TEST_COMPATIBILITY: 0.15,   // Medium weight - exam requirements
  COUNTRY_PREFERENCE: 0.15,   // Medium weight - target country match
  COST_ALIGNMENT: 0.15,       // Medium weight - affordability
  ADMISSION_PROBABILITY: 0.10 // Medium weight - selectivity proxy
};

/**
 * CLASSIFICATION THRESHOLDS
 */
const CLASSIFICATION_THRESHOLDS = {
  REACH: { maxScore: 0.50, maxAcceptanceRate: 0.20 },
  MATCH: { minScore: 0.50, maxScore: 0.75 },
  SAFETY: { minScore: 0.75, minAcceptanceRate: 0.40 }
};

/**
 * SELECTIVITY LEVELS based on acceptance rate
 */
const SELECTIVITY_LEVELS = {
  HIGHLY_SELECTIVE: { maxRate: 0.15, label: 'Highly Selective' },
  SELECTIVE: { minRate: 0.15, maxRate: 0.30, label: 'Selective' },
  MODERATELY_SELECTIVE: { minRate: 0.30, maxRate: 0.50, label: 'Moderately Selective' },
  LESS_SELECTIVE: { minRate: 0.50, maxRate: 0.70, label: 'Less Selective' },
  OPEN_ADMISSION: { minRate: 0.70, label: 'Open Admission' }
};

/**
 * AFFORDABILITY BUCKETS
 */
const AFFORDABILITY_BUCKETS = {
  AFFORDABLE: { label: 'Within Budget', ratio: 1.0 },
  MODERATE_STRETCH: { label: 'Moderate Stretch', ratio: 0.75 },
  SIGNIFICANT_STRETCH: { label: 'Significant Stretch', ratio: 0.50 },
  UNAFFORDABLE: { label: 'Over Budget', ratio: 0.0 }
};

/**
 * Generate college recommendations for a user
 * @param {Object} userProfile - User's academic profile from User.getAcademicProfile()
 * @param {Array} colleges - Array of college objects
 * @param {Object} options - Optional filters (limit, country, etc.)
 * @returns {Object} Categorized recommendations with explanations
 */
function generateRecommendations(userProfile, colleges, options = {}) {
  if (!userProfile || !colleges || colleges.length === 0) {
    return {
      success: false,
      message: 'User profile or colleges data is missing',
      reach: [],
      match: [],
      safety: [],
      stats: null
    };
  }

  // Derive user signals from profile
  const userSignals = deriveUserSignals(userProfile);
  
  // Score and classify each college
  const scoredColleges = [];
  
  for (const college of colleges) {
    try {
      // Normalize college features
      const collegeFeatures = normalizeCollegeFeatures(college);
      
      // Calculate individual signal scores
      const signalScores = calculateSignalScores(userSignals, collegeFeatures, college);
      
      // Calculate weighted overall score
      const overallScore = calculateOverallScore(signalScores);
      
      // Classify college (Reach/Match/Safety)
      const classification = classifyCollege(overallScore, collegeFeatures.selectivityLevel, college);
      
      // Generate explanation (rule-derived, not hardcoded)
      const explanation = generateExplanation(userSignals, collegeFeatures, signalScores, classification);
      
      scoredColleges.push({
        collegeId: college.id,
        collegeName: college.name,
        country: college.country,
        location: college.location,
        category: classification,
        score: Math.round(overallScore * 100),
        signalScores,
        explanation,
        trustTier: college.trust_tier || 'official',
        acceptanceRate: college.acceptance_rate,
        selectivityLevel: collegeFeatures.selectivityLevel,
        affordabilityBucket: collegeFeatures.affordabilityBucket,
        programMatch: collegeFeatures.programMatch,
        // Include full college data for frontend
        college: sanitizeCollegeForResponse(college)
      });
    } catch (error) {
      // Skip colleges that cause errors (e.g., missing data)
      console.warn(`Skipping college ${college.name}: ${error.message}`);
    }
  }
  
  // Sort by score descending
  scoredColleges.sort((a, b) => b.score - a.score);
  
  // Categorize into Reach, Match, Safety
  const reach = scoredColleges.filter(c => c.category === 'Reach');
  const match = scoredColleges.filter(c => c.category === 'Match');
  const safety = scoredColleges.filter(c => c.category === 'Safety');
  
  // Apply limits
  const limit = options.limit || 5;
  
  // Calculate statistics
  const stats = {
    totalConsidered: colleges.length,
    totalScored: scoredColleges.length,
    reachCount: reach.length,
    matchCount: match.length,
    safetyCount: safety.length,
    avgScore: scoredColleges.length > 0 
      ? Math.round(scoredColleges.reduce((sum, c) => sum + c.score, 0) / scoredColleges.length) 
      : 0,
    countriesRepresented: [...new Set(scoredColleges.map(c => c.country))]
  };
  
  return {
    success: true,
    reach: reach.slice(0, limit),
    match: match.slice(0, limit),
    safety: safety.slice(0, limit),
    stats,
    userSignals // Include for debugging/transparency
  };
}

/**
 * Derive user signals from academic profile
 * TODO 3: Define user profile signals
 */
function deriveUserSignals(profile) {
  const signals = {
    // Academic strength level (derived from grades)
    academicStrengthLevel: deriveAcademicStrength(profile),
    
    // Test status
    testStatus: deriveTestStatus(profile),
    
    // Major intent
    majorIntent: deriveMajorIntent(profile),
    
    // Country preferences
    countryPreferences: profile.preferences?.target_countries || [],
    
    // Budget sensitivity
    budgetSensitivity: deriveBudgetSensitivity(profile),
    
    // Raw data for reference
    percentage: profile.percentage || profile.academic?.percentage || null,
    gpa: profile.gpa || profile.academic?.gpa || null,
    subjects: profile.subjects || profile.academic?.subjects || [],
    board: profile.academic_board || profile.academic?.board || null
  };
  
  return signals;
}

/**
 * Derive academic strength level from grades
 * Returns: 'excellent', 'strong', 'good', 'fair', 'needs_improvement'
 */
function deriveAcademicStrength(profile) {
  const percentage = profile.percentage || profile.academic?.percentage;
  const gpa = profile.gpa || profile.academic?.gpa;
  
  // Use percentage if available (common for Indian boards)
  if (percentage) {
    if (percentage >= 90) return 'excellent';
    if (percentage >= 80) return 'strong';
    if (percentage >= 70) return 'good';
    if (percentage >= 60) return 'fair';
    return 'needs_improvement';
  }
  
  // Use GPA if percentage not available
  if (gpa) {
    if (gpa >= 3.8) return 'excellent';
    if (gpa >= 3.5) return 'strong';
    if (gpa >= 3.0) return 'good';
    if (gpa >= 2.5) return 'fair';
    return 'needs_improvement';
  }
  
  return 'unknown';
}

/**
 * Derive test status from exams data
 */
function deriveTestStatus(profile) {
  const exams = profile.exams || {};
  const testStatus = profile.testStatus || {};
  
  // Merge both sources
  const allExams = { ...exams, ...testStatus };
  
  return {
    hasSAT: hasCompletedExam(allExams, 'SAT'),
    hasACT: hasCompletedExam(allExams, 'ACT'),
    hasIELTS: hasCompletedExam(allExams, 'IELTS'),
    hasTOEFL: hasCompletedExam(allExams, 'TOEFL'),
    hasDuolingo: hasCompletedExam(allExams, 'DUOLINGO'),
    hasGRE: hasCompletedExam(allExams, 'GRE'),
    hasGMAT: hasCompletedExam(allExams, 'GMAT'),
    // Scores if available
    satScore: getExamScore(allExams, 'SAT'),
    actScore: getExamScore(allExams, 'ACT'),
    ieltsScore: getExamScore(allExams, 'IELTS'),
    toeflScore: getExamScore(allExams, 'TOEFL'),
    // Summary
    hasStandardizedTest: hasCompletedExam(allExams, 'SAT') || hasCompletedExam(allExams, 'ACT'),
    hasLanguageTest: hasCompletedExam(allExams, 'IELTS') || hasCompletedExam(allExams, 'TOEFL') || hasCompletedExam(allExams, 'DUOLINGO')
  };
}

function hasCompletedExam(exams, examName) {
  const exam = exams[examName] || exams[examName.toLowerCase()];
  if (!exam) return false;
  return exam.status === 'completed' || exam.score !== undefined;
}

function getExamScore(exams, examName) {
  const exam = exams[examName] || exams[examName.toLowerCase()];
  if (!exam) return null;
  return exam.score || null;
}

/**
 * Derive major intent
 */
function deriveMajorIntent(profile) {
  const major = profile.preferences?.intended_major || 
                (profile.preferences?.intended_majors?.[0]) ||
                profile.intended_major ||
                null;
  
  return {
    primary: major,
    all: profile.preferences?.intended_majors || (major ? [major] : []),
    hasIntent: Boolean(major)
  };
}

/**
 * Derive budget sensitivity
 */
function deriveBudgetSensitivity(profile) {
  const budget = profile.financial?.max_budget_per_year;
  const needsAid = profile.financial?.need_financial_aid;
  const canLoan = profile.financial?.can_take_loan;
  
  if (!budget) {
    return { level: 'unknown', maxBudget: null, needsAid: false, canLoan: false };
  }
  
  // Convert to USD equivalent for comparison (rough conversion)
  const budgetUSD = budget / 82; // Assuming INR
  
  let level;
  if (budgetUSD >= 80000) level = 'flexible';
  else if (budgetUSD >= 50000) level = 'moderate';
  else if (budgetUSD >= 30000) level = 'constrained';
  else level = 'limited';
  
  return {
    level,
    maxBudget: budget,
    maxBudgetUSD: Math.round(budgetUSD),
    needsAid: Boolean(needsAid),
    canLoan: Boolean(canLoan)
  };
}

/**
 * Normalize college features into comparable signals
 * TODO 2: Define college feature normalization
 */
function normalizeCollegeFeatures(college) {
  const features = {
    // Program match (will be calculated against user)
    programs: parseJSONField(college.programs),
    majorCategories: parseJSONField(college.major_categories || college.majorCategories),
    
    // Country
    country: college.country,
    
    // Affordability bucket
    affordabilityBucket: calculateAffordabilityBucket(college),
    estimatedCostUSD: getEstimatedCost(college),
    
    // Selectivity level
    selectivityLevel: calculateSelectivityLevel(college.acceptance_rate),
    acceptanceRate: college.acceptance_rate,
    
    // Requirements
    requirements: parseJSONField(college.requirements),
    
    // Financial aid availability
    financialAidAvailable: Boolean(college.financial_aid_available || 
      parseJSONField(college.research_data)?.aid_available)
  };
  
  return features;
}

function parseJSONField(field) {
  if (!field) return [];
  if (Array.isArray(field)) return field;
  if (typeof field === 'object') return field;
  try {
    return JSON.parse(field);
  } catch {
    return [];
  }
}

function getEstimatedCost(college) {
  const researchData = parseJSONField(college.research_data);
  const tuition = college.tuition_cost || researchData.avg_cost || 50000;
  const living = 15000; // Rough estimate
  return tuition + living;
}

function calculateAffordabilityBucket(college) {
  // This returns a normalized label; actual affordability calculation
  // happens in scoring where we compare to user budget
  const cost = getEstimatedCost(college);
  
  if (cost <= 25000) return 'low_cost';
  if (cost <= 45000) return 'moderate_cost';
  if (cost <= 65000) return 'high_cost';
  return 'premium_cost';
}

function calculateSelectivityLevel(acceptanceRate) {
  if (!acceptanceRate || acceptanceRate <= 0) return 'unknown';
  
  if (acceptanceRate <= 0.15) return 'highly_selective';
  if (acceptanceRate <= 0.30) return 'selective';
  if (acceptanceRate <= 0.50) return 'moderately_selective';
  if (acceptanceRate <= 0.70) return 'less_selective';
  return 'open_admission';
}

/**
 * Calculate individual signal scores
 * TODO 4: Implement rule-based scoring engine
 */
function calculateSignalScores(userSignals, collegeFeatures, college) {
  return {
    majorAlignment: calculateMajorAlignmentScore(userSignals, collegeFeatures),
    academicFit: calculateAcademicFitScore(userSignals, collegeFeatures, college),
    testCompatibility: calculateTestCompatibilityScore(userSignals, collegeFeatures, college),
    countryPreference: calculateCountryPreferenceScore(userSignals, college),
    costAlignment: calculateCostAlignmentScore(userSignals, collegeFeatures),
    admissionProbability: calculateAdmissionProbabilityScore(userSignals, collegeFeatures)
  };
}

/**
 * Major alignment score (0-1)
 * High weight because program match is critical
 */
function calculateMajorAlignmentScore(userSignals, collegeFeatures) {
  if (!userSignals.majorIntent.hasIntent) {
    return 0.7; // Neutral if no major specified
  }
  
  const userMajor = userSignals.majorIntent.primary.toLowerCase();
  const userMajors = userSignals.majorIntent.all.map(m => m.toLowerCase());
  
  const collegePrograms = [
    ...collegeFeatures.programs,
    ...collegeFeatures.majorCategories
  ].map(p => p?.toLowerCase() || '');
  
  // Check for exact or partial match
  for (const program of collegePrograms) {
    // Exact match
    if (program === userMajor) return 1.0;
    
    // Contains match (e.g., "Computer Science" contains "computer")
    if (program.includes(userMajor) || userMajor.includes(program)) return 0.9;
    
    // Check against all user majors
    for (const um of userMajors) {
      if (program.includes(um) || um.includes(program)) return 0.85;
    }
  }
  
  // Check for related fields (basic keyword matching)
  const relatedKeywords = getRelatedKeywords(userMajor);
  for (const program of collegePrograms) {
    for (const keyword of relatedKeywords) {
      if (program.includes(keyword)) return 0.7;
    }
  }
  
  // No match
  return 0.3;
}

function getRelatedKeywords(major) {
  const majorLower = major.toLowerCase();
  
  // Define related fields
  const relatedFields = {
    'computer science': ['engineering', 'technology', 'computing', 'software', 'data science', 'it'],
    'engineering': ['technology', 'science', 'mechanics', 'electronics'],
    'business': ['management', 'commerce', 'economics', 'finance', 'accounting', 'mba'],
    'medicine': ['health', 'medical', 'biology', 'pre-med', 'life sciences'],
    'law': ['legal', 'political science', 'government'],
    'arts': ['humanities', 'liberal arts', 'creative', 'design'],
    'science': ['biology', 'chemistry', 'physics', 'mathematics']
  };
  
  for (const [field, keywords] of Object.entries(relatedFields)) {
    if (majorLower.includes(field) || field.includes(majorLower)) {
      return keywords;
    }
  }
  
  return [];
}

/**
 * Academic fit score (0-1)
 * Compares user's academic strength to college requirements
 */
function calculateAcademicFitScore(userSignals, collegeFeatures, college) {
  const requirements = collegeFeatures.requirements;
  const userPercentage = userSignals.percentage;
  const userGPA = userSignals.gpa;
  
  // Get minimum requirements
  const minPercentage = requirements.min_percentage || 0;
  const minGPA = requirements.min_gpa || 0;
  
  let score = 0.7; // Default neutral score
  
  // Check percentage
  if (userPercentage && minPercentage) {
    const difference = userPercentage - minPercentage;
    if (difference >= 15) score = 1.0;
    else if (difference >= 10) score = 0.9;
    else if (difference >= 5) score = 0.8;
    else if (difference >= 0) score = 0.7;
    else if (difference >= -5) score = 0.5;
    else score = 0.3;
  } else if (userGPA && minGPA) {
    const difference = userGPA - minGPA;
    if (difference >= 0.5) score = 1.0;
    else if (difference >= 0.3) score = 0.9;
    else if (difference >= 0.1) score = 0.8;
    else if (difference >= 0) score = 0.7;
    else if (difference >= -0.2) score = 0.5;
    else score = 0.3;
  }
  
  // Adjust for selectivity
  if (collegeFeatures.selectivityLevel === 'highly_selective' && score > 0.8) {
    score *= 0.85; // Even strong students have lower probability at highly selective schools
  }
  
  // Adjust for academic strength level
  if (userSignals.academicStrengthLevel === 'excellent') {
    score = Math.min(1.0, score + 0.1);
  } else if (userSignals.academicStrengthLevel === 'needs_improvement') {
    score = Math.max(0.2, score - 0.1);
  }
  
  return score;
}

/**
 * Test compatibility score (0-1)
 * Checks if user has required exams
 */
function calculateTestCompatibilityScore(userSignals, collegeFeatures, college) {
  const requirements = collegeFeatures.requirements;
  const testStatus = userSignals.testStatus;
  
  let score = 0.7; // Default neutral
  
  // Check if test-optional
  if (requirements.test_optional) {
    // Test-optional schools: having tests is a bonus, not having is neutral
    if (testStatus.hasStandardizedTest) {
      score = 0.9;
    } else {
      score = 0.7;
    }
  } else {
    // Test-required schools
    const requiredExams = requirements.required_exams || [];
    const optionalExams = requirements.optional_exams || [];
    
    // Check required exams
    let hasAllRequired = true;
    for (const exam of requiredExams) {
      if (!hasCompletedExamFromTestStatus(userSignals.testStatus, exam.toUpperCase())) {
        hasAllRequired = false;
        break;
      }
    }
    
    if (hasAllRequired && requiredExams.length > 0) {
      score = 1.0;
    } else if (!hasAllRequired) {
      score = 0.4; // Missing required exams is a problem
    }
    
    // Check optional exams (SAT OR ACT)
    if (optionalExams.length > 0) {
      const hasOne = optionalExams.some(exam => 
        hasCompletedExamFromTestStatus(userSignals.testStatus, exam.toUpperCase())
      );
      if (hasOne) score = Math.max(score, 0.8);
    }
  }
  
  // Check language requirements for international students
  const languageExams = requirements.language_exams || ['IELTS', 'TOEFL'];
  if (college.country !== 'India' && languageExams.length > 0) {
    if (!testStatus.hasLanguageTest) {
      score *= 0.8; // Penalty for missing language test
    } else {
      // Check minimum scores if available
      if (requirements.min_ielts && testStatus.ieltsScore) {
        if (testStatus.ieltsScore >= requirements.min_ielts) {
          score = Math.min(1.0, score + 0.1);
        } else {
          score *= 0.7;
        }
      }
      if (requirements.min_toefl && testStatus.toeflScore) {
        if (testStatus.toeflScore >= requirements.min_toefl) {
          score = Math.min(1.0, score + 0.1);
        } else {
          score *= 0.7;
        }
      }
    }
  }
  
  return Math.max(0, Math.min(1, score));
}

function hasCompletedExamFromTestStatus(testStatus, examName) {
  const key = `has${examName.charAt(0).toUpperCase()}${examName.slice(1).toLowerCase()}`;
  return testStatus[key] === true;
}

/**
 * Country preference score (0-1)
 */
function calculateCountryPreferenceScore(userSignals, college) {
  const preferences = userSignals.countryPreferences || [];
  
  if (preferences.length === 0) {
    return 0.7; // Neutral if no preference
  }
  
  // Normalize country names
  const collegeCountry = normalizeCountry(college.country);
  const normalizedPrefs = preferences.map(normalizeCountry);
  
  if (normalizedPrefs.includes(collegeCountry)) {
    return 1.0; // Perfect match
  }
  
  // Check for similar regions
  const regions = {
    'North America': ['US', 'USA', 'Canada'],
    'Europe': ['UK', 'Germany', 'France', 'Netherlands', 'Ireland', 'Switzerland'],
    'Asia': ['Singapore', 'Hong Kong', 'Japan', 'South Korea'],
    'Oceania': ['Australia', 'New Zealand']
  };
  
  for (const [region, countries] of Object.entries(regions)) {
    const userInRegion = normalizedPrefs.some(p => countries.includes(p));
    const collegeInRegion = countries.includes(collegeCountry);
    
    if (userInRegion && collegeInRegion) {
      return 0.6; // Same region but not preferred country
    }
  }
  
  return 0.3; // Different region entirely
}

function normalizeCountry(country) {
  if (!country) return '';
  const normalized = country.toUpperCase().trim();
  
  // Handle variations
  const countryMap = {
    'UNITED STATES': 'US',
    'USA': 'US',
    'UNITED KINGDOM': 'UK',
    'GREAT BRITAIN': 'UK',
    'ENGLAND': 'UK'
  };
  
  return countryMap[normalized] || normalized;
}

/**
 * Cost alignment score (0-1)
 */
function calculateCostAlignmentScore(userSignals, collegeFeatures) {
  const budgetInfo = userSignals.budgetSensitivity;
  
  if (budgetInfo.level === 'unknown') {
    return 0.7; // Neutral if no budget specified
  }
  
  const estimatedCost = collegeFeatures.estimatedCostUSD;
  const userBudget = budgetInfo.maxBudgetUSD;
  
  const ratio = userBudget / estimatedCost;
  
  if (ratio >= 1.2) return 1.0; // Well within budget
  if (ratio >= 1.0) return 0.9; // Within budget
  if (ratio >= 0.8) return 0.7; // Slight stretch
  if (ratio >= 0.6) return 0.5; // Moderate stretch
  if (ratio >= 0.4) return 0.3; // Significant stretch
  
  // Below 40% of cost - check if aid available
  if (collegeFeatures.financialAidAvailable && budgetInfo.needsAid) {
    return 0.4; // Aid may help
  }
  
  return 0.2; // Likely unaffordable
}

/**
 * Admission probability score (0-1)
 * Based on selectivity and user's academic profile
 */
function calculateAdmissionProbabilityScore(userSignals, collegeFeatures) {
  const selectivity = collegeFeatures.selectivityLevel;
  const academicLevel = userSignals.academicStrengthLevel;
  
  // Base probability by selectivity
  let baseProbability;
  switch (selectivity) {
    case 'highly_selective':
      baseProbability = 0.3;
      break;
    case 'selective':
      baseProbability = 0.5;
      break;
    case 'moderately_selective':
      baseProbability = 0.7;
      break;
    case 'less_selective':
      baseProbability = 0.85;
      break;
    case 'open_admission':
      baseProbability = 0.95;
      break;
    default:
      baseProbability = 0.6;
  }
  
  // Adjust based on academic level
  const academicMultiplier = {
    'excellent': 1.3,
    'strong': 1.1,
    'good': 1.0,
    'fair': 0.85,
    'needs_improvement': 0.7,
    'unknown': 1.0
  };
  
  const multiplier = academicMultiplier[academicLevel] || 1.0;
  
  return Math.min(1.0, Math.max(0.1, baseProbability * multiplier));
}

/**
 * Calculate weighted overall score
 */
function calculateOverallScore(signalScores) {
  return (
    signalScores.majorAlignment * SCORING_WEIGHTS.MAJOR_ALIGNMENT +
    signalScores.academicFit * SCORING_WEIGHTS.ACADEMIC_FIT +
    signalScores.testCompatibility * SCORING_WEIGHTS.TEST_COMPATIBILITY +
    signalScores.countryPreference * SCORING_WEIGHTS.COUNTRY_PREFERENCE +
    signalScores.costAlignment * SCORING_WEIGHTS.COST_ALIGNMENT +
    signalScores.admissionProbability * SCORING_WEIGHTS.ADMISSION_PROBABILITY
  );
}

/**
 * Classify college into Reach/Match/Safety
 * TODO 5: Classify colleges into categories
 */
function classifyCollege(overallScore, selectivityLevel, college) {
  const acceptanceRate = college.acceptance_rate || 0.5;
  
  // Highly selective schools are almost always Reach
  if (selectivityLevel === 'highly_selective' && overallScore < 0.85) {
    return 'Reach';
  }
  
  // Use score thresholds with selectivity consideration
  if (overallScore >= 0.75 && acceptanceRate >= 0.40) {
    return 'Safety';
  }
  
  if (overallScore >= 0.50) {
    // Additional check: low acceptance rate schools are Reach
    if (acceptanceRate < 0.25) {
      return 'Reach';
    }
    return 'Match';
  }
  
  return 'Reach';
}

/**
 * Generate explanation for recommendation
 * TODO 6: Generate explanations (mandatory)
 * Explanations are derived from rules, not hardcoded
 */
function generateExplanation(userSignals, collegeFeatures, signalScores, classification) {
  const reasons = [];
  const concerns = [];
  
  // Major alignment explanation
  if (signalScores.majorAlignment >= 0.9) {
    const major = userSignals.majorIntent.primary;
    reasons.push(`Offers strong ${major} program matching your intended major`);
  } else if (signalScores.majorAlignment >= 0.7) {
    reasons.push('Offers programs related to your area of interest');
  } else if (signalScores.majorAlignment < 0.5 && userSignals.majorIntent.hasIntent) {
    concerns.push(`Limited programs in ${userSignals.majorIntent.primary}`);
  }
  
  // Academic fit explanation
  if (signalScores.academicFit >= 0.85) {
    reasons.push('Your academic profile aligns well with typical admits');
  } else if (signalScores.academicFit >= 0.7) {
    reasons.push('Your grades meet the requirements');
  } else if (signalScores.academicFit < 0.5) {
    concerns.push('Your grades may be below the typical admit profile');
  }
  
  // Test compatibility explanation
  if (signalScores.testCompatibility >= 0.9) {
    reasons.push('You have the required standardized test scores');
  } else if (signalScores.testCompatibility < 0.6) {
    concerns.push('You may need to complete required exams before applying');
  }
  
  // Country preference explanation
  if (signalScores.countryPreference >= 1.0) {
    reasons.push(`Located in ${collegeFeatures.country}, your target country`);
  } else if (signalScores.countryPreference < 0.5) {
    concerns.push('Not in your preferred study destination');
  }
  
  // Cost alignment explanation
  if (signalScores.costAlignment >= 0.9) {
    reasons.push('Within your budget');
  } else if (signalScores.costAlignment >= 0.7) {
    reasons.push('Affordable with some financial planning');
  } else if (signalScores.costAlignment < 0.5) {
    if (collegeFeatures.financialAidAvailable) {
      concerns.push('Above budget, but financial aid may be available');
    } else {
      concerns.push('Cost exceeds your budget');
    }
  }
  
  // Admission probability explanation
  if (signalScores.admissionProbability >= 0.8) {
    reasons.push('Good acceptance rate for your profile');
  } else if (signalScores.admissionProbability < 0.4) {
    const selectivityLabel = SELECTIVITY_LEVELS[collegeFeatures.selectivityLevel.toUpperCase()]?.label || 'Selective';
    concerns.push(`${selectivityLabel} admission (${Math.round((collegeFeatures.acceptanceRate || 0.5) * 100)}% acceptance rate)`);
  }
  
  // Classification-specific explanation
  let summary;
  switch (classification) {
    case 'Reach':
      summary = 'This is a stretch goal - admission is competitive but possible';
      break;
    case 'Match':
      summary = 'Good fit for your profile - competitive but realistic option';
      break;
    case 'Safety':
      summary = 'Strong likelihood of admission based on your profile';
      break;
    default:
      summary = 'Consider this option based on your priorities';
  }
  
  return {
    summary,
    reasons,
    concerns,
    primaryReason: reasons[0] || 'Matches your search criteria'
  };
}

/**
 * Sanitize college data for API response
 * TODO 8: Frontend-ready response format
 */
function sanitizeCollegeForResponse(college) {
  return {
    id: college.id,
    name: college.name,
    country: college.country,
    location: college.location,
    type: college.type,
    officialWebsite: college.official_website,
    acceptanceRate: college.acceptance_rate,
    programs: parseJSONField(college.programs),
    tuitionCost: college.tuition_cost,
    financialAidAvailable: Boolean(college.financial_aid_available),
    logoUrl: college.logo_url,
    description: college.description
  };
}

/**
 * Get recommendations for a specific user by ID
 * TODO 7: Create recommendation service
 */
async function getRecommendationsForUser(userId, colleges, options = {}) {
  const User = require('../src/models/User');
  
  // Get user's academic profile
  const userProfile = User.getAcademicProfile(userId);
  
  if (!userProfile) {
    return {
      success: false,
      error: 'User not found',
      reach: [],
      match: [],
      safety: []
    };
  }
  
  if (!userProfile.academic_board && !userProfile.preferences?.intended_major) {
    return {
      success: false,
      error: 'Please complete your profile first',
      redirect: '/onboarding',
      reach: [],
      match: [],
      safety: []
    };
  }
  
  return generateRecommendations(userProfile, colleges, options);
}

module.exports = {
  generateRecommendations,
  getRecommendationsForUser,
  deriveUserSignals,
  normalizeCollegeFeatures,
  calculateSignalScores,
  classifyCollege,
  generateExplanation,
  SCORING_WEIGHTS,
  CLASSIFICATION_THRESHOLDS
};

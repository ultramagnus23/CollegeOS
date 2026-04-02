// backend/services/recommendationEngine.js
// The brain of CollegeOS - recommends colleges based on student profile

const { checkEligibility } = require('./eligibilityChecker');
const { getUSDtoINR } = require('./exchangeRateService');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5050';

/**
 * Generate personalized college recommendations for a student
 * This is the CORE intelligence that makes CollegeOS revolutionary
 * 
 * @param {Object} studentProfile - Complete student profile
 * @param {Array} allColleges - All available colleges
 * @returns {Promise<Array>} Colleges with recommendation scores and classifications
 */
async function generateRecommendations(studentProfile, allColleges) {
  const usdToInr = await getUSDtoINR();
  const recommendations = [];
  
  for (const college of allColleges) {
    // Check eligibility first
    const eligibility = checkEligibility(
      studentProfile, 
      college, 
      studentProfile.preferences?.intended_major
    );
    
    // Skip if completely ineligible
    if (eligibility.status === 'not_eligible' && eligibility.issues.length > 3) {
      continue;
    }
    
    // Compute recommendation scores (academic fit calls /predict asynchronously)
    const scores = await computeRecommendationScores(studentProfile, college, eligibility, usdToInr);
    
    // Classify as Reach/Target/Safety
    const classification = classifyCollege(scores, studentProfile, college);
    
    // Compute financial fit using live exchange rate
    const financialFit = computeFinancialFit(studentProfile, college, usdToInr);
    
    // Generate why recommended and concerns
    const reasoning = generateReasoning(studentProfile, college, eligibility, scores, financialFit);
    
    // Compute values resonance (new — 30% of overall fit)
    const valuesResult = computeValuesResonance(studentProfile, college);

    recommendations.push({
      college,
      eligibility,
      scores,
      classification,
      financial_fit: financialFit,
      overall_fit_score: computeOverallFit(scores, financialFit, valuesResult.score),
      why_recommended: reasoning.why,
      concerns: reasoning.concerns,
      why_values: valuesResult.whyValues,
      application_effort: estimateApplicationEffort(college)
    });
  }
  
  // Sort by overall fit score
  recommendations.sort((a, b) => b.overall_fit_score - a.overall_fit_score);
  
  return recommendations;
}

/**
 * Compute multiple recommendation scores
 */
async function computeRecommendationScores(student, college, eligibility, usdToInr = null) {
  if (!usdToInr || usdToInr <= 0) {
    throw new Error('usdToInr must be a positive live exchange rate; never use a hardcoded default');
  }
  return {
    eligibility_score: computeEligibilityScore(eligibility),
    academic_fit: await computeAcademicFit(student, college),
    program_strength: computeProgramStrength(college, student.preferences?.intended_major),
    cost_affordability: computeCostAffordability(student, college, usdToInr),
    outcome_quality: computeOutcomeQuality(college),
    application_feasibility: computeApplicationFeasibility(college)
  };
}

/**
 * Convert eligibility status to score
 */
function computeEligibilityScore(eligibility) {
  if (eligibility.status === 'eligible') return 1.0;
  if (eligibility.status === 'conditional') {
    // Deduct based on number of warnings
    return Math.max(0.5, 1.0 - (eligibility.warnings.length * 0.1));
  }
  // Not eligible but some path forward
  return Math.max(0.2, 1.0 - (eligibility.issues.length * 0.15));
}

/**
 * Academic fit – calls the synthetic LDA /predict endpoint.
 * Falls back to a simple percentile heuristic when the ML service is unavailable.
 */
async function computeAcademicFit(student, college) {
  try {
    const axios = require('axios');
    const response = await axios.post(
      `${ML_SERVICE_URL}/predict`,
      { student, college, cds_data: {} },
      { timeout: 4000 }
    );
    const data = response?.data;
    if (data?.success && typeof data.probability === 'number') {
      // Mahalanobis distance-based fit: closer to admitted centroid → higher fit
      // probability is 0-100; normalise to 0-1
      return Math.min(1.0, data.probability / 100);
    }
  } catch (_err) {
    // ML service unavailable – fall through to heuristic
  }

  // Fallback heuristic using student percentage vs. college min requirement
  let score = 0.5;
  const requirements = college.requirements || {};
  const studentPercentage = student.academic?.percentage || 0;

  if (requirements.min_percentage) {
    const difference = studentPercentage - requirements.min_percentage;
    if (difference >= 10) score = 0.95;
    else if (difference >= 5) score = 0.85;
    else if (difference >= 0) score = 0.70;
    else if (difference >= -5) score = 0.50;
    else score = 0.30;
  }

  const acceptanceRate = college.acceptance_rate || 0.5;
  if (acceptanceRate < 0.10) score *= 0.8;
  else if (acceptanceRate < 0.20) score *= 0.9;
  else if (acceptanceRate > 0.50) score *= 1.1;

  return Math.min(1.0, score);
}

/**
 * Program strength for student's intended major.
 * Uses college.qs_rank and college.program_rankings when available.
 */
function computeProgramStrength(college, intendedMajor) {
  if (!intendedMajor) return 0.7;

  const programs = Array.isArray(college.programs)
    ? college.programs
    : JSON.parse(college.programs || '[]');

  // Check if college offers the program
  const hasProgram = programs.some(p =>
    p.toLowerCase().includes(intendedMajor.toLowerCase()) ||
    intendedMajor.toLowerCase().includes(p.toLowerCase())
  );

  if (!hasProgram) return 0.3;

  // 1) Use subject/program-specific ranking if available
  const programRankings = college.program_rankings || {};
  const majorKey = intendedMajor.toLowerCase().replace(/\s+/g, '_');
  const programRank = programRankings[majorKey] || programRankings[intendedMajor];
  if (typeof programRank === 'number' && programRank > 0) {
    if (programRank <= 10) return 0.98;
    if (programRank <= 25) return 0.93;
    if (programRank <= 50) return 0.87;
    if (programRank <= 100) return 0.80;
    if (programRank <= 200) return 0.72;
    return 0.65;
  }

  // 2) Fall back to overall QS world ranking
  const qsRank = college.qs_rank;
  if (typeof qsRank === 'number' && qsRank > 0) {
    if (qsRank <= 10) return 0.97;
    if (qsRank <= 50) return 0.90;
    if (qsRank <= 100) return 0.82;
    if (qsRank <= 200) return 0.74;
    if (qsRank <= 500) return 0.66;
    return 0.60;
  }

  // 3) Acceptance-rate proxy (existing fallback)
  const acceptanceRate = college.acceptance_rate || 0.5;
  if (acceptanceRate < 0.15) return 0.95;
  if (acceptanceRate < 0.30) return 0.85;
  if (acceptanceRate < 0.50) return 0.75;
  return 0.65;
}

/**
 * Cost affordability based on student's budget.
 * usdToInr is the live exchange rate passed in from generateRecommendations.
 */
function computeCostAffordability(student, college, usdToInr = null) {
  if (!usdToInr || usdToInr <= 0) {
    throw new Error('usdToInr must be a positive live exchange rate; never use a hardcoded default');
  }
  const budget = student.financial?.max_budget_per_year || Infinity;
  const needsAid = student.financial?.need_financial_aid || false;
  
  const researchData = typeof college.research_data === 'object'
    ? college.research_data
    : JSON.parse(college.research_data || '{}');
  
  // Estimate total annual cost (tuition + living)
  const tuitionUSD = researchData.avg_cost || 50000;
  const livingUSD = 15000;
  const totalUSD = tuitionUSD + livingUSD;
  const totalINR = totalUSD * usdToInr;
  
  // Check if within budget
  const ratio = budget / totalINR;
  
  if (ratio >= 1.0) return 1.0;
  if (ratio >= 0.8) return 0.85;
  if (ratio >= 0.6) return 0.65;
  
  // Below budget - check if aid is available
  if (needsAid && researchData.aid_available) {
    if (researchData.aid_percentage > 0.7) return 0.75;
    if (researchData.aid_percentage > 0.5) return 0.60;
    return 0.45;
  }
  
  return 0.25; // Not affordable
}

/**
 * Outcome quality – uses Return on Investment (ROI) as the primary signal.
 * ROI = median_earnings_6yr / avg_net_price.  Falls back to acceptance-rate proxy.
 */
function computeOutcomeQuality(college) {
  const medianEarnings = college.median_earnings_6yr
    || college.median_salary_6yr
    || college.outcome_salary_6yr
    || null;

  const avgNetPrice = college.avg_net_price
    || college.net_price
    || null;

  if (medianEarnings && avgNetPrice && avgNetPrice > 0) {
    const roi = medianEarnings / avgNetPrice;
    // Typical "great" ROI ≈ 1.5–2.0+; normalise to 0-1
    if (roi >= 2.0) return 1.00;
    if (roi >= 1.5) return 0.90;
    if (roi >= 1.0) return 0.78;
    if (roi >= 0.7) return 0.65;
    if (roi >= 0.5) return 0.55;
    return 0.40;
  }

  // Fallback: acceptance-rate proxy
  const acceptanceRate = college.acceptance_rate || 0.5;
  if (acceptanceRate < 0.10) return 0.95;
  if (acceptanceRate < 0.20) return 0.85;
  if (acceptanceRate < 0.35) return 0.75;
  if (acceptanceRate < 0.50) return 0.65;
  return 0.55;
}

/**
 * Application feasibility - how complex is the application?
 */
function computeApplicationFeasibility(college) {
  const requirements = college.requirements || {};
  let complexity = 0;
  
  // Essays make it harder
  if (requirements.essay_required) complexity += 2;
  
  // LORs add complexity
  if (requirements.lors_required) complexity += 1;
  
  // Interviews add complexity
  if (requirements.interview) complexity += 1;
  
  // Multiple required exams
  const requiredExams = requirements.required_exams || [];
  complexity += requiredExams.length * 0.5;
  
  // Convert complexity to feasibility score
  if (complexity <= 1) return 1.0; // Very easy
  if (complexity <= 2) return 0.85; // Easy
  if (complexity <= 3) return 0.70; // Moderate
  if (complexity <= 4) return 0.55; // Complex
  return 0.40; // Very complex
}

/**
 * Classify college as Reach/Target/Safety
 */
function classifyCollege(scores, student, college) {
  const combinedScore = (
    scores.eligibility_score * 0.4 +
    scores.academic_fit * 0.4 +
    scores.application_feasibility * 0.2
  );
  
  const acceptanceRate = college.acceptance_rate || 0.5;
  
  // Elite schools (< 15% acceptance) are always reach unless perfect profile
  if (acceptanceRate < 0.15 && combinedScore < 0.95) {
    return 'REACH';
  }
  
  // High combined score = Safety
  if (combinedScore >= 0.85 && acceptanceRate > 0.40) {
    return 'SAFETY';
  }
  
  // Low combined score = Reach
  if (combinedScore < 0.60) {
    return 'REACH';
  }
  
  // Medium = Target
  return 'TARGET';
}

/**
 * Compute financial fit details.
 * usdToInr is passed from generateRecommendations (live rate with 24h cache).
 */
function computeFinancialFit(student, college, usdToInr = null) {
  if (!usdToInr || usdToInr <= 0) {
    throw new Error('usdToInr must be a positive live exchange rate; never use a hardcoded default');
  }
  const budget = student.financial?.max_budget_per_year || Infinity;
  const canLoan = student.financial?.can_take_loan || false;
  const needsAid = student.financial?.need_financial_aid || false;
  
  const researchData = typeof college.research_data === 'object'
    ? college.research_data
    : JSON.parse(college.research_data || '{}');
  
  const tuitionUSD = researchData.avg_cost || 50000;
  const livingUSD = 15000;
  const totalUSD = tuitionUSD + livingUSD;
  const totalINR = totalUSD * usdToInr;
  
  // Check work opportunities
  const canWork = college.country === 'US' || college.country === 'Canada' || college.country === 'UK';
  const workEarnings = canWork ? 800000 : 0; // ~$10K per year
  
  const effectiveCost = totalINR - workEarnings;
  
  return {
    tuition_inr: tuitionUSD * usdToInr,
    living_cost_inr: livingUSD * usdToInr,
    total_per_year: totalINR,
    four_year_total: totalINR * 4,
    within_budget: totalINR <= budget,
    needs_aid: totalINR > budget && needsAid,
    aid_available: researchData.aid_available || false,
    can_work_part_time: canWork,
    estimated_work_earnings: workEarnings,
    effective_cost: effectiveCost,
    affordability: budget >= effectiveCost ? 'AFFORDABLE' : 'STRETCH'
  };
}

/**
 * Compute overall fit score (0-100).
 * Weights: eligibility 17.5%, academic_fit 14%, program_strength 14%,
 *          cost_affordability 14%, outcome_quality 7%, application_feasibility 3.5%,
 *          values_resonance 30%  (new)
 */
function computeOverallFit(scores, financialFit, valuesScore = 0) {
  const weightedScore = (
    scores.eligibility_score    * 17.5 +
    scores.academic_fit         * 14   +
    scores.program_strength     * 14   +
    scores.cost_affordability   * 14   +
    scores.outcome_quality      *  7   +
    scores.application_feasibility * 3.5 +
    valuesScore                 * 30
  );

  return Math.round(weightedScore);
}

/**
 * Generate reasoning - why recommended and concerns
 */
function generateReasoning(student, college, eligibility, scores, financialFit) {
  const why = [];
  const concerns = [];
  
  // Eligibility
  if (eligibility.status === 'eligible') {
    why.push('You meet all admission requirements');
  } else if (eligibility.status === 'conditional') {
    why.push(`You're eligible with ${eligibility.warnings.length} requirement(s) to complete`);
  }
  
  // Academic fit
  if (scores.academic_fit >= 0.85) {
    why.push('Your academic profile matches typical successful applicants');
  } else if (scores.academic_fit < 0.60) {
    concerns.push('Your grades are below typical admits - consider this a reach');
  }
  
  // Program
  if (scores.program_strength >= 0.85) {
    why.push(`Strong ${student.preferences?.intended_major || 'program'} program`);
  }
  
  // Cost
  if (financialFit.within_budget) {
    why.push('Within your budget');
  } else if (financialFit.aid_available) {
    why.push('Financial aid available to make it affordable');
  } else {
    concerns.push(`Cost (₹${(financialFit.total_per_year / 100000).toFixed(1)}L/year) exceeds budget`);
  }
  
  // Work opportunities
  if (financialFit.can_work_part_time) {
    why.push('Can work part-time to offset costs');
  }
  
  // Acceptance rate
  const acceptanceRate = college.acceptance_rate || 0.5;
  if (acceptanceRate < 0.15) {
    concerns.push(`Highly competitive (${(acceptanceRate * 100).toFixed(1)}% acceptance rate)`);
  } else if (acceptanceRate > 0.50) {
    why.push('Good acceptance rate - realistic option');
  }
  
  // Indian students
  const researchData = typeof college.research_data === 'object'
    ? college.research_data
    : JSON.parse(college.research_data || '{}');
  
  if (researchData.indian_students > 500) {
    why.push(`Strong Indian community (${researchData.indian_students}+ students)`);
  }
  
  // Application complexity
  if (scores.application_feasibility >= 0.85) {
    why.push('Simple application process');
  } else if (scores.application_feasibility < 0.60) {
    concerns.push('Complex application (multiple essays, interviews)');
  }
  
  return { why, concerns };
}

/**
 * Estimate application effort
 */
function estimateApplicationEffort(college) {
  const requirements = college.requirements || {};
  
  let effortScore = 0;
  if (requirements.essay_required) effortScore += 3;
  if (requirements.lors_required) effortScore += 2;
  if (requirements.interview) effortScore += 2;
  
  const requiredExams = requirements.required_exams || [];
  effortScore += requiredExams.length;
  
  if (effortScore <= 2) return { level: 'LOW', hours: '2-5 hours' };
  if (effortScore <= 5) return { level: 'MEDIUM', hours: '10-15 hours' };
  return { level: 'HIGH', hours: '20-30 hours' };
}

/**
 * Compute values resonance score (0–1) based on how well the college matches
 * the student's dominant_values from their values_vector.
 *
 * Returns an object: { score: 0-1, whyValues: string[] }
 */
function computeValuesResonance(student, college) {
  const valuesVector = student.values_vector;
  if (!valuesVector || !Array.isArray(valuesVector.dominant_values) || valuesVector.dominant_values.length === 0) {
    return { score: 0, whyValues: [] };
  }

  const dominant = valuesVector.dominant_values;
  const dimensions = valuesVector.dimensions || {};
  const name = college.name || '';
  const country = (college.country || '').toUpperCase();
  const acceptanceRate = college.acceptance_rate || 0.5;
  const description = (college.description || '').toLowerCase();
  const whyValues = [];
  let matchCount = 0;

  for (const value of dominant) {
    const evidence = dimensions[value]?.evidence || null;
    let matched = false;

    switch (value) {
      case 'entrepreneurship':
        if (
          /silicon valley|startup|entrepreneurship|innovation|venture|builder/i.test(description) ||
          (country === 'USA' && acceptanceRate > 0.20)
        ) {
          whyValues.push(
            `${name}'s innovation culture aligns with your goal to ${evidence ? `"${evidence}"` : 'build and create'}.`
          );
          matched = true;
        }
        break;

      case 'research':
        if (
          /r1|research university|phd|doctoral|laboratory|lab|research-intensive/i.test(description) ||
          (college.research_output_score && college.research_output_score > 70)
        ) {
          whyValues.push(
            `${name} is a leading research university — ideal since you want to ${evidence ? `"${evidence}"` : 'push knowledge forward'}.`
          );
          matched = true;
        }
        break;

      case 'social_impact':
        if (/liberal arts|public policy|social policy|development|community|civic|impact/i.test(description)) {
          whyValues.push(
            `${name}'s focus on policy and community engagement fits your goal to ${evidence ? `"${evidence}"` : 'create social change'}.`
          );
          matched = true;
        }
        break;

      case 'prestige_career':
        if (acceptanceRate < 0.15) {
          whyValues.push(
            `${name}'s selective admissions (${(acceptanceRate * 100).toFixed(1)}% acceptance) signals the top-tier career outcomes you value${evidence ? ` — "${evidence}"` : ''}.`
          );
          matched = true;
        }
        break;

      case 'creative_expression':
        if (/arts|design|music|film|creative|media|humanities/i.test(description)) {
          whyValues.push(
            `${name}'s arts and creative programs resonate with your interest in ${evidence ? `"${evidence}"` : 'creative work'}.`
          );
          matched = true;
        }
        break;

      case 'community_belonging':
        if (/community|campus life|tradition|spirit|athletics|greek/i.test(description)) {
          whyValues.push(
            `${name}'s vibrant campus community fits what you described: ${evidence ? `"${evidence}"` : 'belonging and friendship'}.`
          );
          matched = true;
        }
        break;

      case 'global_exposure':
        if (
          country !== 'IN' && country !== 'IND' && country !== 'INDIA' ||
          /international|global|diverse|multicultural/i.test(description)
        ) {
          whyValues.push(
            `${name}'s international student body and global network match your goal of ${evidence ? `"${evidence}"` : 'building a global perspective'}.`
          );
          matched = true;
        }
        break;

      case 'academic_freedom':
        if (/open curriculum|design your own|no core|flexible|interdisciplinary|brown/i.test(`${description} ${name}`)) {
          whyValues.push(
            `${name}'s open or flexible curriculum lets you ${evidence ? `"${evidence}"` : 'explore broadly without being locked in'}.`
          );
          matched = true;
        }
        break;

      case 'financial_pragmatism': {
        // Meets full need, or Germany (typically no tuition)
        const fundingRows = Array.isArray(college.funding) ? college.funding : [];
        const meetsNeed = fundingRows.some(f => f.meets_full_demonstrated_need && f.international_students_eligible);
        if (meetsNeed || /germany|deutschland/i.test(country)) {
          whyValues.push(
            `${name} ${meetsNeed ? 'meets 100% of demonstrated financial need' : 'charges no tuition fees'} — directly supporting your priority of ${evidence ? `"${evidence}"` : 'value for money'}.`
          );
          matched = true;
        }
        break;
      }

      case 'personal_growth':
        if (/wellness|counseling|support|mental health|liberal arts|holistic|self|community/i.test(description)) {
          whyValues.push(
            `${name}'s emphasis on holistic student development aligns with your focus on ${evidence ? `"${evidence}"` : 'personal growth'}.`
          );
          matched = true;
        }
        break;
    }

    if (matched) matchCount++;
  }

  const score = dominant.length > 0 ? matchCount / dominant.length : 0;
  return { score, whyValues };
}


function filterRecommendations(recommendations, filters) {
  let filtered = [...recommendations];
  
  // Filter by classification
  if (filters.classification && filters.classification !== 'all') {
    filtered = filtered.filter(r => r.classification === filters.classification.toUpperCase());
  }
  
  // Filter by budget
  if (filters.within_budget) {
    filtered = filtered.filter(r => r.financial_fit.within_budget);
  }
  
  // Filter by eligibility
  if (filters.eligibility === 'eligible') {
    filtered = filtered.filter(r => r.eligibility.status === 'eligible');
  }
  
  // Filter by country
  if (filters.country) {
    filtered = filtered.filter(r => r.college.country === filters.country);
  }
  
  // Sort
  if (filters.sort === 'cost') {
    filtered.sort((a, b) => a.financial_fit.total_per_year - b.financial_fit.total_per_year);
  } else if (filters.sort === 'ranking') {
    filtered.sort((a, b) => (a.college.acceptance_rate || 1) - (b.college.acceptance_rate || 1));
  } else if (filters.sort === 'acceptance_rate') {
    filtered.sort((a, b) => (b.college.acceptance_rate || 0) - (a.college.acceptance_rate || 0));
  }
  // Default is already sorted by fit score
  
  return filtered;
}

module.exports = {
  generateRecommendations,
  filterRecommendations
};
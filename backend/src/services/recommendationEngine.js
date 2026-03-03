// backend/services/recommendationEngine.js
// The brain of CollegeOS - recommends colleges based on student profile

const { checkEligibility } = require('./eligibilityChecker');

/**
 * Generate personalized college recommendations for a student
 * This is the CORE intelligence that makes CollegeOS revolutionary
 * 
 * @param {Object} studentProfile - Complete student profile
 * @param {Array} allColleges - All available colleges
 * @returns {Array} Colleges with recommendation scores and classifications
 */
function generateRecommendations(studentProfile, allColleges) {
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
    
    // Compute recommendation scores
    const scores = computeRecommendationScores(studentProfile, college, eligibility);
    
    // Classify as Reach/Target/Safety
    const classification = classifyCollege(scores, studentProfile, college);
    
    // Compute financial fit
    const financialFit = computeFinancialFit(studentProfile, college);
    
    // Generate why recommended and concerns
    const reasoning = generateReasoning(studentProfile, college, eligibility, scores, financialFit);
    
    recommendations.push({
      college,
      eligibility,
      scores,
      classification,
      financial_fit: financialFit,
      overall_fit_score: computeOverallFit(scores, financialFit),
      why_recommended: reasoning.why,
      concerns: reasoning.concerns,
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
function computeRecommendationScores(student, college, eligibility) {
  return {
    eligibility_score: computeEligibilityScore(eligibility),
    academic_fit: computeAcademicFit(student, college),
    program_strength: computeProgramStrength(college, student.preferences?.intended_major),
    cost_affordability: computeCostAffordability(student, college),
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
 * Academic fit - how well student's profile matches typical admits
 */
function computeAcademicFit(student, college) {
  let score = 0.5; // Baseline
  
  const requirements = college.requirements || {};
  const studentPercentage = student.academic?.percentage || 0;
  
  // Compare to typical admits
  if (requirements.min_percentage) {
    const difference = studentPercentage - requirements.min_percentage;
    
    if (difference >= 10) score = 0.95; // Well above
    else if (difference >= 5) score = 0.85; // Above
    else if (difference >= 0) score = 0.70; // At level
    else if (difference >= -5) score = 0.50; // Slightly below
    else score = 0.30; // Below
  }
  
  // Adjust for acceptance rate
  const acceptanceRate = college.acceptance_rate || 0.5;
  if (acceptanceRate < 0.10) score *= 0.8; // Very selective
  else if (acceptanceRate < 0.20) score *= 0.9; // Selective
  else if (acceptanceRate > 0.50) score *= 1.1; // More accessible
  
  return Math.min(1.0, score);
}

/**
 * Program strength for student's intended major
 */
function computeProgramStrength(college, intendedMajor) {
  if (!intendedMajor) return 0.7; // Default if no major specified
  
  const programs = Array.isArray(college.programs) 
    ? college.programs 
    : JSON.parse(college.programs || '[]');
  
  // Check if college offers the program
  const hasProgram = programs.some(p => 
    p.toLowerCase().includes(intendedMajor.toLowerCase()) ||
    intendedMajor.toLowerCase().includes(p.toLowerCase())
  );
  
  if (!hasProgram) return 0.3; // Doesn't offer program
  
  // Could be enhanced with actual program rankings
  // For now, use acceptance rate as proxy for quality
  const acceptanceRate = college.acceptance_rate || 0.5;
  if (acceptanceRate < 0.15) return 0.95; // Elite program
  if (acceptanceRate < 0.30) return 0.85; // Strong program
  if (acceptanceRate < 0.50) return 0.75; // Good program
  return 0.65; // Decent program
}

/**
 * Cost affordability based on student's budget
 */
function computeCostAffordability(student, college) {
  const budget = student.financial?.max_budget_per_year || Infinity;
  const needsAid = student.financial?.need_financial_aid || false;
  
  const researchData = typeof college.research_data === 'object'
    ? college.research_data
    : JSON.parse(college.research_data || '{}');
  
  // Estimate total annual cost (tuition + living)
  const tuitionUSD = researchData.avg_cost || 50000;
  const livingUSD = 15000; // Rough estimate
  const totalUSD = tuitionUSD + livingUSD;
  const totalINR = totalUSD * 82; // Rough conversion
  
  // Check if within budget
  const ratio = budget / totalINR;
  
  if (ratio >= 1.0) return 1.0; // Well within budget
  if (ratio >= 0.8) return 0.85; // Slightly tight
  if (ratio >= 0.6) return 0.65; // Need to stretch
  
  // Below budget - check if aid is available
  if (needsAid && researchData.aid_available) {
    if (researchData.aid_percentage > 0.7) return 0.75; // Good aid
    if (researchData.aid_percentage > 0.5) return 0.60; // Moderate aid
    return 0.45; // Limited aid
  }
  
  return 0.25; // Not affordable
}

/**
 * Outcome quality - employment, salary, etc.
 */
function computeOutcomeQuality(college) {
  const researchData = typeof college.research_data === 'object'
    ? college.research_data
    : JSON.parse(college.research_data || '{}');
  
  // Use acceptance rate as proxy for outcome quality
  // (Lower acceptance = better outcomes typically)
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
 * Compute financial fit details
 */
function computeFinancialFit(student, college) {
  const budget = student.financial?.max_budget_per_year || Infinity;
  const canLoan = student.financial?.can_take_loan || false;
  const needsAid = student.financial?.need_financial_aid || false;
  
  const researchData = typeof college.research_data === 'object'
    ? college.research_data
    : JSON.parse(college.research_data || '{}');
  
  const tuitionUSD = researchData.avg_cost || 50000;
  const livingUSD = 15000;
  const totalUSD = tuitionUSD + livingUSD;
  const totalINR = totalUSD * 82;
  
  // Check work opportunities
  const canWork = college.country === 'US' || college.country === 'Canada' || college.country === 'UK';
  const workEarnings = canWork ? 800000 : 0; // ~$10K per year
  
  const effectiveCost = totalINR - workEarnings;
  
  return {
    tuition_inr: tuitionUSD * 82,
    living_cost_inr: livingUSD * 82,
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
 * Compute overall fit score (0-100)
 */
function computeOverallFit(scores, financialFit) {
  const weightedScore = (
    scores.eligibility_score * 25 +
    scores.academic_fit * 20 +
    scores.program_strength * 20 +
    scores.cost_affordability * 20 +
    scores.outcome_quality * 10 +
    scores.application_feasibility * 5
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
 * Filter and sort recommendations based on preferences
 */
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
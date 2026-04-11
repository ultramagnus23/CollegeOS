/**
 * backend/src/services/chancingService.js
 * ─────────────────────────────────────────
 * Computes admit-chance on top of the cosine-similarity recommendation score.
 *
 * The algorithm is fully deterministic and requires no external API calls.
 * It combines:
 *   1. The college's raw admission rate (base)
 *   2. An academic-dimension cosine similarity between the student's academic
 *      sub-vector (dims 0–5) and the college's selectivity sub-vector (dims 0–5)
 *   3. A multiplier derived from the academic similarity
 *   4. Specific reasoning sentences using actual GPA / SAT numbers
 */

'use strict';

const { cosineSimilarity } = require('./vectorService');

/**
 * Compute admit chance and tier for a student–college pair.
 *
 * @param {number[]} userVector     28-dim user vector (from buildUserVector)
 * @param {number[]} collegeVector  28-dim college vector (from buildCollegeVector)
 * @param {object}   college        Raw college row (from colleges_comprehensive)
 * @param {object}   userRaw        Raw user / profile data (for human-readable reasoning)
 *
 * @returns {{
 *   chance: number,           // 0–100 percentage
 *   tier: string,             // 'Safety' | 'Target' | 'Reach'
 *   reasoning: string[],      // Array of plain-English explanation bullets
 *   academic_similarity: number,  // 0–100
 *   overall_fit: number           // 0–100
 * }}
 */
function computeAdmitChance(userVector, collegeVector, college, userRaw) {
  // ── 1. Base admission rate ────────────────────────────────────────────────
  const rawAdmissionRate = parseFloat(
    college.admission_rate ?? college.acceptance_rate
  );
  const baseRate = isNaN(rawAdmissionRate)
    ? 0.5
    : Math.max(0.01, Math.min(0.99, rawAdmissionRate));

  // ── 2. Academic sub-vector comparison (dims 0–5) ──────────────────────────
  const userAcademic     = userVector.slice(0, 6);
  const collegeAcademic  = collegeVector.slice(0, 6);
  const academicSim      = cosineSimilarity(userAcademic, collegeAcademic);

  // ── 3. Multiplier based on academic similarity ────────────────────────────
  let multiplier;
  if      (academicSim > 0.85) multiplier = 2.5;
  else if (academicSim > 0.65) multiplier = 1.5;
  else if (academicSim > 0.45) multiplier = 0.8;
  else                          multiplier = 0.3;

  const chance = Math.min(baseRate * multiplier, 0.92);

  // ── 4. Tier classification ────────────────────────────────────────────────
  let tier;
  if      (chance > 0.65) tier = 'Safety';
  else if (chance > 0.30) tier = 'Target';
  else                     tier = 'Reach';

  // ── 5. Reasoning sentences ────────────────────────────────────────────────
  const reasoning = [];

  // GPA comparison
  const studentGPA  = parseFloat(userRaw?.gpa ?? userRaw?.gpa_unweighted);
  const collegeGPA  = parseFloat(college?.gpa_50 ?? college?.median_gpa ?? college?.avg_gpa);
  if (!isNaN(studentGPA) && !isNaN(collegeGPA) && collegeGPA > 0) {
    const diff = studentGPA - collegeGPA;
    if (diff > 0.2)
      reasoning.push(`Your GPA (${studentGPA.toFixed(2)}) is above this school's average (${collegeGPA.toFixed(2)})`);
    else if (diff < -0.2)
      reasoning.push(`Your GPA (${studentGPA.toFixed(2)}) is below this school's average (${collegeGPA.toFixed(2)})`);
    else
      reasoning.push(`Your GPA (${studentGPA.toFixed(2)}) is close to this school's average (${collegeGPA.toFixed(2)})`);
  }

  // SAT comparison
  const studentSAT = parseInt(userRaw?.sat_score ?? userRaw?.sat_total);
  const sat25      = parseInt(college?.sat_25 ?? college?.sat_25th ?? college?.sat_range_low);
  const sat75      = parseInt(college?.sat_75 ?? college?.sat_75th ?? college?.sat_range_high);
  const satAvg     = parseInt(college?.sat_avg ?? college?.sat_average ?? college?.sat_total_50);

  if (!isNaN(studentSAT) && studentSAT > 0) {
    if (!isNaN(sat75) && !isNaN(sat25)) {
      if (studentSAT >= sat75)
        reasoning.push(`Your SAT (${studentSAT}) is above the 75th percentile (${sat75})`);
      else if (studentSAT < sat25)
        reasoning.push(`Your SAT (${studentSAT}) is below the 25th percentile (${sat25})`);
      else
        reasoning.push(`Your SAT (${studentSAT}) falls between the 25th (${sat25}) and 75th (${sat75}) percentile`);
    } else if (!isNaN(satAvg) && satAvg > 0) {
      const diff = studentSAT - satAvg;
      if (diff > 60)
        reasoning.push(`Your SAT (${studentSAT}) is above the school average (${satAvg})`);
      else if (diff < -60)
        reasoning.push(`Your SAT (${studentSAT}) is below the school average (${satAvg})`);
      else
        reasoning.push(`Your SAT (${studentSAT}) is close to the school average (${satAvg})`);
    }
  }

  // ACT comparison (if no SAT)
  if (isNaN(studentSAT) || studentSAT === 0) {
    const studentACT = parseInt(userRaw?.act_score ?? userRaw?.act_composite);
    const collegeACT = parseInt(college?.act_avg ?? college?.act_50 ?? college?.act_average);
    if (!isNaN(studentACT) && !isNaN(collegeACT) && collegeACT > 0) {
      const diff = studentACT - collegeACT;
      if (diff > 2)
        reasoning.push(`Your ACT (${studentACT}) is above the school average (${collegeACT})`);
      else if (diff < -2)
        reasoning.push(`Your ACT (${studentACT}) is below the school average (${collegeACT})`);
      else
        reasoning.push(`Your ACT (${studentACT}) is close to the school average (${collegeACT})`);
    }
  }

  // Admission rate bullet (always shown)
  const admitPct = Math.round(baseRate * 100);
  reasoning.push(`Admission rate: ${admitPct}%`);

  // International note
  if (userRaw?.is_international) {
    reasoning.push('International applicant pool is typically smaller and more competitive');
  }

  // ── 6. Overall fit ────────────────────────────────────────────────────────
  const overallFit = cosineSimilarity(userVector, collegeVector);

  return {
    chance:              Math.round(chance * 100),
    tier,
    reasoning,
    academic_similarity: Math.round(academicSim * 100),
    overall_fit:         Math.round(overallFit * 100),
  };
}

module.exports = { computeAdmitChance };

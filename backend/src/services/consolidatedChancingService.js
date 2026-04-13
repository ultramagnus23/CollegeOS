// backend/src/services/consolidatedChancingService.js
// Unified chancing service — 7-factor probabilistic model.

const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/security');

// ─────────────────────────────────────────────────────────────────────────────
// MATH HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** @param {number} x @returns {number} */
function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

/** @param {number} p @returns {number} */
function logit(p) { return Math.log(p / (1 - p)); }

/** @param {number} v @param {number} lo @param {number} hi @returns {number} */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** @param {number} a @param {number} b @param {number} t @returns {number} */
function lerp(a, b, t) { return a + (b - a) * t; }

/**
 * Map a student's value onto a 0–1 score relative to the college's admitted band.
 * Falls back to a sigmoid if only the median (p50) is available.
 *
 * @param {number|null} studentVal
 * @param {number|null} p25
 * @param {number|null} p50  - median / average
 * @param {number|null} p75
 * @param {'sat'|'gpa'} kind - controls fallback sigma
 * @returns {number|null}
 */
function percentileScore(studentVal, p25, p50, p75, kind = 'sat') {
  if (studentVal == null) return null;
  const sigma = kind === 'gpa' ? 0.25 : 100;

  if (p25 == null || p75 == null) {
    // Fallback: sigmoid around median
    if (p50 == null) return null;
    return clamp(sigmoid((studentVal - p50) / sigma), 0.05, 0.95);
  }

  const median = p50 ?? (p25 + p75) / 2;

  if (studentVal < p25) {
    // lerp from ~0.05 at p25-200 to 0.30 at p25
    const t = clamp((studentVal - (p25 - 200)) / 200, 0, 1);
    return clamp(lerp(0.05, 0.30, t), 0.05, 0.30);
  }
  if (studentVal <= median) {
    const range = median - p25;
    const t = range > 0 ? (studentVal - p25) / range : 0.5;
    return lerp(0.30, 0.50, clamp(t, 0, 1));
  }
  if (studentVal <= p75) {
    const range = p75 - median;
    const t = range > 0 ? (studentVal - median) / range : 0.5;
    return lerp(0.50, 0.72, clamp(t, 0, 1));
  }
  // above p75
  const t = clamp((studentVal - p75) / 200, 0, 1);
  return clamp(lerp(0.72, 0.92, t), 0.72, 0.92);
}

/**
 * Return selectivity metadata for a given raw acceptance rate.
 * @param {number} acceptRate  fraction 0–1
 * @returns {{ tier: string, varianceMultiplier: number, edBonus: number }}
 */
function selectivityTier(acceptRate) {
  if (acceptRate < 0.05)  return { tier: 'elite',      varianceMultiplier: 2.2, edBonus: 0.06 };
  if (acceptRate < 0.10)  return { tier: 'highly',     varianceMultiplier: 1.7, edBonus: 0.09 };
  if (acceptRate < 0.20)  return { tier: 'selective',  varianceMultiplier: 1.3, edBonus: 0.11 };
  if (acceptRate < 0.40)  return { tier: 'moderate',   varianceMultiplier: 1.0, edBonus: 0.12 };
  return                         { tier: 'accessible', varianceMultiplier: 0.8, edBonus: 0.09 };
}

// ─────────────────────────────────────────────────────────────────────────────
// ACT → SAT concordance (subset; covers 19–36)
// ─────────────────────────────────────────────────────────────────────────────
const ACT_TO_SAT = {
  36: 1590, 35: 1540, 34: 1500, 33: 1460, 32: 1430,
  31: 1400, 30: 1370, 29: 1340, 28: 1310, 27: 1280,
  26: 1240, 25: 1210, 24: 1180, 23: 1140, 22: 1110,
  21: 1080, 20: 1020, 19: 980,  18: 940,  17: 910,
  16: 880,  15: 850,  14: 820,  13: 780,
};

// ─────────────────────────────────────────────────────────────────────────────
// STEM keyword list (for international + institutional fit factors)
// ─────────────────────────────────────────────────────────────────────────────
const STEM_KEYWORDS = [
  'computer', 'cs', 'engineering', 'math', 'physics', 'chemistry',
  'biology', 'statistics', 'data science', 'electrical', 'mechanical',
  'chemical', 'biomedical', 'software', 'aerospace', 'civil',
];

// ─────────────────────────────────────────────────────────────────────────────
// Tier / bucket helpers (kept for backward compat)
// ─────────────────────────────────────────────────────────────────────────────
function normalizeTier(tier) {
  if (!tier) return 'Unknown';
  const n = String(tier).trim().toLowerCase();
  if (n === 'safety') return 'Safety';
  if (n === 'match' || n === 'target') return 'Match';
  if (n === 'reach') return 'Reach';
  if (n === 'long shot' || n === 'longshot') return 'Long Shot';
  if (n === 'extreme reach') return 'Extreme Reach';
  return 'Unknown';
}

function tierBucket(tier) {
  const n = normalizeTier(tier);
  if (n === 'Safety') return 'safety';
  if (n === 'Match')  return 'target';
  if (n === 'Reach' || n === 'Long Shot' || n === 'Extreme Reach') return 'reach';
  return 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate a student's admission probability for a given college.
 *
 * Seven weighted factors:
 *   F1 Academic fit          (0.28)
 *   F2 Selectivity curve     (0.18)
 *   F3 Holistic profile      (0.16)
 *   F4 International pool    (0.14)
 *   F5 Application strategy  (0.12)
 *   F6 Institutional fit     (0.08)
 *   F7 Financial signal      (0.04)
 *
 * @param {Object} studentProfile
 * @param {Object} college
 * @param {Object} [application={}]  - decision_type, demonstrated_interest, intended_major
 * @returns {{
 *   tier: string,
 *   probability: number,
 *   confidence: string,
 *   explanation: Object,
 *   studentSAT: number|null,
 *   collegeSAT: number|null,
 *   studentGPA: number|null,
 *   collegeGPA: number|null,
 *   probabilityRange: { low: number, high: number },
 *   factorScores: Object,
 *   missingDataFields: string[],
 *   recommendedActions: string[]
 * }}
 */
async function calculateChance(studentProfile, college, application = {}) {
  try {
    // ── Convenience aliases ─────────────────────────────────────────────────
    const sp   = studentProfile ?? {};
    const col  = college ?? {};
    const app  = application ?? {};

    const acceptRate = clamp(col.acceptance_rate ?? 0.50, 0.001, 0.999);
    const selTier    = selectivityTier(acceptRate);

    const missingDataFields = [];

    // ── FACTOR 1 — Academic Fit (weight 0.28) ───────────────────────────────
    let f1Weight = 0.28;

    // Resolve student SAT / ACT
    let studentSATRaw = sp.sat_total ?? sp.sat_score ?? null;
    const studentACT  = sp.act_composite ?? null;

    // ACT fallback → SAT conversion
    if (studentSATRaw == null && studentACT != null) {
      const rounded = Math.round(studentACT);
      studentSATRaw = ACT_TO_SAT[rounded] ?? ACT_TO_SAT[clamp(rounded, 13, 36)] ?? null;
    }

    // Resolve student GPA
    const useWeighted = (col.gpa_50 != null && col.gpa_50 > 4.0);
    const effectiveStudentGPA = useWeighted
      ? (sp.gpa_weighted ?? sp.gpa_unweighted ?? sp.gpa ?? null)
      : (sp.gpa_unweighted ?? sp.gpa_weighted ?? sp.gpa ?? null);

    // Test-optional logic
    const testOptional   = col.test_optional === true;
    const studentHasSAT  = studentSATRaw != null;
    const skipTestScore  = testOptional && !studentHasSAT;

    // College SAT references
    const colSat25 = col.sat_25 ?? null;
    const colSat75 = col.sat_75 ?? null;
    const colSatMid = col.sat_avg ?? col.sat_total_50 ?? col.median_sat ?? null;

    // College GPA references
    const colGpa25 = col.gpa_25 ?? null;
    const colGpa75 = col.gpa_75 ?? null;
    const colGpaMid = col.gpa_50 ?? col.median_gpa ?? null;

    // SAT sub-score
    let satScore = null;
    if (!skipTestScore && studentSATRaw != null) {
      if (colSat25 != null || colSat75 != null) {
        satScore = percentileScore(studentSATRaw, colSat25, colSatMid, colSat75, 'sat');
      } else if (colSatMid != null) {
        satScore = clamp(sigmoid((studentSATRaw - colSatMid) / 90), 0.05, 0.95);
      }
    }

    // GPA sub-score
    let gpaScore = null;
    if (effectiveStudentGPA != null) {
      if (colGpa25 != null || colGpa75 != null) {
        gpaScore = percentileScore(effectiveStudentGPA, colGpa25, colGpaMid, colGpa75, 'gpa');
      } else if (colGpaMid != null) {
        gpaScore = clamp(sigmoid((effectiveStudentGPA - colGpaMid) / 0.22), 0.05, 0.95);
      }
    }

    // Combine SAT + GPA
    let academicScore = null;
    if (satScore != null && gpaScore != null) {
      academicScore = satScore * 0.52 + gpaScore * 0.48;
    } else if (satScore != null) {
      academicScore = satScore * 0.60 + 0.50 * 0.40;
    } else if (gpaScore != null) {
      academicScore = gpaScore * 0.60 + 0.50 * 0.40;
    }

    if (sp.sat_total == null && sp.act_composite == null) missingDataFields.push('sat_total / act_composite');
    if (effectiveStudentGPA == null) missingDataFields.push('gpa_unweighted');

    const factorScores = {};
    factorScores.academicFit = {
      score: academicScore,
      weight: f1Weight,
      contribution: academicScore != null ? academicScore * f1Weight : null,
      detail: 'Built from SAT/ACT percentile + GPA percentile vs admitted pool',
    };

    // ── FACTOR 2 — Selectivity Curve (weight 0.18) ─────────────────────────
    const logitAnchor = logit(clamp(acceptRate, 0.01, 0.99));
    const academicZ   = academicScore != null
      ? (academicScore - 0.50) / 0.18
      : 0;
    const rawSelectivity = sigmoid(
      academicZ * (1 / selTier.varianceMultiplier) + logitAnchor
    );
    const rangeHalfWidth = 0.06 * selTier.varianceMultiplier;

    factorScores.selectivity = {
      score: rawSelectivity,
      weight: 0.18,
      contribution: rawSelectivity * 0.18,
      detail: `${selTier.tier} selectivity — signal compression ×${selTier.varianceMultiplier}`,
    };

    // ── FACTOR 3 — Holistic Profile (weight 0.16) ──────────────────────────
    let f3Weight = acceptRate > 0.45 ? 0.08 : 0.16;
    // Weight shift goes to F1 if school is less holistic
    if (acceptRate > 0.45) f1Weight += 0.08;

    const extracurriculars  = Array.isArray(sp.extracurriculars)  ? sp.extracurriculars  : [];
    const awards            = Array.isArray(sp.awards)            ? sp.awards            : [];
    const leadershipRoles   = Array.isArray(sp.leadership_roles)  ? sp.leadership_roles  : [];
    const essay             = sp.essay ?? '';

    const tier1ECs = extracurriculars.filter(e => e.tier === 1).length;
    const tier2ECs = extracurriculars.filter(e => e.tier === 2).length;
    const tier3ECs = extracurriculars.filter(e => e.tier === 3).length;
    const ecScore  = clamp(tier1ECs * 3.5 + tier2ECs * 1.5 + tier3ECs * 0.5, 0, 10);

    const t1Awards = awards.filter(a => a.tier === 1).length;
    const t2Awards = awards.filter(a => a.tier === 2).length;
    const t3Awards = awards.filter(a => a.tier === 3).length;
    const awardsScore = clamp(t1Awards * 2.0 + t2Awards * 1.0 + t3Awards * 0.3, 0, 4);

    const researchBonus    = sp.research ? 1.5 : 0;
    const leadershipBonus  = clamp(leadershipRoles.length * 0.75, 0, 1.5);
    const essayBonus       = (essay && essay.length > 100) ? 1 : 0;

    const rubric            = ecScore + awardsScore + researchBonus + leadershipBonus + essayBonus;
    const profileMultiplier = 0.72 + (rubric / 18) * 0.56;
    const profileScore      = rubric / 18;

    factorScores.holisticProfile = {
      score: profileScore,
      weight: f3Weight,
      contribution: profileScore * f3Weight,
      multiplier: profileMultiplier,
      detail: `EC tier breakdown: ${tier1ECs} national, ${tier2ECs} regional, ${tier3ECs} school`,
    };

    // ── FACTOR 4 — International Pool (weight 0.14) ─────────────────────────
    const studentCountry = sp.country ?? null;
    const collegeCountry = col.country ?? col.location_country ?? 'US';
    const isDomestic     = studentCountry != null
      && (studentCountry.toUpperCase() === (collegeCountry ?? 'US').toUpperCase()
          || (collegeCountry === 'US' || collegeCountry === 'USA')
             && (studentCountry === 'US' || studentCountry === 'USA'));

    let intlScore = null;
    let adjustedIntlRate = null;

    if (!isDomestic) {
      // Determine base intl admit rate
      let baseIntlRate;
      if (col.intl_acceptance_rate != null) {
        baseIntlRate = col.intl_acceptance_rate;
      } else {
        // Estimate from tier
        let tierMult;
        if (acceptRate < 0.10)      tierMult = 0.55;
        else if (acceptRate < 0.20) tierMult = 0.70;
        else if (acceptRate < 0.35) tierMult = 0.85;
        else                        tierMult = 0.95;
        baseIntlRate = acceptRate * tierMult;
      }

      // Country pool adjustment
      const HIGH_COMPETITION = {
        IN: { stem: 0.55, other: 0.80 },
        CN: { stem: 0.60, other: 0.75 },
        KR: { stem: 0.70, other: 0.85 },
        SG: { stem: 0.75, other: 0.88 },
      };
      const LOW_COMPETITION = {
        NG: 1.15, GH: 1.15, ZA: 1.10,
        NO: 1.08, FI: 1.08, DK: 1.08,
        PE: 1.10, CO: 1.10, CL: 1.08,
      };

      const intendedMajor = app.intended_major ?? sp.intended_major ?? '';
      const isStem = STEM_KEYWORDS.some(kw => intendedMajor.toLowerCase().includes(kw));
      const countryUpper = (studentCountry ?? '').toUpperCase();

      let countryMultiplier = 1.0;
      if (HIGH_COMPETITION[countryUpper]) {
        countryMultiplier = isStem
          ? HIGH_COMPETITION[countryUpper].stem
          : HIGH_COMPETITION[countryUpper].other;
      } else if (LOW_COMPETITION[countryUpper]) {
        countryMultiplier = LOW_COMPETITION[countryUpper];
      }

      const schoolTypeMultiplierMap = {
        international_school: 1.0,
        local_curriculum:     0.92,
        homeschool:           0.88,
      };
      const schoolTypeMultiplier = schoolTypeMultiplierMap[sp.school_type] ?? 1.0;

      adjustedIntlRate = baseIntlRate * countryMultiplier * schoolTypeMultiplier;
      intlScore = clamp(adjustedIntlRate / 0.50, 0.02, 1.0);

      factorScores.internationalPool = {
        score: intlScore,
        weight: 0.14,
        contribution: intlScore * 0.14,
        adjustedRate: adjustedIntlRate,
        detail: `Est. intl admit rate ${(adjustedIntlRate * 100).toFixed(1)}% after pool adjustment`,
      };
    }
    // If domestic, skip F4 (redistribute to F1 below)

    // ── FACTOR 5 — Application Strategy (weight 0.12) ──────────────────────
    const decisionType = app.decision_type ?? null;
    let decisionBonus  = 0;
    if (decisionType === 'ED') {
      decisionBonus = selTier.edBonus;
      if (sp.need_based_aid && col.need_aware_intl) decisionBonus *= 0.5;
    } else if (decisionType === 'REA') {
      decisionBonus = selTier.edBonus * 0.55;
    } else if (decisionType === 'EA') {
      decisionBonus = selTier.edBonus * 0.35;
    }

    const tracksInterest = col.tracks_demonstrated_interest === true;
    const diBonus = tracksInterest && app.demonstrated_interest ? 0.04 : 0;

    const yieldRate = col.yield_rate ?? null;
    const yieldAdjustment = yieldRate != null
      ? (yieldRate > 0.75 ? -0.02 : yieldRate < 0.40 ? 0.02 : 0)
      : 0;

    const strategyScore = clamp(0.50 + decisionBonus + diBonus + yieldAdjustment, 0.20, 0.80);

    factorScores.applicationStrategy = {
      score: strategyScore,
      weight: 0.12,
      contribution: strategyScore * 0.12,
      detail: `Decision: ${decisionType ?? 'RD'}, ED bonus: ${(selTier.edBonus * 100).toFixed(0)}pp`,
    };

    // ── FACTOR 6 — Institutional Fit (weight 0.08) ─────────────────────────
    const topMajors   = Array.isArray(col.top_majors) ? col.top_majors : [];
    const intendedMajorStr = app.intended_major ?? sp.intended_major ?? '';

    let majorScore = 0.50;
    if (intendedMajorStr) {
      const lowerMajor = intendedMajorStr.toLowerCase();
      const isEngineering = lowerMajor.includes('engineering');

      if (isEngineering && col.school_type === 'liberal_arts') {
        majorScore = 0.20;
      } else if (topMajors.some(m => lowerMajor.includes(m.toLowerCase()))) {
        majorScore = 0.65;
      }
    }

    let typeAdjustment = 0;
    const isStemMajor = STEM_KEYWORDS.some(kw => intendedMajorStr.toLowerCase().includes(kw));
    if (isStemMajor && col.school_type === 'liberal_arts')    typeAdjustment = -0.05;
    if (!isStemMajor && col.school_type === 'technical')      typeAdjustment = -0.05;

    const institutionalFitScore = clamp(majorScore + typeAdjustment, 0.15, 0.85);

    factorScores.institutionalFit = {
      score: institutionalFitScore,
      weight: 0.08,
      contribution: institutionalFitScore * 0.08,
      detail: `Major alignment score, school type: ${col.school_type ?? 'unknown'}`,
    };

    // ── FACTOR 7 — Financial Signal (weight 0.04) ───────────────────────────
    let financialScore;
    if (!sp.need_based_aid) {
      financialScore = 0.60;
    } else if (col.need_aware_intl) {
      financialScore = 0.35;
    } else if (col.meets_full_need) {
      financialScore = 0.50;
    } else {
      financialScore = 0.42;
    }

    factorScores.financialSignal = {
      score: financialScore,
      weight: 0.04,
      contribution: financialScore * 0.04,
      detail: `Need-based: ${sp.need_based_aid ? 'yes' : 'no'}, need-aware: ${col.need_aware_intl ? 'yes' : 'no'}`,
    };

    // ── ASSEMBLY ─────────────────────────────────────────────────────────────
    // Build factor list with effective weights, excluding null scores
    const rawFactors = [
      { key: 'academicFit',        score: academicScore,          weight: f1Weight },
      { key: 'selectivity',        score: rawSelectivity,         weight: 0.18 },
      { key: 'holisticProfile',    score: profileScore,           weight: f3Weight },
      { key: 'internationalPool',  score: intlScore,              weight: isDomestic ? 0 : 0.14 },
      { key: 'applicationStrategy', score: strategyScore,         weight: 0.12 },
      { key: 'institutionalFit',   score: institutionalFitScore,  weight: 0.08 },
      { key: 'financialSignal',    score: financialScore,         weight: 0.04 },
    ];

    // Redistribute domestic F4 weight to F1
    if (isDomestic) {
      rawFactors[0].weight += 0.14;
    }

    const activeFactors = rawFactors.filter(f => f.score != null && f.weight > 0);
    const totalWeight   = activeFactors.reduce((s, f) => s + f.weight, 0);

    let rawComposite = 0;
    if (activeFactors.length === 0) {
      // Absolute fallback
      rawComposite = clamp(acceptRate * 0.5, 0.01, 0.75);
    } else {
      // Normalise weights and sum
      for (const f of activeFactors) {
        rawComposite += f.score * (f.weight / totalWeight);
      }

      // Apply profile multiplier to the academic portion only
      const academicWeight   = (f1Weight + 0.18) / totalWeight;
      const academicPortion  = rawComposite * academicWeight;
      const rest             = rawComposite - academicPortion;
      rawComposite = academicPortion * profileMultiplier + rest;
    }

    // Elite school ceiling (near-random at sub-5% schools)
    if (selTier.tier === 'elite') {
      const ceiling = clamp(acceptRate * 8, 0.12, 0.40);
      rawComposite  = Math.min(rawComposite, ceiling);
    }

    const probability = clamp(rawComposite, 0.01, 0.95);

    // Probability range
    const probabilityRange = {
      low:  clamp(probability - rangeHalfWidth, 0.01, 0.93),
      high: clamp(probability + rangeHalfWidth, 0.03, 0.95),
    };

    // ── CONFIDENCE SCORING ──────────────────────────────────────────────────
    let confPoints = 0;
    if (studentSATRaw != null && colSat25 != null && colSat75 != null) confPoints += 3;
    else if (studentSATRaw != null && colSatMid != null)               confPoints += 2;
    if (effectiveStudentGPA != null && colGpa25 != null && colGpa75 != null) confPoints += 3;
    else if (effectiveStudentGPA != null && colGpaMid != null)              confPoints += 2;
    if (extracurriculars.length > 0 || awards.length > 0)              confPoints += 2;
    if (decisionType != null)                                          confPoints += 1;
    if (studentCountry != null)                                        confPoints += 1;
    if (col.intl_acceptance_rate != null)                              confPoints += 1;
    if (col.yield_rate != null)                                        confPoints += 1;

    const confidence = confPoints >= 11 ? 'High' : confPoints >= 6 ? 'Medium' : 'Low';

    // ── TIER MAPPING ────────────────────────────────────────────────────────
    let tier;
    if (probability >= 0.68)      tier = 'Safety';
    else if (probability >= 0.42) tier = 'Match';
    else if (probability >= 0.20) tier = 'Reach';
    else if (probability >= 0.08) tier = 'Long Shot';
    else                          tier = 'Extreme Reach';

    // ── RECOMMENDED ACTIONS ─────────────────────────────────────────────────
    const recommendedActions = [];

    if (academicScore != null && academicScore < 0.35 && studentSATRaw != null) {
      recommendedActions.push(
        'Your SAT is below the 25th percentile; retaking could move you into reach territory.'
      );
    }
    if (rubric < 8) {
      recommendedActions.push(
        'Adding a national-level EC or award would significantly improve your holistic profile for this school.'
      );
    }
    if (!decisionType || decisionType === 'RD') {
      if (selTier.tier === 'highly' || selTier.tier === 'selective') {
        recommendedActions.push(
          `Applying ED would increase your estimated probability by ~${(selTier.edBonus * 100).toFixed(0)}pp at this school.`
        );
      }
    }
    if (!isDomestic && intlScore != null && intlScore < 0.25) {
      recommendedActions.push(
        'This school has a highly competitive international pool; consider balancing your list with schools where international rates are higher.'
      );
    }
    if (confidence === 'Low') {
      recommendedActions.push(
        'Adding your ECs and awards would reduce uncertainty in this estimate.'
      );
    }

    // ── EXPLANATION ─────────────────────────────────────────────────────────
    const pct = Math.round(probability * 100);
    let summaryParts = [];
    if (academicScore != null) {
      if (academicScore >= 0.65)      summaryParts.push('Your academic profile is strong');
      else if (academicScore >= 0.45) summaryParts.push('Your academics are competitive');
      else                            summaryParts.push('Your academics are below the typical admit band');
    }
    if (!isDomestic && intlScore != null && intlScore < 0.35) {
      summaryParts.push(`the international pool for ${studentCountry} applicants is very competitive`);
    }
    if (summaryParts.length === 0) summaryParts = [`estimated ${pct}% admission probability`];

    const summary = summaryParts.join(', but ') + '.';

    const explanation = {
      summary,
      factors: factorScores,
      probabilityRange,
      missingDataFields,
      recommendedActions,
    };

    // ── RETURN (backward-compatible shape + new fields) ──────────────────────
    return {
      tier,
      category: tierBucket(tier),
      probability,
      confidence,
      explanation,
      studentSAT: studentSATRaw,
      collegeSAT: colSatMid,
      studentGPA: effectiveStudentGPA,
      collegeGPA: colGpaMid,
      probabilityRange,
      factorScores,
      missingDataFields,
      recommendedActions,
    };
  } catch (error) {
    logger.warn('Chancing calculation failed', {
      college: sanitizeForLog(college?.name),
      error: sanitizeForLog(error?.message),
    });
    return {
      tier: 'Unknown',
      category: 'unknown',
      confidence: 'Low',
      explanation: { summary: 'Unable to calculate chancing — please ensure your profile is complete.' },
      probability: null,
      studentSAT: null,
      collegeSAT: null,
      studentGPA: null,
      collegeGPA: null,
      probabilityRange: null,
      factorScores: {},
      missingDataFields: [],
      recommendedActions: [],
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// Run with: node -e "require('./consolidatedChancingService').runTests()"
// ─────────────────────────────────────────────────────────────────────────────
async function runTests() {
  // Case 1: Indian CS student, 1560 SAT, 3.95 GPA, 2 national ECs → MIT
  const mit = {
    name: 'MIT', acceptance_rate: 0.04, sat_25: 1510, sat_75: 1580, sat_avg: 1545,
    gpa_50: 4.17, gpa_25: 4.0, gpa_75: 4.33,
    country: 'US', school_type: 'technical',
    top_majors: ['computer science', 'engineering'],
  };
  const student1 = {
    sat_total: 1560, gpa_unweighted: 3.95, country: 'IN',
    extracurriculars: [{ tier: 1, name: 'Science Olympiad' }, { tier: 1, name: 'IOI' }],
    awards: [], leadership_roles: [], research: false,
  };
  const r1 = await calculateChance(student1, mit, { intended_major: 'computer science', decision_type: 'RD' });
  console.log('Test 1 (Indian CS, MIT):', r1.tier, `${(r1.probability * 100).toFixed(1)}%`, r1.confidence);

  // Case 2: UK student, no SAT, 3.7 GPA, 1 regional EC, ED → Tufts
  const tufts = {
    name: 'Tufts', acceptance_rate: 0.11, sat_avg: 1490, gpa_50: 3.90,
    country: 'US', school_type: 'university',
    top_majors: ['international relations', 'biology'],
  };
  const student2 = {
    sat_total: null, gpa_unweighted: 3.7, country: 'GB',
    extracurriculars: [{ tier: 2, name: 'Regional Science Fair' }],
    awards: [], leadership_roles: [], research: false,
  };
  const r2 = await calculateChance(student2, tufts, { decision_type: 'ED', intended_major: 'international relations' });
  console.log('Test 2 (UK, Tufts ED):', r2.tier, `${(r2.probability * 100).toFixed(1)}%`, r2.confidence);

  // Case 3: US domestic, 1180 SAT, 3.2 GPA, no ECs → UC Santa Barbara
  const ucsb = {
    name: 'UC Santa Barbara', acceptance_rate: 0.30, sat_avg: 1290, sat_25: 1190, sat_75: 1410,
    gpa_50: 3.90, country: 'US', school_type: 'public',
    top_majors: ['biology', 'economics', 'sociology'],
  };
  const student3 = {
    sat_total: 1180, gpa_unweighted: 3.2, country: 'US',
    extracurriculars: [], awards: [], leadership_roles: [], research: false,
  };
  const r3 = await calculateChance(student3, ucsb, { decision_type: 'RD', intended_major: 'economics' });
  console.log('Test 3 (US, UCSB):', r3.tier, `${(r3.probability * 100).toFixed(1)}%`, r3.confidence);
}

/**
 * Classify college fit (Reach/Target/Safety) for a specific user+college pair.
 */
async function classifyFit(userId, collegeId) {
  try {
    const StudentProfile = require('../models/StudentProfile');
    const College = require('../models/College');

    const profile = await StudentProfile.findByUserId(userId);
    const college = await College.findById(collegeId);

    if (!profile || !college) {
      throw new Error('Profile or college not found');
    }

    const result = await calculateChance(profile, college);

    return {
      category: result.category,
      fit: result.category,
      tier: result.tier,
      confidence: result.confidence,
      explanation: result.explanation,
      academicFit: null,
      culturalFit: null,
      financialFit: null,
      overall: null,
      reasoning: [`Chancing tier: ${result.tier}`],
    };
  } catch (error) {
    logger.error('Error in fit classification:', { error: sanitizeForLog(error?.message) });
    return {
      category: 'target',
      fit: 'target',
      tier: 'Unknown',
      confidence: 'Low',
      explanation: 'Fit classification unavailable',
      academicFit: null,
      culturalFit: null,
      financialFit: null,
      overall: null,
      reasoning: ['Fit classification unavailable']
    };
  }
}

/**
 * Get college recommendations using the recommendation engine.
 */
async function getRecommendations(studentProfile, preferences = {}) {
  try {
    const { generateRecommendations } = require('./recommendationEngine');
    const College = require('../models/College');
    const colleges = await College.findAll({ limit: 200 });
    return await generateRecommendations(studentProfile, colleges || []);
  } catch (error) {
    logger.error('Error getting recommendations:', { error: sanitizeForLog(error?.message) });
    return [];
  }
}

/**
 * Analyse college list balance.
 */
async function analyzeCollegeList(userId, collegeIds) {
  try {
    const StudentProfile = require('../models/StudentProfile');
    const College = require('../models/College');

    const profile = await StudentProfile.findByUserId(userId);
    const counts = { reach: 0, target: 0, safety: 0 };

    for (const id of collegeIds) {
      const college = await College.findById(id);
      if (!college) continue;
      const result = await calculateChance(profile, college);
      counts[result.category] = (counts[result.category] || 0) + 1;
    }

    const total = collegeIds.length;
    const suggestions = [];
    if (counts.safety < 2) suggestions.push('Add at least 2 safety schools');
    if (counts.reach < 2) suggestions.push('Consider adding reach schools');
    if (counts.target < 3) suggestions.push('Aim for 3-5 target schools');

    return {
      balance: counts.reach <= counts.safety ? 'balanced' : 'reach-heavy',
      reachCount: counts.reach,
      targetCount: counts.target,
      safetyCount: counts.safety,
      total,
      suggestions
    };
  } catch (error) {
    logger.error('Error analyzing college list:', { error: sanitizeForLog(error?.message) });
    return { balance: 'unknown', reachCount: 0, targetCount: 0, safetyCount: 0, suggestions: [] };
  }
}

/**
 * Suggest colleges to improve list balance.
 */
async function suggestAdditions(userId, currentList) {
  try {
    const StudentProfile = require('../models/StudentProfile');
    const College = require('../models/College');

    const profile = await StudentProfile.findByUserId(userId);
    const analysis = await analyzeCollegeList(userId, currentList);
    const currentSet = new Set(currentList.map(String));

    const candidates = await College.findAll({ limit: 50 });
    const suggestions = [];

    for (const college of (candidates || [])) {
      if (currentSet.has(String(college.id))) continue;
      const result = await calculateChance(profile, college);
      if (analysis.safetyCount < 2 && result.category === 'safety') {
        suggestions.push({ college, reason: 'Improves safety school balance', ...result });
      } else if (analysis.targetCount < 3 && result.category === 'target') {
        suggestions.push({ college, reason: 'Good target school', ...result });
      }
      if (suggestions.length >= 5) break;
    }

    return suggestions;
  } catch (error) {
    logger.error('Error suggesting additions:', { error: sanitizeForLog(error?.message) });
    return [];
  }
}

/**
 * Batch calculate chances for multiple colleges.
 */
async function batchCalculate(studentProfile, colleges) {
  const results = [];
  for (const college of colleges) {
    try {
      const result = await calculateChance(studentProfile, college);
      results.push({ collegeId: college.id, collegeName: college.name, ...result });
    } catch (error) {
      logger.error('Error calculating chance', { college: sanitizeForLog(college?.name), error: sanitizeForLog(error?.message) });
      results.push({
        collegeId: college.id,
        collegeName: college.name,
        error: 'An internal error occurred',
        tier: 'Unknown',
        category: 'unknown',
        confidence: 'Low',
        explanation: 'Chancing unavailable at the moment.',
      });
    }
  }
  return results;
}

/**
 * Get chancing for all colleges in a student's application list.
 */
async function getChancingForStudent(userId) {
  try {
    const Application = require('../models/Application');
    const College = require('../models/College');
    const StudentProfile = require('../models/StudentProfile');

    const profile = await StudentProfile.findByUserId(userId);
    const applications = await Application.findByUser(userId);
    const results = [];

    for (const app of applications) {
      const college = await College.findById(app.college_id);
      if (college) {
        const chancing = await calculateChance(profile, college);
        results.push({ applicationId: app.id, collegeId: college.id, collegeName: college.name, ...chancing });
      }
    }

    return results;
  } catch (error) {
    logger.error('Error getting student chancing:', { error: sanitizeForLog(error?.message) });
    return [];
  }
}

module.exports = {
  calculateChance,
  classifyFit,
  getRecommendations,
  analyzeCollegeList,
  suggestAdditions,
  batchCalculate,
  getChancingForStudent,
  runTests,
  // Legacy aliases
  calculateAdmissionChance: calculateChance,
  calculateFit: classifyFit,
  getSmartRecommendations: getRecommendations
};

// backend/src/services/financialScoringService.js
//
// Financial Aid Intelligence Engine
//
// Provides deterministic, source-backed financial scoring for the CollegeOS
// financial aid system.  No hardcoded monetary values — all financial data
// is read from the DB; exchange rates come from exchangeRateService.
//
// Exports:
//   computeFinancialProfile(user, college, pool) → financial breakdown
//   matchScholarships(user, pool, options)       → top matching scholarships
//   recommendLoans(user, requiredUSD, pool)      → ranked loan options with EMI

'use strict';

const logger    = require('../utils/logger');
const { getUSDtoINR } = require('./exchangeRateService');

// ── Income bracket mapping ────────────────────────────────────────────────────

/**
 * Map a user's annual family income (USD) to the correct net-price bracket
 * column stored in college_financial_data / colleges.
 */
function _incomeBracket(incomeUSD) {
  if (!incomeUSD || incomeUSD <= 0) return null;
  if (incomeUSD < 30000)  return 'net_price_0_30k';
  if (incomeUSD < 48000)  return 'net_price_30_48k';
  if (incomeUSD < 75000)  return 'net_price_48_75k';
  if (incomeUSD < 110000) return 'net_price_75_110k';
  return 'net_price_110k_plus';
}

// ── Merit aid predictor ───────────────────────────────────────────────────────

/**
 * Predict merit aid based on the student's academic advantage over the
 * college's median admitted profile.
 *
 * @param {object} user    - { gpa, sat_score, act_score }
 * @param {object} college - { median_sat, median_act, median_gpa, avg_merit_aid, pct_receiving_merit_aid }
 * @returns {{ predictedMeritAidUSD: number, meritAidBasis: string }}
 */
function _predictMeritAid(user, college) {
  const base = college.avg_merit_aid || 0;
  if (base === 0) {
    return { predictedMeritAidUSD: 0, meritAidBasis: 'No merit aid data on record' };
  }

  // Compute normalised advantage for each available metric
  const advantages = [];

  if (user.gpa && college.median_gpa) {
    const diff = (user.gpa - college.median_gpa) / 4.0; // 4.0 scale normalisation
    advantages.push(diff);
  }

  if (user.sat_score && college.median_sat) {
    const diff = (user.sat_score - college.median_sat) / 1600;
    advantages.push(diff);
  } else if (user.act_score && college.median_act) {
    const diff = (user.act_score - college.median_act) / 36;
    advantages.push(diff);
  }

  const avgAdv = advantages.length
    ? advantages.reduce((a, b) => a + b, 0) / advantages.length
    : 0;

  // Scale: max 50 % above base for top students, zero for weak fit
  const multiplier = Math.max(0, Math.min(1.5, 1 + avgAdv * 2));
  const predicted  = Math.round(base * multiplier);

  const basisParts = [];
  if (advantages.length)  basisParts.push(`academic advantage ${(avgAdv * 100).toFixed(0)}%`);
  else                    basisParts.push('baseline (no academic data available)');

  return {
    predictedMeritAidUSD: predicted,
    meritAidBasis: basisParts.join('; '),
  };
}

// ── ROI scorer ────────────────────────────────────────────────────────────────

/**
 * Return earnings / cost ratio.  Higher = better value.
 * Returns null when either input is missing.
 *
 * @param {number|null} earningsUSD  - Median earnings at 6yr or 10yr
 * @param {number|null} netCostUSD   - 4-year total net cost
 */
function _computeROI(earningsUSD, netCostUSD) {
  if (!earningsUSD || !netCostUSD || netCostUSD <= 0) return null;
  // Annualise to a per-year earnings / per-year cost ratio
  const annualCost = netCostUSD / 4;
  return parseFloat((earningsUSD / annualCost).toFixed(2));
}

// ── Accessibility score ───────────────────────────────────────────────────────

/**
 * Compute a 0–100 accessibility score: how much of the net cost falls within
 * the family's affordable range (30 % of income × 4 years).
 */
function _accessibilityScore(incomeUSD, netCostUSD) {
  if (!incomeUSD || incomeUSD <= 0 || !netCostUSD || netCostUSD <= 0) return null;
  const budget = incomeUSD * 0.30 * 4; // 30% annual × 4 years
  const score  = Math.min(100, Math.round((budget / netCostUSD) * 100));
  return score;
}

// ── Main: computeFinancialProfile ─────────────────────────────────────────────

/**
 * Compute a full financial profile for a (user, college) pair.
 *
 * @param {object} user    - user row with optional: family_income_usd, family_income_inr,
 *                           gpa, sat_score, act_score
 * @param {object} college - college row (id, name, country, …)
 * @param {object} pool    - pg Pool from database.js
 * @returns {Promise<object>} financial breakdown
 */
async function computeFinancialProfile(user, college, pool) {
  const usdToInr = await getUSDtoINR();

  // ── 1. Fetch financial data ────────────────────────────────────────────────
  const { rows: cfdRows } = await pool.query(
    `SELECT
       tuition_in_state, tuition_out_state, total_coa, avg_net_price,
       net_price_0_30k, net_price_30_48k, net_price_48_75k,
       net_price_75_110k, net_price_110k_plus,
       pct_receiving_pell, median_debt_at_graduation,
       loan_default_rate_3yr, median_earnings_6yr, median_earnings_10yr
     FROM college_financial_data
     WHERE college_id = $1
     ORDER BY year DESC
     LIMIT 1`,
    [college.id]
  );

  const cfd = cfdRows[0] || {};

  // Pull summary columns from clean_colleges + detail joins
  const { rows: colRows } = await pool.query(
    `SELECT
       cfd.avg_net_price_0_30k, cfd.avg_net_price_30_48k, cfd.avg_net_price_48_75k,
       cfd.avg_net_price_75_110k, cfd.avg_net_price_110k_plus,
       NULL::numeric AS avg_institutional_grant,
       NULL::numeric AS avg_merit_aid,
       NULL::numeric AS pct_receiving_merit_aid,
       NULL::boolean AS need_blind_domestic,
       cc.need_aware_intl AS need_blind_international,
       cc.meets_full_need,
       NULL::numeric AS median_earnings_6yr,
       NULL::numeric AS median_earnings_10yr,
       cfd.loan_default_rate_3yr AS loan_default_rate,
       cfd.median_debt_at_graduation AS avg_total_debt_at_graduation,
       NULL::boolean AS css_profile_required,
       NULL::boolean AS international_aid_available,
       NULL::numeric AS international_aid_avg,
       cfd.pct_receiving_pell AS pct_students_receiving_aid,
       ca.sat_avg AS median_sat,
       ca.act_avg AS median_act
     FROM public.clean_colleges cc
     LEFT JOIN public.college_financial_data cfd ON cc.id = cfd.college_id
     LEFT JOIN public.college_admissions ca ON cc.id = ca.college_id
     WHERE cc.id = $1`,
    [college.id]
  );

  const colData = colRows[0] || {};

  // Merge: prefer college_financial_data (more recent) over colleges summary
  const merged = {
    net_price_0_30k:    cfd.net_price_0_30k    || colData.avg_net_price_0_30k,
    net_price_30_48k:   cfd.net_price_30_48k   || colData.avg_net_price_30_48k,
    net_price_48_75k:   cfd.net_price_48_75k   || colData.avg_net_price_48_75k,
    net_price_75_110k:  cfd.net_price_75_110k  || colData.avg_net_price_75_110k,
    net_price_110k_plus:cfd.net_price_110k_plus|| colData.avg_net_price_110k_plus,
    avg_net_price:      cfd.avg_net_price,
    total_coa:          cfd.total_coa,
    tuition_out_state:  cfd.tuition_out_state,
    tuition_in_state:   cfd.tuition_in_state,
    median_earnings_6yr:  cfd.median_earnings_6yr  || colData.median_earnings_6yr,
    median_earnings_10yr: cfd.median_earnings_10yr || colData.median_earnings_10yr,
    loan_default_rate:    cfd.loan_default_rate_3yr || colData.loan_default_rate,
    avg_total_debt:       cfd.median_debt_at_graduation || colData.avg_total_debt_at_graduation,
    pct_receiving_pell:   cfd.pct_receiving_pell,
    avg_institutional_grant: colData.avg_institutional_grant,
    avg_merit_aid:          colData.avg_merit_aid,
    pct_receiving_merit_aid:colData.pct_receiving_merit_aid,
    need_blind_domestic:    colData.need_blind_domestic,
    need_blind_international: colData.need_blind_international,
    meets_full_need:        colData.meets_full_need,
    css_profile_required:   colData.css_profile_required,
    international_aid_available: colData.international_aid_available,
    international_aid_avg: colData.international_aid_avg,
    median_sat:             colData.median_sat,
    median_act:             colData.median_act,
  };

  // ── 2. Determine user income in USD ───────────────────────────────────────
  let incomeUSD = user.family_income_usd || null;
  if (!incomeUSD && user.family_income_inr) {
    incomeUSD = Math.round(user.family_income_inr / usdToInr);
  }

  // ── 3. Net price prediction ────────────────────────────────────────────────
  const isInternational = !(user.nationality === 'US' || user.citizenship === 'US');

  let predictedNetPriceUSD = null;
  let netPriceBasis = 'No income data — using average net price';

  if (isInternational) {
    // For international students the need-blind / aid status matters more than bracket
    if (merged.need_blind_international && merged.meets_full_need) {
      predictedNetPriceUSD = incomeUSD
        ? Math.min(merged.net_price_0_30k || merged.avg_net_price || 0, merged.avg_net_price || 0)
        : (merged.avg_net_price || merged.tuition_out_state || null);
      netPriceBasis = 'Need-blind international; meets full need — using low-bracket net price';
    } else if (merged.international_aid_avg) {
      const tuition = merged.tuition_out_state || merged.tuition_in_state || 0;
      predictedNetPriceUSD = Math.max(0, tuition - merged.international_aid_avg);
      netPriceBasis = `International aid average of $${merged.international_aid_avg.toLocaleString()} applied to out-of-state tuition`;
    } else {
      predictedNetPriceUSD = merged.tuition_out_state || merged.avg_net_price || null;
      netPriceBasis = merged.tuition_out_state
        ? 'Out-of-state tuition (no international aid data)'
        : 'Average net price (no out-of-state tuition data)';
    }
  } else {
    // Domestic: use income bracket
    const bracket = _incomeBracket(incomeUSD);
    if (bracket && merged[bracket] != null) {
      predictedNetPriceUSD = merged[bracket];
      netPriceBasis = `Income bracket net price ($${(incomeUSD || 0).toLocaleString()} annual income)`;
    } else {
      predictedNetPriceUSD = merged.avg_net_price || null;
      netPriceBasis = bracket
        ? 'Bracket data unavailable — using average net price'
        : 'No income data — using average net price';
    }
  }

  // ── 4. Merit aid prediction ────────────────────────────────────────────────
  const userAcademic = {
    gpa:       user.gpa       || user.profile_gpa       || null,
    sat_score: user.sat_score || user.profile_sat_score || null,
    act_score: user.act_score || user.profile_act_score || null,
  };
  const { predictedMeritAidUSD, meritAidBasis } = _predictMeritAid(userAcademic, merged);

  // ── 5. Need-based aid estimate ────────────────────────────────────────────
  let predictedNeedAidUSD = 0;
  if (!isInternational && incomeUSD && merged.avg_institutional_grant) {
    // Lower income → more need-based aid
    const incomeFactor = Math.max(0, Math.min(1, 1 - (incomeUSD / 110000)));
    predictedNeedAidUSD = Math.round(merged.avg_institutional_grant * incomeFactor);
  }

  // ── 6. Total net cost after all aid ──────────────────────────────────────
  const baseCOA = merged.total_coa || merged.avg_net_price || predictedNetPriceUSD || 0;
  const totalAidUSD = predictedMeritAidUSD + predictedNeedAidUSD;
  const netCostUSD  = Math.max(0, (predictedNetPriceUSD ?? baseCOA) - totalAidUSD);

  // ── 7. ROI & accessibility ────────────────────────────────────────────────
  const roiScore = _computeROI(merged.median_earnings_6yr, netCostUSD * 4);
  const accessibilityScore = _accessibilityScore(incomeUSD, netCostUSD * 4);

  // ── 8. Currency conversion ─────────────────────────────────────────────────
  const toINR = (v) => (v != null ? Math.round(v * usdToInr) : null);

  // ── 9. Data freshness flag ────────────────────────────────────────────────
  const dataFreshness = cfdRows.length ? 'verified' : (colRows.length ? 'estimated' : 'unavailable');

  return {
    college_id:                   college.id,
    college_name:                 college.name,
    data_freshness:               dataFreshness,
    // Raw cost data
    tuition_in_state_usd:         merged.tuition_in_state,
    tuition_out_state_usd:        merged.tuition_out_state,
    total_coa_usd:                baseCOA,
    avg_net_price_usd:            merged.avg_net_price,
    // Income bracket net prices
    net_price_by_income:          {
      bracket_0_30k:     merged.net_price_0_30k,
      bracket_30_48k:    merged.net_price_30_48k,
      bracket_48_75k:    merged.net_price_48_75k,
      bracket_75_110k:   merged.net_price_75_110k,
      bracket_110k_plus: merged.net_price_110k_plus,
    },
    // Predicted costs for this specific user
    predicted_net_price_usd:      predictedNetPriceUSD,
    predicted_net_price_inr:      toINR(predictedNetPriceUSD),
    net_price_basis:              netPriceBasis,
    predicted_merit_aid_usd:      predictedMeritAidUSD,
    merit_aid_basis:              meritAidBasis,
    predicted_need_aid_usd:       predictedNeedAidUSD,
    total_aid_usd:                totalAidUSD,
    net_cost_usd:                 netCostUSD,
    net_cost_inr:                 toINR(netCostUSD),
    net_cost_4yr_usd:             netCostUSD * 4,
    net_cost_4yr_inr:             toINR(netCostUSD * 4),
    // Aid policy
    need_blind_domestic:          merged.need_blind_domestic,
    need_blind_international:     merged.need_blind_international,
    meets_full_need:              merged.meets_full_need,
    css_profile_required:         merged.css_profile_required,
    international_aid_available:  merged.international_aid_available,
    international_aid_avg_usd:    merged.international_aid_avg,
    pct_receiving_merit_aid:      merged.pct_receiving_merit_aid,
    // Outcomes
    median_earnings_6yr:          merged.median_earnings_6yr,
    median_earnings_10yr:         merged.median_earnings_10yr,
    loan_default_rate_pct:        merged.loan_default_rate,
    avg_total_debt_usd:           merged.avg_total_debt,
    avg_total_debt_inr:           toINR(merged.avg_total_debt),
    // Scores
    roi_score:                    roiScore,
    accessibility_score:          accessibilityScore,
    // Exchange rate metadata
    usd_to_inr:                   usdToInr,
    exchange_rate_note:           'Live USD/INR rate from exchangeRateService',
  };
}

// ── Scholarship matching ──────────────────────────────────────────────────────

/**
 * Match and rank scholarships from the `scholarships_new` table (or `scholarships`)
 * against the user's profile.
 *
 * @param {object} user    - user row: { nationality, gender, gpa, intended_majors, family_income_usd }
 * @param {object} pool    - pg Pool
 * @param {object} options - { limit, nationality, gender, major, type }
 * @returns {Promise<Array>} ranked scholarship records with match_score
 */
async function matchScholarships(user, pool, options = {}) {
  const {
    limit = 50,
    nationality: filterNationality,
    gender: filterGender,
    major: filterMajor,
    type: filterType,
  } = options;

  // Determine which scholarships table exists
  let tableName = 'scholarships';
  try {
    await pool.query('SELECT 1 FROM scholarships_new LIMIT 1');
    tableName = 'scholarships_new';
  } catch { /* use scholarships */ }

  // Build filter conditions
  const conditions = [];
  const params = [];

  // Nationality filter: show universal + user's nationality
  const userNationality = filterNationality || user.nationality || null;
  if (userNationality) {
    params.push(userNationality);
    if (tableName === 'scholarships_new') {
      conditions.push(`(
        eligible_nationalities IS NULL
        OR eligible_nationalities = '{}'
        OR 'All' = ANY(eligible_nationalities)
        OR 'International' = ANY(eligible_nationalities)
        OR $${params.length} ILIKE ANY(eligible_nationalities)
      )`);
    } else {
      conditions.push(`(
        nationality_requirements IS NULL
        OR LOWER(nationality_requirements::text) LIKE '%all%'
        OR LOWER(nationality_requirements::text) LIKE LOWER('%' || $${params.length} || '%')
      )`);
    }
  }

  // Scholarship type filter
  if (filterType) {
    params.push(filterType);
    const typeCol = tableName === 'scholarships_new' ? 'scholarship_type' : 'merit_based';
    if (tableName === 'scholarships_new') {
      conditions.push(`scholarship_type = $${params.length}`);
    }
  }

  // Min GPA filter
  if (user.gpa) {
    params.push(user.gpa);
    conditions.push(`(min_gpa IS NULL OR min_gpa <= $${params.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const queryLimit = Math.min(limit * 3, 300); // fetch more, then score-sort

  let rows = [];
  try {
    const { rows: r } = await pool.query(
      `SELECT * FROM ${tableName} ${where} ORDER BY deadline_month ASC NULLS LAST, amount_max DESC NULLS LAST LIMIT $${params.length + 1}`,
      [...params, queryLimit]
    );
    rows = r;
  } catch (err) {
    logger.warn('matchScholarships query failed', { error: err.message });
    return [];
  }

  // ── Score each scholarship ─────────────────────────────────────────────────
  const userMajors = Array.isArray(user.intended_majors)
    ? user.intended_majors.map(m => m.toLowerCase())
    : [];

  const scored = rows.map(s => {
    let score = 50; // neutral baseline
    const reasons = [];

    // Major match (+30)
    const eligibleMajors = Array.isArray(s.eligible_majors) ? s.eligible_majors : [];
    if (
      eligibleMajors.length === 0 ||
      eligibleMajors.some(m => m.toLowerCase() === 'all')
    ) {
      score += 10;
      reasons.push('Open to all majors');
    } else if (userMajors.some(um => eligibleMajors.some(em => em.toLowerCase().includes(um) || um.includes(em.toLowerCase())))) {
      score += 30;
      reasons.push('Matches your intended major');
    }

    // Amount bonus (up to +15)
    const amt = s.amount_max || s.amount_min || 0;
    if (amt >= 40000) { score += 15; reasons.push(`High award: $${amt.toLocaleString()}`); }
    else if (amt >= 20000) { score += 10; reasons.push(`Good award: $${amt.toLocaleString()}`); }
    else if (amt >= 5000)  { score += 5; }

    // Renewable bonus (+5)
    if (s.renewable) { score += 5; reasons.push('Renewable for multiple years'); }

    // Deadline urgency (within 60 days = +5)
    if (s.deadline_month && s.deadline_day) {
      const now = new Date();
      const dl  = new Date(now.getFullYear(), s.deadline_month - 1, s.deadline_day);
      const days = Math.ceil((dl - now) / 86400000);
      if (days > 0 && days <= 60) { score += 5; reasons.push(`Deadline in ${days} days`); }
      if (days < 0) { score -= 20; } // expired
    }

    // Nationality alignment (+5)
    if (userNationality) {
      const natArr = Array.isArray(s.eligible_nationalities) ? s.eligible_nationalities : [];
      if (natArr.some(n => n.toLowerCase().includes(userNationality.toLowerCase()))) {
        score += 5; reasons.push(`Matches your nationality (${userNationality})`);
      }
    }

    return {
      ...s,
      match_score:    Math.max(0, Math.min(100, score)),
      match_reasons:  reasons,
    };
  });

  // Sort by score desc, limit to requested count
  return scored
    .filter(s => s.match_score > 20)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, limit);
}

// ── Loan recommendation ───────────────────────────────────────────────────────

/**
 * Calculate EMI using the standard loan formula.
 * @param {number} principal   USD
 * @param {number} annualPct   annual interest rate percent (e.g. 8.5)
 * @param {number} termMonths  total repayment months
 */
function _emi(principal, annualPct, termMonths) {
  if (!principal || principal <= 0 || !termMonths) return null;
  const r = annualPct / 100 / 12;
  if (r === 0) return Math.round(principal / termMonths);
  const f = Math.pow(1 + r, termMonths);
  return Math.round((principal * r * f) / (f - 1));
}

/**
 * Recommend and rank loan products for a student needing `requiredUSD`.
 *
 * @param {object} user        - { has_collateral, willing_to_take_loan, nationality }
 * @param {number} requiredUSD - loan amount needed
 * @param {object} pool        - pg Pool
 * @returns {Promise<Array>}
 */
async function recommendLoans(user, requiredUSD, pool) {
  // Support both legacy financing_options table and private_loans / government_loans
  let rows = [];
  try {
    const { rows: r } = await pool.query(
      `SELECT * FROM financing_options WHERE status = 'active' ORDER BY interest_rate_pct ASC NULLS LAST LIMIT 50`
    );
    rows = r;
  } catch {
    // Try private_loans table
    try {
      const { rows: pr } = await pool.query(
        `SELECT id, name, provider, max_amount AS amount_max_usd,
                interest_rate_pct, collateral_required, cosigner_required,
                repayment_months, moratorium_months,
                'loan' AS financing_type, TRUE AS status
         FROM private_loans WHERE status = 'active' ORDER BY interest_rate_pct ASC NULLS LAST LIMIT 50`
      );
      rows = pr;
    } catch (err) {
      logger.warn('recommendLoans: no loans table accessible', { error: err.message });
      return [];
    }
  }

  const usdToInr = await getUSDtoINR();

  return rows
    .map(loan => {
      let score = 50;
      const reasons = [];

      // Coverage
      const maxAmt = loan.amount_max_usd || loan.amount_max || 0;
      if (maxAmt >= requiredUSD) { score += 15; reasons.push('Covers required amount'); }
      else if (maxAmt > 0)       { score -= 10; reasons.push('May not cover full need'); }

      // No collateral needed
      if (!loan.collateral_required) { score += 15; reasons.push('No collateral required'); }
      else if (!user.has_collateral)  { score -= 20; reasons.push('Collateral required but not available'); }

      // No cosigner
      if (!loan.cosigner_required)   { score += 10; reasons.push('No cosigner required'); }

      // Interest rate
      const rate = parseFloat(loan.interest_rate_pct) || 0;
      if (rate === 0)      { score += 20; reasons.push('Zero interest'); }
      else if (rate < 6)   { score += 10; reasons.push(`Low rate (${rate}%)`); }
      else if (rate > 12)  { score -= 10; reasons.push(`High rate (${rate}%)`); }

      // Tax benefit (80E in India)
      if (loan.tax_benefit_80e) { score += 5; reasons.push('Tax benefit under 80E'); }

      // Moratorium during studies
      if (loan.moratorium_months) { score += 5; reasons.push(`${loan.moratorium_months}-month moratorium during studies`); }

      // Compute EMI on required amount
      const termMonths = loan.repayment_months || 120; // default 10 years
      const emiUSD = _emi(requiredUSD, rate, termMonths);
      const emiINR = emiUSD ? Math.round(emiUSD * usdToInr) : null;

      return {
        ...loan,
        fit_score:     Math.max(0, Math.min(100, score)),
        fit_reasons:   reasons,
        emi_usd:       emiUSD,
        emi_inr:       emiINR,
        repayment_months: termMonths,
        usd_to_inr:    usdToInr,
      };
    })
    .filter(l => l.fit_score > 0)
    .sort((a, b) => b.fit_score - a.fit_score);
}

module.exports = {
  computeFinancialProfile,
  matchScholarships,
  recommendLoans,
};

/**
 * backend/src/services/vectorService.js
 * ──────────────────────────────────────
 * 28-dimensional feature vector construction for users and colleges.
 * Used by recommend.js to score and rank colleges via cosine similarity.
 *
 * VECTOR LAYOUT  (index 0–27)
 * ───────────────────────────
 *   0–5   : Academic (GPA, SAT/ACT, class rank, AP/IB courses, composite rigor)
 *   6–13  : Size & setting preferences (small/med/large, urban/suburban/rural,
 *            public/private)
 *   14–17 : Financial (budget, financial need, merit-aid priority, loan tolerance)
 *   18–24 : Subject interests (STEM, Business, Arts, Social Sciences, Health,
 *            Law/Policy, Education)
 *   25–27 : Other (international student, first-gen, diversity priority)
 */

'use strict';

// ─── Dimension labels (kept in sync with the code below) ─────────────────────

const USER_VECTOR_FIELDS = [
  // Academic  0–5
  'gpa_norm',          // GPA / 4.0
  'sat_norm',          // SAT / 1600  (or ACT * 40/36 if only ACT)
  'class_rank_norm',   // 1 − (rank / class_size), higher = better
  'ap_courses_norm',   // num_ap / 15
  'ib_courses_norm',   // num_ib / 6
  'academic_rigor',    // weighted composite (0.4·gpa + 0.3·sat + 0.15·ap + 0.15·ib)

  // Size / setting  6–13
  'pref_size_small',   // 1 if prefers <5k enrollment
  'pref_size_medium',
  'pref_size_large',
  'pref_urban',
  'pref_suburban',
  'pref_rural',
  'pref_public',
  'pref_private',

  // Financial  14–17
  'budget_norm',           // max_budget / 80 000
  'financial_need_norm',   // 1 − (family_income / 200 000), capped [0,1]
  'merit_aid_priority',    // 1 if merit scholarships are important
  'loan_tolerance',        // 1 if willing to take loans

  // Interests  18–24
  'interest_stem',
  'interest_business',
  'interest_arts',
  'interest_social_sciences',
  'interest_health',
  'interest_law_policy',
  'interest_education',

  // Other  25–27
  'intl_student',        // 1 if international
  'first_gen',           // 1 if first-generation
  'diversity_priority',  // 1 if campus diversity matters
];

const COLLEGE_VECTOR_FIELDS = [
  // Academic selectivity  0–5
  'selectivity',          // 1 − admission_rate
  'avg_sat_norm',         // avg_sat / 1600
  'avg_act_norm',         // avg_act / 36 * (40/36)  → scale to [0,1]
  'pct_top10_norm',       // % from top-10 HS class / 100
  'grad_rate_norm',       // graduation rate / 100
  'academic_reputation',  // 1 − (us_news_rank − 1) / 500  (rank 1 → 1.0)

  // Size / setting  6–13
  'is_small',             // enrollment < 5000
  'is_medium',            // 5000–15 000
  'is_large',             // > 15 000
  'is_urban',
  'is_suburban',
  'is_rural',
  'is_public',
  'is_private',

  // Financial  14–17
  'cost_norm',              // avg_net_price / 80 000
  'aid_generosity',         // avg_financial_aid / avg_cost (capped 1)
  'merit_aid_rate',         // % receiving merit aid / 100
  'loan_default_rate_inv',  // 1 − cohort_default_rate

  // Academic offerings  18–24
  'has_stem',
  'has_business',
  'has_arts',
  'has_social_sciences',
  'has_health',
  'has_law_policy',
  'has_education',

  // Other  25–27
  'intl_student_pct',  // % international / 30
  'first_gen_pct',     // % first-gen / 50
  'diversity_score',   // diversity index / 100
];

const VECTOR_DIM = 28;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Clamp a value to [0, 1].
 * @param {number} v
 * @returns {number}
 */
function clamp01(v) {
  if (typeof v !== 'number' || isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * Return v / divisor, clamped to [0, 1].  Returns 0.5 (neutral) when either
 * operand is null / undefined / 0.
 * @param {number|null|undefined} v
 * @param {number} divisor
 * @param {number} [neutral=0.5]
 */
function norm(v, divisor, neutral = 0.5) {
  if (v === null || v === undefined || isNaN(v)) return neutral;
  return clamp01(v / divisor);
}

/**
 * Dot product of two arrays.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * L2 norm of an array.
 * @param {number[]} a
 * @returns {number}
 */
function magnitude(a) {
  return Math.sqrt(dot(a, a));
}

/**
 * Cosine similarity between two equal-length numeric arrays.
 * Returns value in [0, 1] (both vectors assumed non-negative).
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number}
 */
function cosineSimilarity(vecA, vecB) {
  const magA = magnitude(vecA);
  const magB = magnitude(vecB);
  if (magA === 0 || magB === 0) return 0;
  return clamp01(dot(vecA, vecB) / (magA * magB));
}

/**
 * Normalise a vector so its L2 norm = 1.
 * @param {number[]} vec
 * @returns {number[]}
 */
function normalizeVector(vec) {
  const mag = magnitude(vec);
  if (mag === 0) return vec.map(() => 0);
  return vec.map(v => v / mag);
}

// ─── User vector ──────────────────────────────────────────────────────────────

/**
 * Build a 28-dim user preference vector from onboarding / profile data.
 *
 * @param {object} onboardingData  Row from users + student_profiles tables,
 *   expected fields (all optional — missing fields get neutral 0.5):
 *     gpa, sat_score, act_score, class_rank, class_size,
 *     num_ap_courses, num_ib_courses,
 *     preferred_size, preferred_setting, preferred_type,
 *     max_budget_usd, family_income_usd,
 *     wants_merit_aid, willing_to_take_loans,
 *     intended_major_categories (array of strings or comma-sep string),
 *     is_international, is_first_gen, diversity_important
 *
 * @returns {number[]}  Array of length 28, all values in [0, 1]
 */
function buildUserVector(onboardingData) {
  const d = onboardingData || {};

  // ── Academic  (dims 0–5) ──────────────────────────────────────────────────
  // Use 0 (not 0.5) for missing values so incomplete profiles don't inflate
  // cosine similarity — a user with no academic data should NOT look like a
  // perfect match for every college.
  const gpa_norm = d.gpa ? norm(d.gpa, 4.0, 0) : 0;

  let sat_norm = 0;
  if (d.sat_score) {
    sat_norm = norm(d.sat_score, 1600, 0);
  } else if (d.act_score) {
    // Convert ACT → SAT-equivalent scale [0,1]
    sat_norm = norm(d.act_score, 36, 0);
  }

  const rank      = parseFloat(d.class_rank)  || null;
  const classSize = parseFloat(d.class_size)  || null;
  const class_rank_norm =
    rank && classSize && classSize > 0
      ? clamp01(1 - rank / classSize)
      : 0;

  const ap_courses_norm = norm(parseFloat(d.num_ap_courses) || 0, 15, 0);
  const ib_courses_norm = norm(parseFloat(d.num_ib_courses) || 0, 6,  0);

  const academic_rigor = clamp01(
    0.40 * gpa_norm +
    0.30 * sat_norm +
    0.15 * ap_courses_norm +
    0.15 * ib_courses_norm
  );

  // ── Size / setting  (dims 6–13) ───────────────────────────────────────────
  const size = (d.preferred_size || '').toLowerCase();
  const pref_size_small  = size === 'small'  ? 1 : 0;
  const pref_size_medium = size === 'medium' ? 1 : 0;
  const pref_size_large  = size === 'large'  ? 1 : 0;

  const setting = (d.preferred_setting || '').toLowerCase();
  const pref_urban    = setting === 'urban'    ? 1 : 0;
  const pref_suburban = setting === 'suburban' ? 1 : 0;
  const pref_rural    = setting === 'rural'    ? 1 : 0;

  const type = (d.preferred_type || '').toLowerCase();
  const pref_public  = type === 'public'  ? 1 : 0;
  const pref_private = type === 'private' ? 1 : 0;

  // ── Financial  (dims 14–17) ───────────────────────────────────────────────
  const budget_norm = d.max_budget_usd
    ? norm(parseFloat(d.max_budget_usd), 80000, 0)
    : 0;

  const income        = parseFloat(d.family_income_usd) || null;
  const financial_need_norm = income !== null
    ? clamp01(1 - income / 200000)
    : 0;

  const merit_aid_priority = d.wants_merit_aid ? 1 : 0;
  const loan_tolerance     = d.willing_to_take_loans ? 1 : 0;

  // ── Interests  (dims 18–24) ───────────────────────────────────────────────
  const rawInterests = Array.isArray(d.intended_major_categories)
    ? d.intended_major_categories
    : typeof d.intended_major_categories === 'string'
      ? d.intended_major_categories.split(',').map(s => s.trim())
      : [];

  const interests = rawInterests.map(s => s.toLowerCase());
  const hasInterest = (...keywords) =>
    keywords.some(kw => interests.some(i => i.includes(kw)));

  const interest_stem           = hasInterest('stem', 'computer', 'engineer', 'science', 'math', 'biology', 'physics', 'chemistry', 'data') ? 1 : 0;
  const interest_business       = hasInterest('business', 'economics', 'finance', 'accounting', 'management', 'marketing') ? 1 : 0;
  const interest_arts           = hasInterest('arts', 'music', 'design', 'film', 'theater', 'creative', 'visual') ? 1 : 0;
  const interest_social_sciences = hasInterest('social', 'psychology', 'sociology', 'anthropology', 'political', 'history', 'geography') ? 1 : 0;
  const interest_health         = hasInterest('health', 'medicine', 'nursing', 'pharmacy', 'pre-med', 'premed', 'public health') ? 1 : 0;
  const interest_law_policy     = hasInterest('law', 'legal', 'policy', 'government', 'public admin') ? 1 : 0;
  const interest_education      = hasInterest('education', 'teaching', 'pedagogy') ? 1 : 0;

  // ── Other  (dims 25–27) ───────────────────────────────────────────────────
  const intl_student      = d.is_international ? 1 : 0;
  const first_gen         = d.is_first_gen      ? 1 : 0;
  const diversity_priority = d.diversity_important ? 1 : 0;

  return [
    gpa_norm, sat_norm, class_rank_norm, ap_courses_norm, ib_courses_norm, academic_rigor,
    pref_size_small, pref_size_medium, pref_size_large,
    pref_urban, pref_suburban, pref_rural,
    pref_public, pref_private,
    budget_norm, financial_need_norm, merit_aid_priority, loan_tolerance,
    interest_stem, interest_business, interest_arts, interest_social_sciences,
    interest_health, interest_law_policy, interest_education,
    intl_student, first_gen, diversity_priority,
  ];
}

// ─── College vector ───────────────────────────────────────────────────────────

/**
 * Build a 28-dim college characteristic vector.
 *
 * @param {object} college  Row from colleges_comprehensive with joined data,
 *   expected fields:
 *     admission_rate (0–1), sat_avg, act_avg,
 *     pct_top10_hs_class, graduation_rate_4yr, us_news_rank,
 *     enrollment, setting ('urban'|'suburban'|'rural'), type ('public'|'private'|...),
 *     avg_net_price, avg_financial_aid, pct_merit_aid, cohort_default_rate,
 *     major_categories (array or JSON), pct_international, pct_first_gen,
 *     diversity_index
 *
 * @returns {number[]}  Array of length 28
 */
function buildCollegeVector(college) {
  const c = college || {};

  // ── Academic selectivity  (dims 0–5) ─────────────────────────────────────
  const admission_rate = parseFloat(c.admission_rate ?? c.acceptance_rate) || null;
  const selectivity = admission_rate !== null ? clamp01(1 - admission_rate) : 0.5;

  const sat = parseFloat(c.sat_avg ?? c.sat_total_50 ?? c.sat_average) || null;
  const avg_sat_norm = sat ? norm(sat, 1600) : 0.5;

  const act = parseFloat(c.act_avg ?? c.act_average ?? c.act_50) || null;
  const avg_act_norm = act ? norm(act, 36) : 0.5;

  const pct_top10 = parseFloat(c.pct_top10_hs_class ?? c.pct_top10) || null;
  const pct_top10_norm = pct_top10 ? norm(pct_top10, 100) : 0.5;

  const grad_rate = parseFloat(c.graduation_rate_4yr ?? c.grad_rate) || null;
  const grad_rate_norm = grad_rate ? norm(grad_rate, 100) : 0.5;

  // US News rank inversion: rank 1 → score ~1.0, rank 500+ → ~0.0
  const rank = parseInt(c.us_news_rank ?? c.ranking_us_news ?? c.ranking) || null;
  const academic_reputation = rank
    ? clamp01(1 - (rank - 1) / 500)
    : 0.5;

  // ── Size / setting  (dims 6–13) ───────────────────────────────────────────
  const enrollment = parseInt(c.enrollment ?? c.total_enrollment) || 0;
  const is_small  = enrollment > 0 && enrollment < 5000  ? 1 : 0;
  const is_medium = enrollment >= 5000 && enrollment <= 15000 ? 1 : 0;
  const is_large  = enrollment > 15000 ? 1 : 0;

  const settingRaw = (c.setting ?? c.urban_classification ?? '').toLowerCase();
  const is_urban    = settingRaw.includes('urban') && !settingRaw.includes('sub') ? 1 : 0;
  const is_suburban = settingRaw.includes('suburb') ? 1 : 0;
  const is_rural    = settingRaw.includes('rural') ? 1 : 0;

  const typeRaw  = (c.type ?? c.institution_type ?? '').toLowerCase();
  const is_public  = typeRaw.includes('public') ? 1 : 0;
  const is_private = typeRaw.includes('private') ? 1 : 0;

  // ── Financial  (dims 14–17) ───────────────────────────────────────────────
  const netPrice = parseFloat(c.avg_net_price ?? c.tuition_international ?? c.tuition_in_state) || null;
  const cost_norm = netPrice ? norm(netPrice, 80000) : 0.5;

  const avgAid  = parseFloat(c.avg_financial_aid ?? c.average_grant_aid) || null;
  const avgCost = parseFloat(c.avg_cost_of_attendance ?? netPrice) || null;
  const aid_generosity = avgAid && avgCost && avgCost > 0
    ? clamp01(avgAid / avgCost)
    : 0.5;

  const meritRate = parseFloat(c.pct_merit_aid ?? c.merit_aid_rate) || null;
  const merit_aid_rate = meritRate ? norm(meritRate, 100) : 0.5;

  const defaultRate = parseFloat(c.cohort_default_rate) || null;
  const loan_default_rate_inv = defaultRate !== null ? clamp01(1 - defaultRate / 100) : 0.5;

  // ── Academic offerings  (dims 18–24) ─────────────────────────────────────
  let majorCategories = [];
  if (Array.isArray(c.major_categories)) {
    majorCategories = c.major_categories.map(s => String(s).toLowerCase());
  } else if (typeof c.major_categories === 'string') {
    try { majorCategories = JSON.parse(c.major_categories).map(s => String(s).toLowerCase()); }
    catch { majorCategories = c.major_categories.split(',').map(s => s.trim().toLowerCase()); }
  }

  // Also check college_programs if available
  const programs = (c.college_programs || []).map(p =>
    (typeof p === 'string' ? p : p.program_name || '').toLowerCase()
  );
  const allOfferings = [...majorCategories, ...programs];

  const hasMajorKeyword = (...kws) =>
    kws.some(kw => allOfferings.some(o => o.includes(kw)));

  const has_stem          = hasMajorKeyword('stem', 'computer', 'engineer', 'science', 'math', 'biology', 'physics', 'chemistry') ? 1 : 0;
  const has_business      = hasMajorKeyword('business', 'economics', 'finance', 'accounting', 'management', 'marketing') ? 1 : 0;
  const has_arts          = hasMajorKeyword('arts', 'music', 'design', 'film', 'theater', 'visual') ? 1 : 0;
  const has_social_sciences = hasMajorKeyword('social', 'psychology', 'sociology', 'anthropology', 'political', 'history') ? 1 : 0;
  const has_health        = hasMajorKeyword('health', 'medicine', 'nursing', 'pharmacy', 'pre-med') ? 1 : 0;
  const has_law_policy    = hasMajorKeyword('law', 'legal', 'policy', 'government', 'public admin') ? 1 : 0;
  const has_education     = hasMajorKeyword('education', 'teaching') ? 1 : 0;

  // ── Other  (dims 25–27) ───────────────────────────────────────────────────
  const pctIntl = parseFloat(c.pct_international ?? c.intl_student_pct) || null;
  const intl_student_pct = pctIntl ? norm(pctIntl, 30) : 0.5;

  const pctFG = parseFloat(c.pct_first_gen ?? c.first_gen_pct) || null;
  const first_gen_pct = pctFG ? norm(pctFG, 50) : 0.5;

  const divIdx = parseFloat(c.diversity_index ?? c.diversity_score) || null;
  const diversity_score = divIdx ? norm(divIdx, 100) : 0.5;

  return [
    selectivity, avg_sat_norm, avg_act_norm, pct_top10_norm, grad_rate_norm, academic_reputation,
    is_small, is_medium, is_large,
    is_urban, is_suburban, is_rural,
    is_public, is_private,
    cost_norm, aid_generosity, merit_aid_rate, loan_default_rate_inv,
    has_stem, has_business, has_arts, has_social_sciences,
    has_health, has_law_policy, has_education,
    intl_student_pct, first_gen_pct, diversity_score,
  ];
}

// ─── Signal adjustments ───────────────────────────────────────────────────────

/**
 * Nudge a user's preference vector based on the colleges they've interacted
 * with.  This is lightweight online learning: no model retraining required.
 *
 * Algorithm:
 *   For each 'added' signal:   vec += 0.10 * collegeVec   (pull toward)
 *   For each 'dismissed' signal: vec -= 0.05 * collegeVec (push away)
 *   Finally: renormalise to L2 = 1
 *
 * Only the 20 most-recent signals are considered.
 *
 * @param {number[]} userVector        28-dim base vector from buildUserVector()
 * @param {Array<{signal_type: string, college_vector: number[]}>} signals
 *   Each signal must include the pre-fetched college_vector for that college.
 *
 * @returns {number[]}  Adjusted & normalised 28-dim vector
 */
function applySignalAdjustments(userVector, signals) {
  if (!signals || signals.length === 0) return userVector;

  // Cap at most-recent 20 signals
  const recent = signals.slice(-20);

  const adjusted = [...userVector];

  for (const signal of recent) {
    const cv = signal.college_vector;
    if (!Array.isArray(cv) || cv.length !== VECTOR_DIM) continue;

    const weight =
      signal.signal_type === 'added'     ?  0.10 :
      signal.signal_type === 'dismissed' ? -0.05 :
      signal.signal_type === 'viewed'    ?  0.03 :
      signal.signal_type === 'removed'   ? -0.07 :
      0;

    for (let i = 0; i < VECTOR_DIM; i++) {
      adjusted[i] = adjusted[i] + weight * cv[i];
    }
  }

  // Clamp to [0, 1] after adjustment before normalising
  const clamped = adjusted.map(v => Math.max(0, Math.min(1, v)));
  return normalizeVector(clamped);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  VECTOR_DIM,
  USER_VECTOR_FIELDS,
  COLLEGE_VECTOR_FIELDS,
  buildUserVector,
  buildCollegeVector,
  cosineSimilarity,
  applySignalAdjustments,
  normalizeVector,
};

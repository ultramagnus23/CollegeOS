'use strict';

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRank(rank, cap = 1000) {
  const r = safeNum(rank, null);
  if (r == null || r <= 0) return 0;
  return clamp01((cap - Math.min(cap, r)) / cap);
}

function majorMatchScore(student, college) {
  const majors = Array.isArray(student.intendedMajors) ? student.intendedMajors : [];
  const offered = Array.isArray(college.programs) ? college.programs : [];
  if (!majors.length || !offered.length) return 0.35;
  const offeredText = offered.map((m) => String(m).toLowerCase());
  let hits = 0;
  for (const major of majors) {
    const token = String(major).toLowerCase();
    if (offeredText.some((m) => m.includes(token) || token.includes(m))) hits += 1;
  }
  return clamp01(hits / majors.length);
}

function admissionsFit(student, college) {
  const gpa = safeNum(student.gpa, null);
  const sat = safeNum(student.sat, null);
  const act = safeNum(student.act, null);
  const gpa75 = safeNum(college.gpa_75, null);
  const sat75 = safeNum(college.sat_75, null);
  const act75 = safeNum(college.act_75, null);
  const checks = [];
  if (gpa != null && gpa75 != null) checks.push(clamp01(gpa / Math.max(gpa75, 0.01)));
  if (sat != null && sat75 != null) checks.push(clamp01(sat / Math.max(sat75, 1)));
  if (act != null && act75 != null) checks.push(clamp01(act / Math.max(act75, 1)));
  if (!checks.length) return 0.45;
  return checks.reduce((a, b) => a + b, 0) / checks.length;
}

function affordabilityFit(student, college) {
  const budget = safeNum(student.maxBudgetUsd, null);
  const netCost = safeNum(college.net_cost_usd, safeNum(college.tuition_international, null));
  if (budget == null || netCost == null) return 0.45;
  if (netCost <= budget) return 1;
  return clamp01(budget / Math.max(netCost, 1));
}

function countryMatch(student, college) {
  const preferred = Array.isArray(student.preferredCountries) ? student.preferredCountries : [];
  if (!preferred.length || !college.country) return 0.5;
  const c = String(college.country).toLowerCase();
  return preferred.some((p) => c.includes(String(p).toLowerCase())) ? 1 : 0.2;
}

function featureVector(student, college, rankingSignals = {}, popularitySignals = {}) {
  const majorAvailability = majorMatchScore(student, college);
  const admissions = admissionsFit(student, college);
  const affordability = affordabilityFit(student, college);
  const globalRanking = safeNum(rankingSignals.normalized_rank_score, normalizeRank(college.ranking));
  const subjectRankingRaw = safeNum(rankingSignals.subject_rank_score, normalizeRank(college.subject_rank, 300));
  const subjectWeight = safeNum(rankingSignals.subject_weight, 0.45) || 0.45;
  const subjectRanking = clamp01((subjectRankingRaw * subjectWeight) + (globalRanking * (1 - subjectWeight) * 0.35));
  const calibratedRanking = safeNum(rankingSignals.calibrated_score, (subjectRanking + globalRanking) / 2);
  const popularity = safeNum(popularitySignals.popularity_score, safeNum(college.popularity_score, 0)) || 0;
  const outcomeSalary = clamp01((safeNum(college.median_earnings_6yr, 0) || 0) / 180000);
  const graduationRate = clamp01((safeNum(college.graduation_rate_6yr, 0) || 0) / 100);
  const intlAid = college.international_aid_available ? 1 : 0;
  const countryFit = countryMatch(student, college);
  const selectivity = clamp01(1 - (safeNum(college.acceptance_rate, 0.5) || 0.5));
  const searchSignal = clamp01((safeNum(popularitySignals.search_volume_score, 0) || 0));

  return {
    major_availability: majorAvailability,
    subject_ranking_alignment: subjectRanking,
    admissions_fit: admissions,
    affordability_fit: affordability,
    normalized_global_ranking: calibratedRanking,
    popularity_score: clamp01(popularity),
    outcomes_alignment: clamp01((outcomeSalary * 0.6) + (graduationRate * 0.4)),
    research_intensity_fit: clamp01((safeNum(college.research_intensity_score, 0.4) || 0.4)),
    international_aid_match: intlAid,
    country_match: countryFit,
    selectivity_tier_score: selectivity,
    search_volume_signal: searchSignal,
  };
}

module.exports = {
  featureVector,
};

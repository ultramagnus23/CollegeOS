'use strict';

const SBI_APPROVED_COUNTRIES = new Set(['United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'Ireland']);

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function evaluateLoanFeasibility({ institution = {}, amountUsd = 0, hasCollateral = false, profile = {} }) {
  const country = String(institution.country || institution.country_code || '').trim();
  const isSbiEligible = SBI_APPROVED_COUNTRIES.has(country);
  const credilaCompatible = Boolean(institution.credila_eligible || institution.global_rank || institution.subject_rank);
  const amountInr = (Number(amountUsd) || 0) * (Number(profile.usdInrRate) || 83);

  let score = 0.35;
  score += isSbiEligible ? 0.25 : 0;
  score += credilaCompatible ? 0.2 : 0;
  score += hasCollateral ? 0.2 : -0.1;
  score += amountInr <= 4500000 ? 0.1 : -0.05;

  const risk = clamp01(1 - score);
  return {
    sbi_eligible: isSbiEligible,
    credila_compatible: credilaCompatible,
    collateral_required: !hasCollateral && amountInr > 3500000,
    feasibility_score: clamp01(score),
    risk_score: risk,
    confidence: Number((0.55 + (isSbiEligible ? 0.15 : 0) + (credilaCompatible ? 0.1 : 0)).toFixed(6)),
  };
}

module.exports = {
  evaluateLoanFeasibility,
};

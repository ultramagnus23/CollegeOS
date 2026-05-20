'use strict';

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function predictScholarshipProbability({ profile = {}, institution = {} }) {
  const gpa = Number(profile.gpa) || 0;
  const sat = Number(profile.sat) || 0;
  const budget = Number(profile.maxBudgetUsd) || 0;
  const tuition = Number(institution.tuition_international || institution.net_cost_usd) || 0;
  const aidAvailable = institution.international_aid_available ? 1 : 0;

  const needFactor = tuition > 0 ? clamp01((tuition - budget) / tuition) : 0.35;
  const meritFactor = clamp01((gpa / 4) * 0.6 + (sat / 1600) * 0.4);
  const score = clamp01((needFactor * 0.45) + (meritFactor * 0.4) + (aidAvailable * 0.15));

  return {
    probability: Number(score.toFixed(6)),
    confidence: Number((0.55 + meritFactor * 0.35).toFixed(6)),
  };
}

module.exports = {
  predictScholarshipProbability,
};

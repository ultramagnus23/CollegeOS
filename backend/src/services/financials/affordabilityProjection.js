'use strict';

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function projectAffordability({ annualCostUsd = 0, annualBudgetUsd = 0, scholarshipProbability = 0, expectedAidUsd = 0, years = 4 }) {
  const cost = Number(annualCostUsd) || 0;
  const budget = Number(annualBudgetUsd) || 0;
  const aid = (Number(expectedAidUsd) || 0) + cost * (Number(scholarshipProbability) || 0) * 0.35;
  const net = Math.max(0, cost - aid);
  const trajectory = [];

  for (let year = 1; year <= years; year += 1) {
    const inflation = 1 + (year - 1) * 0.045;
    const projectedNet = net * inflation;
    const affordability = clamp01(budget / Math.max(1, projectedNet));
    trajectory.push({ year, projected_net_cost_usd: Number(projectedNet.toFixed(2)), affordability_score: Number(affordability.toFixed(6)) });
  }

  const avgAffordability = trajectory.reduce((a, b) => a + b.affordability_score, 0) / Math.max(1, trajectory.length);
  return {
    yearly_projection: trajectory,
    affordability_score: Number(avgAffordability.toFixed(6)),
    confidence: Number((0.5 + clamp01(Number(scholarshipProbability) || 0) * 0.3).toFixed(6)),
  };
}

module.exports = {
  projectAffordability,
};

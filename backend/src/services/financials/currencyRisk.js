'use strict';

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function assessCurrencyRisk({ annualCostUsd = 0, usdInrRate = 83, usdInrVolatility = 0.07 }) {
  const costInr = (Number(annualCostUsd) || 0) * (Number(usdInrRate) || 83);
  const volatility = Number(usdInrVolatility) || 0.07;
  const stressRate = (Number(usdInrRate) || 83) * (1 + volatility);
  const stressedCostInr = (Number(annualCostUsd) || 0) * stressRate;
  const riskScore = clamp01(volatility / 0.2);

  return {
    baseline_cost_inr: Number(costInr.toFixed(2)),
    stressed_cost_inr: Number(stressedCostInr.toFixed(2)),
    inr_fx_risk_score: Number(riskScore.toFixed(6)),
    confidence: Number((0.65 - Math.min(0.2, volatility)).toFixed(6)),
  };
}

module.exports = {
  assessCurrencyRisk,
};

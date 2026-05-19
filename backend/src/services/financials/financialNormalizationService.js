'use strict';

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function regionFromCountry(country) {
  const c = String(country || '').toLowerCase();
  if (c.includes('united states') || c === 'us' || c === 'usa') return 'US';
  if (c.includes('united kingdom') || c === 'uk') return 'UK';
  if (c.includes('canada')) return 'Canada';
  if (c.includes('india')) return 'India';
  if (c.includes('singapore')) return 'Singapore';
  if (c.includes('australia')) return 'Australia';
  return 'Europe';
}

function computeConfidence({ freshness, completeness, coverage }) {
  const freshnessScore =
    freshness === 'verified' ? 1 :
    freshness === 'estimated' ? 0.65 :
    0.3;
  const completenessScore = clamp01(completeness);
  const coverageScore = clamp01(coverage);
  return Number((freshnessScore * 0.45 + completenessScore * 0.35 + coverageScore * 0.2).toFixed(4));
}

function normalizeFinancialProfile(rawProfile, country) {
  const profile = { ...(rawProfile || {}) };
  const region = regionFromCountry(country);
  const keys = [
    'tuition_out_state_usd',
    'tuition_in_state_usd',
    'total_coa_usd',
    'avg_net_price_usd',
    'predicted_net_price_usd',
    'predicted_merit_aid_usd',
    'predicted_need_aid_usd',
    'total_aid_usd',
    'net_cost_usd',
    'net_cost_4yr_usd',
    'avg_total_debt_usd',
    'median_earnings_6yr',
  ];
  const present = keys.filter((k) => profile[k] != null).length;
  const completeness = keys.length ? present / keys.length : 0;
  const aidCoverage = profile.total_coa_usd > 0 ? (profile.total_aid_usd || 0) / profile.total_coa_usd : 0;
  const freshness = profile.data_freshness || 'unavailable';
  const confidence = computeConfidence({
    freshness,
    completeness,
    coverage: Math.max(0, Math.min(1, aidCoverage)),
  });

  const baseRoi = profile.roi_score != null
    ? Number(profile.roi_score)
    : (profile.median_earnings_6yr && profile.net_cost_4yr_usd
      ? Number((profile.median_earnings_6yr / Math.max(profile.net_cost_4yr_usd / 4, 1)).toFixed(2))
      : null);

  const debtBurdenScore = profile.avg_total_debt_usd != null
    ? clamp01(1 - (profile.avg_total_debt_usd / 120000))
    : 0.4;
  const affordabilityScore = profile.net_cost_usd != null && profile.total_coa_usd
    ? clamp01(1 - (profile.net_cost_usd / Math.max(profile.total_coa_usd, 1)))
    : 0.45;
  const intlAidScore = profile.international_aid_available ? 1 : profile.need_blind_international ? 0.85 : 0.25;
  const roiScore = clamp01((baseRoi || 0) / 4);

  const financialFit = Number((
    affordabilityScore * 0.35 +
    intlAidScore * 0.2 +
    roiScore * 0.2 +
    debtBurdenScore * 0.15 +
    clamp01((profile.median_earnings_6yr || 0) / 160000) * 0.1
  ).toFixed(4));

  return {
    ...profile,
    country: titleCase(country),
    region,
    financial_fit_score: financialFit,
    financial_confidence_score: confidence,
    financial_confidence: {
      score: confidence,
      label: confidence >= 0.75 ? 'high' : confidence >= 0.5 ? 'medium' : 'low',
      freshness,
      completeness: Number(completeness.toFixed(4)),
    },
    aid_semantics: {
      supports_fafsa: region === 'US',
      supports_css_profile: region === 'US',
      supports_pell: region === 'US',
      supports_uk_bursaries: region === 'UK',
      supports_eu_grants: region === 'Europe',
      supports_indian_scholarships: region === 'India',
    },
  };
}

module.exports = {
  normalizeFinancialProfile,
};

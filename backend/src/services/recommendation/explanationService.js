'use strict';

function clampPct(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v * 100)));
}

function toContributionRows(featureContributions = {}) {
  return Object.entries(featureContributions)
    .map(([feature, value]) => ({
      feature,
      value: Number(value) || 0,
      abs: Math.abs(Number(value) || 0),
    }))
    .sort((a, b) => b.abs - a.abs);
}

function humanizeFeature(feature) {
  return feature
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildReasoningSentences(college, topContribs = []) {
  const reasons = [];
  for (const item of topContribs.slice(0, 4)) {
    const feature = item.feature;
    if (feature === 'subject_ranking_alignment') {
      reasons.push(`strong ${college.primaryMajor || 'major'} subject ranking alignment`);
    } else if (feature === 'admissions_fit') {
      reasons.push('your academic profile is competitive for this institution');
    } else if (feature === 'research_intensity_fit') {
      reasons.push('excellent research intensity match');
    } else if (feature === 'outcomes_alignment') {
      reasons.push('strong career outcomes and salary trajectory');
    } else if (feature === 'international_aid_match') {
      reasons.push('good international aid compatibility');
    } else if (feature === 'affordability_fit') {
      reasons.push('cost and aid profile aligns with your budget');
    } else {
      reasons.push(humanizeFeature(feature).toLowerCase());
    }
  }
  return reasons;
}

function buildNaturalLanguageSummary(college, topContribs = []) {
  const reasons = buildReasoningSentences(college, topContribs);
  if (!reasons.length) {
    return `${college.name} is recommended due to overall fit across academics, outcomes, and affordability.`;
  }
  return `${college.name} is recommended because ${reasons.join(', ')}.`;
}

function generateRecommendationExplanation(college, featureContributions, confidence = 0.5) {
  const rows = toContributionRows(featureContributions);
  const topRows = rows.slice(0, 6);

  return {
    confidence_score: Number(Number(confidence).toFixed(4)),
    confidence_label: confidence >= 0.75 ? 'high' : confidence >= 0.5 ? 'medium' : 'low',
    feature_importance: topRows.map((r) => ({
      feature: r.feature,
      label: humanizeFeature(r.feature),
      contribution: Number(r.value.toFixed(6)),
      contribution_pct: clampPct(r.abs),
    })),
    reasoning_summary: buildNaturalLanguageSummary(college, topRows),
    reasons: buildReasoningSentences(college, topRows),
  };
}

module.exports = {
  generateRecommendationExplanation,
};

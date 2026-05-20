'use strict';

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function profileUncertainty(profile = {}) {
  const checks = [
    profile.gpa,
    profile.sat,
    profile.act,
    profile.maxBudgetUsd,
    (profile.intendedMajors || []).length ? 1 : null,
    (profile.preferredCountries || []).length ? 1 : null,
  ];
  const missing = checks.filter((value) => value == null).length;
  return clamp01(missing / checks.length);
}

function confidenceAdjustedScore(score, uncertainty) {
  const penalty = clamp01(uncertainty) * 0.25;
  return clamp01((Number(score) || 0) * (1 - penalty));
}

module.exports = {
  profileUncertainty,
  confidenceAdjustedScore,
};

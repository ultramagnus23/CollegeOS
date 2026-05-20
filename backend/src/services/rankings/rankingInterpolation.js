'use strict';

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function interpolateMissingRank({ globalScore = 0, nationalScore = 0, subjectScore = 0, confidence = 0.5 }) {
  const c = clamp01(confidence);
  if (subjectScore > 0) return clamp01(subjectScore);
  if (globalScore > 0 && nationalScore > 0) return clamp01((globalScore * 0.6 + nationalScore * 0.4) * (0.75 + 0.25 * c));
  if (globalScore > 0) return clamp01(globalScore * (0.7 + 0.3 * c));
  if (nationalScore > 0) return clamp01(nationalScore * (0.65 + 0.35 * c));
  return 0;
}

module.exports = {
  interpolateMissingRank,
};

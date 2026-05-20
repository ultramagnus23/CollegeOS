'use strict';

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function computeSubjectWeight({ subjectMatch = 0, rankingConfidence = 0, hasSubjectRank = false }) {
  const base = hasSubjectRank ? 0.55 : 0.35;
  const weighted = base + (clamp01(subjectMatch) * 0.35) + (clamp01(rankingConfidence) * 0.1);
  return clamp01(weighted);
}

module.exports = {
  computeSubjectWeight,
};

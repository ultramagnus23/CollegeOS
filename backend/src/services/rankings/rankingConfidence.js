'use strict';

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function wilsonLikeConfidence({ sourceCount = 0, variancePenalty = 0, recencyDays = 365 }) {
  const countScore = clamp01(Math.log2(Math.max(1, sourceCount + 1)) / 4);
  const stability = 1 - clamp01(variancePenalty);
  const recency = 1 - clamp01(recencyDays / 730);
  return clamp01((countScore * 0.45) + (stability * 0.35) + (recency * 0.2));
}

module.exports = {
  wilsonLikeConfidence,
};

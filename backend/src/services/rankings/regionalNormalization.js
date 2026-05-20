'use strict';

const REGIONAL_SCALARS = {
  'United States': 1.0,
  'United Kingdom': 0.98,
  Canada: 0.97,
  Australia: 0.95,
  India: 0.9,
  Germany: 0.94,
};

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function applyRegionalScaling(score, country) {
  const scalar = REGIONAL_SCALARS[String(country || '').trim()] || 0.93;
  return clamp01((Number(score) || 0) * scalar);
}

module.exports = {
  applyRegionalScaling,
};

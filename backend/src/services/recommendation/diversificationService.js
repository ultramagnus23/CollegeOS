'use strict';

const { logStageComplete, logStageFailure, logStageStart, nowMs } = require('./pipelineDiagnostics');

function cosine(a = [], b = []) {
  const len = Math.min(a.length, b.length);
  if (!len) return 0;
  let dot = 0;
  let an = 0;
  let bn = 0;
  for (let i = 0; i < len; i += 1) {
    dot += (a[i] || 0) * (b[i] || 0);
    an += (a[i] || 0) ** 2;
    bn += (b[i] || 0) ** 2;
  }
  const denom = Math.sqrt(an) * Math.sqrt(bn);
  return denom > 0 ? dot / denom : 0;
}

function classifyBucket(admitChance) {
  const p = Number(admitChance) || 0;
  if (p >= 0.65) return 'safety';
  if (p >= 0.38) return 'target';
  return 'reach';
}

function diversifyPortfolio(candidates, opts = {}) {
  const startedAt = nowMs();
  logStageStart('portfolio_diversification', { service: 'diversification', inputSize: Array.isArray(candidates) ? candidates.length : 0 });
  try {
  const {
    targetCount = 20,
    lambda = 0.78,
    minSafety = 4,
    minTarget = 7,
    minReach = 5,
    maxPerCountry = 6,
  } = opts;

  const pool = [...(Array.isArray(candidates) ? candidates : [])]
    .map((c) => ({ ...c, bucket: c.bucket || classifyBucket(c.admitChance) }))
    .sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0));

  const selected = [];
  const countryCount = new Map();
  const bucketCount = { safety: 0, target: 0, reach: 0 };

  function canTake(candidate) {
    const country = candidate.country || 'unknown';
    const cCount = countryCount.get(country) || 0;
    if (cCount >= maxPerCountry) return false;
    return true;
  }

  function take(candidate) {
    selected.push(candidate);
    const country = candidate.country || 'unknown';
    countryCount.set(country, (countryCount.get(country) || 0) + 1);
    bucketCount[candidate.bucket] = (bucketCount[candidate.bucket] || 0) + 1;
  }

  function greedyByBucket(bucket, needed) {
    if (needed <= 0) return;
    for (const candidate of pool) {
      if (selected.includes(candidate)) continue;
      if (candidate.bucket !== bucket) continue;
      if (!canTake(candidate)) continue;
      take(candidate);
      if ((bucketCount[bucket] || 0) >= needed) break;
      if (selected.length >= targetCount) break;
    }
  }

  greedyByBucket('safety', minSafety);
  greedyByBucket('target', minTarget);
  greedyByBucket('reach', minReach);

  while (selected.length < targetCount && selected.length < pool.length) {
    let best = null;
    let bestScore = -Infinity;

    for (const candidate of pool) {
      if (selected.includes(candidate)) continue;
      if (!canTake(candidate)) continue;

      const relevance = candidate.rankScore || 0;
      let maxSimilarity = 0;
      for (const s of selected) {
        const sim = cosine(candidate.embedding || [], s.embedding || []);
        if (sim > maxSimilarity) maxSimilarity = sim;
      }

      const mmrScore = (lambda * relevance) - ((1 - lambda) * maxSimilarity);
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        best = candidate;
      }
    }

    if (!best) break;
    take(best);
  }

    const output = selected.map((item, index) => ({
      ...item,
      diversifiedRank: index + 1,
    }));
    logStageComplete('portfolio_diversification', startedAt, { service: 'diversification', outputSize: output.length });
    return output;
  } catch (error) {
    logStageFailure('portfolio_diversification', error, { service: 'diversification', startedAt });
    return [...(Array.isArray(candidates) ? candidates : [])]
      .sort((a, b) => (Number(b?.rankScore) || 0) - (Number(a?.rankScore) || 0))
      .slice(0, Math.max(10, Math.min(30, Number(opts?.targetCount) || 20)))
      .map((item, index) => ({ ...item, diversifiedRank: index + 1 }));
  }
}

module.exports = {
  diversifyPortfolio,
};

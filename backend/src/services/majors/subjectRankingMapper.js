'use strict';

const { expandMajorContext } = require('./majorExpansion');

async function subjectRankingTargets(majors = []) {
  const targets = new Set();
  for (const major of majors) {
    const context = await expandMajorContext(major);
    (context.subjectRankMappings || []).forEach((s) => targets.add(String(s).toLowerCase()));
    targets.add(String(context.canonicalMajor || major).toLowerCase());
  }
  return Array.from(targets);
}

function subjectBoostForInstitution(subjectSignals = {}, targets = []) {
  if (!targets.length) return 0;
  const normalizedSignals = Object.entries(subjectSignals || {}).map(([k, v]) => ({
    key: String(k).toLowerCase(),
    value: Number(v) || 0,
  }));
  if (!normalizedSignals.length) return 0;

  let best = 0;
  for (const target of targets) {
    for (const signal of normalizedSignals) {
      if (signal.key.includes(target) || target.includes(signal.key)) {
        best = Math.max(best, signal.value);
      }
    }
  }
  return Math.max(0, Math.min(1, best));
}

module.exports = {
  subjectRankingTargets,
  subjectBoostForInstitution,
};

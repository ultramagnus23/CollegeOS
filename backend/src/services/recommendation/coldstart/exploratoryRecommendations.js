'use strict';

function diversifyForExploration(recommendations = [], uncertainty = 0) {
  if (!recommendations.length) return [];
  if (uncertainty < 0.25) return recommendations;

  const seenCountries = new Set();
  const diversified = [];

  for (const rec of recommendations) {
    const key = String(rec.country || 'unknown');
    if (!seenCountries.has(key) || diversified.length < Math.ceil(recommendations.length * 0.65)) {
      diversified.push({
        ...rec,
        exploration_bonus: Math.round(Math.min(20, uncertainty * 20)),
      });
      seenCountries.add(key);
    }
  }

  for (const rec of recommendations) {
    if (diversified.length >= recommendations.length) break;
    if (!diversified.find((v) => v.college_id === rec.college_id)) diversified.push(rec);
  }
  return diversified;
}

module.exports = {
  diversifyForExploration,
};

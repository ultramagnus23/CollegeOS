'use strict';

function rerankWithPersonalization(candidates = [], preferenceModel = {}) {
  const preferredCountries = new Set(preferenceModel.preferredCountries || []);
  const preferredTags = new Set((preferenceModel.preferredTags || []).map((v) => String(v).toLowerCase()));
  const affinity = Number(preferenceModel.implicitAffinity) || 0;

  return candidates
    .map((candidate) => {
      const countryBoost = preferredCountries.has(candidate.country) ? 0.08 : 0;
      const semanticTags = Array.isArray(candidate.semantic_tags) ? candidate.semantic_tags : (candidate.tags || []);
      const tagBoost = semanticTags.some((tag) => preferredTags.has(String(tag).toLowerCase())) ? 0.08 : 0;
      const personalized = (Number(candidate.rankScore || candidate.rank_score || 0) + countryBoost + tagBoost + affinity * 0.05);
      return {
        ...candidate,
        personalization_boost: Number((countryBoost + tagBoost + affinity * 0.05).toFixed(6)),
        personalized_score: Number(personalized.toFixed(6)),
      };
    })
    .sort((a, b) => b.personalized_score - a.personalized_score);
}

module.exports = {
  rerankWithPersonalization,
};

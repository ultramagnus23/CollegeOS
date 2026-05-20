'use strict';

function adaptForSession(preferences = {}, sessionSignals = {}) {
  const boostedCountries = new Set(preferences.preferredCountries || []);
  (sessionSignals.countriesExplored || []).forEach((country) => boostedCountries.add(country));

  const boostedTags = new Set(preferences.preferredTags || []);
  (sessionSignals.majorsExplored || []).forEach((major) => boostedTags.add(String(major).toLowerCase()));

  return {
    preferredCountries: Array.from(boostedCountries),
    preferredTags: Array.from(boostedTags),
    rankingSensitivity: Number(sessionSignals.rankingSensitivity) || 0.5,
    affordabilitySensitivity: Number(sessionSignals.affordabilityBehavior) || 0.5,
  };
}

module.exports = {
  adaptForSession,
};

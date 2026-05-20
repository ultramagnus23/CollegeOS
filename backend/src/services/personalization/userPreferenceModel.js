'use strict';

const { userPreferenceSignals } = require('../feedback/personalizationSignals');

async function buildUserPreferenceModel(userId) {
  const signals = await userPreferenceSignals(userId);
  return {
    userId,
    preferredCountries: Object.keys(signals.countries || {}).slice(0, 3),
    preferredTags: Object.keys(signals.tags || {}).slice(0, 8),
    implicitAffinity: signals.implicit_score,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  buildUserPreferenceModel,
};

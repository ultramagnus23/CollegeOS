'use strict';

const EXPERIMENTS = {
  retrieval_blend_v2: { variants: ['control', 'hybrid_focus', 'subject_focus'], traffic: 1 },
  ranking_subject_weight: { variants: ['control', 'subject_boost_15', 'subject_boost_25'], traffic: 1 },
  explanation_payload_v2: { variants: ['control', 'concise', 'detailed'], traffic: 1 },
  popularity_weight_tuning: { variants: ['control', 'pop_low', 'pop_high'], traffic: 1 },
};

function getExperiment(key) {
  return EXPERIMENTS[key] || null;
}

module.exports = {
  getExperiment,
  EXPERIMENTS,
};

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const logger = require('../../utils/logger');

const MODEL_META_PATH = path.resolve(__dirname, '../../../ml/recommendation_ranker/model_meta.json');
const INFER_SCRIPT = path.resolve(__dirname, '../../../ml/recommendation_ranker/infer_ranker.py');

const FALLBACK_WEIGHTS = {
  major_availability: 0.18,
  subject_ranking_alignment: 0.12,
  admissions_fit: 0.16,
  affordability_fit: 0.14,
  normalized_global_ranking: 0.11,
  popularity_score: 0.09,
  outcomes_alignment: 0.09,
  research_intensity_fit: 0.05,
  international_aid_match: 0.03,
  country_match: 0.02,
  selectivity_tier_score: 0.01,
};

function loadModelMeta() {
  try {
    if (!fs.existsSync(MODEL_META_PATH)) return null;
    return JSON.parse(fs.readFileSync(MODEL_META_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function fallbackScore(features) {
  let total = 0;
  const contributions = {};
  for (const [key, weight] of Object.entries(FALLBACK_WEIGHTS)) {
    const value = Number(features[key]) || 0;
    const contribution = value * weight;
    contributions[key] = contribution;
    total += contribution;
  }
  return { score: total, contributions };
}

function inferWithPython(featureRows) {
  const payload = JSON.stringify({ rows: featureRows });
  const run = spawnSync('python3', [INFER_SCRIPT], {
    input: payload,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (run.status !== 0) {
    throw new Error(run.stderr || 'python inference failed');
  }
  const parsed = JSON.parse(run.stdout || '{}');
  return Array.isArray(parsed.predictions) ? parsed.predictions : [];
}

function rankCandidates(featureRows) {
  const modelMeta = loadModelMeta();
  if (modelMeta && fs.existsSync(INFER_SCRIPT)) {
    try {
      return inferWithPython(featureRows);
    } catch (error) {
      logger.warn('LTR python inference failed, switching to deterministic fallback', { error: error.message });
    }
  }

  return featureRows.map((row) => {
    const { score, contributions } = fallbackScore(row.features);
    return {
      institution_id: row.institution_id,
      score,
      confidence: Math.min(0.98, Math.max(0.35, 0.55 + score * 0.4)),
      contributions,
    };
  });
}

module.exports = {
  rankCandidates,
};

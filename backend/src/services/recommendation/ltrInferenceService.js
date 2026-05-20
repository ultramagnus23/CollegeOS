'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const logger = require('../../utils/logger');

const MODEL_META_PATH = path.resolve(__dirname, '../../../ml/recommendation_ranker/model_meta.json');
const INFER_SCRIPT = path.resolve(__dirname, '../../../ml/recommendation_ranker/infer.py');

const FALLBACK_WEIGHTS = {
  major_availability: 0.16,
  subject_ranking_alignment: 0.15,
  admissions_fit: 0.15,
  affordability_fit: 0.13,
  normalized_global_ranking: 0.08,
  popularity_score: 0.07,
  outcomes_alignment: 0.08,
  research_intensity_fit: 0.05,
  international_aid_match: 0.04,
  country_match: 0.03,
  selectivity_tier_score: 0.03,
  search_volume_signal: 0.03,
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
  console.log('RUNNING QUERY:', {
    table: 'python_ranker_subprocess',
    filters: { script: INFER_SCRIPT },
    payload: { rows: Array.isArray(featureRows) ? featureRows.length : 0 },
  });
  const payload = JSON.stringify({ rows: featureRows });
  const run = spawnSync('python3', [INFER_SCRIPT], {
    input: payload,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (run.status !== 0) {
    console.log('QUERY RESULT:', {
      count: null,
      error: {
        message: run.stderr || 'python inference failed',
        code: `PYTHON_EXIT_${run.status}`,
      },
    });
    throw new Error(run.stderr || 'python inference failed');
  }
  const parsed = JSON.parse(run.stdout || '{}');
  console.log('QUERY RESULT:', { count: Array.isArray(parsed?.predictions) ? parsed.predictions.length : 0, error: null });
  return Array.isArray(parsed.predictions) ? parsed.predictions : [];
}

function rankCandidates(featureRows) {
  const modelMeta = loadModelMeta();
  if (modelMeta && fs.existsSync(INFER_SCRIPT)) {
    try {
      return inferWithPython(featureRows);
    } catch (error) {
      console.error('==============================');
      console.error('RECOMMENDATION PIPELINE ERROR');
      console.error('==============================');
      console.error('MESSAGE:', error?.message);
      console.error('STACK:', error?.stack);
      console.error('FULL ERROR:', error);
      if (error?.details) console.error('DETAILS:', error.details);
      if (error?.hint) console.error('HINT:', error.hint);
      if (error?.code) console.error('CODE:', error.code);
      logger.warn('LTR python inference failed, switching to deterministic fallback', { error: error.message });
    }
  }

  return featureRows.map((row) => {
    const { score, contributions } = fallbackScore(row.features);
    return {
      institution_id: row.institution_id,
      score,
      confidence: Math.min(0.98, Math.max(0.35, 0.55 + score * 0.35)),
      contributions,
    };
  });
}

module.exports = {
  rankCandidates,
};

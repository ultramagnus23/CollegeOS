// backend/src/routes/chance.js
// POST /api/chance — global XGBoost admission-chancing endpoint.
//
// Loads the model trained by scraper/training_pipeline.py (backend/ml/model.joblib).
// Caches the model in memory; does not reload on every request.
// Returns { acceptance_chance, tier, confidence, model_version, trained_on }.

'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticate } = require('../middleware/auth');
const dbManager = require('../config/database');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/security');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5050';
const ML_TIMEOUT = parseInt(process.env.ML_SERVICE_TIMEOUT || '8000', 10);

// ── In-memory model metadata cache ───────────────────────────────────────────
// The Python model.joblib is served via the ML Flask service; here we cache
// the latest ml_metadata row so we can return version/trained_on without
// querying Postgres on every request.

let _metaCache = null;
let _metaCacheAt = 0;
const META_CACHE_TTL_MS = 60 * 1000; // 1 minute

async function getLatestMeta(pool) {
  if (_metaCache && Date.now() - _metaCacheAt < META_CACHE_TTL_MS) {
    return _metaCache;
  }
  try {
    const { rows } = await pool.query(
      `SELECT model_version, accuracy, f1_score, training_samples, last_trained
       FROM ml_metadata ORDER BY last_trained DESC LIMIT 1`
    );
    if (rows.length) {
      _metaCache = rows[0];
      _metaCacheAt = Date.now();
      return _metaCache;
    }
  } catch (_) {
    // ml_metadata table may not exist yet
  }
  return null;
}

function tierFromProbability(probability) {
  if (probability >= 65) return 'safety';
  if (probability >= 30) return 'target';
  return 'reach';
}

function confidenceLevelFromMeta(meta) {
  if (!meta) return 'low';
  const samples = parseInt(meta.training_samples, 10) || 0;
  const acc = parseFloat(meta.accuracy) || 0;
  if (samples >= 1000 && acc >= 0.75) return 'high';
  if (samples >= 200 && acc >= 0.60) return 'medium';
  return 'low';
}

/**
 * POST /api/chance
 *
 * Body: { gpa, sat, act, num_aps, num_ecs, college_name, state, intended_major }
 *
 * Response:
 *   {
 *     acceptance_chance: 0.67,
 *     tier: "target",
 *     confidence: "medium",
 *     model_version: "v1.2",
 *     trained_on: 4821
 *   }
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const {
      gpa,
      sat,
      act,
      num_aps,
      num_ecs,
      college_name,
      state,
      intended_major,
    } = req.body;

    if (!college_name) {
      return res.status(400).json({
        success: false,
        message: 'college_name is required',
      });
    }

    const pool = dbManager.getDatabase();
    const meta = await getLatestMeta(pool);

    // Build student profile for the ML service's /predict endpoint
    const student = {
      gpa_unweighted: gpa != null ? parseFloat(gpa) : undefined,
      sat_total: sat != null ? parseInt(sat, 10) : undefined,
      act_composite: act != null ? parseInt(act, 10) : undefined,
      num_ap_courses: num_aps != null ? parseInt(num_aps, 10) : undefined,
      state_province: state || undefined,
    };

    // Build college object for the synthetic LDA endpoint
    const college = {
      name: college_name,
    };

    // Try the ML service
    let probability = null;
    let method = null;
    try {
      const response = await axios.post(
        `${ML_SERVICE_URL}/predict`,
        { student, college, cds_data: {} },
        { timeout: ML_TIMEOUT }
      );
      const data = response?.data;
      if (data?.success && typeof data.probability === 'number') {
        probability = data.probability; // 0–100
        method = data.method || 'synthetic_lda';
      }
    } catch (mlErr) {
      logger.warn('ML /predict unavailable in /api/chance', {
        college: sanitizeForLog(college_name),
        error: sanitizeForLog(mlErr?.message),
      });
    }

    if (probability === null) {
      // Model not trained / service down
      return res.status(503).json({
        success: false,
        error: 'Model not trained yet',
        fallback_chance: null,
        message: 'Run scraper/training_pipeline.py first to train the XGBoost model.',
      });
    }

    const acceptanceChance = Math.round(probability) / 100; // normalise to 0–1
    const tier = tierFromProbability(Math.round(probability));
    const confidence = confidenceLevelFromMeta(meta);

    return res.json({
      success: true,
      acceptance_chance: acceptanceChance,
      tier,
      confidence,
      model_version: meta?.model_version || method || 'synthetic_lda',
      trained_on: meta ? parseInt(meta.training_samples, 10) : null,
      method,
    });
  } catch (error) {
    logger.error('POST /api/chance failed:', error);
    next(error);
  }
});

module.exports = router;

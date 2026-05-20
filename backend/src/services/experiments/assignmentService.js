'use strict';

const dbManager = require('../../config/database');
const { getExperiment } = require('./experimentRegistry');

function deterministicVariant(userId, variants = []) {
  const seed = Number(userId) || 0;
  if (!variants.length) return 'control';
  return variants[Math.abs(seed) % variants.length];
}

async function assignExperiment(userId, experimentKey) {
  const experiment = getExperiment(experimentKey);
  if (!experiment) return null;

  const pool = dbManager.getDatabase();
  const { rows: existing } = await pool.query(
    `SELECT variant FROM canonical.experiment_assignments WHERE experiment_key = $1 AND user_id = $2`,
    [experimentKey, userId]
  );
  if (existing.length) return existing[0].variant;

  const variant = deterministicVariant(userId, experiment.variants);
  await pool.query(
    `INSERT INTO canonical.experiment_assignments (experiment_key, user_id, variant)
     VALUES ($1, $2, $3)
     ON CONFLICT (experiment_key, user_id) DO NOTHING`,
    [experimentKey, userId, variant]
  );
  return variant;
}

module.exports = {
  assignExperiment,
};

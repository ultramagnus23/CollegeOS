'use strict';

/**
 * Calibration module.
 * Compares the chancing model's predicted acceptance rate (sourced from the
 * colleges table) against actual outcomes in scraped_results, computing a
 * per-school Brier Score.
 *
 * Only schools with ≥30 data points are included (too small a sample produces
 * unreliable calibration signals).
 *
 * Brier Score (individual-level):
 *   BS = mean( (predicted_rate - actual_i)^2 )
 * where actual_i = 1 if accepted, 0 otherwise.
 *
 * A lower Brier Score means better calibration.
 * Delta = current_BS − previous_BS  (negative = improved, positive = degraded).
 */

const db = require('./db');
const logger = require('./logger');

// Minimum sample size before a calibration result is surfaced
const MIN_SAMPLE_SIZE = 30;

/**
 * Run calibration for all schools with sufficient data.
 * Logs per-school results and a summary at the end.
 * @returns {Promise<{schools_calibrated: number, schools_skipped: number}>}
 */
async function calibrate() {
  const schoolStats = await db.getSchoolStats();
  let schoolsCalibrated = 0;
  let schoolsSkipped = 0;

  for (const { school, total } of schoolStats) {
    if (total < MIN_SAMPLE_SIZE) {
      schoolsSkipped++;
      continue;
    }

    const predictedRate = await db.getPublishedRate(school);
    if (predictedRate === null) {
      logger.info({
        msg: 'Calibration: no published rate found, skipping',
        school,
        sampleSize: total,
      });
      schoolsSkipped++;
      continue;
    }

    // Fetch individual outcomes for this school
    const outcomes = await db.getResultsForSchool(school);
    const brierScore = computeBrierScore(outcomes, predictedRate);
    const actualRate = outcomes.filter((r) => r.outcome === 'accepted').length / outcomes.length;

    // Delta vs previous run
    const previousBrierScore = await db.getLastBrierScore(school);
    const delta = previousBrierScore !== null ? brierScore - previousBrierScore : null;

    await db.insertCalibrationRun({
      school_name: school,
      predicted_rate: predictedRate,
      actual_rate: actualRate,
      brier_score: brierScore,
      previous_brier_score: previousBrierScore,
      delta,
      sample_size: total,
    });

    const direction =
      delta === null ? 'first run' : delta < 0 ? 'improved ✓' : delta > 0 ? 'degraded ✗' : 'unchanged';

    logger.info({
      msg: 'Calibration result',
      school,
      sampleSize: total,
      predictedRate: round4(predictedRate),
      actualRate: round4(actualRate),
      brierScore: round4(brierScore),
      previousBrierScore: previousBrierScore !== null ? round4(previousBrierScore) : null,
      delta: delta !== null ? round4(delta) : null,
      direction,
    });

    schoolsCalibrated++;
  }

  logger.info({
    msg: 'Calibration complete',
    schoolsCalibrated,
    schoolsSkipped,
  });

  return { schools_calibrated: schoolsCalibrated, schools_skipped: schoolsSkipped };
}

/**
 * Compute the individual-level Brier Score for a set of outcomes.
 * @param {Array<{outcome: string}>} outcomes
 * @param {number} predictedRate  - probability in [0, 1]
 * @returns {number} Brier Score in [0, 1]
 */
function computeBrierScore(outcomes, predictedRate) {
  if (outcomes.length === 0) return 0;

  const sumSq = outcomes.reduce((acc, { outcome }) => {
    const actual = outcome === 'accepted' ? 1 : 0;
    const diff = predictedRate - actual;
    return acc + diff * diff;
  }, 0);

  return sumSq / outcomes.length;
}

/**
 * Round a number to 4 decimal places for clean log output.
 * @param {number} n
 * @returns {number}
 */
function round4(n) {
  return Math.round(n * 10000) / 10000;
}

module.exports = { calibrate };

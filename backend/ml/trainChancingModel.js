'use strict';

/**
 * Chancing model trainer — calibrated logistic regression.
 *
 * HONESTY: there is no labeled per-applicant admission-outcome data anywhere in the
 * system. This trainer therefore fits a model on applicants SIMULATED from REAL
 * per-college statistics (acceptance_rate + median_sat from college_admissions_stats,
 * 801 colleges). The simulation anchors each college's admit rate to its real
 * acceptance_rate and makes stronger-vs-median applicants more likely to be admitted.
 * The reported ROC-AUC / Brier / calibration are SYNTHETIC-HOLDOUT metrics — they
 * measure how well the model recovers the stats-grounded relationship, NOT real
 * predictive accuracy against actual admissions. When real labels accumulate in
 * prediction_logs.actual_outcome, re-point fetchTrainingRows() at them and retrain.
 *
 * No ML dependency: logistic regression via standardized batch gradient descent.
 * Usage:  node ml/trainChancingModel.js [--applicants-per-college=60] [--epochs=400]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const dbManager = require('../src/config/database');

const argv = process.argv.slice(2);
const argInt = (name, def) => {
  const a = argv.find((x) => x.startsWith(`--${name}=`));
  return a ? parseInt(a.split('=')[1], 10) : def;
};
const PER_COLLEGE = argInt('applicants-per-college', 60);
const EPOCHS = argInt('epochs', 400);
const LR = 0.1;
const SAT_SIGMA = 130;

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const logit = (p) => Math.log(p / (1 - p));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Box–Muller standard normal
function randn() {
  let u = 0; let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// The "true" generative relationship (real base rate + academic strength vs band).
const TRUE = { satZ: 1.2, gpaZ: 0.8, noise: 0.5 };

async function fetchCollegeStats() {
  const pool = dbManager.getDatabase();
  const { rows } = await pool.query(
    `SELECT acceptance_rate::float AS ar, median_sat::float AS msat
       FROM college_admissions_stats
      WHERE acceptance_rate IS NOT NULL AND median_sat IS NOT NULL
        AND acceptance_rate > 0 AND acceptance_rate < 1 AND median_sat BETWEEN 600 AND 1600`,
  );
  return rows;
}

// Feature vector the MODEL sees (also used at inference): standardized later.
function features(satZ, gpaCentered, logitAr) {
  return [satZ, gpaCentered, logitAr];
}

function buildDataset(colleges) {
  const X = []; const y = [];
  for (const c of colleges) {
    const la = logit(clamp(c.ar, 0.01, 0.99));
    for (let i = 0; i < PER_COLLEGE; i += 1) {
      const sat = clamp(c.msat + randn() * SAT_SIGMA, 400, 1600);
      const gpa = clamp(2.5 + (sat - 1000) / 600 + randn() * 0.25, 0, 4); // generic prior (no real gpa medians)
      const satZ = (sat - c.msat) / SAT_SIGMA;
      const gpaCentered = (gpa - 3.5) / 0.4;
      const trueLogit = TRUE.satZ * satZ + TRUE.gpaZ * gpaCentered + la + randn() * TRUE.noise;
      const label = sigmoid(trueLogit) > Math.random() ? 1 : 0;
      X.push(features(satZ, gpaCentered, la));
      y.push(label);
    }
  }
  return { X, y };
}

function standardize(X) {
  const n = X.length; const d = X[0].length;
  const mean = Array(d).fill(0); const std = Array(d).fill(0);
  for (const row of X) for (let j = 0; j < d; j += 1) mean[j] += row[j] / n;
  for (const row of X) for (let j = 0; j < d; j += 1) std[j] += ((row[j] - mean[j]) ** 2) / n;
  for (let j = 0; j < d; j += 1) std[j] = Math.sqrt(std[j]) || 1;
  const Z = X.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));
  return { Z, mean, std };
}

function trainLogistic(Z, y, epochs) {
  const n = Z.length; const d = Z[0].length;
  const w = Array(d).fill(0); let b = 0;
  for (let e = 0; e < epochs; e += 1) {
    const gw = Array(d).fill(0); let gb = 0;
    for (let i = 0; i < n; i += 1) {
      let z = b; for (let j = 0; j < d; j += 1) z += w[j] * Z[i][j];
      const err = sigmoid(z) - y[i];
      for (let j = 0; j < d; j += 1) gw[j] += (err * Z[i][j]) / n;
      gb += err / n;
    }
    for (let j = 0; j < d; j += 1) w[j] -= LR * gw[j];
    b -= LR * gb;
  }
  return { w, b };
}

function predictProba(model, Z) {
  return Z.map((row) => {
    let z = model.b; for (let j = 0; j < model.w.length; j += 1) z += model.w[j] * row[j];
    return sigmoid(z);
  });
}

function rocAuc(probs, y) {
  // Mann–Whitney U / rank-based AUC.
  const pairs = probs.map((p, i) => ({ p, y: y[i] })).sort((a, b) => a.p - b.p);
  let rankSumPos = 0; let nPos = 0; let nNeg = 0;
  for (let i = 0; i < pairs.length; i += 1) {
    if (pairs[i].y === 1) { rankSumPos += i + 1; nPos += 1; } else nNeg += 1;
  }
  if (nPos === 0 || nNeg === 0) return null;
  return (rankSumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

function brier(probs, y) {
  return probs.reduce((s, p, i) => s + (p - y[i]) ** 2, 0) / probs.length;
}

function calibration(probs, y, bins = 10) {
  const out = [];
  for (let b = 0; b < bins; b += 1) {
    const lo = b / bins; const hi = (b + 1) / bins;
    const idx = probs.map((p, i) => ({ p, i })).filter((o) => o.p >= lo && (b === bins - 1 ? o.p <= hi : o.p < hi));
    if (!idx.length) continue;
    const meanPred = idx.reduce((s, o) => s + o.p, 0) / idx.length;
    const obs = idx.reduce((s, o) => s + y[o.i], 0) / idx.length;
    out.push({ bin: `${lo.toFixed(1)}-${hi.toFixed(1)}`, n: idx.length, mean_predicted: +meanPred.toFixed(3), observed_rate: +obs.toFixed(3) });
  }
  return out;
}

async function run() {
  const colleges = await fetchCollegeStats();
  if (colleges.length < 50) throw new Error(`Too few colleges with real stats (${colleges.length}) to train.`);
  const { X, y } = buildDataset(colleges);

  // 80/20 split
  const idx = X.map((_, i) => i).sort(() => Math.random() - 0.5);
  const cut = Math.floor(idx.length * 0.8);
  const trIdx = idx.slice(0, cut); const teIdx = idx.slice(cut);
  const Xtr = trIdx.map((i) => X[i]); const ytr = trIdx.map((i) => y[i]);
  const Xte = teIdx.map((i) => X[i]); const yte = teIdx.map((i) => y[i]);

  const { mean, std } = standardize(Xtr);
  const Ztr = Xtr.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));
  const Zte = Xte.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));

  const model = trainLogistic(Ztr, ytr, EPOCHS);
  const pTe = predictProba(model, Zte);

  const metrics = {
    model: 'logistic_regression',
    feature_names: ['sat_z', 'gpa_centered', 'logit_acceptance_rate'],
    dataset: {
      source: 'SIMULATED from real college_admissions_stats (acceptance_rate + median_sat)',
      colleges_used: colleges.length,
      applicants_per_college: PER_COLLEGE,
      total_cases: X.length,
      positive_rate: +(y.reduce((s, v) => s + v, 0) / y.length).toFixed(4),
      gpa_note: 'median_gpa_admitted is unavailable in the data; GPA simulated from a generic SAT-correlated population prior.',
    },
    holdout: {
      n: yte.length,
      roc_auc: +(rocAuc(pTe, yte) ?? 0).toFixed(4),
      brier: +brier(pTe, yte).toFixed(4),
      calibration: calibration(pTe, yte),
    },
    caveat: 'SYNTHETIC-HOLDOUT metrics — measure recovery of the stats-grounded simulation, NOT real predictive accuracy against actual admissions. Re-train on prediction_logs.actual_outcome when real labels exist.',
    trained_at: new Date().toISOString(),
  };

  const artifact = { ...model, mean, std, feature_names: metrics.feature_names, sat_sigma: SAT_SIGMA, version: 1, trained_at: metrics.trained_at };
  fs.mkdirSync(__dirname, { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'chancing_model.json'), JSON.stringify(artifact, null, 2));
  fs.writeFileSync(path.join(__dirname, 'model_metrics.json'), JSON.stringify(metrics, null, 2));

  console.log('Trained on', X.length, 'simulated cases from', colleges.length, 'real colleges.');
  console.log('Holdout: ROC-AUC=%s Brier=%s', metrics.holdout.roc_auc, metrics.holdout.brier);
  console.log('Weights (standardized):', JSON.stringify(model.w.map((v) => +v.toFixed(3))), 'bias=', +model.b.toFixed(3));
  await dbManager.close();
  process.exit(0);
}

run().catch(async (e) => { console.error('train failed:', e.message); try { await dbManager.close(); } catch (_) {} process.exit(1); });

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

// Minimum real labeled rows (with both classes) before we train on REAL outcomes
// instead of the simulation. Below this the simulated model is the honest choice.
const MIN_REAL = argInt('min-real', 200);

const ACT_TO_SAT = {
  36: 1590, 35: 1540, 34: 1500, 33: 1460, 32: 1430, 31: 1400, 30: 1370, 29: 1340,
  28: 1310, 27: 1280, 26: 1240, 25: 1210, 24: 1180, 23: 1140, 22: 1110, 21: 1080,
  20: 1020, 19: 980, 18: 940, 17: 910, 16: 880, 15: 850, 14: 820, 13: 780,
};

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

// REAL labeled outcomes captured via POST /api/chancing/outcome. Joined to
// college_admissions_stats for the per-college median_sat + acceptance_rate the
// model needs. This closes the loop the honesty caveat promised: once enough real
// rows exist the trainer fits on them automatically — no code change needed.
async function fetchRealLabeledData() {
  const pool = dbManager.getDatabase();
  const { rows } = await pool.query(
    `SELECT t.gpa::float AS gpa, t.sat_score::float AS sat, t.act_score::float AS act,
            t.outcome, s.median_sat::float AS msat, s.acceptance_rate::float AS ar
       FROM ml_training_data t
       JOIN college_admissions_stats s ON s.college_id = t.college_id
      WHERE t.outcome IN ('accepted','rejected')
        AND s.median_sat IS NOT NULL AND s.acceptance_rate > 0 AND s.acceptance_rate < 1`,
  );
  return rows;
}

// Shape real rows into the same feature space the model + inference use. Rows
// without a usable test score (no SAT and no convertible ACT) are dropped, not
// guessed.
function buildRealDataset(rows) {
  const X = []; const y = [];
  for (const r of rows) {
    let sat = Number.isFinite(r.sat) ? r.sat : (Number.isFinite(r.act) ? ACT_TO_SAT[Math.round(r.act)] : null);
    if (!Number.isFinite(sat)) continue;
    const gpa = Number.isFinite(r.gpa) ? r.gpa : 3.5; // center if absent (rare)
    const satZ = (sat - r.msat) / SAT_SIGMA;
    const gpaCentered = (gpa - 3.5) / 0.4;
    const la = logit(clamp(r.ar, 0.01, 0.99));
    X.push(features(satZ, gpaCentered, la));
    y.push(r.outcome === 'accepted' ? 1 : 0);
  }
  return { X, y };
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

// Precision / recall / F1 at a probability threshold (default 0.5).
function precisionRecall(probs, y, threshold = 0.5) {
  let tp = 0; let fp = 0; let fn = 0; let tn = 0;
  for (let i = 0; i < probs.length; i += 1) {
    const pred = probs[i] >= threshold ? 1 : 0;
    if (pred === 1 && y[i] === 1) tp += 1;
    else if (pred === 1 && y[i] === 0) fp += 1;
    else if (pred === 0 && y[i] === 1) fn += 1;
    else tn += 1;
  }
  const precision = tp + fp === 0 ? null : tp / (tp + fp);
  const recall = tp + fn === 0 ? null : tp / (tp + fn);
  const f1 = precision && recall ? (2 * precision * recall) / (precision + recall) : null;
  const r = (v) => (v == null ? null : +v.toFixed(4));
  return { threshold, tp, fp, fn, tn, precision: r(precision), recall: r(recall), f1: r(f1) };
}

// Standardized-weight feature importance: |w_j| normalized to sum 1. Because
// inputs are standardized, |w| is directly comparable across features.
function featureImportance(weights, names) {
  const abs = weights.map((w) => Math.abs(w));
  const sum = abs.reduce((s, v) => s + v, 0) || 1;
  return names
    .map((name, j) => ({ feature: name, weight: +weights[j].toFixed(4), importance: +(abs[j] / sum).toFixed(4) }))
    .sort((a, b) => b.importance - a.importance);
}

function gitSha() {
  try {
    return require('child_process').execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim();
  } catch { return null; }
}

// Append-only version history so every retrain is auditable.
function appendVersionLog(entry) {
  const p = path.join(__dirname, 'model_versions.jsonl');
  let nextVersion = 1;
  try {
    const lines = fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean);
    if (lines.length) nextVersion = (JSON.parse(lines[lines.length - 1]).version || lines.length) + 1;
  } catch { /* first version */ }
  const row = { version: nextVersion, ...entry };
  fs.appendFileSync(p, `${JSON.stringify(row)}\n`);
  return nextVersion;
}

async function run() {
  const colleges = await fetchCollegeStats();
  if (colleges.length < 50) throw new Error(`Too few colleges with real stats (${colleges.length}) to train.`);

  // Prefer REAL labeled outcomes once enough exist (both classes present);
  // otherwise fall back to the stats-grounded simulation (the honest default).
  const realRows = await fetchRealLabeledData();
  const real = buildRealDataset(realRows);
  const realPos = real.y.reduce((s, v) => s + v, 0);
  const useReal = real.y.length >= MIN_REAL && realPos > 0 && realPos < real.y.length;

  let X; let y; let datasetMeta;
  if (useReal) {
    ({ X, y } = real);
    datasetMeta = {
      source: 'REAL ml_training_data (user-submitted admission outcomes)',
      synthetic: false,
      real_rows_available: realRows.length,
      real_rows_usable: real.y.length,
      positive_rate: +(realPos / real.y.length).toFixed(4),
    };
    console.log(`Training on ${real.y.length} REAL labeled outcomes.`);
  } else {
    ({ X, y } = buildDataset(colleges));
    datasetMeta = {
      source: 'SIMULATED from real college_admissions_stats (acceptance_rate + median_sat)',
      synthetic: true,
      colleges_used: colleges.length,
      applicants_per_college: PER_COLLEGE,
      total_cases: X.length,
      positive_rate: +(y.reduce((s, v) => s + v, 0) / y.length).toFixed(4),
      gpa_note: 'median_gpa_admitted is unavailable in the data; GPA simulated from a generic SAT-correlated population prior.',
      real_rows_available: realRows.length,
      real_rows_needed: MIN_REAL,
    };
    console.log(`Only ${real.y.length} usable real rows (<${MIN_REAL}); training on simulation.`);
  }

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

  const featureNames = ['sat_z', 'gpa_centered', 'logit_acceptance_rate'];
  const importance = featureImportance(model.w, featureNames);
  const pr = precisionRecall(pTe, yte, 0.5);
  const trainedAt = new Date().toISOString();
  const sha = gitSha();

  const metrics = {
    model: 'logistic_regression',
    feature_names: featureNames,
    dataset: datasetMeta,
    holdout: {
      n: yte.length,
      roc_auc: +(rocAuc(pTe, yte) ?? 0).toFixed(4),
      brier: +brier(pTe, yte).toFixed(4),
      precision: pr.precision,
      recall: pr.recall,
      f1: pr.f1,
      confusion_at_0_5: { tp: pr.tp, fp: pr.fp, fn: pr.fn, tn: pr.tn },
      calibration: calibration(pTe, yte),
    },
    feature_importance: importance,
    caveat: datasetMeta.synthetic
      ? 'SYNTHETIC-HOLDOUT metrics — measure recovery of the stats-grounded simulation, NOT real predictive accuracy against actual admissions. Trainer auto-switches to REAL labels once ml_training_data has >= MIN_REAL accepted/rejected rows.'
      : 'REAL-HOLDOUT metrics — measured on a held-out split of user-submitted admission outcomes. Still limited by sample size and self-report bias; treat as an estimate.',
    git_sha: sha,
    trained_at: trainedAt,
  };

  const version = appendVersionLog({
    trained_at: trainedAt,
    git_sha: sha,
    synthetic: datasetMeta.synthetic,
    n_train: ytr.length,
    n_holdout: yte.length,
    roc_auc: metrics.holdout.roc_auc,
    brier: metrics.holdout.brier,
    precision: pr.precision,
    recall: pr.recall,
    f1: pr.f1,
  });
  metrics.version = version;

  const artifact = { ...model, mean, std, feature_names: featureNames, sat_sigma: SAT_SIGMA, version, synthetic: datasetMeta.synthetic, git_sha: sha, trained_at: trainedAt };
  fs.mkdirSync(__dirname, { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'chancing_model.json'), JSON.stringify(artifact, null, 2));
  fs.writeFileSync(path.join(__dirname, 'model_metrics.json'), JSON.stringify(metrics, null, 2));
  fs.writeFileSync(path.join(__dirname, 'feature_importance.json'), JSON.stringify({ version, trained_at: trainedAt, feature_importance: importance }, null, 2));

  console.log(`Trained ${datasetMeta.synthetic ? 'SIMULATED' : 'REAL'} model v${version} on ${X.length} cases.`);
  console.log('Holdout: ROC-AUC=%s Brier=%s Precision=%s Recall=%s F1=%s', metrics.holdout.roc_auc, metrics.holdout.brier, pr.precision, pr.recall, pr.f1);
  console.log('Feature importance:', JSON.stringify(importance));
  await dbManager.close();
  process.exit(0);
}

// Pure helpers exported for unit testing (no DB/network). The trainer only runs
// when invoked directly, so requiring this module for tests does not train.
module.exports = { precisionRecall, featureImportance, buildRealDataset, ACT_TO_SAT };

if (require.main === module) {
  run().catch(async (e) => { console.error('train failed:', e.message); try { await dbManager.close(); } catch (_) {} process.exit(1); });
}
